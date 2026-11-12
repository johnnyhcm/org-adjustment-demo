/* 执行工作台真实 data/created/computed/methods，覆盖数据树到可见行的过滤。 */
const fs = require('fs');
const vm = require('vm');
const assert = require('assert/strict');
const path = require('path');

module.exports = function runWorkbenchRegression() {
  const S = globalThis.OA.store;
  const html = fs.readFileSync(path.join(__dirname, '../原型/组织调整/03-工作台.html'), 'utf8');
  const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].pop()[1];
  function mount(planId) {
    let options;
    vm.runInNewContext(script, {
      OA: { store: S, ui: { qs: () => planId, mount: value => { options = value; } } },
      window: { location: { href: '' } }
    });
    const instance = options.data();
    Object.entries(options.methods).forEach(([key, method]) => { instance[key] = method.bind(instance); });
    Object.entries(options.computed).forEach(([key, getter]) => {
      Object.defineProperty(instance, key, { get: getter.bind(instance) });
    });
    options.created.call(instance);
    return instance;
  }
  const results = [];
  function test(name, run) {
    try { run(); results.push({ name, pass: true }); }
    catch (error) { results.push({ name, pass: false, error: error.message }); }
  }
  for (const planId of ['plan-case1', 'plan-case2']) {
    test(`工作台显示回归：${planId} 隐藏祖先不影响组织显示及折叠`, () => {
      S.resetAll();
      const page = mount(planId);
      assert.deepEqual(Array.from(page.visibleOrgNodes, row => row.id), ['G03', 'G04', 'G05', 'G06']);
      assert.equal(page.expanded.has('G01'), false);
      assert.equal(page.expanded.has('G02'), false);
      const expected = planId === 'plan-case1' ? '三级｜王经理｜员工 24｜总编 28' : '三级｜王经理｜员工 18｜总编 26';
      assert.equal(page.orgSummaryText('G03'), expected);
      page.toggleExpand('G03');
      assert.deepEqual(Array.from(page.visibleOrgNodes, row => row.id), ['G03']);
      assert.equal(page.orgSummaryText('G03'), expected);
      page.toggleExpand('G03');
      assert.equal(page.visibleOrgNodes.length, 4);
      page.editOrgFromName('G04');
      assert.equal(page.currentOrgId, 'G04');
      assert.equal(page.orgForm.open, true);
      assert.equal(page.orgForm.mode, 'edit');
      assert.equal(page.orgForm.targetId, 'G04');
      const editPosition = planId === 'plan-case1' ? 'C1-P01' : 'C2-P01';
      page.editPositionFromName(editPosition);
      assert.equal(page.currentPositionId, editPosition);
      assert.equal(page.posForm.open, true);
      assert.equal(page.posForm.mode, 'edit');
      assert.equal(page.posForm.targetId, editPosition);
      const source = S.CNT.orgSummary(page.g, 'G04');
      const positionId = planId === 'plan-case1' ? 'C1-P01' : 'C2-P01';
      const movedEmployees = S.CNT.positionEmployees(page.g, positionId);
      const movedHeadcounts = S.CNT.totalHeadcounts(page.g, positionId);
      assert.equal(S.apply(planId, 'movePositions', { positionIds: [positionId], targetOrgId: 'G05' }).ok, true);
      assert.equal(page.orgSummaryText('G03'), expected);
      assert.equal(page.orgSummaryText('G04'), '四级｜李经理｜员工 ' + (source.employees - movedEmployees) + '｜总编 ' + (source.headcounts - movedHeadcounts));
    });
  }
  test('工作台显示回归：多个权限根分别折叠，刷新后恢复', () => {
    S.resetAll();
    const result = S.apply(null, 'createPlan', {
      name: '多根显示回归', universe: 'scopeDemo', effDate: '2026-12-01',
      adjustLevel: 'BU下设一级', adjustReason: '内部原因',
      scopeOrgIds: ['G03', 'S00'], scopeWarningsAcknowledged: true
    });
    assert.equal(result.ok, true, result.error);
    const page = mount(result.planId);
    assert.deepEqual(Array.from(page.visibleOrgNodes, row => row.id), ['G03', 'G04', 'G05', 'G06', 'S00', 'S03']);
    page.toggleExpand('G03');
    assert.deepEqual(Array.from(page.visibleOrgNodes, row => row.id), ['G03', 'S00', 'S03']);
    const reloaded = mount(result.planId);
    assert.equal(reloaded.visibleOrgNodes.length, 6);
    assert.equal(reloaded.visibleOrgNodes.some(row => ['G01', 'G02', 'S01', 'S02'].includes(row.id)), false);
  });
  return results;
};
