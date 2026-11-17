/* 弱化职位浏览器回归。先运行本地静态服务，再执行：
 * BASE_URL=http://127.0.0.1:8116 node tools/browser-weak-position.js
 * 依赖可通过 NODE_PATH 或 PLAYWRIGHT_MODULE 提供；CHROME_PATH 可指定 Chrome。
 * 每组使用独立临时浏览器上下文，不操作用户浏览器的现有数据。
 */
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const baseUrl = (process.env.BASE_URL || 'http://127.0.0.1:8116').replace(/\/$/, '');

async function runSuite(browser, name, run) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage(), errors = [];
  page.setDefaultTimeout(10000);
  page.on('pageerror', error => errors.push(error.message));
  // Vue 生产构建会把事件回调异常写入控制台，只有 pageerror 不足以捕获。
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  try {
    await run(page);
    assert.deepEqual(errors, [], name + ' 页面异常');
    console.log('PASS ' + name);
  } catch (error) {
    if (process.env.QA_OUTPUT_DIR) {
      const fs = require('node:fs'), path = require('node:path');
      fs.mkdirSync(process.env.QA_OUTPUT_DIR, { recursive: true });
      await page.screenshot({ path: path.join(process.env.QA_OUTPUT_DIR, 'browser-failure.png'), fullPage: true });
    }
    throw error;
  } finally { await context.close(); }
}

async function bind(page) {
  await page.evaluate(() => { window.vm = document.querySelector('#app').__vue_app__._container._vnode.component.proxy; });
}

async function managementOperations(page) {
  await page.goto(baseUrl + '/03-工作台.html?plan=plan-case1');
  await page.waitForSelector('.wb-data-panels');
  await bind(page);
  await page.evaluate(() => { vm.selectOrg('G03'); });
  assert.equal(await page.locator('.wb-range-bar').count(), 0);
  assert.equal(await page.getByText('含下级组织', { exact: true }).count(), 0);
  assert.deepEqual(await page.evaluate(() => [vm.peopleTotals.employees, vm.workbenchProjection.headcounts.length]), [0, 0]);
  assert.equal(await page.evaluate(() => vm.autoMatchPreview.poolCount), 0, '父组织的匹配预览不得纳入下级空编');
  await page.locator('[data-org-id="G04"] .tree-card').click();
  assert.deepEqual(await page.locator('.wb-col-title').allTextContents(), ['组织', '编制', '人员']);
  for (const width of [1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    const rows = [];
    for (const column of ['.wb-left', '.wb-mid', '.wb-right']) {
      const box = await page.locator(column).boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= width, column + ' 应完整显示');
      const title = await page.locator(column + ' .wb-col-title').boundingBox();
      const search = await page.locator(column + ' .wb-toolbar').boundingBox();
      rows.push([box.y, box.y + box.height, title.y, search.y]);
    }
    for (const row of rows.slice(1)) row.forEach((value, i) => assert.ok(Math.abs(value - rows[0][i]) < 1, '三栏顶部、底部、标题及搜索行应对齐'));
  }
  assert.deepEqual(await page.evaluate(() => [vm.peopleTotals.employees, vm.workbenchProjection.headcounts.reduce((n,g) => n + g.totalCount, 0)]), [11, 15]);
  for (const selector of ['.wb-mid .rp-hc-actions button', '.wb-mid .hc-code', '.wb-mid .wb-group-head .wb-inline-action', '.wb-mid .wb-head-actions .ant-btn-primary', '.wb-right .rp-actions button', '.wb-right .p-name', '.wb-group-toggle', '.wb-mid input[type="checkbox"]']) {
    const control = page.locator(selector).first();
    await control.hover();
    assert.equal(await control.evaluate(el => getComputedStyle(el).cursor), 'pointer', selector + ' hover 应显示手型');
  }
  assert.equal(await page.locator('.wb-mid button:disabled').first().evaluate(el => getComputedStyle(el).cursor), 'not-allowed');
  assert.equal(await page.locator('.wb-right .rp-drag').first().evaluate(el => getComputedStyle(el).cursor), 'grab');

  await page.locator('[data-org-id="G04"] .tree-action-trigger').click();
  await page.getByRole('menuitem', { name: '管理职位', exact: true }).click();
  const originalOrder = await page.evaluate(() => vm.pmItems.map(p => p.id));
  await page.getByRole('button', { name: '调整顺序', exact: true }).click();
  await page.locator('.pm-sort-row').first().getByRole('button', { name: /^下\s*移$/ }).click();
  await page.getByRole('button', { name: '保存顺序', exact: true }).click();
  assert.deepEqual(await page.evaluate(() => vm.pmItems.map(p => p.id)), [originalOrder[1], originalOrder[0], ...originalOrder.slice(2)]);
  // 两栏排序同步且不依赖管理列表的搜索或状态显示。
  assert.deepEqual(await page.evaluate(() => vm.peopleGroups.filter(g => g.org.id === 'G04').map(g => g.position.id)), [originalOrder[1], originalOrder[0], ...originalOrder.slice(2)]);

  await page.locator('[data-row-key="C1-P01"]').getByText('复制', { exact: true }).click();
  assert.equal(await page.evaluate(() => vm.posForm.orgId), 'G04');
  assert.ok(await page.locator('.pos-form-grid .ant-select-disabled').count());
  await page.getByPlaceholder('请输入职位名称').fill('复制备用职位');
  await page.locator('.ant-modal:visible').last().getByRole('button', { name: '确 认', exact: true }).click();
  const copyId = await page.evaluate(() => vm.g.positions.find(p => p.name === '复制备用职位').id);
  assert.deepEqual(await page.evaluate(id => { const p = vm.pmItems.find(p => p.id === id); return [p.emp, p.total, p.avail]; }, copyId), [0, 0, 0]);
  await page.locator('[data-row-key="' + copyId + '"]').getByText('更多 ▾', { exact: true }).click();
  await page.getByRole('menuitem', { name: '停用', exact: true }).click();
  await page.getByRole('button', { name: '确认停用', exact: true }).click();
  await page.waitForTimeout(250);
  assert.equal(await page.locator('[data-row-key="' + copyId + '"]').count(), 0);
  await page.getByText('显示已停用', { exact: true }).click();
  await page.locator('[data-row-key="' + copyId + '"]').getByText('启用', { exact: true }).click();
  await page.getByRole('button', { name: '确认启用', exact: true }).click();
  await page.waitForTimeout(250);
  assert.equal(await page.evaluate(id => OA.store.G.position(vm.g, id).status, copyId), '有效');
  await page.locator('.pm-footer').getByRole('button', { name: '关 闭', exact: true }).click();

  // 同组织内成功操作应保留另一栏选择，不能由定位顺带清掉。
  await page.evaluate(() => {
    vm.selectedHcIds = ['C1-H10']; vm.openTransfer(['C1-E01']);
    vm.tf.header.orgId = 'G04'; vm.tf.header.posId = 'C1-P02'; vm.tf.header.mgrId = 'M02';
    vm.tf.bring = false; vm.confirmTransfer();
  });
  assert.equal(await page.evaluate(() => vm.tf.open), false);
  assert.deepEqual(await page.evaluate(() => [vm.currentOrgId, vm.selectedHcIds]), ['G04', ['C1-H10']]);

  // 外层草稿经“去处理”回工作台后，可通过实际按钮继续填写。
  await page.evaluate(() => { vm.openTransfer(['C1-E02']); vm.tf.form.workCity = '待处理前草稿'; });
  await page.locator('.ant-modal:visible .position-field-tools').getByText('管理职位', { exact: true }).click();
  await page.locator('[data-row-key="C1-P01"]').getByText('更多 ▾', { exact: true }).click();
  await page.getByRole('menuitem', { name: '停用', exact: true }).click();
  await page.getByRole('button', { name: '去处理', exact: true }).click();
  await page.locator('.wb-draft-return').waitFor();
  await page.waitForFunction(() => [...document.querySelectorAll('.ant-modal')].every(el => !el.getClientRects().length));
  assert.equal(await page.locator('.ant-modal:visible').count(), 0);
  assert.equal(await page.evaluate(() => OA.store.G.position(vm.g, 'C1-P01').status), '有效');
  await page.getByRole('button', { name: '返回继续', exact: true }).click();
  assert.equal(await page.evaluate(() => vm.tf.form.workCity), '待处理前草稿');
  await page.locator('.ant-modal:visible').getByRole('button', { name: '取 消', exact: true }).click();

  // 不合理的职级变化须在工作台分组及管理列表都能发现，不能隐藏待处理。
  await page.evaluate(() => { vm.openPositionManager('G04'); vm.openPosForm('edit', 'C1-P01'); vm.posForm.levelMin = 'P3-1'; vm.posForm.levelMax = 'P3-4'; vm.submitPosForm(); });
  await page.locator('[data-row-key="C1-P01"] .cap-pending').waitFor();
  await page.locator('.pm-footer').getByRole('button', { name: '关 闭', exact: true }).click();
  await page.locator('.wb-right [data-pos-id="C1-P01"] .cap-pending').click();
  await page.getByText('待处理事项', { exact: true }).waitFor();
}

async function workbenchOperations(page) {
await page.goto(baseUrl + '/03-工作台.html?plan=plan-case1');await page.waitForSelector('.wb-data-panels');
await page.evaluate(()=>{window.vm=document.querySelector('#app').__vue_app__._container._vnode.component.proxy;vm.selectOrg('G04')});
await page.locator('.wb-mid .rp-hc input').first().check();await page.locator('.wb-right .rp-person input').first().check();
assert.deepEqual(await page.evaluate(()=>[vm.selectedHcIds.length,vm.selectedPersonIds.length]),[1,1]);
await page.locator('.wb-mid .wb-panel-summary').click();assert.equal(await page.evaluate(()=>vm.selectedHcIds.length),1);
await page.locator('.wb-right .ant-input-search input').fill('孙八');assert.deepEqual(await page.evaluate(()=>[vm.selectedHcIds.length,vm.selectedPersonIds.length]),[1,0]);
await page.locator('[data-org-id="G05"] .tree-card').click();assert.equal(await page.evaluate(()=>vm.selectedHcIds.length),0);
await page.locator('[data-org-id="G04"] .tree-card').click();
await page.locator('.wb-right .ant-input-search input').fill('');
await page.evaluate(()=>{vm.selectedHcIds=['C1-H10','C1-H11'];vm.selectedPersonIds=['C1-E01']});
// Actual drag events through DOM handlers, including a prohibited position-group drop.
const dt=await page.evaluateHandle(()=>new DataTransfer());
await page.locator('.wb-mid .rp-hc').first().dispatchEvent('dragstart',{dataTransfer:dt,clientX:650,clientY:400});
await page.locator('.wb-mid .wb-group-head').first().dispatchEvent('drop',{dataTransfer:dt});
assert.equal(await page.evaluate(()=>vm.hcTf.open),false);
await page.locator('[data-org-id="G05"]').dispatchEvent('drop',{dataTransfer:dt});
await page.waitForSelector('.ant-modal:visible');
assert.deepEqual(await page.evaluate(()=>[vm.hcTf.lockOrg,vm.hcTf.header.orgId,vm.hcTf.header.posId]),[true,'G05',null]);
await page.locator('.ant-modal:visible').getByRole('button',{name:'取 消'}).click();
await page.evaluate(()=>vm.onDragEnd());assert.deepEqual(await page.evaluate(()=>[vm.selectedHcIds.length,vm.selectedPersonIds.length]),[2,1]);
// Top add works on empty organization and no-match search; quick create returns to outer draft.
await page.evaluate(()=>{const r=OA.store.apply('plan-case1','addOrg',{parentId:'G03',name:'BP试验组织'});window.orgId=r.id;vm.selectOrg(r.id);vm.hcKeyword='无搜索结果'});
await page.locator('.wb-mid .wb-head-actions').getByRole('button',{name:/^增\s*编$/}).click();
await page.locator('.ant-modal:visible').getByText('新建职位',{exact:true}).click();
await page.locator('.ant-modal:visible').last().getByPlaceholder('请输入职位名称').fill('BP试验职位');
await page.evaluate(()=>{vm.posForm.levelMin='P3-1';vm.posForm.levelMax='P5-4'});
await page.locator('.ant-modal:visible').last().getByRole('button',{name:'确 认',exact:true}).click();
await page.waitForTimeout(350);
assert.ok(await page.evaluate(()=>vm.addHcForm.posId));
await page.evaluate(()=>{window.posId=vm.addHcForm.posId;vm.addHcForm.level='P4-2'});
await page.locator('.ant-modal:visible').getByRole('button',{name:'确 认',exact:true}).click();
await page.waitForTimeout(350);assert.equal(await page.evaluate(()=>vm.addHcOpen),false);
assert.equal(await page.evaluate(()=>vm.hcKeyword),'');
await page.evaluate(()=>{vm.openTransfer(['C1-E01'],{orgId:orgId,lockOrg:true});vm.tf.header.posId=posId;vm.tf.header.mgrId='M03';vm.tf.bring=false;vm.confirmTransfer()});await page.waitForTimeout(350);
assert.equal(await page.evaluate(()=>vm.tf.open),false);
await page.locator('.wb-mid').getByRole('button',{name:'自动匹配'}).click();await page.waitForTimeout(150);
assert.equal(await page.evaluate(()=>vm.am.pairs.length),1);
await page.locator('.ant-modal:visible').getByRole('button',{name:'应用匹配'}).click();await page.waitForTimeout(350);
assert.ok(await page.evaluate(()=>OA.store.G.person(vm.g,'C1-E01').headcountId));
await page.locator('.wb-right .rp-person').first().getByText('解除编制',{exact:true}).click();
await page.locator('.ant-modal-confirm').getByRole('button',{name:'确认解除'}).click();await page.waitForTimeout(350);
assert.equal(await page.evaluate(()=>OA.store.G.person(vm.g,'C1-E01').headcountId),null);
// New HC removal nets to zero; baseline HC retains read-only restore.
await page.evaluate(()=>{const h=OA.store.G.hcsOf(vm.g,posId)[0];vm.openReduceHc([h.id]);vm.confirmReduceHc()});await page.waitForTimeout(350);
assert.equal(await page.locator('.rp-hc-removed').count(),0);
await page.evaluate(()=>{vm.selectOrg('G04');vm.openReduceHc(['C1-H10']);vm.confirmReduceHc()});await page.waitForTimeout(350);
assert.equal(await page.locator('.rp-hc-removed input').count(),0);assert.ok(await page.locator('.rp-hc-removed').count());
await page.locator('.rp-hc-removed').getByRole('button',{name:'恢复编制'}).click();await page.waitForTimeout(200);
assert.ok(await page.evaluate(()=>OA.store.G.hc(vm.g,'C1-H10')));
}

async function compareOperations(page) {
await page.goto(baseUrl + '/04-前后对比.html?plan=plan-case2&embed=1');await page.waitForSelector('.cmp-toolbar');await page.evaluate(()=>{window.vm=document.querySelector('#app').__vue_app__._container._vnode.component.proxy});assert.equal(await page.locator('.cmp-toolbar input[type=checkbox]').count(),2);assert.equal(await page.locator('.oc-details').count(),0);assert.equal(await page.locator('.oc-counts').filter({hasText:'岗位'}).count(),0);
await page.getByText('人员和编制',{exact:true}).click();await page.waitForTimeout(350);assert.ok(await page.locator('.oc-person').count());assert.equal(await page.locator('.oc-pos').count(),0);assert.ok(await page.locator('.oc-group-head').count());
await page.evaluate(()=>{vm.kw='赵六'});await page.waitForTimeout(100);assert.ok(await page.locator('.oc-person.oc-hit-soft').count());
await page.evaluate(()=>vm.zoomStep(1));await page.waitForTimeout(100);assert.ok(await page.locator('.oc-connectors path').count());


await page.getByText('收起全部明细',{exact:true}).click();assert.equal(await page.locator('.oc-person').count(),0);await page.getByText('展开全部明细',{exact:true}).click();assert.ok(await page.locator('.oc-person').count());
}

async function lifecycle(page, plan, prefix, employees, total) {
 await page.goto(baseUrl + '/03-工作台.html?plan='+plan);await page.waitForSelector('.wb-data-panels');await bind(page);
 await page.evaluate(()=>{vm.selectOrg('G03')});
 assert.deepEqual(await page.evaluate(()=>[vm.peopleTotals.employees,vm.workbenchProjection.headcounts.length]),[0,0]);
 assert.deepEqual(await page.evaluate(()=>{let people=0,total=0;for(const id of ['G04','G05','G06']){vm.selectOrg(id);people+=vm.peopleTotals.employees;total+=vm.workbenchProjection.headcounts.reduce((n,g)=>n+g.totalCount,0);}return [people,total]}),[employees,total]);
 await page.evaluate(({prefix})=>{vm.openPositionManager('G04');vm.openPosForm('edit',prefix+'-P01');vm.posForm.name='审阅测试职位';vm.submitPosForm();vm.closePositionManager()}, {prefix});
 await page.waitForTimeout(250);await page.reload();await page.waitForSelector('.wb-data-panels');await bind(page);
 assert.equal(await page.evaluate(prefix=>vm.positionName(prefix+'-P01'),prefix),'审阅测试职位');
 await page.getByRole('button',{name:/^撤\s*销$/}).click();assert.notEqual(await page.evaluate(prefix=>vm.positionName(prefix+'-P01'),prefix),'审阅测试职位');
 await page.getByRole('button',{name:/^重\s*做$/}).click();assert.equal(await page.evaluate(prefix=>vm.positionName(prefix+'-P01'),prefix),'审阅测试职位');
 // Previous schema is migrated without dropping the existing plan or changes.
 await page.evaluate(()=>localStorage.setItem('oa.schema','10'));await page.reload();await page.waitForSelector('.wb-data-panels');await bind(page);assert.equal(await page.evaluate(prefix=>vm.positionName(prefix+'-P01'),prefix),'审阅测试职位');
 await page.getByRole('button',{name:'前后对比',exact:true}).click();const frame=page.frameLocator('.compare-iframe');await frame.locator('.cmp-toolbar').waitFor();
 const height=await page.locator('.compare-iframe').evaluate(e=>e.getBoundingClientRect().height);assert.ok(height>700,'对比全屏主体不应被表单滚动限制压缩');
 await frame.getByRole('tab',{name:/职位/}).click();assert.ok(await frame.getByText('审阅测试职位',{exact:true}).count());
 await page.locator('.compare-modal .ant-modal-close').click();await page.waitForTimeout(250);
 // Submission through iframe; preview must expose the same full position differences.
 await page.locator('.wb-actions').getByRole('button',{name:/^提\s*交$/}).click();await frame.getByRole('button',{name:'确认并提交审批'}).click();await page.waitForURL(/05-/);await page.waitForSelector('.status-tag');await bind(page);
 assert.equal(await page.evaluate(()=>vm.plan.status),'审批中');
 const snapshot=await page.evaluate(plan=>JSON.stringify(OA.store.getPlanData(plan).versions[0].snapshot),plan);
 assert.equal(await page.evaluate(({plan,prefix})=>OA.store.apply(plan,'editPosition',{id:prefix+'-P01',name:'非法审批编辑'}).ok,{plan,prefix}),false);
 await page.getByRole('button',{name:'退回…',exact:true}).click();await page.getByPlaceholder('请填写退回意见').fill('请继续核对人员编制');await page.getByRole('button',{name:'确认退回',exact:true}).click();await page.waitForTimeout(250);
 assert.equal(await page.evaluate(()=>vm.plan.status),'草稿');
 await page.getByRole('button',{name:'继续调整',exact:true}).click();await page.waitForSelector('.wb-data-panels');await bind(page);
 await page.evaluate(({plan,prefix})=>OA.store.apply(plan,'editPosition',{id:prefix+'-P01',name:'退回后修订'}),{plan,prefix});
 assert.equal(await page.evaluate(plan=>JSON.stringify(OA.store.getPlanData(plan).versions[0].snapshot),plan),snapshot);
 await page.locator('.wb-actions').getByRole('button',{name:/^提\s*交$/}).click();await frame.getByRole('button',{name:'确认并提交审批'}).click();await page.waitForURL(/05-/);await page.waitForSelector('.status-tag');await bind(page);
 assert.equal(await page.evaluate(()=>vm.versions.length),2);assert.equal(await page.evaluate(plan=>JSON.stringify(OA.store.getPlanData(plan).versions[0].snapshot),plan),snapshot);
}

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' }) });
  try {
    await runSuite(browser, '布局、职位管理、排序、复制启停、选择保留、草稿返回、待处理', managementOperations);
    await runSuite(browser, '工作台选择、组织拖拽、增编调岗、匹配解除、减编恢复', workbenchOperations);
    await runSuite(browser, '对比单一开关、搜索、展开收起、缩放连线', compareOperations);
    for (const row of [['plan-case1', 'C1', 24, 28], ['plan-case2', 'C2', 18, 26]]) {
      await runSuite(browser, row[0] + ' 刷新、历史、兼容、全屏对比、退回和 V1/V2', page => lifecycle(page, ...row));
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
