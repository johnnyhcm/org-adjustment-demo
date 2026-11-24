/* 变化审阅回归：独立浏览器上下文与临时方案，使用真实业务操作准备主要场景。 */
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const baseUrl = (process.env.BASE_URL || 'http://127.0.0.1:8120').replace(/\/$/, '');
(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' }) });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const page = await context.newPage(), errors = [];
  await require('./browser-overview-stub.js')(context);
  page.setDefaultTimeout(10000);
  page.on('pageerror', e => errors.push(e.message));
  const settle = async () => page.evaluate(async () => {
    window.vm = document.querySelector('#app').__vue_app__._container._vnode.component.proxy;
    await vm.$nextTick();
    for (let i = 0; i < 8; i++) await new Promise(requestAnimationFrame);
  });
  const open = async id => {
    await page.goto(baseUrl + '/04-前后对比.html?plan=' + id);
    await page.waitForSelector('.cmp-toolbar'); await settle();
  };
  const filter = async checked => { await page.getByRole('checkbox', { name: '只看变化', exact: true }).setChecked(checked); await settle(); };
  const details = () => page.getByRole('checkbox', { name: '人员和编制', exact: true });
  const card = (side, id) => page.locator('.cmp-side').nth(side === 'L' ? 0 : 1).locator('[data-oc-id="' + id + '"] > .oc-head > .oc-box');
  const mode = async label => {
    await page.locator('.cmp-toolbar .ant-radio-button-wrapper').getByText(label, { exact: true }).click(); await settle();
  };
  const fitted = async () => {
    const metrics = await page.evaluate(() => vm.visibleSides.map(side => {
      const view = vm.$refs[side === 'L' ? 'leftView' : 'rightView'], vr = view.getBoundingClientRect();
      const boxes = [...view.querySelectorAll('.oc-box,.oc-pos,.oc-person,.oc-hcsum')].filter(e => e.getClientRects().length).map(e => e.getBoundingClientRect());
      if (!boxes.length) return null;
      const left = Math.min(...boxes.map(r => r.left)), right = Math.max(...boxes.map(r => r.right));
      return { center: (left + right) / 2 - vr.left - view.clientWidth / 2,
        width: right - left, available: view.clientWidth, zoom: vm.zoom,
        top: Math.min(...boxes.map(r => r.top)) - vr.top,
        bottom: Math.max(...boxes.map(r => r.bottom)) - vr.top, height: view.clientHeight };
    }));
    for (const m of metrics.filter(Boolean)) {
      assert.ok(Math.abs(m.center) < 1.5, '过滤／模式切换后水平居中：' + JSON.stringify(m));
      if (m.zoom > 0.25) assert.ok(m.width <= m.available + 1.5 && m.top >= -1.5 && m.bottom <= m.height + 1.5, '适配画布');
    }
  };
  const verifyPositionCounts = async () => {
    const expected = await page.evaluate(() => {
      const S = OA.store, result = [];
      const delta = n => n ? '（' + (n > 0 ? '+' : '') + n + '）' : '';
      const walk = (nodes, side) => nodes.forEach(n => {
        n.positions.forEach(p => {
          const b = S.G.hcsOf(vm.base, p.id), a = S.G.hcsOf(vm.g, p.id);
          const vacant = hs => hs.filter(h => h.state === '可用' || h.state === '需求预留').length;
          result.push({ side, name: p.name, total: '编制 ' + p.hcTotal + (side === 'R' && S.G.position(vm.base, p.id) ? delta(a.length - b.length) : ''),
            vacant: '空编 ' + p.hcVacant + (side === 'R' && S.G.position(vm.base, p.id) ? delta(vacant(a) - vacant(b)) : '') });
        }); walk(n.children, side);
      });
      walk(vm.leftTree, 'L'); walk(vm.rightTree, 'R'); return result;
    });
    for (const item of expected) {
      const detail = page.locator('.cmp-side').nth(item.side === 'L' ? 0 : 1).locator('.oc-detail').filter({ has: page.getByText(item.name, { exact: true }).and(page.locator('.oc-pos-name')) });
      // 职位名称可能包含同名，按当前侧和本测试唯一的样例名称匹配。
      assert.equal(await detail.count(), 1, item.name);
      assert.equal((await detail.locator('.oc-position-headcounts').textContent()).trim(), item.total);
      assert.equal((await detail.locator('.oc-position-vacant').textContent()).trim(), item.vacant);
    }
    const colors = await page.locator('.cmp-side .oc-delta').evaluateAll(nodes => nodes.map(el => ({ text: el.textContent, color: getComputedStyle(el).color })));
    for (const item of colors) assert.equal(item.color, item.text.includes('+') ? 'rgb(255, 77, 79)' : 'rgb(0, 178, 89)', item.text);
    assert.equal(await page.locator('.cmp-side').first().locator('.oc-delta').count(), 0, '前侧无差值');
  };
  const verifyTransferLabels = async () => {
    const expected = await page.evaluate(() => vm.visibleSides.map(side => {
      const graph = side === 'L' ? vm.g : vm.base, S = OA.store;
      const person = S.G.person(graph, 'C2-E01'), position = S.G.position(graph, person.positionId);
      const place = S.G.org(graph, position.orgId).name + '／' + position.name;
      return { side, name: person.name, tag: side === 'L' ? '调出' : '调入',
        note: side === 'L' ? '拟调往：' + place : '拟由：' + place + '调入' };
    }));
    for (const item of expected) {
      const row = page.locator('.cmp-side').nth(item.side === 'L' ? 0 : 1).locator('.oc-person')
        .filter({ has: page.locator('.oc-person-name').getByText(item.name, { exact: true }) });
      assert.equal(await row.count(), 1, '本人按本侧真实职位展示');
      assert.equal(await row.locator('.oc-tag').textContent(), item.tag, '前调出／后调入');
      assert.ok((await row.getAttribute('title')).includes(item.note), '悬停按另一侧快照提供去向／来源');
      assert.equal(await row.locator('.is-transferred').count(), 1, '方向标签保留姓名及图标浅底');
    }
    assert.equal(await page.locator('.cmp-side .oc-person .oc-tag').getByText('调岗', { exact: true }).count(), 0, '图内不再使用泛化调岗标签');
    assert.equal(await page.evaluate(() => vm.diff.persons.find(p => p.id === 'C2-E01').changeType), '调岗', '底层调岗分类保持');
  };
  const verifyHighlights = async () => {
    for (const side of ['L', 'R']) {
      for (const id of ['G05', 'G06']) assert.equal(await card(side, id).evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(238, 242, 255)', '更名／层级变化整卡浅底');
      for (const id of ['G03', 'G04']) assert.equal(await card(side, id).evaluate(el => el.classList.contains('oc-modified')), false, '祖先／仅主管变化不涂整卡');
    }
    await verifyTransferLabels();
    const moved = page.locator('.cmp-side .oc-person-identity.is-transferred');
    assert.equal(await moved.count(), 2, '调岗两侧高亮');
    for (const element of await moved.all()) {
      assert.equal(await element.evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(238, 242, 255)');
      assert.equal(await element.locator('.oc-person-icon').count(), 1);
      assert.equal(await element.locator('.oc-person-name').count(), 1);
    }
    assert.equal(await page.locator('.cmp-side .oc-person-identity:not(.is-transferred)').evaluateAll(nodes => nodes.every(el => getComputedStyle(el).backgroundColor === 'rgba(0, 0, 0, 0)')), true, '未调岗人员不高亮');
  };
  const create = async kind => page.evaluate(kind => {
    const S = OA.store;
    const r = S.apply(null, 'createPlan', { name: '变化回归-' + kind, universe: 'case2', effDate: '2026-12-01', adjustLevel: 'BU下设一级', adjustReason: '内部原因', scopeOrgIds: ['G03'], scopeWarningsAcknowledged: true });
    if (!r.ok) throw new Error(r.error);
    const apply = (type, payload) => { const x = S.apply(r.planId, type, payload); if (!x.ok) throw new Error(type + '：' + x.error); return x; };
    const pd = S.getPlanData(r.planId), g = pd.cur;
    let extra = {};
    if (kind === 'mixed') {
      apply('moveOrg', { id: 'G06', newParentId: 'G04' });
      apply('editOrg', { id: 'G04', leaderId: 'M04' });
      apply('editOrg', { id: 'G05', name: '研发中心', leaderId: null });
      apply('addHeadcounts', { positionId: 'C2-P01', level: 'P4-2', count: 3 });
      apply('transferPersons', { rows: [{ personId: 'C2-E01', targetPositionId: 'C2-P03', managerId: 'M03', bringHeadcount: false }] });
      extra.emptyPosition = apply('addPosition', { orgId: 'G05', name: '变化空职位', levelMin: 'P3-1', levelMax: 'P5-4' }).id;
      extra.newOrg = apply('addOrg', { parentId: 'G03', name: '新增空组织' }).id;
      extra.newPosition = apply('addPosition', { orgId: 'G04', name: '新增编制职位', levelMin: 'P3-1', levelMax: 'P5-4' }).id;
      apply('addHeadcounts', { positionId: extra.newPosition, level: 'P4-2', count: 2 });
    } else if (kind === 'new-object-counts') {
      extra.newOrg = apply('addOrg', { parentId: 'G03', name: '新增数量部门' }).id;
      extra.newPosition = apply('addPosition', { orgId: extra.newOrg, name: '新增数量岗位', levelMin: 'P3-1', levelMax: 'P5-4' }).id;
      apply('addHeadcounts', { positionId: extra.newPosition, level: 'P4-2', count: 2 });
      apply('transferPersons', { rows: [{ personId: 'C2-E01', targetPositionId: extra.newPosition, managerId: 'M03', bringHeadcount: false }] });
      apply('movePositions', { positionIds: ['C2-P03'], targetOrgId: extra.newOrg });
      apply('addHeadcounts', { positionId: 'C2-P03', level: 'P4-2', count: 3 });
    } else if (kind === 'person') {
      apply('transferPersons', { rows: [{ personId: 'C2-E01', targetPositionId: 'C2-P02', managerId: 'M03', bringHeadcount: false }] });
    } else if (kind === 'roundtrip') {
      apply('transferPersons', { rows: [{ personId: 'C2-E01', targetPositionId: 'C2-P02', managerId: 'M03', bringHeadcount: false }] });
      apply('transferPersons', { rows: [{ personId: 'C2-E01', targetPositionId: 'C2-P01', managerId: 'M02', bringHeadcount: false }] });
    } else if (kind === 'structure-only') {
      apply('editOrg', { id: 'G04', name: '产品中心' });
      apply('moveOrg', { id: 'G04', newParentId: 'G05' });
    } else if (kind === 'follow-position') {
      apply('movePositions', { positionIds: ['C2-P01'], targetOrgId: 'G05' });
    } else if (kind === 'manager-only') {
      g.persons.find(p => p.id === 'C2-E01').managerId = 'M04';
      S.retryPersist(r.planId);
    } else if (kind === 'headcount') {
      apply('addHeadcounts', { positionId: 'C2-P01', level: 'P4-2', count: 1 });
    } else if (kind === 'counts') {
      apply('transferPersons', { rows: [{ personId: 'C2-E01', targetPositionId: 'C2-P03', managerId: 'M03', bringHeadcount: false }] });
      apply('addHeadcounts', { positionId: 'C2-P03', level: 'P4-2', count: 3 });
    } else if (kind === 'hc-attribute') {
      const h = g.headcounts.find(h => h.positionId === 'C2-P01' && h.state === '可用'); h.level = 'P4-3';
      S.retryPersist(r.planId);
    } else if (kind === 'last-hc') {
      extra.position = apply('addPosition', { orgId: 'G04', name: '最后编制载体', levelMin: 'P3-1', levelMax: 'P5-4' }).id;
      const h = apply('addHeadcounts', { positionId: extra.position, level: 'P4-2', count: 1 });
      pd.base = JSON.parse(JSON.stringify(g));
      apply('removeHeadcountsByIds', { headcountIds: h.ids });
    } else if (kind === 'person-no-hc') {
      extra.position = apply('addPosition', { orgId: 'G04', name: '无编在职职位', levelMin: 'P3-1', levelMax: 'P5-4' }).id;
      apply('transferPersons', { rows: [{ personId: 'C2-E01', targetPositionId: extra.position, managerId: 'M03', bringHeadcount: false }] });
      pd.base = JSON.parse(JSON.stringify(g));
      apply('editPosition', { id: extra.position, name: '无编在职改名' });
    } else if (kind === 'future-only') {
      extra.position = apply('addPosition', { orgId: 'G04', name: '仅未来人员职位', levelMin: 'P3-1', levelMax: 'P5-4' }).id;
      const person = g.persons.find(p => p.status === '未来');
      person.targetPositionId = extra.position; pd.base = JSON.parse(JSON.stringify(g));
      person.date = '2027-01-10'; S.retryPersist(r.planId);
    } else if (kind === 'reduce-hc') {
      const h = g.headcounts.find(h => h.positionId === 'C2-P01' && h.state === '可用');
      apply('removeHeadcountsByIds', { headcountIds: [h.id] });
    } else if (kind === 'future') {
      // 时间属性尚无编辑入口：仅在隔离临时方案中构造一个最终差异。
      const p = g.persons.find(p => p.status === '未来'); p.date = '2027-01-10'; extra.person = p.id;
      S.retryPersist(r.planId);
    } else if (kind === 'post') {
      const p = g.posts[0]; extra.position = p.concurrentPositionId;
      apply('cancelPost', { postId: p.id });
    } else if (kind === 'stop') {
      extra.org = apply('addOrg', { parentId: 'G03', name: '停用基准组织' }).id;
      // 新增后停用的净零与基准停用分开验证。
      pd.base = JSON.parse(JSON.stringify(g));
      apply('stopOrg', { orgId: extra.org, mode: 'direct' });
    } else if (kind === 'sort') {
      apply('reorderOrgs', { parentId: 'G03', orderedIds: ['G06', 'G05', 'G04'] });
    } else if (kind === 'netzero') {
      const h = apply('addHeadcounts', { positionId: 'C2-P01', level: 'P4-2', count: 1 });
      apply('removeHeadcountsByIds', { headcountIds: h.ids });
    }
    return { id: r.planId, ...extra };
  }, kind);
  try {
    await open('plan-case2');
    assert.equal(await details().isChecked(), true);
    assert.equal(await page.getByRole('checkbox', { name: '只看变化', exact: true }).isChecked(), true);
    assert.equal(await page.getByText('当前方案暂无变化', { exact: true }).count(), 2);
    for (const label of ['调整前', '调整后', '前后对比']) {
      await mode(label);
      assert.equal(await details().isChecked(), true);
      assert.equal(await page.locator('.cmp-side .oc-box').count(), 0);
    }
    await page.getByRole('button', { name: '查看完整架构', exact: true }).first().click(); await settle();
    assert.ok(await page.locator('.cmp-side .oc-person').count()); await fitted();
    console.log('PASS 默认、无变化空态、三视图共享、查看完整架构');

    const mixed = await create('mixed'); await open(mixed.id); await fitted();
    const snapshot = await page.evaluate(id => JSON.stringify(OA.store.getPlanData(id)), mixed.id);
    await verifyPositionCounts(); await verifyHighlights();
    for (const side of ['L', 'R']) {
      assert.equal(await card(side, 'G06').locator('.oc-org-level.oc-changed').count(), 1, '真实层级变化两侧高亮');
      assert.equal(await card(side, 'G04').locator('.oc-org-leader.oc-changed').count(), 1, '主管更换两侧高亮');
      assert.equal(await card(side, 'G05').locator('.oc-org-leader.oc-changed').count(), 1, '主管清空两侧高亮');
      assert.equal(await card(side, 'G03').locator('.oc-changed').count(), 0, '路径祖先不高亮未变字段');
    }
    const expected = await page.evaluate(() => {
      const b = OA.store.CNT.orgSummary(vm.base, 'G04'), a = OA.store.CNT.orgSummary(vm.g, 'G04');
      const f = n => '（' + (n > 0 ? '+' : '') + n + '）';
      return { hc: '总编 ' + a.headcounts + f(a.headcounts - b.headcounts), emp: '员工 ' + a.employees + f(a.employees - b.employees) };
    });
    assert.equal(await card('R', 'G04').locator('.oc-org-headcounts').textContent(), expected.hc);
    assert.equal(await card('R', 'G04').locator('.oc-org-employees').textContent(), expected.emp);
    assert.equal(await card('L', 'G04').locator('.oc-delta').count(), 0, '前图基准不加差值');
    assert.equal(await card('L', mixed.newOrg).count(), 0, '新增仅后图');
    assert.equal(await card('R', mixed.newOrg).count(), 1);
    assert.equal(await card('R', mixed.newOrg).locator('.oc-delta').count(), 0, '零数量不显示（0）');
    assert.equal(await page.locator('.cmp-side .oc-pos').filter({ hasText: '变化空职位' }).count(), 0, '真正无人无编的新增职位隐藏');
    assert.ok(await page.locator('.cmp-side .oc-person').filter({ hasText: await page.evaluate(() => OA.store.G.person(vm.g, 'C2-E01').name) }).count(), '变更人员展示');
    assert.equal(await page.locator('.cmp-chart').getByText(/人员有变化|编制有变化/).count(), 0);
    const structural = await page.locator('.cmp-side').first().locator('[data-oc-id="G06"]').evaluate(el => el.dataset.parentOrg);
    assert.equal(structural, 'G03');
    assert.equal(await page.locator('.cmp-side').nth(1).locator('[data-oc-id="G06"]').evaluate(el => el.dataset.parentOrg), 'G04');
    await details().uncheck(); await settle(); assert.equal(await page.locator('.cmp-side .oc-pos').count(), 0);
    await filter(false); assert.equal(await details().isChecked(), false, '取消过滤保留人编选择');
    assert.equal(await card('R', 'G04').locator('.oc-org-headcounts').textContent(), expected.hc, '完整模式差值仍生效');
    await details().check(); await settle(); await verifyPositionCounts(); await verifyHighlights();
    assert.equal(await page.locator('.cmp-side .oc-pos').filter({ hasText: '变化空职位' }).count(), 0, '完整模式同样隐藏真正空职位');
    await filter(true); assert.equal(await details().isChecked(), true, '再次勾选自动开启人编'); await fitted();
    for (const label of ['调整前', '调整后', '前后对比']) { await mode(label); await fitted(); await verifyTransferLabels(); assert.equal(await details().isChecked(), true); }
    await page.getByRole('button', { name: /^全\s*屏$/ }).click(); await settle();
    for (const label of ['调整后', '调整前', '前后对比']) { await mode(label); await fitted(); await verifyTransferLabels(); }
    await filter(false); await fitted(); await filter(true); await fitted();
    await page.getByRole('button', { name: '退出全屏', exact: true }).click(); await settle();
    assert.equal(await page.evaluate(id => JSON.stringify(OA.store.getPlanData(id)), mixed.id), snapshot, '展示操作不改业务数据／历史');
    await page.getByRole('button', { name: '适应画布', exact: true }).click(); await settle(); await fitted();
    if (process.env.QA_OUTPUT_DIR) { require('node:fs').mkdirSync(process.env.QA_OUTPUT_DIR, { recursive: true }); await page.screenshot({ path: process.env.QA_OUTPUT_DIR + '/compare-changes.png' }); }
    console.log('PASS 混合变化、迁移原／新路径、双侧字段高亮、红绿差值、整卡与调岗浅底、空职位隐藏、人编联动、全屏与只读');

    const newly = await create('new-object-counts'); await open(newly.id);
    const newSnapshot = await page.evaluate(id => JSON.stringify(OA.store.getPlanData(id)), newly.id);
    const checkNewCounts = async () => {
      await verifyPositionCounts();
      const org = card('R', newly.newOrg);
      assert.equal(await org.locator('.oc-delta').count(), 0, '新增部门非零总编／员工不追加差值');
      assert.equal(await org.locator('.oc-tag-add').textContent(), '新增');
      const totals = await page.evaluate(id => OA.store.CNT.orgSummary(vm.g, id), newly.newOrg);
      assert.ok(totals.headcounts > 0 && totals.employees > 0);
      assert.equal(await org.locator('.oc-org-headcounts').textContent(), '总编 ' + totals.headcounts);
      assert.equal(await org.locator('.oc-org-employees').textContent(), '员工 ' + totals.employees);
      assert.ok((await org.getAttribute('title')).includes('总编 ' + totals.headcounts + '｜员工 ' + totals.employees));
      assert.doesNotMatch(await org.getAttribute('title'), /（[+-]\d+）/, '新增部门悬停不追加数量差值');
      const added = page.locator('.cmp-side').nth(1).locator('.oc-detail').filter({ has: page.getByText('新增数量岗位', { exact: true }).and(page.locator('.oc-pos-name')) });
      assert.equal(await added.locator('.oc-pos.oc-new').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(240, 250, 243)', '新增底色仅在职位名称卡片');
      assert.equal(await added.locator('.oc-position-card,.oc-people,.oc-person,.oc-hcsum').evaluateAll(els => els.every(el => getComputedStyle(el).backgroundColor === 'rgba(0, 0, 0, 0)')), true, '职位外层及下方人员、编制区域无新增底色');
      assert.equal(await added.locator('.oc-delta').count(), 0, '新增岗位非零编制／空编不追加差值');
      assert.equal(await added.locator('.oc-position-headcounts').textContent(), '编制 2');
      assert.equal(await added.locator('.oc-position-vacant').textContent(), '空编 1');
      assert.equal(await added.locator('.oc-tag-add').first().textContent(), '新增');
      assert.doesNotMatch(await added.locator('.oc-pos').getAttribute('title'), /（[+-]\d+）/, '新增岗位悬停不追加数量差值');
      assert.doesNotMatch(await added.locator('.oc-hcsum').getAttribute('title'), /（[+-]\d+）/, '新增岗位编制悬停不追加数量差值');
      const existingName = await page.evaluate(() => OA.store.G.position(vm.g, 'C2-P03').name);
      const existing = page.locator('.cmp-side').nth(1).locator('.oc-detail').filter({ has: page.getByText(existingName, { exact: true }).and(page.locator('.oc-pos-name')) });
      assert.equal(await existing.locator('.oc-pos.oc-new').count(), 0, '已有岗位迁入新增部门不染新增底色');
      assert.equal(await existing.locator('.oc-position-headcounts .oc-delta').textContent(), '（+3）', '已有岗位迁入新增部门仍显示自身增编');
      assert.equal(await existing.locator('.oc-position-vacant .oc-delta').textContent(), '（+3）');
      assert.equal(await card('R', 'G03').locator('.oc-org-headcounts .oc-delta').textContent(), '（+5）', '已有上级汇总包含新增与迁入岗位实际增编');
    };
    await checkNewCounts();
    const newPositionCard = page.locator('.cmp-side').nth(1).locator('.oc-position-card').filter({ hasText: '新增数量岗位' });
    await newPositionCard.locator('.oc-pos-toggle').click(); await settle();
    assert.equal(await newPositionCard.locator('.oc-people').count(), 0, '新增职位可收起明细');
    assert.equal(await newPositionCard.locator('.oc-pos.oc-new').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(240, 250, 243)', '收起明细仍保留名称卡片浅绿底');
    await newPositionCard.locator('.oc-pos-toggle').click(); await settle();
    for (const label of ['调整前', '调整后', '前后对比']) { await mode(label); await checkNewCounts(); }
    await filter(false); await checkNewCounts(); await filter(true); await checkNewCounts();
    await page.getByRole('button', { name: /^全\s*屏$/ }).click(); await settle();
    await mode('调整后'); await checkNewCounts();
    await page.getByRole('button', { name: '退出全屏', exact: true }).click(); await settle();
    assert.equal(await page.evaluate(id => JSON.stringify(OA.store.getPlanData(id)), newly.id), newSnapshot, '新增对象数量展示不改业务数据及历史');
    console.log('PASS 新增部门／岗位非零数量与悬停无差值，已有迁入岗位及上级汇总差值保留，三视图／过滤／全屏一致');

    const person = await create('person'); await open(person.id); await fitted(); await verifyTransferLabels();
    assert.equal(await card('L', 'G04').count(), 1); assert.equal(await card('R', 'G04').count(), 1);
    assert.equal(await card('R', 'G04').locator('.oc-org-employees .oc-delta').count(), 0, '同部门调岗人数不变不显示零差值');
    assert.equal(await card('R', 'G05').count(), 0); assert.equal(await card('R', 'G06').count(), 0);
    const changedNames = await page.locator('.cmp-side .oc-person-name').allTextContents();
    const indexNames = await page.evaluate(() => vm.diff.persons.map(r => r.name));
    assert.ok(changedNames.length && changedNames.every(name => indexNames.includes(name)), '只展示最终变化人员');
    assert.equal(await page.locator('.cmp-side .oc-empty-row').count(), 0, '过滤无人员时不误报暂无人员');
    const unchangedName = await page.evaluate(() => vm.g.persons.find(p => p.status === '在职' && !vm.changeIndex.people.has(p.id)).name);
    await page.locator('.cmp-toolbar input[type="text"]').fill(unchangedName); await settle();
    assert.equal(await page.locator('.cmp-side .oc-hit-soft').count(), 0, '过滤隐藏人员不参与搜索');
    await page.locator('.cmp-toolbar input[type="text"]').fill(''); await settle();
    assert.equal(await page.locator('.cmp-side .oc-hidden').count(), 0, '不显示未变分支提示或恢复入口');
    assert.equal(await page.getByText(/另有.*未变更分支|收起.*未变更分支/).count(), 0);
    const totals = await card('R', 'G03').locator('.oc-counts').textContent();
    await filter(false); assert.equal(await card('R', 'G05').count(), 1);
    assert.equal(await card('R', 'G03').locator('.oc-counts').textContent(), totals, '过滤不改变统计口径');
    await filter(true); assert.equal(await card('R', 'G05').count(), 0);
    await page.locator('.cmp-side .oc-pos-toggle').first().click(); await settle();
    const closed = await page.locator('.cmp-side .oc-pos').first().evaluate(e => !e.classList.contains('is-open'));
    assert.equal(closed, true); await filter(false); await filter(true);
    assert.equal(await page.locator('.cmp-side .oc-pos').first().evaluate(e => !e.classList.contains('is-open')), true, '过滤往返保留用户折叠');
    console.log('PASS 仅人员变化、人数不变、隐藏明细搜索、无未变分支提示／完整架构切换、真实统计及展开状态');

    for (const kind of ['roundtrip', 'structure-only', 'follow-position', 'manager-only']) {
      const unchanged = await create(kind); await open(unchanged.id); await filter(false);
      assert.ok(await page.locator('.cmp-side .oc-person').count(), '完整架构保留真实人员');
      assert.equal(await page.locator('.cmp-side .oc-person .oc-tag').count(), 0, kind + '不误标调入调出');
      assert.equal(await page.locator('.cmp-side .is-transferred').count(), 0, kind + '不误作本人调岗高亮');
    }
    console.log('PASS 调出／调入：跨部门及同部门、来源目标快照、三视图／全屏／过滤；结构随迁、上级变化及往返净零不误标');

    const hc = await create('headcount'); await open(hc.id);
    assert.equal(await card('R', 'G04').count(), 1); assert.equal(await page.locator('.cmp-side .oc-person').count(), 0);
    assert.equal(await card('R', 'G04').locator('.oc-org-headcounts .oc-delta').textContent(), '（+1）');
    assert.ok(await page.locator('.cmp-side .oc-hcsum').count());
    const counts = await create('counts'); await open(counts.id); await verifyPositionCounts();
    assert.equal(await card('R', 'G04').locator('.oc-org-employees .oc-delta').textContent(), '（-1）');
    assert.equal(await card('R', 'G05').locator('.oc-org-employees .oc-delta').textContent(), '（+1）');
    assert.equal(await card('R', 'G05').locator('.oc-org-headcounts .oc-delta').textContent(), '（+3）');
    const reduce = await create('reduce-hc'); await open(reduce.id); await verifyPositionCounts();
    assert.equal(await page.locator('.cmp-side .oc-position-headcounts .is-decrease').count(), 1, '职位减编绿色差值');
    assert.equal(await page.locator('.cmp-side .oc-position-vacant .is-decrease').count(), 1, '职位空编减少绿色差值');
    const attribute = await create('hc-attribute'); await open(attribute.id);
    assert.equal(await card('R', 'G04').count(), 1, '仅编制属性变化也保留部门');
    assert.equal(await page.locator('.cmp-side .oc-delta').count(), 0, '属性变化数量未变不加差值');
    assert.match(await page.locator('.cmp-side .oc-hcsum').last().getAttribute('title'), /编制职级/);
    const last = await create('last-hc'); await open(last.id);
    assert.equal(await page.locator('.cmp-side .oc-pos-name').filter({ hasText: '最后编制载体' }).count(), 1, '减掉最后一个编制且无人时仅前侧保留');
    assert.equal(await card('R', 'G04').locator('.oc-org-headcounts .oc-delta').textContent(), '（-1）');
    assert.equal(await page.locator('.cmp-side').nth(1).locator('.oc-pos-name').filter({ hasText: '最后编制载体' }).count(), 0, '空职位在后侧隐藏');
    await filter(false);
    assert.equal(await page.locator('.cmp-side .oc-pos-name').filter({ hasText: '最后编制载体' }).count(), 1, '完整模式依然只保留前侧');
    const unbound = await create('person-no-hc'); await open(unbound.id);
    assert.equal(await page.locator('.cmp-side .oc-pos-name').filter({ hasText: '无编在职' }).count(), 2, '无人编明细显示不等于职位实际无人');
    assert.equal(await page.locator('.cmp-side .oc-person').count(), 0, '未变化在职人员被过滤');
    const futureOnly = await create('future-only'); await open(futureOnly.id);
    assert.equal(await page.locator('.cmp-side .oc-pos-name').filter({ hasText: '仅未来人员职位' }).count(), 2, '有未来人员的无编职位仍展示');
    const future = await create('future'); await open(future.id);
    assert.equal(await page.locator('.cmp-side .oc-person').count(), 2, '仅变化未来事项双侧保留');
    assert.match(await page.locator('.cmp-side .oc-person').first().getAttribute('title'), /计划日期/);
    assert.equal(await page.locator('.cmp-side .oc-person .oc-tag').count(), 0, '未来事项保留原状态，不标本方案调入调出');
    const post = await create('post'); await open(post.id);
    assert.ok(await page.locator('.cmp-side .oc-pos').count(), '兼职变化通过所属职位保留');
    assert.ok((await page.locator('.cmp-side .oc-pos').allTextContents()).length);
    assert.equal(await page.evaluate(id => vm.changeIndex.positions.has(id), post.position), true);
    const stop = await create('stop'); await open(stop.id);
    assert.equal(await card('L', stop.org).count(), 1); assert.equal(await card('R', stop.org).count(), 0);
    for (const size of [{ width: 1280, height: 720 }, { width: 1024, height: 600 }]) {
      await page.setViewportSize(size); await open(mixed.id); await fitted();
      await mode('调整后'); await fitted();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, '窄屏页面无水平溢出');
      const overflow = await page.locator('.cmp-side .oc-org-headcounts,.oc-org-employees,.oc-hc-item').evaluateAll(nodes => nodes.some(el => el.scrollWidth > el.clientWidth + 1));
      assert.equal(overflow, false, '数量及差值不截断');
    }
    const sort = await create('sort'); await open(sort.id);
    assert.equal(await page.evaluate(() => vm.hasChange), true, '纯排序仍按原规则属于方案调整');
    assert.equal(await page.getByText('当前方案暂无可展示的字段变化', { exact: true }).count(), 2, '没有字段差异不误称方案无变化');
    const zero = await create('netzero'); await open(zero.id);
    assert.equal(await page.getByText('当前方案暂无变化', { exact: true }).count(), 2, '新增再减掉的净零不误显示');
    assert.deepEqual(errors, []);
    console.log('PASS 仅编制／未来事项／兼职变化、停用、净零过滤及页面无异常');
  } finally { await context.close(); await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
