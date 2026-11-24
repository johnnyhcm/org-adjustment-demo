/* 弱化职位浏览器回归。先运行本地静态服务，再执行：
 * BASE_URL=http://127.0.0.1:8117 node tools/browser-weak-position.js
 * 依赖可通过 NODE_PATH 或 PLAYWRIGHT_MODULE 提供；CHROME_PATH 可指定 Chrome。
 * 每组使用独立临时浏览器上下文，不操作用户浏览器的现有数据。
 */
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const baseUrl = (process.env.BASE_URL || 'http://127.0.0.1:8117').replace(/\/$/, '');

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
    await page.waitForFunction(() => {
      const searches = ['.wb-left', '.wb-mid', '.wb-right'].map(s => document.querySelector(s + ' .wb-toolbar').getBoundingClientRect().top);
      return searches.every(y => Math.abs(y - searches[0]) < 1);
    });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    const rows = [];
    for (const column of ['.wb-left', '.wb-mid', '.wb-right']) {
      const box = await page.locator(column === '.wb-left' ? column : '.wb-data-panels').boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= width, column + ' 应完整显示');
      const title = await page.locator(column + ' .wb-col-title').boundingBox();
      const search = await page.locator(column + ' .wb-toolbar').boundingBox();
      rows.push([box.y, box.y + box.height, title.y, search.y]);
    }
    for (const row of rows.slice(1)) row.forEach((value, i) => assert.ok(Math.abs(value - rows[0][i]) < 1, '三栏顶部、底部、标题及搜索行应对齐'));
  }
  assert.deepEqual(await page.evaluate(() => [vm.peopleTotals.employees, vm.workbenchProjection.headcounts.reduce((n,g) => n + g.totalCount, 0)]), [11, 15]);
  for (const selector of ['.wb-mid .rp-hc-actions button', '.wb-mid .hc-code', '.wb-mid .wb-group-head .wb-inline-action', '.wb-right .rp-actions button', '.wb-right .p-name', '.wb-group-toggle', '.wb-mid input[type="checkbox"]']) {
    const control = page.locator(selector).first();
    await control.hover();
    assert.equal(await control.evaluate(el => getComputedStyle(el).cursor), 'pointer', selector + ' hover 应显示手型');
  }
  assert.equal(await page.locator('.wb-mid button:disabled').first().evaluate(el => getComputedStyle(el).cursor), 'not-allowed');
  assert.equal(await page.locator('.wb-right .rp-drag').first().evaluate(el => getComputedStyle(el).cursor), 'grab');

  await page.locator('[data-org-id="G04"] .tree-action-trigger').click();
  await page.getByRole('menuitem', { name: '管理职位', exact: true }).click();
  const originalOrder = await page.evaluate(() => vm.pmItems.map(p => p.id));
  const nextRow = page.locator('[data-row-key="' + originalOrder[1] + '"]');
  const sortDrag = await page.evaluateHandle(() => new DataTransfer());
  const nextBox = await nextRow.boundingBox();
  await page.locator('[data-row-key="' + originalOrder[0] + '"] .pm-drag-handle').dispatchEvent('dragstart', { dataTransfer: sortDrag });
  await nextRow.dispatchEvent('dragover', { dataTransfer: sortDrag, clientY: nextBox.y + nextBox.height - 2 });
  assert.match(await nextRow.getAttribute('class'), /pm-drop-after/);
  await nextRow.dispatchEvent('drop', { dataTransfer: sortDrag, clientY: nextBox.y + nextBox.height - 2 });
  assert.deepEqual(await page.evaluate(() => vm.pmItems.map(p => p.id)), [originalOrder[1], originalOrder[0], ...originalOrder.slice(2)]);
  // 两栏排序同步且不依赖管理列表的搜索或状态显示。
  assert.deepEqual(await page.evaluate(() => vm.peopleGroups.filter(g => g.org.id === 'G04').map(g => g.position.id)), [originalOrder[1], originalOrder[0], ...originalOrder.slice(2)]);

  await page.locator('[data-row-key="C1-P01"]').getByRole('button',{name:'操作 ▾',exact:true}).click();await page.getByRole('menuitem',{name:'复制',exact:true}).click();
  assert.equal(await page.evaluate(() => vm.posForm.orgId), 'G04');
  assert.equal(await page.locator('.pos-form-grid .ant-select').first().evaluate(el => el.classList.contains('ant-select-disabled')), false);
  assert.equal(await page.evaluate(() => {
    const flatten = nodes => nodes.reduce((out, n) => out.concat([n], flatten(n.children || [])), []);
    const target = flatten(vm.posOrgOptions).find(n => n.value === 'G05');
    return !!target && !target.disabled;
  }), true);
  await page.evaluate(() => { vm.posForm.orgId = 'G05'; });
  await page.getByPlaceholder('请输入职位名称').fill('复制备用职位');
  await page.locator('.ant-modal:visible').last().getByRole('button', { name: '确 认', exact: true }).click();
  const copyId = await page.evaluate(() => vm.g.positions.find(p => p.name === '复制备用职位').id);
  assert.deepEqual(await page.evaluate(() => [vm.currentOrgId, vm.pm.orgId]), ['G05', 'G05']);
  assert.deepEqual(await page.evaluate(id => { const p = vm.pmItems.find(p => p.id === id); return [p.emp, p.total, p.avail]; }, copyId), [0, 0, 0]);
  await page.locator('[data-row-key="' + copyId + '"]').getByText('操作 ▾', { exact: true }).click();
  await page.getByRole('menuitem', { name: '取消新增', exact: true }).click();
  await page.getByRole('button', { name: '取消新增', exact: true }).click();
  await page.waitForFunction(id => !OA.store.G.position(vm.g, id), copyId);
  assert.equal(await page.locator('[data-row-key="' + copyId + '"]').count(), 0);
  await page.locator('.pm-footer').getByRole('button', { name: '关 闭', exact: true }).click();

  // 同组织内成功操作应保留另一栏选择，不能由定位顺带清掉。
  await page.evaluate(() => vm.selectOrg('G04'));
  await page.waitForTimeout(50);
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
  await page.locator('[data-row-key="C1-P01"]').getByText('操作 ▾', { exact: true }).click();
  await page.getByRole('menuitem', { name: '停用', exact: true }).click();
  await page.getByRole('button', { name: '去处理', exact: true }).click();
  await page.locator('.wb-draft-return').waitFor();
  await page.waitForFunction(() => [...document.querySelectorAll('.ant-modal')].every(el => !el.getClientRects().length));
  assert.equal(await page.locator('.ant-modal:visible').count(), 0);
  assert.equal(await page.evaluate(() => OA.store.G.position(vm.g, 'C1-P01').status), '有效');
  await page.getByRole('button', { name: '返回继续', exact: true }).click();
  assert.equal(await page.evaluate(() => vm.tf.form.workCity), '待处理前草稿');
  await page.locator('.ant-modal:visible').getByRole('button', { name: '取 消', exact: true }).click();

  // 职级异常收口到所属组织，管理列表仍可查看，修正后自动消除。
  await page.evaluate(() => { vm.openPositionManager('G04'); vm.openPosForm('edit', 'C1-P01'); vm.posForm.levelMin = 'P3-1'; vm.posForm.levelMax = 'P3-4'; vm.submitPosForm(); });
  await page.locator('[data-row-key="C1-P01"] .cap-pending').waitFor();
  await page.locator('.pm-footer').getByRole('button', { name: '关 闭', exact: true }).click();
  assert.equal(await page.locator('.wb-data-panels .wb-group-head .cap-pending').count(), 0);
  await page.locator('[data-org-id="G04"] .cap-pending').click();
  await page.getByText('待处理事项', { exact: true }).waitFor();
  assert.match(await page.locator('.ant-modal-confirm-content').textContent(), /编制 .*超出职位/);
  await page.locator('.ant-modal-confirm').getByRole('button', { name: '知道了', exact: true }).click();
  await page.evaluate(() => OA.store.apply('plan-case1', 'editPosition', { id: 'C1-P01', levelMin: 'P3-1', levelMax: 'P5-4' }));
  assert.equal(await page.evaluate(()=>OA.store.computePending(vm.plan).some(x=>x.kind==='headcount')),false,'职级异常已消除，待绑定仍保留');
}

async function alignmentOperations(page) {
  await page.goto(baseUrl + '/03-工作台.html?plan=plan-case2');
  await page.waitForSelector('.wb-data-panels');await bind(page);
  await page.evaluate(()=>vm.selectOrg('G04'));
  async function aligned(label) {
    const result=await page.evaluate(()=>{
      const rows=side=>[...document.querySelectorAll(side+' [data-align-key]')].map(el=>{const r=el.getBoundingClientRect();return [el.dataset.alignKey,r.top,r.height];});
      return {hc:rows('.wb-mid'),people:rows('.wb-right')};
    });
    assert.deepEqual(result.hc.map(x=>x[0]),result.people.map(x=>x[0]),label+' 职位顺序');
    result.hc.forEach((row,i)=>{
      assert.ok(Math.abs(row[1]-result.people[i][1])<1,label+' 同职位顶部');
      assert.ok(Math.abs(row[2]-result.people[i][2])<1,label+' 同职位高度');
    });
  }
  assert.equal(await page.locator('.wb-mid .wb-col-head .wb-title-extra').textContent(),'总编 21｜主职占编 9｜长期兼职 1｜短期兼职 1｜浮动 1｜预留 7｜可用空编 2');
  assert.equal(await page.locator('.wb-right .wb-col-head .wb-title-extra').textContent(),'主职 13｜长期兼职 2｜短期兼职 1');
  assert.equal(await page.locator('.wb-panel-summary').count(),0);
  assert.equal(await page.getByText('编制均已占用或预留',{exact:true}).count(),0);
  assert.equal(await page.locator('.wb-mid .ant-btn-dangerous').count(),0);
  for(const selector of ['.wb-mid .wb-group-head .wb-inline-action','.wb-mid .rp-hc-actions button']) {
    const style=await page.locator(selector).first().evaluate(el=>{const s=getComputedStyle(el);return [s.backgroundColor,s.borderTopWidth,s.color];});
    assert.deepEqual(style,['rgba(0, 0, 0, 0)','0px','rgb(14, 102, 251)']);
  }
  const buttonStyle = el => { const s=getComputedStyle(el);return [s.backgroundColor,s.borderTopWidth,s.borderTopColor,s.color,s.borderRadius,s.height,s.padding]; };
  assert.deepEqual(await page.locator('.wb-mid .wb-head-actions button').last().evaluate(buttonStyle),await page.locator('.wb-left .wb-head-actions button').evaluate(buttonStyle),'顶部增编与新增组织样式一致');
  const checkStyle = el => {const s=getComputedStyle(el);return [s.fontFamily,s.fontSize,s.fontWeight,s.lineHeight,s.color];};
  assert.deepEqual(await page.locator('.wb-mid .wb-group-head .wb-check').first().evaluate(checkStyle),await page.locator('.wb-right .wb-group-head .wb-check').first().evaluate(checkStyle));
  assert.equal(await page.locator('.wb-group-summary').count(),0);
  await page.evaluate(()=>OA.store.apply('plan-case2','editPosition',{id:'C2-P01',name:'高级产品规划与用户体验设计专家'}));
  for(const width of [1280,1440]) {
    await page.setViewportSize({width,height:900});await aligned(width+' 初始');
    for(const selector of ['.wb-mid .wb-col-head .wb-title-extra','.wb-right .wb-col-head .wb-title-extra']) {
      assert.ok(await page.locator(selector).evaluate(el=>el.scrollWidth<=el.clientWidth+1),width+' 标题统计应完整显示');
    }
    for(const header of await page.locator('.wb-mid .wb-group-head').all()) {
      const panel=await page.locator('.wb-mid').boundingBox();
      const bounds=await header.boundingBox(), stats=await header.locator('.wb-title-extra').boundingBox(), title=await header.locator('.wb-group-toggle').boundingBox();
      assert.ok(bounds.x>=panel.x && bounds.x+bounds.width<=panel.x+panel.width,'长职位名不能撑出所属面板');
      assert.ok(stats.y<title.y+title.height && title.y<stats.y+stats.height,'职位与统计同一行');
      for(const child of await header.locator('.wb-title-extra,.wb-check,button').all()) {
        const r=await child.boundingBox();assert.ok(r.x>=bounds.x-1 && r.x+r.width<=bounds.x+bounds.width+1,'分组标题内容不溢出');
      }
      assert.ok(await header.locator('.wb-title-extra').evaluate(el=>el.scrollWidth<=el.clientWidth+1),'分组统计完整');
    }
    const boxes=await Promise.all(['.wb-left','.wb-data-panels'].map(s=>page.locator(s).boundingBox()));
    boxes.slice(1).forEach(box=>assert.ok(Math.abs(box.y+box.height-boxes[0].y-boxes[0].height)<1,'三栏底部一致'));
  }
  // 增加一侧内容，验证由自然高度撑开的共同轨道，而非两个 scrollTop 的近似同步。
  await page.evaluate(()=>{vm.openAddHc('C2-P01');vm.addHcForm.count=25;vm.addHcForm.level='P4-2';vm.submitAddHc();});
  assert.equal(await page.evaluate(()=>vm.addHcOpen),false);await aligned('增编后');
  const scroller=page.locator('.wb-data-panels'),box=await scroller.boundingBox();
  for(const [x,delta] of [[box.x+80,300],[box.x+box.width-80,-120]]) {
    const before=await scroller.evaluate(el=>el.scrollTop);
    await page.mouse.move(x,box.y+180);await page.mouse.wheel(0,delta);
    await page.waitForFunction(({before,delta})=>{const top=document.querySelector('.wb-data-panels').scrollTop;return delta>0 ? top>before : top<before;},{before,delta});
    await aligned('从任一面板滚动');
    for(const selector of ['.wb-mid .wb-col-head','.wb-right .wb-col-head']) {
      assert.ok(Math.abs((await page.locator(selector).boundingBox()).y-box.y)<1,'滚动时标题搜索固定');
    }
  }
  const largeHeight=await page.locator('.wb-mid [data-pos-id="C2-P01"]').evaluate(el=>el.getBoundingClientRect().height);
  await page.evaluate(()=>vm.toggleGroup('hc','C2-P01'));await aligned('单侧折叠');
  assert.equal(await page.evaluate(()=>vm.groupCollapsed('people','C2-P01')),false);
  assert.ok(await page.locator('.wb-mid [data-pos-id="C2-P01"]').evaluate((el,before)=>el.getBoundingClientRect().height<before,largeHeight));
  await page.evaluate(()=>vm.toggleGroup('hc','C2-P01'));
  await page.locator('.wb-mid .wb-toolbar input[type="checkbox"]').check();await aligned('单侧批量');
  await page.locator('.wb-right .wb-toolbar input[type="checkbox"]').check();await aligned('切换人员批量');
  assert.equal(await page.locator('.rp-hc-batch').count(),0);assert.equal(await page.locator('.rp-batch-bar').count(),1);
  const slots=await page.locator('.wb-batch-slot').evaluateAll(els=>els.map(el=>el.getBoundingClientRect().height));
  assert.ok(Math.abs(slots[0]-slots[1])<1,'批量操作区等高');
  await page.mouse.move(box.x+80,box.y+180);await page.mouse.wheel(0,240);
  await page.waitForFunction(()=>document.querySelector('.wb-data-panels').scrollTop>20);
  await aligned('批量状态滚动');
  for(const slot of await page.locator('.wb-batch-slot').all()) {
    assert.ok(Math.abs((await slot.boundingBox()).y-box.y-(await page.locator('.wb-mid .wb-col-head').boundingBox()).height)<1,'批量操作区在标题下吸顶');
  }
  await page.evaluate(()=>{vm.selectedHcIds=[];vm.selectedPersonIds=[];});
  const query=await page.evaluate(()=>({hc:vm.headcountGroups[0].availHcs[0].code,person:vm.peopleGroups.at(-1).people[0].name}));
  await page.locator('.wb-mid .ant-input-search input').fill(query.hc);
  await page.locator('.wb-right .ant-input-search input').fill(query.person);await aligned('两侧搜索不同职位');
  assert.equal(await page.evaluate(()=>vm.headcountGroups.length),1);assert.equal(await page.evaluate(()=>vm.peopleGroups.length),1);
  assert.equal(await page.locator('.wb-mid .is-context-only').count(),1);
  assert.equal(await page.locator('.wb-right .is-context-only').count(),1);
  const filteredContext=await page.evaluate(()=>{const g=vm.alignedHeadcountGroups.find(g=>g.isContextOnly);return {key:g.key,summary:'总编 '+g.totalCount+'｜可用空编 '+g.availableCount};});
  assert.equal(await page.locator('.wb-mid [data-align-key="'+filteredContext.key+'"] .wb-title-extra').textContent(),filteredContext.summary,'搜索未命中仍显示真实统计');
  assert.equal(await page.locator('.wb-mid .is-context-only .rp-hc,.wb-mid .is-context-only input,.wb-right .is-context-only .rp-person,.wb-right .is-context-only input').count(),0,'不补未命中明细或选择项');
  assert.equal(await scroller.evaluate(el=>el.scrollTop),0,'搜索重置共享滚动位置');
  await page.locator('.wb-mid .ant-input-search input').fill('不存在的编制');await aligned('单侧无匹配');
  await page.getByText('未找到匹配的编制',{exact:true}).waitFor();
  await page.locator('.wb-right .ant-input-search input').fill('不存在的人员');
  assert.equal(await page.locator('[data-align-key]').count(),0);assert.equal(await page.locator('.wb-empty-title').count(),1);assert.equal(await page.locator('.wb-hc-empty').count(),1);
  await page.locator('.wb-mid .ant-input-search input').fill('');await page.locator('.wb-right .ant-input-search input').fill('');
  const ids=await page.evaluate(()=>{
    const pos=OA.store.apply('plan-case2','addPosition',{orgId:'G04',name:'只有编制的对齐测试',levelMin:'P3-1',levelMax:'P5-4'});
    return {position:pos.id};
  });
  assert.equal(await page.locator('[data-align-key="G04:'+ids.position+'"]').count(),0,'空职位不生成占位');
  await page.evaluate(id=>{OA.store.apply('plan-case2','addHeadcounts',{positionId:id,level:'P4-2',count:1});},ids.position);
  await aligned('仅编制职位');
  const placeholder=page.locator('.wb-right [data-align-key="G04:'+ids.position+'"]');
  assert.equal(await placeholder.locator('.wb-group-head').count(),1,'无人员一侧保留职位标题');
  assert.equal(await placeholder.locator('input,.rp-person').count(),0,'不补虚拟人员或复选框');
  const personOnly=await page.evaluate(()=>{
    const r=OA.store.apply('plan-case2','addPosition',{orgId:'G04',name:'有人无编制对齐测试',levelMin:'P3-1',levelMax:'P5-4'});
    vm.openTransfer(['C2-E01']);vm.tf.header.posId=r.id;vm.tf.header.mgrId='M02';vm.tf.bring=false;vm.confirmTransfer();
    if(vm.tf.open)throw new Error(vm.tf.err || JSON.stringify(vm.tfErrorList));
    return r.id;
  });
  await aligned('仅人员职位');
  const emptyGroup=page.locator('.wb-mid [data-pos-id="'+personOnly+'"]');
  assert.equal(await emptyGroup.locator('.wb-title-extra').textContent(),'总编 0｜可用空编 0');
  assert.equal(await emptyGroup.locator('input,.rp-hc').count(),0,'零编制无复选框或明细');
  assert.equal(await page.locator('.wb-right [data-pos-id="'+personOnly+'"] .rp-person').count(),1);
  if(process.env.QA_OUTPUT_DIR) {
    require('node:fs').mkdirSync(process.env.QA_OUTPUT_DIR,{recursive:true});
    await page.screenshot({path:require('node:path').join(process.env.QA_OUTPUT_DIR,'aligned-position-titles.png')});
  }
  await emptyGroup.getByRole('button',{name:/增编/}).click();
  assert.deepEqual(await page.evaluate(()=>[vm.addHcForm.posId,vm.addHcForm.lockPos]),[personOnly,true]);
  await page.locator('.ant-modal:visible').getByRole('button',{name:'确 认',exact:true}).click();
  await page.waitForFunction(()=>!vm.addHcOpen);await aligned('仅人员职位增编后');
  assert.equal(await emptyGroup.locator('.wb-title-extra').textContent(),'总编 1｜可用空编 1');
  assert.equal(await page.evaluate(()=>OA.store.G.person(vm.g,'C2-E01').headcountId),null,'增编不自动占编');
  await page.evaluate(id=>vm.locateHeadcounts(id,[]),ids.position);
  const target=await page.locator('.wb-mid [data-pos-id="'+ids.position+'"] .wb-group-head').boundingBox();
  assert.ok(target.y>=box.y+(await page.locator('.wb-mid .wb-col-head').boundingBox()).height-1 && target.y<box.y+box.height,'定位应避开固定标题');
  await page.reload();await page.waitForSelector('.wb-data-panels');await bind(page);await aligned('刷新后');
  // 满编仍显示占用明细；仅完全无编制时显示空态。
  await page.evaluate(()=>vm.selectOrg('G06'));
  assert.equal(await page.locator('.wb-hc-empty').count(),0);
  assert.equal(await page.locator('.wb-mid .rp-hc').count(),3);
  for(const width of [1280,1440]) {
    await page.setViewportSize({width,height:900});await aligned('满编明细');
    assert.equal(await page.locator('.wb-mid .rp-hc input').count(),0,'占用不可选择');
  }
  await page.locator('.wb-mid .wb-head-actions').getByRole('button',{name:/^增\s*编$/}).click();
  assert.equal(await page.evaluate(()=>vm.addHcOpen),true);
  await page.locator('.ant-modal:visible').getByRole('button',{name:'取 消',exact:true}).click();
  await page.evaluate(()=>{vm.selectOrg('G03');});
  assert.equal(await page.locator('.wb-hc-empty').textContent(),'暂无编制','空组织同样提示');
  await page.evaluate(()=>{vm.selectOrg('G04');vm.headcountGroups.forEach(g=>vm.toggleGroup('hc',g.position.id));});
  assert.equal(await page.locator('.wb-hc-empty').count(),0,'折叠不当作无数据');
  const demandCode=await page.evaluate(()=>vm.headcountGroups.find(g=>g.demands.length).demands[0].code);
  await page.locator('.wb-mid .ant-input-search input').fill(demandCode);
  assert.equal(await page.locator('.wb-hc-empty').count(),0,'只有招聘预留时不显示空态');
  await page.evaluate(()=>{vm.hcKeyword='';OA.store.apply('plan-case2','removeHeadcountsByIds',{headcountIds:['C2-H08']});vm.hcKeyword=vm.headcountGroups.find(g=>g.removedHcs.length).removedHcs[0].code;});
  assert.equal(await page.locator('.wb-hc-empty').count(),0,'只有减编记录时不显示空态');
  await page.locator('.wb-mid .ant-input-search input').fill('无此编制');
  assert.equal(await page.locator('.wb-hc-empty').textContent(),'未找到匹配的编制');
}

async function workbenchOperations(page) {
await page.goto(baseUrl + '/03-工作台.html?plan=plan-case1');await page.waitForSelector('.wb-data-panels');
await page.evaluate(()=>{window.vm=document.querySelector('#app').__vue_app__._container._vnode.component.proxy;vm.selectOrg('G04')});
const counts=()=>page.evaluate(()=>[vm.selectedHcIds.length,vm.selectedPersonIds.length]);
const hcAll=page.locator('.wb-mid .wb-toolbar input[type="checkbox"]'),peopleAll=page.locator('.wb-right .wb-toolbar input[type="checkbox"]');
await page.locator('.wb-mid .rp-hc input').first().check();
await page.locator('.wb-right .rp-person input').first().check();
assert.deepEqual(await counts(),[0,1],'单条人员勾选清空编制');
await hcAll.check();assert.deepEqual(await counts(),[4,0],'顶部全选清空人员');
await peopleAll.check();assert.deepEqual(await counts(),[0,11],'人员全选包含所有职位');
await page.locator('.wb-mid .wb-group-head .wb-check input').first().check();
assert.deepEqual(await counts(),[2,0],'分组全选同样互斥');
await page.locator('.wb-mid .wb-group-head .wb-check input').nth(1).check();assert.deepEqual(await counts(),[3,0]);
await page.locator('.wb-mid .wb-group-head .wb-check input').first().uncheck();assert.deepEqual(await counts(),[1,0],'取消本组保留其他组');
await page.locator('.wb-mid .rp-hc input').first().check();
assert.equal(await page.locator('.wb-mid .wb-group-head .wb-check input').first().evaluate(el=>el.indeterminate),true);
assert.equal(await hcAll.evaluate(el=>el.indeterminate),true);
await hcAll.check();assert.deepEqual(await counts(),[4,0]);
// 操作、普通数据行、标题和搜索不会被当作列表空白。
await page.locator('.wb-mid .rp-hc .hc-meta').first().click();assert.deepEqual(await counts(),[4,0]);
await page.locator('.wb-mid .hc-code').first().click();
await page.locator('.ant-modal-confirm').getByRole('button',{name:'知道了',exact:true}).click();assert.deepEqual(await counts(),[4,0]);
await page.locator('.wb-mid .wb-group-toggle').first().click();assert.deepEqual(await counts(),[4,0]);
await page.locator('.wb-mid .wb-group-toggle').first().click();
await page.locator('.rp-hc-batch').getByRole('button',{name:/^调\s*编$/}).click();
assert.equal(await page.locator('.ant-modal:visible').getByRole('button',{name:'确认调编',exact:true}).isDisabled(),true);
await page.evaluate(()=>vm.confirmHcTransfer());
assert.deepEqual(await counts(),[4,0],'校验失败不清选择');
await page.locator('.ant-modal:visible').getByRole('button',{name:'取 消',exact:true}).click();assert.deepEqual(await counts(),[4,0]);
await page.locator('.wb-mid .wb-col-head .wb-title-extra').click();assert.deepEqual(await counts(),[4,0]);
await page.locator('.wb-right .ant-input-search input').fill('孙八');assert.deepEqual(await counts(),[4,0],'另一栏搜索保留选择');
await page.locator('.wb-right .ant-input-search input').fill('');
async function clickBlank(side) { const box=await page.locator(side).boundingBox();await page.mouse.click(box.x+5,box.y+box.height-8); }
await clickBlank('.wb-right');assert.deepEqual(await counts(),[0,0],'另一面板纯空白退出选择');
await page.locator('.wb-right .rp-person input').first().check();await clickBlank('.wb-mid');assert.deepEqual(await counts(),[0,0]);
await hcAll.check();await page.locator('.wb-mid .ant-input-search input').fill('无此编制');assert.deepEqual(await counts(),[0,0],'本栏搜索清选择');
await peopleAll.check();await clickBlank('.wb-mid');assert.deepEqual(await counts(),[0,0],'编制空态留白可以取消人员选择');
await page.locator('.wb-mid .ant-input-search input').fill('');
await hcAll.check();await page.locator('[data-org-id="G05"] .tree-card').click();assert.deepEqual(await counts(),[0,0]);
await page.locator('[data-org-id="G04"] .tree-card').click();
await page.locator('.wb-mid .rp-hc input').first().check();await page.locator('.wb-mid .rp-hc input').nth(1).check();
// Actual drag events through DOM handlers, including a prohibited position-group drop.
const dt=await page.evaluateHandle(()=>new DataTransfer());
await page.locator('.wb-mid .rp-hc[draggable="true"]').first().dispatchEvent('dragstart',{dataTransfer:dt,clientX:650,clientY:400});
await page.locator('.wb-mid .wb-group-head').first().dispatchEvent('drop',{dataTransfer:dt});
assert.equal(await page.evaluate(()=>vm.hcTf.open),false);
await page.locator('[data-org-id="G05"]').dispatchEvent('drop',{dataTransfer:dt});
await page.waitForSelector('.ant-modal:visible');
assert.deepEqual(await page.evaluate(()=>[vm.hcTf.lockOrg,vm.hcTf.header.orgId,vm.hcTf.header.posId]),[true,'G05',null]);
await page.locator('.ant-modal:visible').getByRole('button',{name:'取 消'}).click();
await page.evaluate(()=>vm.onDragEnd());assert.deepEqual(await counts(),[2,0]);
// Top add works on empty organization and no-match search; quick create returns to outer draft.
await page.evaluate(()=>{const r=OA.store.apply('plan-case1','addOrg',{parentId:'G03',name:'BP试验组织'});window.orgId=r.id;vm.selectOrg(r.id);vm.hcKeyword='无搜索结果'});
await page.locator('.wb-mid .wb-head-actions').getByRole('button',{name:/^增\s*编$/}).click();
await page.locator('.ant-modal:visible').getByText('新增职位',{exact:true}).click();
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
assert.ok(await page.evaluate(()=>OA.store.G.person(vm.g,'C1-E01').headcountId),'调岗已自动占编');
assert.equal(await page.locator('.wb-mid').getByRole('button',{name:'自动匹配'}).isDisabled(),true);
await page.evaluate(()=>OA.store.apply('plan-case1','releaseHeadcount',{personId:'C1-E01'}));
await page.locator('.wb-mid').getByRole('button',{name:'自动匹配'}).click();await page.waitForTimeout(150);
assert.equal(await page.evaluate(()=>vm.am.pairs.length),1);
await page.locator('.ant-modal:visible').getByRole('button',{name:'应用匹配'}).click();await page.waitForTimeout(350);
assert.ok(await page.evaluate(()=>OA.store.G.person(vm.g,'C1-E01').headcountId));
const releaseId=await page.evaluate(()=>OA.store.G.person(vm.g,'C1-E01').headcountId);
await page.locator('[data-hc-id="'+releaseId+'"]').getByRole('button',{name:'操作 ▾',exact:true}).click();
await page.getByRole('menuitem',{name:'解除绑定',exact:true}).click();
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

async function headcountFormOperations(page) {
  await page.goto(baseUrl + '/03-工作台.html?plan=plan-case1');
  await page.waitForSelector('.wb-data-panels');await bind(page);
  await page.evaluate(()=>{vm.selectOrg('G04');vm.openHcTransfer(['C1-H10']);});
  const modal=page.locator('.ant-modal:visible');
  async function waitClosed() {await page.waitForFunction(()=>[...document.querySelectorAll('.ant-modal')].every(el=>!el.getClientRects().length));}
  async function cancel() {await modal.getByRole('button',{name:'取 消',exact:true}).click();await waitClosed();}
  assert.equal(await modal.locator('.ant-modal-title').textContent(),'调编已选 1 个可用空编');
  const code=await page.evaluate(()=>vm.hcTfHcs[0].code);
  assert.ok(!(await modal.locator('.ant-modal-body').textContent()).includes(code),'正文不平铺编制编码');
  async function checkLayout(label) {
    await modal.evaluate(el=>Promise.allSettled(el.getAnimations({subtree:true}).map(animation=>animation.finished)));
    const layout=await modal.evaluate(el=>{
      const box=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,right:r.right};};
      const field=el.querySelector('.hc-position-field');
      return {modal:box(el),department:box(el.querySelector('.hc-department-field > .ant-select')),position:box(field.querySelector('.ant-select')),tools:box(field.querySelector('.position-field-tools')),level:box(el.querySelector('.hc-layout-grid > .ant-select, .hc-layout-grid > div:not(.form-label):not(.hc-department-field):not(.hc-position-field) > .ant-select'))};
    });
    assert.ok(layout.department.y+layout.department.h<layout.position.y,label+' 部门和职位独立行');
    assert.ok(Math.abs(layout.department.w-layout.position.w)<1 && Math.abs(layout.position.w-layout.level.w)<1,label+' 控件同宽');
    assert.ok(Math.abs(layout.position.x-layout.level.x)<1,label+' 控件起点一致');
    assert.ok(layout.tools.x>=layout.position.right && layout.tools.right<=layout.modal.right-24,label+' 提示和按钮同行且未溢出');
    assert.ok(Math.abs((layout.tools.y+layout.tools.h/2)-(layout.position.y+layout.position.h/2))<1,label+' 提示垂直居中');
  }
  for(const width of [1280,1440]) {await page.setViewportSize({width,height:900});await checkLayout('变更 '+width);}
  await modal.locator('.hc-department-field .ant-select').click();
  const orgName=await page.evaluate(()=>OA.store.G.org(vm.g,'G05').name);
  await modal.locator('.hc-department-field input').fill(orgName);
  await page.locator('.ant-select-tree-title').getByText(orgName,{exact:true}).click();
  assert.deepEqual(await page.evaluate(()=>[vm.hcTf.header.orgId,vm.hcTf.header.posId,vm.hcTf.form.level]),['G05',null,'P4-2'],'切部门清职位并保留其他属性');
  assert.equal(await modal.locator('.hc-position-field .muted').count(),0);
  await modal.locator('.hc-position-field > .ant-select').click();
  const positionLabel=await page.evaluate(()=>vm.hcTfPositions[0].label);
  await page.locator('.ant-select-item-option-content').getByText(positionLabel,{exact:true}).click();
  await modal.getByText('管理职位',{exact:true}).click();
  await page.locator('.pm-footer').getByRole('button',{name:'关 闭',exact:true}).click();
  assert.equal(await page.evaluate(()=>vm.hcTf.header.orgId),'G05','管理职位返回保留草稿');
  await cancel();
  await page.evaluate(()=>{vm.openHcTransfer(['C1-H10']);vm.hcTf.form.category='A';});
  await modal.getByRole('button',{name:'确认调编',exact:true}).click();await waitClosed();
  assert.equal(await page.evaluate(()=>OA.store.G.hc(vm.g,'C1-H10').category),'A');
  await page.evaluate(()=>vm.openHcTransfer(['C1-H10','C1-H11']));
  await modal.getByRole('button',{name:'已选 2 个可用空编',exact:true}).click();
  assert.equal(await page.locator('.hc-selection-list > div').count(),2,'标题可查看整批明细');
  await modal.locator('.hc-modal-title > span').first().click();
  assert.match(await modal.locator('.hc-change-summary').textContent(),/统一/);
  await cancel();
  await page.evaluate(()=>vm.openHcTransfer(['C1-H10'],{orgId:'G05',lockOrg:true}));
  assert.equal(await modal.locator('.hc-department-field .ant-select-disabled').count(),1,'拖拽目标部门锁定');
  await cancel();
  await page.evaluate(()=>vm.openAddHc('C1-P01'));
  assert.equal(await modal.locator('.hc-department-field .ant-select-disabled').count(),1);
  assert.equal(await modal.locator('.hc-position-field .ant-select-disabled').count(),1);
  assert.equal(await modal.getByText('新增职位',{exact:true}).count(),0);
  for(const width of [1280,1440]) {await page.setViewportSize({width,height:900});await checkLayout('增编 '+width);}
  if(process.env.QA_OUTPUT_DIR) {
    require('node:fs').mkdirSync(process.env.QA_OUTPUT_DIR,{recursive:true});
    await page.screenshot({path:require('node:path').join(process.env.QA_OUTPUT_DIR,'headcount-add-form.png')});
  }
  await cancel();
  await page.evaluate(()=>vm.openHcTransfer(['C1-H10']));
  await checkLayout('变更最终');
  if(process.env.QA_OUTPUT_DIR) await page.screenshot({path:require('node:path').join(process.env.QA_OUTPUT_DIR,'headcount-change-form.png')});
  // 与创建下级组织不同：八级部门可以承载编制。实际创建后验证树的业务限制。
  const treeCheck=await page.evaluate(()=>{
    let parentId='G03';
    while(OA.store.G.orgLevel(vm.g,parentId)<OA.store.MAX_ORG_LEVEL) {
      const r=OA.store.apply('plan-case1','addOrg',{parentId,name:'编制树层级'+OA.store.G.orgLevel(vm.g,parentId)});
      if(!r.ok)throw new Error(r.error);parentId=r.id;
    }
    const nodes=[];const walk=xs=>xs.forEach(x=>{nodes.push(x);walk(x.children||[])});walk(vm.businessOrgOptions);
    const scope=OA.store._internals.scopeOrgIds(vm.plan);
    return {deepDisabled:nodes.find(x=>x.value===parentId).disabled,valid:nodes.every(x=>x.disabled===(!scope.has(x.value)||OA.store.G.org(vm.g,x.value).status!=='有效'))};
  });
  assert.deepEqual(treeCheck,{deepDisabled:false,valid:true});
}

async function transferFormOperations(page) {
  await page.goto(baseUrl+'/03-工作台.html?plan=plan-case1');
  await page.waitForSelector('.wb-data-panels');await bind(page);
  await page.evaluate(()=>{vm.selectOrg('G04');vm.openTransfer(['C1-E01']);});
  const modal=page.locator('.ant-modal:visible');
  const waitStable=()=>modal.evaluate(el=>Promise.allSettled(el.getAnimations({subtree:true}).map(a=>a.finished)));
  const waitClosed=()=>page.waitForFunction(()=>[...document.querySelectorAll('.ant-modal')].every(el=>!el.getClientRects().length));
  const original=await page.evaluate(()=>vm.tf.rows[0].name+' · '+vm.tf.rows[0].fromPosName);
  assert.equal(await modal.locator('.tf-person-summary').textContent(),original);
  assert.equal(await modal.locator('.ant-modal-body .tf-person-summary,.tf-people,.tf-summary').count(),0,'正文不重复人员上下文');
  for(const width of [1280,1440]) {
    await page.setViewportSize({width,height:900});await waitStable();
    const r=await modal.evaluate(el=>{
      const box=x=>{const r=x.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,right:r.right};};
      return {department:box(el.querySelector('.tf-department-field > .ant-select')),position:box(el.querySelector('.tf-position-field > .ant-select')),tools:box(el.querySelector('.tf-position-field .position-field-tools')),attribute:box(el.querySelector('.tf-details-grid > input')),title:box(el.querySelector('.tf-modal-title > span')),summary:box(el.querySelector('.tf-person-summary')),modal:box(el)};
    });
    assert.ok(r.position.y>r.department.y+r.department.h,'归属独立行');
    assert.ok(Math.abs(r.department.w-r.position.w)<1 && Math.abs(r.position.w-r.attribute.w)<1,'控件同宽');
    assert.ok(Math.abs(r.position.x-r.attribute.x)<1,'控件起点一致');
    assert.ok(r.tools.x>=r.position.right && r.tools.right<=r.modal.right-24,'职位提示同行不溢出');
    assert.ok(Math.abs(r.tools.y+r.tools.h/2-r.position.y-r.position.h/2)<1);
    assert.ok(Math.abs(r.title.y+r.title.h/2-r.summary.y-r.summary.h/2)<1,'人员信息与标题同行');
  }
  if(process.env.QA_OUTPUT_DIR) {
    require('node:fs').mkdirSync(process.env.QA_OUTPUT_DIR,{recursive:true});
    await page.screenshot({path:require('node:path').join(process.env.QA_OUTPUT_DIR,'transfer-single-form.png')});
  }
  await page.evaluate(()=>vm.tf.rows[0].fromPosName='产品研发及组织人才规划高级业务管理专家'.repeat(8));
  assert.ok(await modal.locator('.tf-person-summary').evaluate(el=>el.scrollWidth>el.clientWidth && el.title===el.textContent && el.getBoundingClientRect().right<el.closest('.ant-modal').querySelector('.ant-modal-close').getBoundingClientRect().left),'长职位名省略且可悬停查看');
  await page.evaluate(()=>{vm.tf.form.workCity='调岗表单验证';});
  await modal.locator('.tf-department-field .ant-select').click();
  const orgName=await page.evaluate(()=>OA.store.G.org(vm.g,'G05').name);
  await modal.locator('.tf-department-field input').fill(orgName);
  await page.locator('.ant-select-tree-title').getByText(orgName,{exact:true}).click();
  assert.deepEqual(await page.evaluate(()=>[vm.tf.header.orgId,vm.tf.header.posId,vm.tf.form.workCity]),['G05',null,'调岗表单验证']);
  assert.equal(await modal.locator('.tf-position-field .muted').count(),0);
  await modal.getByText('管理职位',{exact:true}).click();
  await page.locator('.pm-footer').getByRole('button',{name:'关 闭',exact:true}).click();
  await modal.locator('.tf-position-field').getByText('新增职位',{exact:true}).click();
  await page.locator('.ant-modal:visible').last().getByPlaceholder('请输入职位名称').fill('调岗新增职位验证');
  await page.evaluate(()=>{vm.posForm.levelMin='P3-1';vm.posForm.levelMax='P5-4';});
  await page.locator('.ant-modal:visible').last().getByRole('button',{name:'确 认',exact:true}).click();
  await page.waitForFunction(()=>!vm.posForm.open && !!vm.tf.header.posId);
  const target=await page.evaluate(()=>vm.tf.header.posId);
  assert.equal(await page.evaluate(()=>vm.tf.form.workCity),'调岗表单验证');
  assert.match(await modal.locator('.tf-position-field .muted').textContent(),/P3-1.*P5-4.*空编 0/);
  await page.evaluate(()=>{vm.tf.bring=false;});
  await modal.getByRole('button',{name:'确认调岗',exact:true}).click();await waitClosed();
  assert.equal(await page.evaluate(()=>OA.store.G.person(vm.g,'C1-E01').positionId),target,'新增回选后实际调岗成功');
  await page.evaluate(()=>{vm.selectedPersonIds=['C1-E02','C1-E03'];vm.openTransfer(vm.selectedPersonIds);});
  await modal.getByRole('button',{name:'已选 2 人',exact:true}).click();
  assert.equal(await page.locator('.tf-selection-list > div').count(),2);
  assert.match(await modal.locator('.tf-batch-summary').textContent(),/统一/);
  await modal.locator('.tf-modal-title > span').click();await waitStable();
  await page.waitForFunction(()=>[...document.querySelectorAll('.ant-popover')].every(el=>!el.getClientRects().length));
  if(process.env.QA_OUTPUT_DIR) await page.screenshot({path:require('node:path').join(process.env.QA_OUTPUT_DIR,'transfer-batch-form.png')});
  await modal.getByRole('button',{name:'取 消',exact:true}).click();await waitClosed();
  assert.deepEqual(await page.evaluate(()=>vm.selectedPersonIds),['C1-E02','C1-E03']);
  await page.evaluate(()=>vm.openTransfer(['C1-E02'],{orgId:'G05',lockOrg:true}));
  assert.equal(await modal.locator('.tf-department-field .ant-select-disabled').count(),1);
  assert.equal(await modal.locator('.tf-position-field .ant-select-disabled').count(),0,'拖拽后手动选择职位');
}

async function transferDragOperations(page) {
  async function load() {
    await page.goto(baseUrl+'/03-工作台.html?plan=plan-case2');await page.waitForSelector('.wb-data-panels');await bind(page);
    await page.evaluate(()=>vm.selectOrg('G04'));
  }
  async function reset() {await page.evaluate(()=>OA.store.resetAll());await load();}
  async function closed() {await page.waitForFunction(()=>[...document.querySelectorAll('.ant-modal')].every(e=>!e.getClientRects().length));}
  const person=id=>page.locator('.wb-right .rp-person[data-person-id="'+id+'"]');
  async function compact(id,posId) {
    const labels=await page.evaluate(({id,posId})=>({name:OA.store.G.person(vm.g,id).name,code:vm.scopedDataGroups.get('G04:'+posId).allHcs[0].code}),{id,posId});
    await page.locator('.wb-mid .ant-input-search input').fill(labels.code);
    await page.locator('.wb-right .ant-input-search input').fill(labels.name);
  }

  const modal=()=>page.locator('.ant-modal:visible');
  async function cancel() {await modal().getByRole('button',{name:'取 消',exact:true}).click();await closed();}
  async function confirm(name='确认调岗') {assert.equal(await modal().getByRole('button',{name,exact:true}).isEnabled(),true);await modal().getByRole('button',{name,exact:true}).click();await closed();}
  async function target(orgId,name,count=1,min='P3-1',max='P5-4') {
    return page.evaluate(({orgId,name,count,min,max})=>{
      const p=OA.store.apply('plan-case2','addPosition',{orgId,name,levelMin:min,levelMax:max});if(!p.ok)throw new Error(p.error);
      if(count){const h=OA.store.apply('plan-case2','addHeadcounts',{positionId:p.id,level:min,count});if(!h.ok)throw new Error(h.error);}
      return p.id;
    },{orgId,name,count,min,max});
  }
  await load();
  const hc=await page.evaluate(()=>OA.store.G.availableHcs(vm.g,'C2-P01')[0].id);
  const before=await page.evaluate(()=>JSON.stringify(vm.g));
  await person('C2-E25').dragTo(page.locator('.wb-mid [data-hc-id="'+hc+'"]'));
  await modal().waitFor();
  assert.match(await modal().locator('.ant-modal-title').textContent(),/编制绑定/);
  assert.equal(await modal().getByText('直接上级',{exact:true}).count(),0);
  assert.equal(await modal().locator('.tf-bring').count(),0);
  assert.deepEqual(await page.evaluate(()=>[vm.tfAllocation.boundCount,vm.tfAllocation.pendingCount]),[1,0]);
  await cancel();assert.equal(await page.evaluate(()=>JSON.stringify(vm.g)),before,'取消无写入');
  await person('C2-E25').dragTo(page.locator('.wb-mid [data-hc-id="'+hc+'"]'));
  await confirm('确认绑定');
  assert.deepEqual(await page.evaluate(()=>[OA.store.G.person(vm.g,'C2-E25').headcountId,OA.store.G.person(vm.g,'C2-E26').headcountId]),[hc,'C2-H32']);
  await page.getByRole('button',{name:/^撤\s*销$/}).click();
  assert.equal(await page.evaluate(()=>JSON.stringify(vm.g)),before,'绑定一步撤销');

  // 三人拖一个空编，拖动起点为第二名；空编不足仍允许确认，仅绑定不改变岗位。
  for(const id of ['C2-E25','C2-E26','C2-E28']) await person(id).locator('input').check();
  await person('C2-E26').dragTo(page.locator('.wb-mid [data-hc-id="'+hc+'"]'));
  assert.deepEqual(await page.evaluate(()=>[vm.tf.rows[0].personId,vm.tfAllocation.boundCount,vm.tfAllocation.pendingCount]),['C2-E26',1,2]);
  await modal().locator('.tf-allocation summary').click();
  assert.match(await modal().locator('.tf-allocation').textContent(),/待绑编/);
  if(process.env.QA_OUTPUT_DIR) await page.screenshot({path:require('node:path').join(process.env.QA_OUTPUT_DIR,'transfer-batch-shortage.png')});
  await confirm('确认绑定');
  assert.equal(await page.evaluate(()=>OA.store.G.person(vm.g,'C2-E26').headcountId),hc);
  assert.deepEqual(await page.evaluate(()=>['C2-E25','C2-E28'].map(id=>OA.store.assignmentHeadcountState(vm.g,OA.store.G.person(vm.g,id),'main',vm.plan.effDate).status)),['待绑定','待绑定']);
  await page.getByRole('button',{name:/^撤\s*销$/}).click();await page.getByRole('button',{name:/^重\s*做$/}).click();
  await page.reload();await page.waitForSelector('.wb-data-panels');await bind(page);
  assert.equal(await page.evaluate(()=>OA.store.G.person(vm.g,'C2-E26').headcountId),hc,'刷新保持');

  await reset();
  const pos=await target('G04','拖拽职位自动占编验证');
  await compact('C2-E25',pos);
  await person('C2-E25').dragTo(page.locator('.wb-right [data-pos-id="'+pos+'"] .wb-group-head'));
  await modal().waitFor();
  assert.deepEqual(await page.evaluate(()=>[vm.tf.lockOrg,vm.tf.lockPos,vm.tfHasHcCount,vm.tfAllocation.boundCount]),[true,true,0,1]);
  await confirm();
  assert.equal(await page.evaluate(()=>OA.store.G.person(vm.g,'C2-E25').positionId),pos);
  assert.equal(await page.evaluate(()=>OA.store.G.person(vm.g,'C2-E28').headcountId),null,'不处理未选人员');
  await compact('C2-E26',pos);
  await person('C2-E26').dragTo(page.locator('.wb-mid [data-pos-id="'+pos+'"] .wb-group-head'));
  await modal().waitFor();
  assert.equal(await page.evaluate(()=>vm.tfAllocation.pendingCount),1);await confirm();
  assert.deepEqual(await page.evaluate(()=>[OA.store.G.person(vm.g,'C2-E26').positionId,OA.store.G.person(vm.g,'C2-E26').headcountId]),[pos,null]);
  assert.equal(await page.evaluate(()=>OA.store.G.hc(vm.g,'C2-H32').positionId),'C2-P01');

  await reset();
  const orgPos=await target('G05','组织落点自动占编验证');
  await person('C2-E01').dragTo(page.locator('[data-org-id="G05"] .tree-card'));
  await modal().waitFor();
  assert.deepEqual(await page.evaluate(()=>[vm.tf.header.orgId,vm.tf.header.posId,vm.tf.lockOrg,vm.tf.lockPos]),['G05',null,true,false]);
  await modal().locator('.tf-position-field .ant-select-selector').click();
  await page.locator('.ant-select-dropdown:visible').getByText(/组织落点自动占编验证/).click();
  await modal().locator('.tf-bring input').uncheck();
  assert.equal(await page.evaluate(()=>vm.tfAllocation.boundCount),1);await confirm();
  assert.equal(await page.evaluate(()=>OA.store.G.person(vm.g,'C2-E01').positionId),orgPos);
  assert.ok(await page.evaluate(()=>OA.store.G.person(vm.g,'C2-E01').headcountId));

  await reset();
  const badPos=await target('G04','带编不匹配验证',1,'P1-1','P1-4');
  await compact('C2-E01',badPos);
  await person('C2-E01').dragTo(page.locator('.wb-mid [data-pos-id="'+badPos+'"] .wb-group-head'));
  await modal().waitFor();
  assert.deepEqual(await page.evaluate(()=>[vm.tfAllocation.carriedCount,vm.tfAllocation.boundCount,vm.tfAllocation.abnormalCount]),[1,0,1]);
  await modal().locator('.tf-allocation summary').click();
  if(process.env.QA_OUTPUT_DIR) await page.screenshot({path:require('node:path').join(process.env.QA_OUTPUT_DIR,'transfer-carry-mismatch.png')});
  await confirm();
  assert.equal(await page.evaluate(()=>OA.store.G.person(vm.g,'C2-E01').positionId),badPos);
  assert.equal(await page.evaluate(id=>OA.store.G.availableHcs(vm.g,id).length,badPos),1,'带编不额外占空编');
  assert.equal(await page.evaluate(()=>OA.store.apply('plan-case2','submit',{}).ok),false,'异常阻止提交');
  // 禁止预留落点，不应占编人员仍可通过职位正常调岗。
  await page.evaluate(()=>{vm.selectOrg('G04');vm.hcKeyword='';vm.rpKeyword='';});
  const reserved=await page.evaluate(()=>vm.g.headcounts.find(h=>h.positionId==='C2-P01' && ['Offer占用','待调入预留','入职预留'].includes(h.state)).id);
  const beforeInvalid=await page.evaluate(()=>JSON.stringify(vm.g));
  const dt=await page.evaluateHandle(()=>new DataTransfer());
  await person('C2-E27').dispatchEvent('dragstart',{dataTransfer:dt,clientX:1100,clientY:350});
  await page.locator('[data-hc-id="'+reserved+'"]').dispatchEvent('drop',{dataTransfer:dt});
  assert.equal(await page.evaluate(()=>vm.tf.open),false);assert.equal(await page.evaluate(()=>JSON.stringify(vm.g)),beforeInvalid);
  await page.evaluate(()=>vm.onDragEnd());
}

async function compareOperations(page) {
await page.goto(baseUrl + '/04-前后对比.html?plan=plan-case2&embed=1');await page.waitForSelector('.cmp-toolbar');await page.evaluate(()=>{window.vm=document.querySelector('#app').__vue_app__._container._vnode.component.proxy});assert.equal(await page.locator('.cmp-toolbar input[type=checkbox]').count(),2);assert.equal(await page.locator('.oc-details').count(),0);assert.equal(await page.locator('.oc-counts').filter({hasText:'岗位'}).count(),0);
await page.getByText('人员和编制',{exact:true}).click();await page.waitForTimeout(350);assert.ok(await page.locator('.oc-person').count());assert.ok(await page.locator('.oc-pos').count());assert.equal(await page.locator('.oc-group-head').count(),0);
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
 await page.evaluate(()=>localStorage.setItem(OA.store.STORAGE_PREFIX+'schema','10'));await page.reload();await page.waitForSelector('.wb-data-panels');await bind(page);assert.equal(await page.evaluate(prefix=>vm.positionName(prefix+'-P01'),prefix),'审阅测试职位');
 await page.getByRole('button',{name:'前后对比',exact:true}).click();const frame=page.frameLocator('.compare-iframe');await frame.locator('.cmp-toolbar').waitFor();
 await page.waitForFunction(() => getComputedStyle(document.querySelector('.compare-modal .ant-modal')).transform === 'none');
 const height=await page.locator('.compare-iframe').evaluate(e=>e.getBoundingClientRect().height);assert.ok(height>700,'对比全屏主体不应被表单滚动限制压缩');
 await frame.getByRole('tab',{name:/职位/}).click();assert.ok(await frame.getByText('审阅测试职位',{exact:true}).count());
 await page.locator('.compare-modal .ant-modal-close').click();await page.waitForTimeout(250);
 // 复杂案例必须先通过真实占编规则，后续审批快照才有意义。
 if(plan==='plan-case2') await page.evaluate(()=>{
   const S=OA.store, pid='plan-case2';
   for(const [type,payload] of [
     ['applyAutoMatch',{positionId:'C2-P01'}],
     ['releaseHeadcount',{personId:'C2-E24'}],
     ['moveHeadcountsByIds',{headcountIds:['C2-H29'],targetPositionId:'C2-P01',level:'P4-2'}],
     ['applyAutoMatch',{positionId:'C2-P01'}]
   ]) { const result=S.apply(pid,type,payload);if(!result.ok)throw new Error(result.error); }
 });
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
    await runSuite(browser, '标题统计、同职位等高、同步滚动、搜索占位、折叠批量与定位', alignmentOperations);
    await runSuite(browser, '工作台选择、组织拖拽、增编调岗、匹配解除、减编恢复', workbenchOperations);
    await runSuite(browser, '编制表单标题、布局、部门树搜索、批量明细及锁定返回', headcountFormOperations);
    await runSuite(browser, '人员调岗标题、长文本、批量名单、部门树及新增职位保存', transferFormOperations);
    await runSuite(browser, '人员实际拖拽：组织、双栏职位、空编、批量缺编、浮动转绑及撤销', transferDragOperations);
    await runSuite(browser, '对比单一开关、搜索、展开收起、缩放连线', compareOperations);
    for (const row of [['plan-case1', 'C1', 24, 28], ['plan-case2', 'C2', 23, 35]]) {
      await runSuite(browser, row[0] + ' 刷新、历史、兼容、全屏对比、退回和 V1/V2', page => lifecycle(page, ...row));
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
