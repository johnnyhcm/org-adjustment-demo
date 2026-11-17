/* 执行工作台真实 data/created/computed/methods，覆盖数据树到可见行的过滤。 */
const fs = require('fs');
const vm = require('vm');
const assert = require('assert/strict');
const path = require('path');

module.exports = function runWorkbenchRegression() {
  const S = globalThis.OA.store;
  const html = fs.readFileSync(path.join(__dirname, '../原型/组织调整/03-工作台.html'), 'utf8');
  const createHtml = fs.readFileSync(path.join(__dirname, '../原型/组织调整/index.html'), 'utf8');
  const createCompatHtml = fs.readFileSync(path.join(__dirname, '../原型/组织调整/02-新建方案.html'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '../原型/组织调整/shared/theme.css'), 'utf8');
  const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].pop()[1];
  function mount(planId) {
    let options;
    const infos = [];
    vm.runInNewContext(script, {
      OA: { store: S, ui: { qs: () => planId, toast: () => {}, info: value => infos.push(value), mount: value => { options = value; } } },
      window: { location: { href: '' } },
      setTimeout: () => 0,
      clearTimeout: () => {}
    });
    const instance = options.data();
    instance.infoMessages = infos;
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
  test('工作台拖拽源只允许把手，卡片与连线不作为拖拽快照', () => {
    const orgStart = html.indexOf("['tree-node'");
    const orgNode = html.slice(orgStart, html.indexOf('<!-- 当前组织直属数据', orgStart));
    assert.match(orgNode, /:draggable="false"/);
    assert.doesNotMatch(orgNode, /@dragstart="onOrgDragStart/);
    assert.match(orgNode, /class="org-drag-handle"[^>]*:draggable="n\.inScope"[^>]*@dragstart\.stop="onOrgDragStart/);
    assert.doesNotMatch(html, /@dragover[^=]*="onCard|@drop[^=]*="onCard|@dragstart[^=]*="onPosDragStart/);
    assert.match(html, /wb-col-title">编制/);
    assert.match(html, /wb-col-title">人员/);
    assert.match(html, /onOrgDragStart\(e, n\)[\s\S]*?setDragImage\(ghost/);
    assert.match(html, /class="tree-connectors"/);
    assert.match(html, /编辑方案信息/);
    assert.doesNotMatch(html, /@click="openScope"/);
    assert.match(html, /v-model:open="planInfo\.open"/);
    assert.match(html, /planInfoScopeValidation\.blocking/);
    assert.match(css, /\.tree-connectors/);
    assert.match(html, /parentIdOf\(n\)/);
    assert.match(html, /r\.left - rootRect\.left \+ r\.width \/ 2/);
    assert.match(html, /queueOrgConnectorRefresh\(\)[\s\S]*?requestAnimationFrame/);
    assert.match(html, /data-org-id/);
    assert.doesNotMatch(html, /orgForm\.sortCode/);
    assert.match(html, /orgForm\.copyMode/);
    assert.match(html, /a-radio-group v-model:value="orgForm\.copyMode"/);
    assert.doesNotMatch(html, /org-copy-options/);
    assert.doesNotMatch(html, /posForm\.sequenceNo/);
    assert.match(html, /posForm\.jobSequence/);
    assert.match(html, /posForm\.collarColor/);
    assert.match(html, /onOrgSortOver[\s\S]*?sort-slot-line/);
    assert.match(html, /savePositionSort[\s\S]*?reorderPositions/);
  });
  test('新建方案组织树直接展示，随上级纳入节点已勾选置灰', () => {
    for (const source of [createHtml, createCompatHtml]) {
      assert.match(source, /plan-scope-tree|new-scope-tree/);
      assert.match(source, /:checked="(?:newIsChecked|isChecked)\(n\.id\)"/);
      assert.match(source, /:disabled="(?:newIsDerived\(n\.id\) \|\| newIsFuture\(n\.id\) \|\| newIsBlocked\(n\.id\)|isDerived\(n\.id\) \|\| isFuture\(n\.id\) \|\| isBlocked\(n\.id\))"/);
      assert.match(source, /(?:newIsBlocked|isBlocked)\(n\.id\)/);
      assert.match(source, /scope-tree-toggle[^>]*@click\.stop\.prevent/);
      assert.match(source, /indeterminate\.prop/);
      assert.doesNotMatch(source, /@click="openNewScope"|v-model:open="scopeOpen"/);
    }
  });
  test('权限根移动后不重复渲染组织卡片', () => {
    S.resetAll();
    const result = S.apply(null, 'createPlan', {
      name: '权限根移动回归', universe: 'scopeDemo', effDate: '2026-12-01',
      adjustLevel: 'BU下设一级', adjustReason: '内部原因',
      scopeOrgIds: ['G03', 'S00'], scopeWarningsAcknowledged: true
    });
    assert.equal(result.ok, true, result.error);
    assert.equal(S.apply(result.planId, 'moveOrg', { id: 'S00', newParentId: 'G03' }).ok, true);
    const page = mount(result.planId);
    const ids = Array.from(page.visibleOrgNodes, row => row.id);
    assert.equal(ids.filter(id => id === 'S00').length, 1);
    assert.deepEqual(ids, ['G03', 'G04', 'G05', 'G06', 'S00', 'S03']);
  });
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
      page.selectOrg('G04');
      page.openOrgForm('edit', 'G04');
      assert.equal(page.currentOrgId, 'G04');
      assert.equal(page.orgForm.open, true);
      assert.equal(page.orgForm.mode, 'edit');
      assert.equal(page.orgForm.targetId, 'G04');
      const editPosition = planId === 'plan-case1' ? 'C1-P01' : 'C2-P01';
      page.selectPosition(editPosition);
      page.openPosForm('edit', editPosition);
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
  test('人员调岗弹框组装 payload 并实际更新员工职位', () => {
    S.resetAll();
    const page = mount('plan-case1');
    const person = page.g.persons.find(p => p.status === '在职' && p.kind === 'employee');
    const target = page.g.positions.find(p => p.status === '有效' && p.id !== person.positionId);
    const manager = page.g.persons.find(p => p.status === '在职' && p.id !== person.id);
    assert.ok(person && target && manager);
    page.openTransfer([person.id]);
    page.tf.header = { orgId: target.orgId, posId: target.id, mgrId: manager.id };
    page.tf.bring = false;
    assert.equal(page.tfPayloadRows.length, 1);
    assert.equal(page.tfPayloadRows[0].personId, person.id);
    assert.equal(page.tfPayloadRows[0].targetPositionId, target.id);
    assert.equal(page.tfPayloadRows[0].managerId, manager.id);
    assert.equal(page.hasTransferErrors, false);
    page.confirmTransfer();
    assert.equal(S.G.person(S.getPlanData('plan-case1').cur, person.id).positionId, target.id);
    const chartPeople = [];
    const walk = nodes => (nodes || []).forEach(n => { (n.positions || []).forEach(p => chartPeople.push(...(p.people || []))); walk(n.children); });
    walk(S.chartTree('plan-case1', 'R'));
    assert.equal(chartPeople.find(p => p.id === person.id).tags.includes('调岗'), true);
  });
  test('人员与编制变化标签及已减编只读行', () => {
    S.resetAll();
    const created = S.apply(null, 'createPlan', {
      name: '人员编制标签回归', universe: 'huadong', effDate: '2026-12-01',
      adjustLevel: 'BU下设一级', adjustReason: '内部原因', scopeOrgIds: ['O10', 'O20', 'O30']
    });
    assert.equal(created.ok, true, created.error);
    const pid = created.planId;
    assert.equal(S.apply(pid, 'transferPersons', { rows: [{ personId: 'E01', targetPositionId: 'P20', managerId: 'M02', bringHeadcount: true }] }).ok, true);
    assert.deepEqual(S.personChangeTags(S.getPlan(pid), 'E01'), ['调岗']);
    assert.deepEqual(S.personChangeTags(S.getPlan(pid), 'E04'), []);
    assert.equal(S.apply(pid, 'removeHeadcountsByIds', { headcountIds: ['H03'] }).ok, true);
    assert.deepEqual(S.headcountChangeTags(S.getPlan(pid), 'H03'), ['减编']);
    const page = mount(pid);
    page.currentPositionId = 'P10';
    assert.equal(page.positionData('P10').removedHcs.some(h => h.id === 'H03' && h.tags.includes('减编')), true);
    assert.equal(page.positionData('P10').removedHcs.find(h => h.id === 'H03').code, '202611060003');
    assert.equal(S.apply(pid, 'restoreHeadcounts', { headcountIds: ['H03'] }).ok, true);
    assert.equal(S.diffPlan(S.getPlan(pid)).headcounts.some(h => h.id === 'H03'), false);
  });
  test('新增对象使用占位标记而不是 Demo 编码', () => {
    S.resetAll();
    const created = S.apply(null, 'createPlan', {
      name: '新增对象标记回归', universe: 'huadong', effDate: '2026-12-01',
      adjustLevel: 'BU下设一级', adjustReason: '内部原因', scopeOrgIds: ['O10', 'O20', 'O30']
    });
    assert.equal(created.ok, true, created.error);
    const pid = created.planId;
    const org = S.apply(pid, 'addOrg', { parentId: 'O10', name: '新增组织' });
    const pos = S.apply(pid, 'addPosition', { orgId: 'O10', name: '新增职位', levelMin: 'P3-1', levelMax: 'P4-4' });
    const hc = S.apply(pid, 'addHeadcounts', { positionId: pos.id, level: 'P3-2', count: 1 });
    assert.match(S.displayCode(S.getPlan(pid), 'org', org.id), /^新增组织 \d{3}$/);
    assert.match(S.displayCode(S.getPlan(pid), 'position', pos.id), /^新增职位 \d{3}$/);
    assert.match(S.displayCode(S.getPlan(pid), 'headcount', hc.ids[0]), /^新增编制 \d{3}$/);
  });
  test('调动完整字段：单人旧值、系统字段、差异、刷新与撤销重做', () => {
    S.resetAll();
    const pid = 'plan-case1', page = mount(pid);
    page.openTransfer(['C1-E01']);
    assert.equal(page.tfSingleLevel, 'P5-1');
    assert.equal(page.tfPersonnelType, '默认');
    assert.equal(page.tf.form.workCity, '默认');
    page.tf.header = { orgId: 'G05', posId: 'C1-P03', mgrId: 'M03' };
    page.tf.form.workCity = '测试城市';
    page.tf.form.officeLocation = '测试办公地点';
    page.tf.form.employeeType1 = '测试一级';
    page.tf.form.employeeType2 = '';
    assert.equal(page.hasTransferErrors, false);
    page.confirmTransfer();
    assert.equal(page.tf.open, false);
    let person = S.G.person(S.getPlanData(pid).cur, 'C1-E01');
    assert.equal(person.workCity, '测试城市');
    assert.equal(person.employeeType1, '测试一级');
    assert.equal(person.level, 'P5-1');
    assert.equal(person.personnelType, '默认');
    assert.equal(person.transferDate, S.getPlan(pid).effDate);
    assert.equal(person.transferReason, '组织架构调整');
    assert.equal(person.isRotation, false);
    assert.equal(person.transferType, undefined);
    let diff = S.diffPlan(S.getPlan(pid)).persons.find(x => x.id === person.id);
    assert.ok(diff.fields.some(f => f.key === 'workCity' && f.new === '测试城市'));
    assert.ok(!diff.fields.some(f => f.key === 'transferReason'));
    S.load();
    assert.equal(S.G.person(S.getPlanData(pid).cur, 'C1-E01').officeLocation, '测试办公地点');
    assert.equal(S.undo(pid).ok, true);
    assert.equal(S.G.person(S.getPlanData(pid).cur, 'C1-E01').workCity, '默认');
    assert.equal(S.redo(pid).ok, true);
    assert.equal(S.G.person(S.getPlanData(pid).cur, 'C1-E01').workCity, '测试城市');
    // 改回字段基准后，仅该字段差异消失，职位调岗差异仍保留。
    const again = mount(pid);
    again.openTransfer(['C1-E01']);
    again.tf.header = { orgId: 'G04', posId: 'C1-P02', mgrId: 'M02' };
    again.tf.bring = false;
    again.tf.form.workCity = '默认';
    again.confirmTransfer();
    diff = S.diffPlan(S.getPlan(pid)).persons.find(x => x.id === 'C1-E01');
    assert.ok(diff && !diff.fields.some(f => f.key === 'workCity'));
  });
  test('多人调动：不同旧值留空、只读各自保留、共同填写整批应用', () => {
    S.resetAll();
    const pid = 'plan-case1', page = mount(pid);
    const second = S.G.person(page.g, 'C1-E05');
    second.workCity = '另一城市';
    second.employeeType2 = '另一类型';
    second.personnelType = '另一人员类型';
    page.openTransfer(['C1-E01', 'C1-E05']);
    assert.equal(page.tf.form.workCity, null);
    assert.equal(page.tf.form.employeeType2, null);
    assert.equal(page.tf.form.workRegion, '默认');
    assert.equal(page.tfPersonnelType, null);
    assert.equal(page.tfSingleLevel, '');
    page.tf.header = { orgId: 'G05', posId: 'C1-P03', mgrId: 'M03' };
    assert.equal(page.hasTransferErrors, true);
    page.tf.form.workCity = '共同城市';
    assert.equal(page.hasTransferErrors, false);
    page.confirmTransfer();
    for (const id of ['C1-E01', 'C1-E05']) {
      const p = S.G.person(S.getPlanData(pid).cur, id);
      assert.equal(p.workCity, '共同城市');
      assert.equal(p.employeeType2, '');
    }
    assert.equal(S.G.person(S.getPlanData(pid).cur, 'C1-E01').personnelType, '默认');
    assert.equal(S.G.person(S.getPlanData(pid).cur, 'C1-E05').personnelType, '另一人员类型');
    assert.equal(S.G.person(S.getPlanData(pid).cur, 'C1-E05').level, 'P4-2');
  });
  test('调动入口：拖拽锁定、部门切换、主管缺失与取消无变化', () => {
    S.resetAll();
    const page = mount('plan-case1');
    const before = JSON.stringify(page.g);
    page.openTransfer(['C1-E01'], { orgId: 'G05', lockOrg: true });
    assert.equal(page.tf.lockOrg, true);
    assert.equal(page.tf.lockPos, false);
    assert.equal(page.tf.header.posId, null);
    assert.equal(page.tf.header.mgrId, 'M03');
    page.openTransfer(['C1-E01'], { orgId: 'G05', posId: 'C1-P03', lockOrg: true, lockPos: true });
    assert.equal(page.tf.lockPos, true);
    assert.equal(page.tf.header.posId, 'C1-P03');
    page.tf.open = false;
    assert.equal(JSON.stringify(page.g), before);
    page.openTransfer(['C1-E01']);
    page.tf.header = { orgId: 'G05', posId: 'C1-P03', mgrId: 'M01' };
    page.onTargetOrgChange();
    assert.equal(page.tf.header.posId, null);
    assert.equal(page.tf.header.mgrId, 'M03');
    S.G.org(page.g, 'G05').leaderId = 'C1-E01';
    page.onTargetOrgChange();
    assert.equal(page.tf.header.mgrId, null);
    S.G.org(page.g, 'G05').leaderId = null;
    page.onTargetOrgChange();
    assert.equal(page.tf.header.mgrId, null);
  });
  test('调动校验：空白必填、部门职位不匹配、范围外、整批失败不写入', () => {
    S.resetAll();
    const pid = 'plan-case1', page = mount(pid);
    page.openTransfer(['C1-E01', 'C1-E05']);
    page.tf.header = { orgId: 'G05', posId: 'C1-P03', mgrId: 'M03' };
    const rows = page.tfPayloadRows;
    rows[1].workCity = '  ';
    const before = JSON.stringify(S.getPlanData(pid));
    assert.equal(S.apply(pid, 'transferPersons', { rows }).ok, false);
    assert.equal(JSON.stringify(S.getPlanData(pid)), before);
    rows[1].workCity = '默认';
    rows[0].targetOrgId = 'G04';
    assert.equal(S.apply(pid, 'transferPersons', { rows }).ok, false);
    rows[0].targetOrgId = 'G07';
    rows[0].targetPositionId = 'C1-P10';
    assert.equal(S.apply(pid, 'transferPersons', { rows }).ok, false);
    assert.equal(JSON.stringify(S.getPlanData(pid)), before);
  });
  test('调动旧数据兼容：缺失字段补齐、已有空值保留、历史恢复无假差异', () => {
    S.resetAll();
    const pid = 'plan-case1';
    S.apply(pid, 'editOrg', { id: 'G04', name: '产品中心' });
    const data = JSON.parse(localStorage.getItem('oa.plan.' + pid));
    const strip = graph => graph.persons.forEach(p => { S.TRANSFER_FIELDS.forEach(f => delete p[f.key]); delete p.personnelType; });
    strip(data.base); strip(data.cur);
    data.history.undo.forEach(f => strip(f.state.cur));
    data.cur.persons.find(p => p.id === 'C1-E01').employeeType2 = '';
    localStorage.setItem('oa.plan.' + pid, JSON.stringify(data));
    localStorage.setItem('oa.schema', '10');
    S.load();
    assert.equal(S.G.person(S.getPlanData(pid).cur, 'C1-E01').workCity, '默认');
    assert.equal(S.G.person(S.getPlanData(pid).cur, 'C1-E01').employeeType2, '');
    assert.equal(S.diffPlan(S.getPlan(pid)).persons.length, 0);
    assert.equal(S.undo(pid).ok, true);
    assert.equal(S.diffPlan(S.getPlan(pid)).persons.length, 0);
    assert.equal(S.G.person(S.getPlanData(pid).cur, 'C1-E01').workCity, '默认');
  });
  test('编制变更：原部门职位预填，同职位属性保存、恢复和身份守恒', () => {
    S.resetAll();
    const pid = 'plan-case1', page = mount(pid), id = 'C1-H10';
    const initial = JSON.stringify(page.g), oldCount = page.g.headcounts.length;
    page.openHcTransfer([id]);
    assert.equal(page.hcTf.header.orgId, 'G04');
    assert.equal(page.hcTf.header.posId, 'C1-P01');
    assert.equal(page.hcTf.form.level, 'P4-2');
    assert.equal(page.hcTfTargetPosition.collarColor, '白领');
    assert.equal(page.hcTfValidation, '暂无编制变更内容');
    assert.equal(page.hcTfCanConfirm, false);
    const before = JSON.stringify(S.getPlanData(pid));
    assert.equal(S.apply(pid, 'moveHeadcountsByIds', page.hcTfPayload).ok, false);
    assert.equal(JSON.stringify(S.getPlanData(pid)), before);
    page.hcTf.form.level = 'P5-1';
    page.hcTf.form.category = 'A';
    page.hcTf.form.workLocation = '变更地点';
    assert.equal(page.hcTfCanConfirm, true);
    page.confirmHcTransfer();
    const h = S.G.hc(S.getPlanData(pid).cur, id);
    assert.equal(h.positionId, 'C1-P01');
    assert.equal(h.category, 'A');
    assert.equal(h.level, 'P5-1');
    assert.equal(h.workLocation, '变更地点');
    assert.equal(page.g.headcounts.length, oldCount);
    const diff = S.diffPlan(S.getPlan(pid)).headcounts.find(x => x.id === id);
    assert.equal(diff.reason, '编制属性变更');
    assert.ok(diff.fields.some(f => f.key === 'level'));
    assert.ok(diff.fields.some(f => f.key === 'category'));
    assert.ok(!diff.fields.some(f => f.key === 'positionId'));
    S.load();
    assert.equal(S.G.hc(S.getPlanData(pid).cur, id).workLocation, '变更地点');
    assert.equal(S.undo(pid).ok, true);
    assert.equal(JSON.stringify(S.getPlanData(pid).cur), initial);
    assert.equal(S.redo(pid).ok, true);
    assert.equal(S.G.hc(S.getPlanData(pid).cur, id).level, 'P5-1');
  });
  test('编制变更：只改备注可保存，但不进入前后对比差异', () => {
    S.resetAll();
    const pid = 'plan-case1', page = mount(pid), id = 'C1-H10';
    page.openHcTransfer([id]);
    page.hcTf.form.remark = '备注信息';
    assert.equal(page.hcTfCanConfirm, true);
    page.confirmHcTransfer();
    assert.equal(S.G.hc(S.getPlanData(pid).cur, id).remark, '备注信息');
    assert.equal(S.diffPlan(S.getPlan(pid)).headcounts.length, 0);
    S.load();
    assert.equal(S.G.hc(S.getPlanData(pid).cur, id).remark, '备注信息');
  });
  test('编制变更：批量共同值、拖拽预填及取消不改数据', () => {
    S.resetAll();
    const page = mount('plan-case1'), a = S.G.hc(page.g, 'C1-H10'), b = S.G.hc(page.g, 'C1-H11');
    b.category = 'B'; b.remark = '保留第二条备注';
    const before = JSON.stringify(page.g);
    page.openHcTransfer([a.id, b.id]);
    assert.equal(page.hcTf.header.posId, 'C1-P01');
    assert.equal(page.hcTf.form.category, null);
    assert.equal(page.hcTf.form.remark, null);
    assert.equal(page.hcTfCanConfirm, false);
    page.hcTf.form.category = 'A';
    assert.equal(page.hcTfCanConfirm, true);
    page.confirmHcTransfer();
    assert.equal(S.G.hc(page.g, a.id).category, 'A');
    assert.equal(S.G.hc(page.g, b.id).remark, '');
    page.openHcTransfer([a.id], { orgId: 'G05', lockOrg: true });
    assert.equal(page.hcTf.header.orgId, 'G05');
    assert.equal(page.hcTf.header.posId, null);
    assert.equal(page.hcTf.lockOrg, true);
    assert.equal(page.hcTf.lockPos, false);
    page.openHcTransfer([a.id], { orgId: 'G05', posId: 'C1-P03', lockOrg: true, lockPos: true });
    assert.equal(page.hcTf.header.posId, 'C1-P03');
    assert.equal(page.hcTf.lockPos, true);
    const saved = JSON.stringify(page.g);
    page.hcTf.open = false;
    assert.equal(JSON.stringify(page.g), saved);
    assert.notEqual(saved, before);
    page.openHcTransfer([a.id]);
    page.hcTf.header.orgId = 'G05';
    page.onHcTargetOrgChange();
    assert.equal(page.hcTf.header.posId, null);
    assert.equal(page.hcTf.form.level, a.level);
  });
  test('编制变更：非法职级、分类、日期、部门与预留边界整批拒绝', () => {
    S.resetAll();
    const pid = 'plan-case1', page = mount(pid);
    page.openHcTransfer(['C1-H10', 'C1-H11']);
    const payload = Object.assign({}, page.hcTfPayload, { category: 'A' });
    const before = JSON.stringify(S.getPlanData(pid));
    for (const change of [{ level: 'P1-1' }, { category: 'D' }, { costCenterId: '不存在' }, { expectedArrivalDate: '2026-02-30' }, { officeLocation: '  ' }, { targetOrgId: 'G05' }, { targetPositionId: 'C1-P10', targetOrgId: 'G07' }, { headcountIds: ['C1-H01', 'C1-H10'] }]) {
      assert.equal(S.apply(pid, 'moveHeadcountsByIds', Object.assign({}, payload, change)).ok, false);
      assert.equal(JSON.stringify(S.getPlanData(pid)), before);
    }
    S.resetAll();
    const case2 = mount('plan-case2');
    for (const id of ['C2-H02', 'C2-H04', 'C2-H09']) {
      const h = S.G.hc(case2.g, id);
      const r = S.apply('plan-case2', 'moveHeadcountsByIds', { headcountIds: [id], targetPositionId: h.positionId, category: 'A' });
      assert.equal(r.ok, false);
    }
  });
  test('工作台详情占位：名称不编辑不改选择，四类提示文案统一', () => {
    S.resetAll();
    const pid = 'plan-case1', page = mount(pid);
    const before = JSON.stringify(S.getPlanData(pid));
    const selectedOrg = page.currentOrgId, selectedPosition = page.currentPositionId;
    page.showOrgInfo('G04');
    page.showPositionInfo('C1-P01');
    page.showPersonInfo({ id: 'C1-E01' });
    page.showHcInfo({ code: '新增编制 001' });
    assert.deepEqual(Array.from(page.infoMessages, x => x.content), [
      '此处在新标签页展示打开部门完整详细信息（本Demo 暂不实现）',
      '此处在新标签页展示职位完整详细信息（本Demo 暂不实现）',
      '此处在新标签页展示员工档案（本Demo 暂不实现）',
      '此处在新标签页展示编制完整详细信息（本Demo 暂不实现）'
    ]);
    assert.equal(page.orgForm.open, false);
    assert.equal(page.posForm.open, false);
    assert.equal(page.currentOrgId, selectedOrg);
    assert.equal(page.currentPositionId, selectedPosition);
    assert.equal(JSON.stringify(S.getPlanData(pid)), before);
    assert.match(html, /@click\.stop="showOrgInfo\(n\.id\)"/);
    assert.match(html, /@click="showPositionInfo\(record\.id\)"/);
  });
  test('恢复减编：解除占编后恢复可用名额，不恢复人编绑定', () => {
    S.resetAll();
    const pid = 'plan-case1', id = 'C1-H01', employeeId = 'C1-E01';
    assert.equal(S.apply(pid, 'releaseHeadcount', { personId: employeeId }).ok, true);
    assert.equal(S.apply(pid, 'removeHeadcountsByIds', { headcountIds: [id] }).ok, true);
    const people = JSON.stringify(S.getPlanData(pid).cur.persons);
    const r = S.apply(pid, 'restoreHeadcounts', { headcountIds: [id] });
    assert.equal(r.ok, true, r.error);
    const h = S.G.hc(S.getPlanData(pid).cur, id);
    assert.equal(h.state, '可用');
    assert.equal(h.personId, null);
    assert.equal(h.demandId, null);
    assert.equal(h.code, '202611070101');
    assert.equal(JSON.stringify(S.getPlanData(pid).cur.persons), people);
    assert.equal(S.G.person(S.getPlanData(pid).cur, employeeId).headcountId, null);
    assert.equal(S.diffPlan(S.getPlan(pid)).headcounts.find(x => x.id === id).changeType, '变更');
  });
  test('恢复减编：不带编调岗后已占其他编制，恢复不改现有绑定', () => {
    S.resetAll();
    const pid = 'plan-case1', id = 'C1-H01';
    assert.equal(S.apply(pid, 'transferPersons', { rows: [{ personId: 'C1-E01', targetPositionId: 'C1-P03', managerId: 'M03', bringHeadcount: false }] }).ok, true);
    assert.equal(S.apply(pid, 'removeHeadcountsByIds', { headcountIds: [id] }).ok, true);
    const add = S.apply(pid, 'addHeadcounts', { positionId: 'C1-P03', level: 'P5-1', count: 1 });
    assert.equal(add.ok, true);
    assert.equal(S.apply(pid, 'applyAutoMatch', { positionId: 'C1-P03' }).ok, true);
    const people = JSON.stringify(S.getPlanData(pid).cur.persons);
    const r = S.apply(pid, 'restoreHeadcounts', { headcountIds: [id] });
    assert.equal(r.ok, true, r.error);
    assert.equal(JSON.stringify(S.getPlanData(pid).cur.persons), people);
    assert.equal(S.G.person(S.getPlanData(pid).cur, 'C1-E01').headcountId, add.ids[0]);
    assert.equal(S.G.hc(S.getPlanData(pid).cur, id).personId, null);
  });
  test('恢复减编：保留减编前属性归属、刷新和恢复历史', () => {
    S.resetAll();
    const pid = 'plan-case1', id = 'C1-H10';
    const page = mount(pid);
    page.openHcTransfer([id]);
    page.hcTf.header = { orgId: 'G05', posId: 'C1-P03' };
    page.hcTf.form.level = 'P5-1'; page.hcTf.form.category = 'A'; page.hcTf.form.remark = '减编前备注';
    page.confirmHcTransfer();
    const snapshot = JSON.stringify(S.G.hc(S.getPlanData(pid).cur, id));
    assert.equal(S.apply(pid, 'removeHeadcountsByIds', { headcountIds: [id] }).ok, true);
    S.load();
    const current = mount(pid); current.currentPositionId = 'C1-P03';
    assert.ok(current.positionData('C1-P03').removedHcs.some(h => h.id === id && h.level === 'P5-1' && h.category === 'A'));
    assert.equal(S.apply(pid, 'restoreHeadcounts', { headcountIds: [id] }).ok, true);
    assert.equal(JSON.stringify(S.G.hc(S.getPlanData(pid).cur, id)), snapshot);
    assert.equal(S.diffPlan(S.getPlan(pid)).headcounts.find(x => x.id === id).changeType, '变更');
    assert.equal(S.undo(pid).ok, true);
    assert.equal(S.G.hc(S.getPlanData(pid).cur, id), undefined);
    assert.equal(S.redo(pid).ok, true);
    assert.equal(JSON.stringify(S.G.hc(S.getPlanData(pid).cur, id)), snapshot);
    const before = JSON.stringify(S.getPlanData(pid));
    assert.equal(S.apply(pid, 'restoreHeadcounts', { headcountIds: [id] }).ok, false);
    assert.equal(JSON.stringify(S.getPlanData(pid)), before);
  });
  test('恢复减编：旧数量入口、旧方案回退与批量失败保持一致', () => {
    S.resetAll();
    const pid = 'plan-case1';
    S.apply(pid, 'releaseHeadcount', { personId: 'C1-E01' });
    assert.equal(S.apply(pid, 'removeHeadcounts', { positionId: 'C1-P01', level: 'P5-1', count: 1 }).ok, true);
    const data = JSON.parse(localStorage.getItem('oa.plan.' + pid));
    delete data.cur.removedHeadcounts; data.history = { undo: [], redo: [] };
    localStorage.setItem('oa.plan.' + pid, JSON.stringify(data));
    S.load();
    const before = JSON.stringify(S.getPlanData(pid));
    assert.equal(S.apply(pid, 'restoreHeadcounts', { headcountIds: ['C1-H01', '不存在'] }).ok, false);
    assert.equal(JSON.stringify(S.getPlanData(pid)), before);
    assert.equal(S.apply(pid, 'restoreHeadcounts', { headcountIds: ['C1-H01'] }).ok, true);
    const h = S.G.hc(S.getPlanData(pid).cur, 'C1-H01');
    assert.equal(h.state, '可用'); assert.equal(h.personId, null); assert.equal(h.demandId, null);
    assert.equal(S.G.person(S.getPlanData(pid).cur, 'C1-E01').headcountId, null);
  });
  test('审阅修正：复制职位保存修改的职级，非法范围整批拒绝', () => {
    S.resetAll();
    const pid = 'plan-case1', page = mount(pid);
    page.openPosForm('copy', 'C1-P01');
    page.posForm.levelMin = 'P2-1'; page.posForm.levelMax = 'P3-4';
    page.submitPosForm();
    const newPosition = S.G.position(page.g, page.currentPositionId);
    assert.equal(newPosition.name, '产品经理副本');
    assert.equal(newPosition.levelMin, 'P2-1'); assert.equal(newPosition.levelMax, 'P3-4');
    const before = JSON.stringify(S.getPlanData(pid));
    const bad = S.apply(pid, 'copyPosition', { id: 'C1-P01', levelMin: 'P6-4', levelMax: 'P2-1' });
    assert.equal(bad.ok, false);
    assert.equal(JSON.stringify(S.getPlanData(pid)), before);
  });
  test('审阅修正：增编部门取当前职位归属，备注实际保存', () => {
    S.resetAll();
    const pid = 'plan-case1', page = mount(pid);
    page.currentOrgId = 'G03'; page.currentPositionId = 'C1-P01';
    page.openAddHc('C1-P01');
    assert.equal(page.addHcForm.orgId, 'G04');
    assert.equal(page.addHcForm.lockPos, true);
    assert.equal(page.addHcForm.costCenterId, S.G.org(page.g, 'G04').costCenterId);
    page.addHcForm.remark = '增编备注';
    const oldIds = new Set(page.g.headcounts.map(h => h.id));
    page.submitAddHc();
    const h = page.g.headcounts.find(h => !oldIds.has(h.id));
    assert.ok(h); assert.equal(h.positionId, 'C1-P01'); assert.equal(h.remark, '增编备注');
    assert.match(html, /v-model:value="addHcForm.remark"/);
    const before = JSON.stringify(S.getPlanData(pid));
    for (const fields of [{ workLocation: ' ' }, { costCenterId: null }, { expectedArrivalDate: null }, { expectedArrivalDate: '2026-02-30' }]) {
      assert.equal(S.apply(pid, 'addHeadcounts', Object.assign({ positionId: 'C1-P01', level: 'P4-2', count: 1 }, fields)).ok, false);
      assert.equal(JSON.stringify(S.getPlanData(pid)), before);
    }
  });
  test('审阅修正：复制子树超过八级拒绝，停用源组织不可复制', () => {
    S.resetAll();
    const pid = 'plan-case1'; let parentId = 'G03';
    for (let i = 4; i <= 7; i++) {
      const r = S.apply(pid, 'addOrg', { parentId, name: '复制层级校验' + i });
      assert.equal(r.ok, true); parentId = r.id;
    }
    const before = JSON.stringify(S.getPlanData(pid));
    const result = S.apply(pid, 'copyOrg', { id: 'G03', parentId, copyMode: 'subtree' });
    assert.equal(result.ok, false); assert.match(result.error, /超过八级/);
    assert.equal(JSON.stringify(S.getPlanData(pid)), before);
    assert.equal(S.apply(pid,'movePositions',{ positionIds:['C1-P07','C1-P08','C1-P09'],targetOrgId:'G04' }).ok,true);
    assert.equal(S.apply(pid, 'toggleOrg', { id: 'G06', action: '停用' }).ok,true);
    assert.equal(S.apply(pid, 'copyOrg', { id: 'G06', parentId: 'G03', copyMode: 'org' }).ok, false);
  });
  test('方案信息编辑：属性保存、日期只读、无变化不重复写历史', () => {
    S.resetAll();
    const pid = 'plan-case1';
    const beforeHistory = S.historyState(pid).undoCount;
    let r = S.apply(pid, 'updatePlanInfo', { name: '案例一新名称', adjustLevel: '其他', adjustReason: '外部原因', desc: '更新说明', sourceScopeIds: ['G03'], targetScopeIds: [], effDate: '2026-12-01' });
    assert.equal(r.ok, true, r.error);
    assert.equal(S.getPlan(pid).name, '案例一新名称');
    assert.equal(S.getPlan(pid).adjustLevel, '其他');
    assert.equal(S.getPlan(pid).adjustReason, '外部原因');
    assert.equal(S.getPlan(pid).desc, '更新说明');
    assert.equal(S.historyState(pid).undoCount, beforeHistory + 1);
    assert.equal(S.undo(pid).ok, true);
    assert.equal(S.getPlan(pid).name, '技术部组织拆分方案');
    assert.equal(S.redo(pid).ok, true);
    assert.equal(S.getPlan(pid).name, '案例一新名称');
    const same = S.apply(pid, 'updatePlanInfo', { name: '案例一新名称', adjustLevel: '其他', adjustReason: '外部原因', desc: '更新说明', sourceScopeIds: ['G03'], targetScopeIds: [], effDate: '2026-12-01' });
    assert.equal(same.ok, true, same.error);
    assert.equal(S.historyState(pid).undoCount, beforeHistory + 1);
    const badDate = S.apply(pid, 'updatePlanInfo', { name: '案例一新名称', adjustLevel: '其他', adjustReason: '外部原因', desc: '更新说明', sourceScopeIds: ['G03'], targetScopeIds: [], effDate: '2027-01-01' });
    assert.equal(badDate.ok, false);
    assert.match(badDate.error, /生效日期创建后不可修改/);
  });
  test('方案信息编辑：父级自动归并后仍可取消以改选部分下级', () => {
    S.resetAll();
    const page = mount('plan-case1');
    page.openPlanInfo();
    assert.equal(page.planInfoScopeDisabled('G03'), false);
    page.planInfo.roots = ['G03'];
    assert.equal(page.planInfoScopeDisabled('G03'), false);
  });
  test('方案信息编辑：无影响显式范围可移除，有影响范围阻断', () => {
    S.resetAll();
    const created = S.apply(null, 'createPlan', { name: '范围编辑回归', universe: 'scopeDemo', effDate: '2026-12-01', adjustLevel: 'BU下设一级', adjustReason: '内部原因', scopeOrgIds: ['G03'] });
    assert.equal(created.ok, true, created.error);
    const pid = created.planId;
    const common = { name: '范围编辑回归', adjustLevel: 'BU下设一级', adjustReason: '内部原因', desc: '', effDate: '2026-12-01', scopeWarningsAcknowledged: true };
    assert.equal(S.apply(pid, 'updatePlanInfo', Object.assign({}, common, { sourceScopeIds: ['G03'], targetScopeIds: ['S00'] })).ok, true);
    const removeClean = S.apply(pid, 'updatePlanInfo', Object.assign({}, common, { sourceScopeIds: ['G03'], targetScopeIds: [] }));
    assert.equal(removeClean.ok, true, removeClean.error);
    assert.deepEqual(S.getPlan(pid).targetScopeIds, []);
    assert.equal(S.apply(pid, 'updatePlanInfo', Object.assign({}, common, { sourceScopeIds: ['G03'], targetScopeIds: ['S00'] })).ok, true);
    assert.equal(S.apply(pid, 'addOrg', { parentId: 'S00', name: '范围内新增' }).ok, true);
    const blocked = S.apply(pid, 'updatePlanInfo', Object.assign({}, common, { sourceScopeIds: ['G03'], targetScopeIds: [] }));
    assert.equal(blocked.ok, false);
    assert.match(blocked.error, /存在 1 项方案调整/);
    assert.deepEqual(S.getPlan(pid).targetScopeIds, ['S00', 'NO1']);
  });
  test('新版工作台：跨职位独立多选、搜索全选及分组收起',()=>{
    S.resetAll();const page=mount('plan-case1');page.selectOrg('G04');
    page.selectOrg('G03');assert.equal(page.peopleGroups.length,0);assert.equal(page.headcountGroups.length,0);
    page.selectOrg('G04');page.toggleAllPeople({target:{checked:true}});page.toggleAllHcs({target:{checked:true}});
    assert.equal(page.selectedPersonIds.length,11);assert.equal(page.selectedHcIds.length,4);
    page.toggleGroup('people','C1-P01');assert.equal(page.peopleSelectableItems.length,11);
    page.rpKeyword='张三';page.selectedPersonIds=[];page.toggleAllPeople({target:{checked:true}});
    assert.deepEqual(Array.from(page.selectedPersonIds),['C1-E01']);assert.equal(page.selectedHcIds.length,4);
    page.selectOrg('G05');assert.equal(page.selectedPersonIds.length,0);assert.equal(page.selectedHcIds.length,0);
  });
  test('职位管理：直属范围、停用过滤、快捷新建回选和独立撤销',()=>{
    S.resetAll();const pid='plan-case1',page=mount(pid);
    page.openPositionManager('G04');assert.equal(page.pmItems.length,3);
    page.openTransfer(['C1-E01']);page.tf.header.orgId='G05';page.tf.form.workCity='调岗草稿';
    page.quickNewPosition('tf');assert.equal(page.posForm.orgId,'G05');
    page.posForm.name='快捷新职位';page.posForm.levelMin='P3-1';page.posForm.levelMax='P5-4';page.submitPosForm();
    const newId=page.tf.header.posId;assert.ok(newId);assert.equal(page.tf.form.workCity,'调岗草稿');
    page.tf.open=false;assert.ok(S.G.position(page.g,newId));
    const steps=S.historyState(pid).undoCount;
    page.openTransfer(['C1-E01']);page.tf.header={orgId:'G05',posId:newId,mgrId:'M03'};page.confirmTransfer();
    assert.equal(page.tf.open,false);assert.equal(S.historyState(pid).undoCount,steps+1);
    S.undo(pid);assert.equal(S.G.person(S.getPlanData(pid).cur,'C1-E01').positionId,'C1-P01');assert.ok(S.G.position(S.getPlanData(pid).cur,newId));
    S.undo(pid);assert.equal(S.G.position(S.getPlanData(pid).cur,newId),undefined);
  });
  test('顶部增编：空组织和搜索无结果时仍可选有效空职位',()=>{
    S.resetAll();const pid='plan-case1',page=mount(pid);
    page.selectOrg('G03');page.hcKeyword='不存在';page.openAddHc();
    assert.equal(page.addHcForm.orgId,'G03');assert.equal(page.addHcForm.posId,null);assert.equal(page.addHcForm.lockOrg,false);
    page.quickNewPosition('addHc');page.posForm.name='预备空职位';page.posForm.levelMin='P3-1';page.posForm.levelMax='P5-4';page.submitPosForm();
    const id=page.addHcForm.posId;page.onAddHcPositionChange();page.submitAddHc();
    assert.equal(page.addHcOpen,false);assert.equal(S.G.hcsOf(page.g,id).length,1);assert.equal(page.hcKeyword,'');
  });
  test('组织拖拽：编制职位手选、取消保留整批和其他面板选择',()=>{
    S.resetAll();const page=mount('plan-case1');page.selectOrg('G04');
    page.selectedHcIds=['C1-H10','C1-H11'];page.selectedPersonIds=['C1-E01'];
    const event={dataTransfer:{setData(){}},currentTarget:{getBoundingClientRect:()=>({left:0,top:0,width:100,height:30})},clientX:0,clientY:0};
    page.onHcDragStart(event,{id:'C1-H10',code:'名额'});
    page.onTreeDrop(event,{id:'G04',status:'有效',inScope:true});
    assert.equal(page.hcTf.header.posId,null);assert.equal(page.hcTf.lockOrg,true);
    page.hcTf.open=false;assert.equal(page.selectedHcIds.length,2);assert.equal(page.selectedPersonIds.length,1);
  });
  test('调岗定位：同组织内保留另一栏选择，去处理保留外层草稿',()=>{
    S.resetAll();const page=mount('plan-case1');page.selectOrg('G04');
    page.selectedHcIds=['C1-H10'];page.openTransfer(['C1-E01']);page.tf.header={orgId:'G04',posId:'C1-P02',mgrId:'M02'};page.tf.bring=false;
    page.tf.form.workCity='未完成城市';page.openPositionManager('G04','tf');page.askTogglePos('C1-P01','停用');
    assert.equal(page.positionBlocked.open,true);page.goHandlePosition();
    assert.equal(page.tf.open,false);assert.equal(page.suspendedDraft.value.form.workCity,'未完成城市');
    page.resumeBusinessDraft();assert.equal(page.tf.open,true);assert.equal(page.tf.form.workCity,'未完成城市');
    page.currentOrgId='G04';page.selectedHcIds=['C1-H10'];page.confirmTransfer();
    assert.equal(page.currentOrgId,'G04');assert.deepEqual(Array.from(page.selectedHcIds),['C1-H10']);
  });
  return results;
};
