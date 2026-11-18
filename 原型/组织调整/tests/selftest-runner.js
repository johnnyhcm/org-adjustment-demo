/* 自测断言（纯 JS，浏览器 06-演示自测.html 与 Node tests/run-tests.js 共用）
 * 断言值来源：
 *  - PRD 13.1/13.3 初始数量与 13.4 NUM-01—08 预期
 *  - PRD 12.2 INV-01—05、13.2 DUP/PTKEEP
 *  - PRD 17.2.2/17.3.2 种子与 17.3.4 案例二结果
 *  - APR-03/04 快照不可变、UI-05 只读、FUT-02 提交阻断
 */
(function (root) {
  const S = root.OA.store;

  function runAll() {
    const results = [];
    const t = (name, fn) => { try { fn(); results.push({ name, pass: true }); } catch (e) { results.push({ name, pass: false, error: e.message }); } finally { S.setDemoFlag('persistFail', false); } };
    const eq = (actual, expected, label) => { if (actual !== expected) throw new Error(`${label}: 期望 ${expected}，实际 ${actual}`); };
    const ok = (cond, label) => { if (!cond) throw new Error(label || '断言失败'); };

    const setupHuadong = (ready = false) => {
      S.resetAll();
      const r = S.apply(null, 'createPlan', { name: '华东组织调整方案', effDate: '2026-12-01', adjustLevel: 'BU下设一级', adjustReason: '内部原因', scopeOrgIds: ['O10', 'O20'], desc: '', universe: 'huadong' });
      if (!r.ok) throw new Error('创建华东方案失败: ' + r.error);
      S.apply(r.planId, 'extendScope', { orgIds: ['O30'] });
      if (ready) ok(S.apply(r.planId, 'applyAutoMatch', { positionId: 'P10' }).ok, '提交类用例先处理应占编的李四');
      return r.planId;
    };
    const cnt = (pid, posId) => {
      const g = S.getPlanData(pid).cur, C = S.CNT;
      return { emp: C.positionEmployees(g, posId), ppl: C.positionPeople(g, posId), total: C.totalHeadcounts(g, posId), avail: C.available(g, posId), dem: C.demandReserved(g, posId), ind: C.independentVacant(g, posId), fut: C.futureMatters(g, posId), post: C.posts(g, posId) };
    };
    const rangeTotal = (pid, orgIds) => S.CNT.rangeTotals(S.getPlanData(pid).cur, orgIds);
    const move = (pid, personId, targetPositionId, managerId, bringHeadcount) =>
      S.apply(pid, 'transferPersons', { rows: [{ personId, targetPositionId, managerId, bringHeadcount: !!bringHeadcount }] });

    /* ---- BASE 初始数量（13.1/13.3） ---- */
    t('BASE：P10/P20 初始数量与范围合计', () => {
      const pid = setupHuadong();
      const meta = S.getPlan(pid);
      eq(meta.adjustLevel, 'BU下设一级', '方案调整层级'); eq(meta.adjustReason, '内部原因', '方案调整原因');
      const p10 = cnt(pid, 'P10'), p20 = cnt(pid, 'P20');
      eq(p10.emp, 2, 'P10 员工'); eq(p10.ppl, 5, 'P10 人员'); eq(p10.total, 6, 'P10 总编制');
      eq(p10.avail, 1, 'P10 可用'); eq(p10.dem, 2, 'P10 需求占用'); eq(p10.ind, 3, 'P10 独立空编');
      eq(p10.fut, 4, 'P10 未来事项'); eq(p10.post, 1, 'P10 兼职');
      eq(p20.emp, 1, 'P20 员工'); eq(p20.total, 2, 'P20 总编制'); eq(p20.avail, 1, 'P20 可用');
      const rt = rangeTotal(pid, ['O10', 'O20', 'O30']);
      eq(rt.positions, 4, '范围职位'); eq(rt.employees, 4, '范围在职'); eq(rt.future, 3, '范围未来');
      eq(rt.headcounts, 9, '范围编制'); eq(rt.available, 2, '范围可用'); eq(rt.demandReserved, 2, '范围需求'); eq(rt.posts, 1, '范围兼职');
    });

    /* ---- NUM-01：张三带 H01 调到 P20 ---- */
    t('NUM-01：带编调岗（含下属自动更新）', () => {
      const pid = setupHuadong();
      const r = move(pid, 'E01', 'P20', 'M02', true);
      ok(r.ok, '调岗应成功: ' + (r.error || ''));
      const p10 = cnt(pid, 'P10'), p20 = cnt(pid, 'P20');
      eq(p10.emp, 1, 'P10 员工'); eq(p10.ppl, 4, 'P10 人员'); eq(p10.total, 5, 'P10 总编制'); eq(p10.avail, 1, 'P10 可用'); eq(p10.ind, 3, 'P10 独立');
      eq(p20.emp, 2, 'P20 员工'); eq(p20.total, 3, 'P20 总编制'); eq(p20.avail, 1, 'P20 可用');
      const g = S.getPlanData(pid).cur;
      const h01 = S.G.hc(g, 'H01');
      eq(h01.positionId, 'P20', 'H01 跟随'); eq(h01.personId, 'E01', 'H01 仍占张三'); eq(h01.state, '占编', 'H01 状态');
      eq(S.G.person(g, 'E04').managerId, 'M01', '陈七经理改为 M01（Demo 规则）');
      eq(S.G.post(g, 'PT01').concurrentPositionId, 'P10', 'PT01 不变');
    });
    t('NUM-01b：带编调岗（下属自动更新，无同步开关）', () => {
      const pid = setupHuadong();
      const r = move(pid, 'E01', 'P20', 'M02', true);
      ok(r.ok, r.error || '');
      eq(S.G.person(S.getPlanData(pid).cur, 'E04').managerId, 'M01', '陈七经理自动更新为所在部门负责人');
    });

    /* ---- NUM-02：张三不带编调到 P20 ---- */
    t('NUM-02：不带编调岗', () => {
      const pid = setupHuadong();
      const r = move(pid, 'E01', 'P20', 'M02', false);
      ok(r.ok, r.error || '');
      const p10 = cnt(pid, 'P10'), p20 = cnt(pid, 'P20');
      eq(p10.emp, 1, 'P10 员工'); eq(p10.ppl, 4, 'P10 人员'); eq(p10.total, 6, 'P10 总编制'); eq(p10.avail, 2, 'P10 可用'); eq(p10.ind, 4, 'P10 独立');
      eq(p20.emp, 2, 'P20 员工'); eq(p20.total, 2, 'P20 总编制'); eq(p20.avail, 0, 'P20 空编自动分配');
      const g = S.getPlanData(pid).cur, h01 = S.G.hc(g, 'H01');
      eq(h01.positionId, 'P10', 'H01 留 P10'); eq(h01.state, '可用', 'H01 变可用'); ok(S.G.person(g, 'E01').headcountId, '张三自动占用目标空编');
    });

    /* ---- NUM-03：解除张三编制 ---- */
    t('NUM-03：解除编制（不自动匹配）', () => {
      const pid = setupHuadong();
      const r = S.apply(pid, 'releaseHeadcount', { personId: 'E01' });
      ok(r.ok, r.error || '');
      const p10 = cnt(pid, 'P10');
      eq(p10.emp, 2, 'P10 员工'); eq(p10.ppl, 5, 'P10 人员'); eq(p10.total, 6, 'P10 总编制'); eq(p10.avail, 2, 'P10 可用'); eq(p10.ind, 4, 'P10 独立');
      const g = S.getPlanData(pid).cur;
      eq(S.G.person(g, 'E01').positionId, 'P10', '张三留原职位'); ok(!S.G.person(g, 'E01').headcountId, '占编标识移除');
      ok(!S.G.person(g, 'E02').headcountId, '不自动匹配李四');
    });

    /* ---- NUM-04：自动匹配李四与 H03 ---- */
    t('NUM-04：自动匹配（预览不落数据，应用后占编）', () => {
      const pid = setupHuadong();
      const pv = S.apply(pid, 'matchPreview', { positionId: 'P10' });
      ok(pv.ok && pv.pairs.length === 1, '预览应有一组可匹配');
      eq(pv.pairs[0].personId, 'E02', '匹配李四'); eq(pv.pairs[0].hcId, 'H03', '匹配 H03');
      const before = JSON.stringify(S.getPlanData(pid).cur.headcounts);
      const r = S.apply(pid, 'applyAutoMatch', { positionId: 'P10' });
      ok(r.ok, r.error || '');
      const p10 = cnt(pid, 'P10');
      eq(p10.total, 6, '总编制不变'); eq(p10.avail, 0, '可用归零'); eq(p10.ind, 2, '独立空编 2'); eq(p10.emp, 2, '员工不变');
      const g = S.getPlanData(pid).cur;
      eq(S.G.person(g, 'E02').headcountId, 'H03', '李四占编');
      eq(S.G.hc(g, 'H04').state, '需求预留', 'H04 预留不动'); eq(S.G.hc(g, 'H05').state, '需求预留', 'H05 预留不动');
    });

    /* ---- NUM-05：P10 增编 2 个 P4 ---- */
    t('NUM-05：增编 2（每名额独立编码，不自动分配）', () => {
      const pid = setupHuadong();
      const r = S.apply(pid, 'addHeadcounts', { positionId: 'P10', level: 'P4-2', count: 2 });
      ok(r.ok, r.error || '');
      eq(r.ids.length, 2, '两个新名额');
      const g = S.getPlanData(pid).cur;
      ok(S.G.hc(g, r.ids[0]).code !== S.G.hc(g, r.ids[1]).code, '编码唯一');
      const p10 = cnt(pid, 'P10');
      eq(p10.total, 8, '总编制 8'); eq(p10.avail, 3, '可用 3'); eq(p10.ind, 5, '独立 5');
      ok(!S.G.person(g, 'E02').headcountId, '不自动分配李四');
    });
    t('NUM-05b：增编非法数量（0/负数/小数）拒绝', () => {
      const pid = setupHuadong();
      ok(!S.apply(pid, 'addHeadcounts', { positionId: 'P10', level: 'P4-2', count: 0 }).ok, '0 拒绝');
      ok(!S.apply(pid, 'addHeadcounts', { positionId: 'P10', level: 'P4-2', count: -1 }).ok, '负数拒绝');
      ok(!S.apply(pid, 'addHeadcounts', { positionId: 'P10', level: 'P4-2', count: 1.5 }).ok, '小数拒绝');
    });

    /* ---- NUM-06：P10 减编 1 个 P4 ---- */
    t('NUM-06：减编 1（只动可用，预留不动）', () => {
      const pid = setupHuadong();
      const r = S.apply(pid, 'removeHeadcounts', { positionId: 'P10', level: 'P4-2', count: 1 });
      ok(r.ok, r.error || '');
      eq(JSON.stringify(r.removed), JSON.stringify(['H03']), '仅 H03 减编');
      const p10 = cnt(pid, 'P10');
      eq(p10.total, 5, '总编制 5'); eq(p10.avail, 0, '可用 0'); eq(p10.ind, 2, '独立 2');
      const g = S.getPlanData(pid).cur;
      eq(S.G.hc(g, 'H04').state, '需求预留', 'H04 不动'); eq(S.G.hc(g, 'H05').state, '需求预留', 'H05 不动');
    });
    t('NUM-06b：减编超量拒绝（可用 1 减 2）', () => {
      const pid = setupHuadong();
      const r = S.apply(pid, 'removeHeadcounts', { positionId: 'P10', level: 'P4-2', count: 2 });
      ok(!r.ok, '超过可用数量应拒绝'); ok(/仅 .* 个/.test(r.error), '提示可用数量');
    });

    /* ---- NUM-07：H03 移到 P20 ---- */
    t('NUM-07：空编移动（身份与职级不变）', () => {
      const pid = setupHuadong();
      const r = S.apply(pid, 'moveHeadcounts', { fromPositionId: 'P10', toPositionId: 'P20', level: 'P4-2', count: 1 });
      ok(r.ok, 'P4-2 在 P20 范围内应可移动: ' + (r.error || ''));
      const p10 = cnt(pid, 'P10'), p20 = cnt(pid, 'P20');
      eq(p10.total, 5, 'P10 总编制 5'); eq(p10.avail, 0, 'P10 可用 0'); eq(p10.ind, 2, 'P10 独立 2');
      eq(p20.total, 3, 'P20 总编制 3'); eq(p20.avail, 2, 'P20 可用 2'); eq(p20.ind, 2, 'P20 独立 2');
      const rt = rangeTotal(pid, ['O10', 'O20', 'O30']);
      eq(rt.headcounts, 9, '全范围总编制仍 9');
      const h03 = S.G.hc(S.getPlanData(pid).cur, 'H03');
      eq(h03.positionId, 'P20', 'H03 归属 P20'); eq(h03.level, 'P4-2', '职级不变');
    });
    t('NUM-07b：空编移到职级不匹配职位拒绝', () => {
      const pid = setupHuadong();
      const r = S.apply(pid, 'moveHeadcounts', { fromPositionId: 'P10', toPositionId: 'P21', level: 'P4-2', count: 1 });
      ok(!r.ok, 'P21 为 P1-1—P3-4，P4-2 应拒绝'); ok(S.G.hc(S.getPlanData(pid).cur, 'H03').positionId === 'P10', '原编制不变化');
    });

    /* ---- NUM-08：取消 PT01 ---- */
    t('NUM-08：取消兼职（主职与编制不变）', () => {
      const pid = setupHuadong();
      const r = S.apply(pid, 'cancelPost', { postId: 'PT01' });
      ok(r.ok, r.error || '');
      const p10 = cnt(pid, 'P10');
      eq(p10.emp, 2, '员工 2'); eq(p10.ppl, 5, '人员 5'); eq(p10.post, 0, '兼职 0'); eq(p10.total, 6, '总编制 6');
      const g = S.getPlanData(pid).cur;
      eq(S.G.person(g, 'E06').positionId, 'P40', '王强外部主职不变'); eq(S.G.hc(g, 'H40').state, '占编', '外部编制不变');
    });

    /* ---- DUP：同一人多单据合并（13.2） ---- */
    t('DUP：王五 Offer+待入职合并展示，数量不增', () => {
      const pid = setupHuadong();
      const g = S.getPlanData(pid).cur;
      const c01 = S.G.person(g, 'C01');
      c01.refs.push({ type: '入职', note: '同身份待入职关联单（DUP）' });
      c01.futureType = '待入职';
      const ppl = S.CNT.positionPeople(g, 'P10');
      eq(ppl, 5, '人员仍 5'); eq(S.CNT.independentVacant(g, 'P10'), 3, '独立空编仍 3');
      eq(S.G.person(g, 'C01').refs.length, 2, '详情保留两个关联');
    });

    /* ---- PTKEEP：单独调岗不重建兼职（13.2） ---- */
    t('PTKEEP：张三单独调岗，PT02 仍属 P11', () => {
      const pid = setupHuadong();
      S.apply(pid, 'addPost', { personId: 'E01', mainPositionId: 'P10', concurrentPositionId: 'P11' }); // PT02（自测专用入口）
      let g = S.getPlanData(pid).cur;
      eq(S.CNT.posts(g, 'P11'), 1, 'P11 兼职 1');
      const r = move(pid, 'E01', 'P20', 'M02', true);
      ok(r.ok, r.error || '');
      g = S.getPlanData(pid).cur;
      const pt02 = g.posts.find(x => x.personId === 'E01' && x.concurrentPositionId === 'P11');
      ok(pt02, 'PT02 仍指向 P11'); eq(S.CNT.posts(g, 'P11'), 1, 'P11 兼职仍 1');
      eq(S.G.person(g, 'E01').positionId, 'P20', '张三主职已调'); eq(S.G.hc(g, 'H01').personId, 'E01', '主职编制随人');
    });

    /* ---- 校验边界（PER-08/10/11、ORG-10） ---- */
    t('PER-08/10：带编职级不匹配仍移动，异常待处理', () => {
      const pid = setupHuadong();
      const r = S.apply(pid, 'transferPersons', { rows: [{ personId: 'E01', targetPositionId: 'P21', managerId: 'M02', bringHeadcount: true }] });
      ok(r.ok,'允许先移动');eq(r.abnormalCount,1,'一人异常');
      const g=S.getPlanData(pid).cur;eq(S.G.person(g,'E01').positionId,'P21','人员已移动');eq(S.G.hc(g,'H01').positionId,'P21','原编制已移动');
      ok(S.computePending(S.getPlan(pid)).some(x=>x.kind==='headcount' && x.id==='H01'),'编制异常待处理');
      ok(!S.apply(pid,'submit',{}).ok,'未解决不能提交');
    });
    t('PER-11：经理循环拒绝', () => {
      const pid = setupHuadong();
      const r = S.apply(pid, 'transferPersons', { rows: [{ personId: 'E01', targetPositionId: 'P20', managerId: 'E04', bringHeadcount: true }] });
      ok(!r.ok, 'E01 的上级设为其下属 E04 应拒绝');
      eq(S.G.person(S.getPlanData(pid).cur, 'E01').managerId, 'M01', '未产生变更');
    });
    t('ORG-10：组织移动落点校验', () => {
      const pid = setupHuadong();
      ok(!S.apply(pid, 'moveOrg', { id: 'O10', newParentId: 'O10' }).ok, '不能移到自身');
      ok(!S.apply(pid, 'moveOrg', { id: 'O20', newParentId: 'O21' }).ok, '不能移到自身后代');
      ok(!S.apply(pid, 'moveOrg', { id: 'O20', newParentId: 'O40' }).ok, '不能移到范围外 O40');
      const r = S.apply(pid, 'moveOrg', { id: 'O20', newParentId: 'O10' });
      ok(r.ok, '移入范围内 O10 应成功: ' + (r.error || ''));
      const g = S.getPlanData(pid).cur;
      eq(S.G.org(g, 'O21').parentId, 'O20', '下级 O21 跟随（身份不变）');
      eq(S.G.position(g, 'P10').orgId, 'O10', 'O10 职位直接归属不变');
    });

    /* ---- ORG-08/09：停用组织两种处理方式 ---- */
    t('停用组织：有人时原子阻断，无人空对象随组织关闭', () => {
      const pid = setupHuadong();
      const before = JSON.stringify(S.getPlanData(pid));
      ok(!S.apply(pid, 'stopOrg', { orgId:'O10', mode:'manual' }).ok, '有人阻断');
      eq(JSON.stringify(S.getPlanData(pid)), before, '失败无写入');
      const child = S.apply(pid, 'addOrg', { parentId:'O10', name:'空组织' });
      const pos = S.apply(pid, 'addPosition', { orgId:child.id, name:'空职位', levelMin:'P3-1', levelMax:'P5-4' });
      ok(S.apply(pid, 'addHeadcounts', { positionId:pos.id, level:'P4-2', count:1 }).ok, '增编');
      ok(S.apply(pid, 'stopOrg', { orgId:child.id, mode:'manual' }).ok, '无人可关闭');
      const g = S.getPlanData(pid).cur;
      eq(S.G.org(g,child.id).status, '停用', '组织停用');
      eq(S.G.position(g,pos.id).status, '停用', '职位关闭');
      eq(S.G.hcsOf(g,pos.id).length, 0, '空编关闭');
    });

    t('停用组织：整体转移保留层级，直属职位和关联对象跟随', () => {
      const pid = setupHuadong();
      const child = S.apply(pid, 'addOrg', { parentId: 'O10', name: '产品子部' });
      ok(child.ok, '新增子组织');
      const childPos = S.apply(pid, 'addPosition', { orgId: child.id, name: '子部职位', levelMin: 'P3-1', levelMax: 'P5-4' });
      ok(childPos.ok, '新增子组织职位');
      const beforePerson = JSON.stringify(S.G.person(S.getPlanData(pid).cur, 'E01'));
      const beforeHc = JSON.stringify(S.G.hc(S.getPlanData(pid).cur, 'H01'));
      const r = S.apply(pid, 'stopOrg', { orgId: 'O10', mode: 'transfer', targetOrgId: 'O20' });
      ok(r.ok, r.error || '');
      const g = S.getPlanData(pid).cur;
      eq(S.G.org(g, 'O10').status, '停用', '当前组织停用');
      eq(S.G.org(g, child.id).parentId, 'O20', '下级组织整体挂到新上级');
      eq(S.G.position(g, 'P10').orgId, 'O20', '当前组织直属职位转移');
      eq(S.G.position(g, 'P11').orgId, 'O20', '当前组织直属职位全部转移');
      eq(S.G.position(g, childPos.id).orgId, child.id, '下级组织职位保持原层级');
      eq(JSON.stringify(S.G.person(g, 'E01')), beforePerson, '人员身份和主职关系不变');
      eq(JSON.stringify(S.G.hc(g, 'H01')), beforeHc, '编制身份和关系不变');
      eq(S.computePending(S.getPlan(pid)).some(x => x.id === 'O10'), false, '当前组织因对象迁走不再产生结构待处理');
    });

    t('停用组织：整体转移目标校验与整批回滚', () => {
      const pid = setupHuadong();
      const before = JSON.stringify({ plan: S.getPlan(pid), pd: S.getPlanData(pid) });
      ok(!S.apply(pid, 'stopOrg', { orgId: 'O10', mode: 'transfer', targetOrgId: 'O10' }).ok, '不能转移到自身');
      ok(!S.apply(pid, 'stopOrg', { orgId: 'O10', mode: 'transfer', targetOrgId: 'O00' }).ok, '范围外目标阻断');
      eq(JSON.stringify({ plan: S.getPlan(pid), pd: S.getPlanData(pid) }), before, '目标校验失败不改变数据');
      const child = S.apply(pid, 'addOrg', { parentId: 'O10', name: '产品子部' });
      ok(!S.apply(pid, 'stopOrg', { orgId: 'O10', mode: 'transfer', targetOrgId: child.id }).ok, '不能转移到自身下级');
      eq(S.G.org(S.getPlanData(pid).cur, 'O10').status, '有效', '失败后当前组织仍有效');
    });

    /* ---- 派生变化：职位整体移动（CMP-16、AT-50） ---- */
    t('职位整体移动：人员/编制/未来派生差异与跟随', () => {
      const pid = setupHuadong();
      const r = S.apply(pid, 'movePositions', { positionIds: ['P10'], targetOrgId: 'O30' });
      ok(r.ok, r.error || '');
      const g = S.getPlanData(pid).cur;
      eq(S.G.position(g, 'P10').orgId, 'O30', 'P10 归属运营部');
      eq(S.G.person(g, 'E01').positionId, 'P10', '人员 positionId 不变');
      eq(S.G.hc(g, 'H01').positionId, 'P10', '编制 positionId 不变');
      eq(S.G.person(g, 'C01').targetPositionId, 'P10', '未来目标不变');
      const d = S.diffPlan(S.getPlan(pid));
      const dEmp = d.persons.find(x => x.id === 'E01');
      ok(dEmp && dEmp.reason === '随职位整体迁移', '人员差异原因=随职位整体迁移');
      const dHc = d.headcounts.find(x => x.id === 'H01');
      ok(dHc && dHc.reason === '随职位整体迁移', '编制差异原因=随职位整体迁移');
      const dFut = d.futureItems.find(x => x.id === 'C01');
      ok(dFut && dFut.reason === '随职位整体迁移', '未来事项差异原因=随职位整体迁移');
      const dPos = d.positions.find(x => x.id === 'P10');
      ok(dPos && dPos.reason === '整体移动', '职位差异原因=整体移动');
    });

    /* ---- 待处理与提交阻断（F-03、FUT-02） ---- */
    t('职级范围收缩 → 待处理 → 提交阻断 → 恢复', () => {
      const pid = setupHuadong(true);
      ok(S.apply(pid, 'editPosition', { id: 'P10', levelMax: 'P3-4' }).ok, '允许保存（F-03 Demo 约定）');
      const pending = S.computePending(S.getPlan(pid));
      ok(pending.length >= 6, '6 个 P4 编制不匹配应全部标待处理，实际 ' + pending.length);
      ok(!S.apply(pid, 'submit', {}).ok, '提交被阻止');
      ok(S.apply(pid, 'editPosition', { id: 'P10', levelMax: 'P5-4' }).ok, '恢复职级范围');
      eq(S.computePending(S.getPlan(pid)).length, 0, '待处理清空');
    });
    t('停用职位：有引用前置阻断，空职位可停用再启用', () => {
      const pid = setupHuadong(true), before = JSON.stringify(S.getPlanData(pid));
      ok(!S.apply(pid, 'togglePosition', { id:'P10', action:'停用' }).ok, '有关联禁止停用');
      eq(JSON.stringify(S.getPlanData(pid)), before, '阻断无写入');
      const p = S.apply(pid,'addPosition',{ orgId:'O10',name:'空职位',levelMin:'P3-1',levelMax:'P5-4' });
      ok(S.apply(pid,'togglePosition',{ id:p.id,action:'停用' }).ok, '空职位可停用');
      ok(S.apply(pid,'togglePosition',{ id:p.id,action:'启用' }).ok, '启用');
      eq(S.computePending(S.getPlan(pid)).length,0,'无待处理');
    });

    /* ---- 提交快照与版本（APR-03/04、UI-05、AT-55） ---- */
    t('提交快照不可变，退回回草稿后重提 V2 保留 V1', () => {
      const pid = setupHuadong(true);
      ok(S.apply(pid, 'editOrg', { id: 'O10', name: '产品中心' }).ok, '改名');
      const s1 = S.apply(pid, 'submit', {});
      ok(s1.ok, '提交 V1: ' + (s1.error || ''));
      eq(s1.version, 1, 'V1');
      ok(S.apply(pid, 'editOrg', { id: 'O10', name: '产品中心二' }).ok === false, '审批中不可编辑（UI-05）');
      const pd = S.getPlanData(pid);
      eq(pd.versions[0].snapshot.orgs.find(o => o.id === 'O10').name, '产品中心', 'V1 快照冻结');
      ok(S.apply(pid, 'demoReturn', { comment: '请核对 HRBP' }).ok, '退回');
      eq(S.getPlan(pid).status, '草稿', '退回后回草稿');
      ok(S.apply(pid, 'editOrg', { id: 'O10', hrbpId: 'HR01' }).ok, '退回草稿后可继续调整');
      const s2 = S.apply(pid, 'submit', {});
      ok(s2.ok && s2.version === 2, '再次提交 V2');
      eq(S.getPlanData(pid).versions.length, 2, '两个版本');
      eq(S.getPlanData(pid).versions[0].snapshot.orgs.find(o => o.id === 'O10').name, '产品中心', 'V1 材料不被 V2 替换');
      ok(S.apply(pid, 'demoApprove', {}).ok, '审批通过');
      eq(S.getPlan(pid).status, '待生效', '待生效（EFF-01）');
      ok(S.apply(pid, 'demoExecuteSuccess', {}).ok, '到期执行成功');
      eq(S.getPlan(pid).status, '已生效', '已生效（EFF-02）');
    });

    t('待手动处理状态：模拟执行异常后进入待手动处理', () => {
      const pid = setupHuadong(true);
      ok(S.apply(pid, 'editOrg', { id: 'O10', name: '产品中心' }).ok, '先产生调整');
      ok(S.apply(pid, 'submit', {}).ok, '提交');
      ok(S.apply(pid, 'demoApprove', {}).ok, '审批通过');
      ok(S.apply(pid, 'demoExecuteFail', { reason: '组织数据同步失败（演示异常）' }).ok, '模拟异常');
      eq(S.getPlan(pid).status, '待手动处理', '待手动处理');
    });

    t('范围校验：未来组织提醒、已停用组织排除、在途编制流程阻断', () => {
      const r = S.validateScope('scopeDemo', ['G02'], '2026-12-01');
      ok(r.warnings.some(x => x.orgId === 'S01' && x.code === 'future-start'), '未来生效组织提醒');
      ok(r.warnings.some(x => x.orgId === 'S02' && x.code === 'future-stop'), '计划停用组织提醒');
      ok(r.excludedOrgIds.includes('S04'), '方案日已停用组织排除');
      ok(r.blocking.some(x => x.orgId === 'S06' && x.code === 'HEADCOUNT_WORKFLOW'), '在途编制流程阻断');
    });

    t('范围校验：完整子树保留，未来组织提示不阻断创建', () => {
      const check = S.validateScope('scopeDemo', ['S00'], '2026-12-01');
      ok(check.warnings.length === 2, '未来组织有两项提醒');
      ok(!check.blocking.length, '没有在途流程阻断');
      const created = S.apply(null, 'createPlan', { universe: 'scopeDemo', name: '范围校验提示', effDate: '2026-12-01', adjustLevel: 'BU下设一级', adjustReason: '内部原因', scopeOrgIds: ['S00'] });
      ok(created.ok, '未来组织提示不阻断创建');
      ok(S.scopeInfo(S.getPlan(created.planId)).scope.includes('S03'), '完整子树有效组织纳入');
      ok(!S.scopeInfo(S.getPlan(created.planId)).scope.includes('S01'), '未来生效组织不纳入实际范围');
      ok(!S.scopeInfo(S.getPlan(created.planId)).scope.includes('S02'), '计划停用组织不纳入实际范围');
    });

    t('范围校验：在途流程所在组织不能单独创建方案', () => {
      const r = S.apply(null, 'createPlan', { universe: 'scopeDemo', name: '在途流程阻断', effDate: '2026-12-01', adjustLevel: 'BU下设一级', adjustReason: '内部原因', scopeOrgIds: ['S06'] });
      ok(!r.ok && /在途编制调整流程/.test(r.error), '在途流程阻断创建');
    });

    t('权限森林与全局组织层级：多个可见根节点保留真实层级', () => {
      const g = OA.seed.UNIVERSES.scopeDemo();
      const roots = S.permissionRoots('scopeDemo');
      ok(roots.includes('G03') && roots.includes('S00') && roots.includes('S05'), '权限根节点完整');
      eq(S.G.orgLevel(g, 'G03'), 3, '技术部全局层级');
      eq(S.G.orgLevel(g, 'S01'), 4, '未来启用部全局层级');
      const tree = S.universeTree('scopeDemo', '2026-12-01');
      ok(tree.map(x => x.id).includes('G03') && tree.map(x => x.id).includes('S00'), '权限森林多个根节点');
      ok(!tree.flatMap(x => [x].concat(x.children || [])).some(x => x.id === 'G01'), '不展示无权限集团根节点');
      ok(S.scopeTree('plan-case1').some(x => x.id === 'G03'), '现有测试方案工作台组织树可见');
      ok(S.chartTree('plan-case1', 'R').some(x => x.id === 'G03'), '现有测试方案架构图组织树可见');
    });

    t('组织胶囊：主标签优先级与待处理无数量', () => {
      const pid = setupHuadong();
      const add = S.apply(pid, 'addOrg', { parentId: 'O10', name: '空组织' });
      ok(add.ok, '新增空组织');
      ok(S.apply(pid, 'toggleOrg', { id: add.id, action: '停用' }).ok, '停用新增空组织');
      eq(S.orgChangeTags(S.getPlan(pid), add.id).length, 0, '新增后停用且为空不显示主标签');
      const childPending = S.apply(pid, 'addOrg', { parentId: 'O10', name: '待处理下级' });
      ok(childPending.ok, '新增待处理下级');
      ok(!S.apply(pid, 'toggleOrg', { id:'O10', action:'停用' }).ok, '有人员不能停用');
      S.G.org(S.getPlanData(pid).cur, 'O10').status = '停用'; // 模拟旧方案异常数据，继续验证待处理兜底
      eq(JSON.stringify(S.orgChangeTags(S.getPlan(pid), 'O10')), JSON.stringify(['停用']), '停用优先');
      const pending = S.computePending(S.getPlan(pid));
      ok(pending.some(x => x.kind === 'org' && x.id === childPending.id), '上级停用时待处理标记下级组织');
      ok(pending.some(x => x.kind === 'org' && x.id === 'O10'), '停用组织自身仍有人员时标记上级');
      ok(pending.some(x => x.kind === 'position' && x.id === 'P10'), '所属组织停用时职位标记待处理');
      const empty = S.computePending(S.getPlan(pid)).filter(x => x.kind === 'position' && x.id === 'P11');
      ok(empty.length > 0, '所属组织停用的职位按职位责任标记');
    });

    t('组织最多八级：八级组织不能新增下级', () => {
      const pid = setupHuadong();
      let parent = 'O10';
      for (let i = 0; i < 6; i++) {
        const r = S.apply(pid, 'addOrg', { parentId: parent, name: '层级组织' + i });
        ok(r.ok, '新增第 ' + (i + 3) + ' 级组织');
        parent = r.id;
      }
      const blocked = S.apply(pid, 'addOrg', { parentId: parent, name: '第九级组织' });
      ok(!blocked.ok && /八级组织/.test(blocked.error), '第九级组织被阻断');
    });

    /* ---- 放弃方案（LIST-03） ---- */
    t('放弃草稿 → 已作废只读', () => {
      const pid = setupHuadong();
      ok(S.apply(pid, 'discardPlan', {}).ok, '放弃');
      eq(S.getPlan(pid).status, '已作废', '状态已作废');
      ok(!S.apply(pid, 'editOrg', { id: 'O10', name: 'X' }).ok, '已作废不可编辑');
    });

    /* ---- 案例一种子（17.2.2） ---- */
    t('案例一 BASE：范围内 9 职位 24 员工 28 编制 4 可用，管理人员 4', () => {
      S.resetAll();
      const pid = 'plan-case1', g = S.getPlanData(pid).cur;
      eq(g.positions.length, 11, '职位 11（含范围外 2）'); eq(g.orgs.length, 8, '组织 8');
      const rt = S.CNT.rangeTotals(g, ['G03']);
      eq(rt.positions, 9, '范围内职位 9'); eq(rt.employees, 24, '在职 24'); eq(rt.headcounts, 28, '编制 28'); eq(rt.available, 4, '可用 4');
      eq(S.CNT.available(g, 'C1-P02'), 1, '产品运营可用 1（C1-H03）');
      eq(S.CNT.available(g, 'C1-P01'), 2, '产品经理可用 2（C1-H10/H11）');
      eq(g.persons.filter(p => p.kind === 'manager').length, 4, '管理人员 4');
      eq((S.G.org(g, 'G04') || {}).leaderId, 'M02', '产品部负责人 M02（调岗默认上级映射）');
    });

    /* ---- 案例二主线（17.3.3 → 17.3.4） ---- */
    t('案例二主线：三新组织、六职位迁移、停用阻断与解除', () => {
      S.resetAll();
      const pid = 'plan-case2';
      // 基准断言（17.3.2）
      let g = S.getPlanData(pid).cur;
      let rt = S.CNT.rangeTotals(g, ['G03']);
      eq(rt.positions, 8, '基准职位 8'); eq(rt.employees, 23, '基准在职 23'); eq(rt.future, 8, '基准未来 8');
      eq(rt.headcounts, 35, '基准编制 35'); eq(rt.available, 4, '基准可用 4'); eq(rt.posts, 4, '基准兼职 4'); eq(rt.demandReserved, 2, '基准需求预留 2');
      const n1 = S.apply(pid, 'addOrg', { parentId: 'G03', name: '产品一部' });
      const n2 = S.apply(pid, 'addOrg', { parentId: 'G03', name: '产品二部' });
      const n3 = S.apply(pid, 'addOrg', { parentId: 'G03', name: 'AI 应用部' });
      ok(n1.ok && n2.ok && n3.ok, '新建三个目标组织');
      ok(S.apply(pid, 'movePositions', { positionIds: ['C2-P01'], targetOrgId: n1.id }).ok, '产品经理 → 产品一部（4 名在职跟随）');
      ok(S.apply(pid, 'movePositions', { positionIds: ['C2-P02'], targetOrgId: n2.id }).ok, '产品设计师 → 产品二部（王五 Offer 跟随）');
      ok(S.apply(pid, 'movePositions', { positionIds: ['C2-P05'], targetOrgId: n2.id }).ok, '产品运营 → 产品二部（3 人 + 需求 H09/H10 跟随）');
      ok(S.apply(pid, 'movePositions', { positionIds: ['C2-P03'], targetOrgId: n3.id }).ok, '项目经理 → AI 应用部');
      ok(!S.apply(pid, 'toggleOrg', { id:'G05',action:'停用' }).ok, '项目部仍有人及未来引用，前置阻断');
      ok(S.apply(pid, 'movePositions', { positionIds: ['C2-P04'], targetOrgId: n3.id }).ok, '项目专员 → AI 应用部（赵六/C2-H04 跟随）');
      ok(S.apply(pid, 'movePositions', { positionIds: ['C2-P06'], targetOrgId: n3.id }).ok, '测试工程师 → AI 应用部（周九/王六待入职跟随）');
      ok(S.apply(pid, 'toggleOrg', { id:'G05',action:'停用' }).ok, '对象迁出后可停用');
      eq(S.computePending(S.getPlan(pid)).length, 3, '停用冲突消除；保留一名待绑定及异常人编两个对象');
      g = S.getPlanData(pid).cur;
      // 17.3.4 关键口径
      eq(S.CNT.positionEmployees(g, 'C2-P01'), 9, '产品一部在职 9（复杂场景随职位迁移）');
      eq(S.CNT.available(g, 'C2-P01'), 1, '产品一部可用 1（C2-H05）');
      eq(S.CNT.positionPeople(g, 'C2-P02'), 2, '产品二部人员 2（王五未来 + 冯二在职）');
      eq(S.CNT.positionEmployees(g, 'C2-P02'), 1, '产品设计师在职 1（冯二）');
      eq(S.CNT.positionEmployees(g, 'C2-P05'), 3, '产品运营在职 3（钱七、孙八、郑二）');
      eq(S.CNT.demandReserved(g, 'C2-P05'), 2, '需求独立预留 2 跟随');
      eq(S.CNT.available(g, 'C2-P05'), 1, '产品运营可用 1（C2-H08）');
      eq(S.CNT.posts(g, 'C2-P05'), 1, '周九兼职 1（随职位归属到产品二部）');
      eq(S.CNT.positionEmployees(g, 'C2-P03'), 2, 'AI 应用部项目经理在职 2（陈七、林一）');
      eq(S.CNT.posts(g, 'C2-P03'), 1, '王强兼职 1（随职位归属到 AI 应用部）');
      eq(S.CNT.futureMatters(g, 'C2-P04'), 1, '赵六待调入 1');
      eq(S.CNT.positionEmployees(g, 'C2-P06'), 3, '测试工程师在职 3（周九、吴十、宋七）');
      eq(S.CNT.futureMatters(g, 'C2-P06'), 1, '王六待入职 1');
      eq(S.CNT.available(g, 'C2-P06'), 1, '测试工程师可用 1（C2-H12）');
      const rt2 = S.CNT.rangeTotals(g, ['G03', n1.id, n2.id, n3.id]);
      eq(rt2.employees, 23, '调整后在职 23'); eq(rt2.future, 8, '未来 8'); eq(rt2.posts, 4, '兼职 4');
      eq(rt2.headcounts, 35, '编制 35'); eq(rt2.available, 4, '可用 4'); eq(rt2.demandReserved, 2, '需求预留 2');
      eq(S.G.hc(g, 'C2-H02').state, 'Offer占用', 'C2-H02 不进独立空编');
      eq(S.CNT.independentVacant(g, 'C2-P02'), 0, '产品设计师独立空编 0');
      const zhao = S.G.person(g, 'C2-E04');
      eq(zhao.futureType, '待调入', '赵六仍待调入'); eq(zhao.date, '2027-01-05', '日期保持'); eq(zhao.targetPositionId, 'C2-P04', '目标跟随职位');
      const wangliu = S.G.person(g, 'C2-E05');
      eq(wangliu.futureType, '待入职', '王六仍待入职'); eq(wangliu.date, '2027-01-20', '日期保持'); eq(wangliu.targetPositionId, 'C2-P06', '目标跟随职位');
      eq(S.G.position(g, 'C2-P07').orgId, 'G06', '数据部职位未动');
      ok(!S.apply(pid, 'submit', {}).ok, '复杂样例异常仍阻断');
      ok(S.apply(pid,'applyAutoMatch',{positionId:'C2-P01'}).ok,'处理待绑定');
      ok(S.apply(pid,'releaseHeadcount',{personId:'C2-E24'}).ok,'解除异常编制');
      ok(S.apply(pid,'moveHeadcountsByIds',{headcountIds:['C2-H29'],targetPositionId:'C2-P01',level:'P4-2'}).ok,'修正职级');
      ok(S.apply(pid,'applyAutoMatch',{positionId:'C2-P01'}).ok,'重新绑定');
      ok(S.apply(pid, 'submit', {}).ok, '处理后提交成功');
    });

    /* ---- 案例一主线（17.2.3 → 17.2.4） ---- */
    t('案例一主线：三新组织、六职位迁移、两旧组织停用', () => {
      S.resetAll();
      const pid = 'plan-case1';
      const n1 = S.apply(pid, 'addOrg', { parentId: 'G03', name: '产品一部' });
      const n2 = S.apply(pid, 'addOrg', { parentId: 'G03', name: '产品二部' });
      const n3 = S.apply(pid, 'addOrg', { parentId: 'G03', name: 'AI 应用部' });
      ok(S.apply(pid, 'movePositions', { positionIds: ['C1-P01'], targetOrgId: n1.id }).ok, 'C1-P01 → 产品一部');
      ok(S.apply(pid, 'movePositions', { positionIds: ['C1-P02', 'C1-P05'], targetOrgId: n2.id }).ok, 'C1-P02/P05 → 产品二部（批量：6 人、8 编制跟随）');
      ok(S.apply(pid, 'movePositions', { positionIds: ['C1-P03', 'C1-P04', 'C1-P06'], targetOrgId: n3.id }).ok, 'C1-P03/P04/P06 → AI 应用部');
      ok(S.apply(pid, 'toggleOrg', { id: 'G04', action: '停用' }).ok, '停用产品部');
      ok(S.apply(pid, 'toggleOrg', { id: 'G05', action: '停用' }).ok, '停用项目部');
      const g = S.getPlanData(pid).cur;
      const rt = S.CNT.rangeTotals(g, ['G03', n1.id, n2.id, n3.id, 'G04', 'G05']);
      eq(rt.positions, 9, '职位仍 9'); eq(rt.employees, 24, '员工仍 24'); eq(rt.headcounts, 28, '编制仍 28'); eq(rt.available, 4, '可用空编仍 4');
      eq(S.G.hc(g, 'C1-H03').positionId, 'C1-P02', 'C1-H03 空编跟随产品运营');
      eq(S.G.hc(g, 'C1-H17').positionId, 'C1-P05', 'C1-H17 空编跟随产品设计师');
      eq(S.G.position(g, 'C1-P07').orgId, 'G06', '数据部职位未动');
      const d = S.diffPlan(S.getPlan(pid));
      eq(d.persons.length, 20, '人员差异 20（数据部 4 人未动无差异）');
      ok(d.persons.every(x => x.reason === '随职位整体迁移'), '人员差异原因均为随职位整体迁移');
      ok(!d.orgs.some(x => x.id === 'G06'), '数据部无组织差异（范围内未调整）');
      eq(S.computePending(S.getPlan(pid)).length, 0, '无待处理');
      ok(S.apply(pid, 'submit', {}).ok, '提交成功');
    });

    /* ---- ORG-07 / AT-82：预览无副作用，四种复制范围保持层级和人编守恒 ---- */
    [[false, false, false, 1, 0], [false, true, false, 1, 2], [true, false, false, 3, 0], [true, false, true, 3, 3], [true, true, true, 3, 3]].forEach(([copyDescendants, copySourcePositions, copyDescendantPositions, orgCount, positionCount]) => {
      t(`组织复制范围：下级=${copyDescendants}／本组织职位=${copySourcePositions}／下级职位=${copyDescendantPositions}`, () => {
        const pid = setupHuadong();
        const child = S.apply(pid, 'addOrg', { name: '子组织', parentId: 'O10', leaderId: 'M01', hrbpId: 'HR01' });
        const grandchild = S.apply(pid, 'addOrg', { name: '孙组织', parentId: child.id });
        ok(child.ok && grandchild.ok, '准备两级下属');
        ok(S.apply(pid, 'addPosition', { name: '子组织职位', orgId: child.id, levelMin: 'P3-1', levelMax: 'P5-4' }).ok, '准备子组织职位');
        const pd = S.getPlanData(pid), source = JSON.stringify(pd.cur);
        const before = JSON.stringify({ plan: S.getPlan(pid), pd });
        const copyMode = copyDescendants ? (copyDescendantPositions ? 'subtreePositions' : 'subtree') : (copySourcePositions ? 'orgPositions' : 'org');
        const payload = { id: 'O10', name: '复制结果', parentId: 'O30', leaderId: 'M02', hrbpId: 'HR01', hrbpOwnerId: 'D-DEFAULT', costCenterId: 'CC-DEFAULT', costCategory: '职能', virtualOrg: true, copyMode };
        const preview = S.previewCopyOrg(S.getPlan(pid), payload);
        eq(preview.orgCount, orgCount, '预览组织数'); eq(preview.positionCount, positionCount, '预览职位数');
        eq(preview.availableOrgCount, 3, '可选下级数量独立于勾选');
        eq(JSON.stringify({ plan: S.getPlan(pid), pd }), before, '预览不写入数据或时间');
        const r = S.apply(pid, 'copyOrg', payload);
        ok(r.ok, r.error); eq(r.orgCount, orgCount, '结果组织数'); eq(r.positionCount, positionCount, '结果职位数');
        const g = S.getPlanData(pid).cur, rootOrg = S.G.org(g, r.id), old = JSON.parse(source);
        eq(rootOrg.parentId, 'O30', '应用手动目标上级'); eq(rootOrg.leaderId, 'M02', '应用手动负责人'); eq(rootOrg.hrbpId, 'HR01', '应用手动 HRBP');
        r.orgIds.forEach(id => {
          const o = S.G.org(g, id);
          ok(!old.orgs.some(x => x.id === o.id || x.code === o.code), '组织身份和编码全新');
          eq(o.setupDate, '2026-12-01', '方案设立日期');
          ok(S.scopeInfo(S.getPlan(pid)).scope.includes(id), '副本纳入方案范围');
          if (id !== r.id) { eq(o.leaderId, 'M02', '下级继承复制父组织负责人'); eq(o.hrbpId, 'HR01', '下级继承复制父组织 HRBP'); eq(o.hrbpOwnerId, 'D-DEFAULT', '下级继承复制父组织 HRBP 负责人'); eq(o.costCenterId, 'CC-DEFAULT', '下级继承成本中心'); eq(o.costCategory, '职能', '下级继承成本分类'); eq(o.virtualOrg, true, '下级继承虚拟组织'); }
        });
        if (copyDescendants) {
          const copiedChild = r.orgIds.map(id => S.G.org(g, id)).find(o => o.name === '子组织');
          const copiedGrandchild = r.orgIds.map(id => S.G.org(g, id)).find(o => o.name === '孙组织');
          eq(copiedChild.parentId, r.id, '子组织挂新根'); eq(copiedGrandchild.parentId, copiedChild.id, '孙组织挂新子组织');
        }
        r.positionIds.forEach(id => {
          const p = S.G.position(g, id);
          ok(r.orgIds.includes(p.orgId), '职位挂副本组织');
          ok(!old.positions.some(x => x.id === p.id || x.code === p.code), '职位身份编码全新');
          eq(p.setupDate, '2026-12-01', '职位方案设立日期');
          eq(S.CNT.positionPeople(g, id), 0, '副本职位无人员'); eq(S.CNT.totalHeadcounts(g, id), 0, '副本职位无编制');
        });
        ['persons', 'headcounts', 'demands', 'posts'].forEach(key => eq(JSON.stringify(g[key]), JSON.stringify(old[key]), key + '不复制不改动'));
        old.orgs.forEach(o => eq(JSON.stringify(S.G.org(g, o.id)), JSON.stringify(o), '源组织保持原样'));
        eq(S.computePending(S.getPlan(pid)).filter(x => x.id === r.id).length, 0, '复制顶层必填字段完整');
      });
    });

    t('组织复制：跳过停用分支／职位，停用来源不可复制', () => {
      const pid = setupHuadong();
      const child = S.apply(pid, 'addOrg', { name: '停用分支', parentId: 'O10' });
      ok(S.apply(pid, 'addOrg', { name: '停用分支内有效孙级', parentId: child.id }).ok, '准备孙级');
      ok(S.apply(pid, 'toggleOrg', { id: child.id, action: '停用' }).ok, '停用分支');
      ok(S.apply(pid,'movePositions',{ positionIds:['P11'],targetOrgId:'O30' }).ok,'迁走带引用职位');
      const empty = S.apply(pid,'addPosition',{ orgId:'O10',name:'停用职位',levelMin:'P3-1',levelMax:'P5-4' });
      ok(S.apply(pid,'togglePosition',{ id:empty.id,action:'停用' }).ok,'停用空职位');
      const r = S.apply(pid, 'copyOrg', { id: 'O10', parentId: 'O30', copyDescendants: true, copySourcePositions: true, copyDescendantPositions: true });
      ok(r.ok, r.error); eq(r.orgCount, 1, '停用分支整支跳过'); eq(r.positionCount, 1, '停用职位跳过');
      const source = S.apply(pid,'addOrg',{ parentId:'O30',name:'待停用来源' });
      ok(S.apply(pid, 'toggleOrg', { id: source.id, action: '停用' }).ok, '停用来源');
      const stopped = S.apply(pid, 'copyOrg', { id: source.id, parentId: 'O30' });
      ok(!stopped.ok && /仅有效组织可复制/.test(stopped.error), '停用来源不可复制');
    });

    t('组织复制：必填缺失保留草稿，刷新／补齐与提交阻断', () => {
      const pid = setupHuadong(true);
      S.G.org(S.getPlanData(pid).cur, 'O21').name = ''; // 模拟源数据缺失，不添加产品侧故障入口
      const r = S.apply(pid, 'copyOrg', { id: 'O20', name: '研发副本', parentId: 'O30', copyDescendants: true });
      ok(r.ok, r.error);
      ok(S.apply(pid, 'editOrg', { id: 'O21', name: '业务支持部' }).ok, '恢复源数据');
      const copiedChildId = r.orgIds[1];
      S.load();
      let pending = S.computePending(S.getPlan(pid));
      ok(pending.some(x => x.id === copiedChildId && x.kind === 'org-required' && x.fields.includes('组织名称')), '刷新后具体副本仍显示缺失名称');
      ok(!S.apply(pid, 'submit', {}).ok, '未补齐不可提交');
      ok(S.apply(pid, 'editOrg', { id: copiedChildId, name: '新业务支持部' }).ok, '补齐名称');
      pending = S.computePending(S.getPlan(pid));
      eq(pending.length, 0, '补齐自动消除，可选角色和合法根级不误报');
      ok(S.apply(pid, 'submit', {}).ok, '补齐后可提交');
    });

    t('组织复制：非法上级拒绝，整批中途失败恢复对象／编码序号／范围', () => {
      const pid = setupHuadong();
      const before = JSON.stringify({ plan: S.getPlan(pid), pd: S.getPlanData(pid) });
      ok(!S.apply(pid, 'copyOrg', { id: 'O10', parentId: '不存在' }).ok, '非法上级拒绝');
      eq(JSON.stringify({ plan: S.getPlan(pid), pd: S.getPlanData(pid) }), before, '非法上级不留变化');
      const original = S._internals.OPS.copyOrg;
      try {
        S._internals.OPS.copyOrg = args => { original(args); throw new Error('复制中途失败（自测）'); };
        ok(!S.apply(pid, 'copyOrg', { id: 'O20', parentId: 'O30', copyDescendants: true, copySourcePositions: true, copyDescendantPositions: true }).ok, '整批失败');
      } finally { S._internals.OPS.copyOrg = original; }
      eq(JSON.stringify({ plan: S.getPlan(pid), pd: S.getPlanData(pid) }), before, '对象、范围、编码序号全部回滚');
      const r = S.apply(pid, 'copyOrg', { id: 'O10', parentId: 'O30' });
      ok(r.ok, r.error); eq(r.id, 'NO1', '失败不消耗新组织编码序号');
    });

    /* ---- UNDO/REDO：一步恢复联动、刷新保留、50 步上限、提交边界 ---- */
    t('Undo/Redo：停用组织及下属整体一进一退', () => {
      const pid = setupHuadong();
      ok(S.apply(pid,'movePositions',{ positionIds:['P10','P11'],targetOrgId:'O30' }).ok,'先处理组织下对象');
      const initialSteps = S.historyState(pid).undoCount;
      const child = S.apply(pid, 'addOrg', { parentId: 'O10', name: '产品子部' });
      ok(child.ok, '准备下属组织');
      const r = S.apply(pid, 'stopOrg', { orgId: 'O10', mode: 'manual', stopDescendantOrgs: true, stopSubtreePositions: true });
      ok(r.ok, r.error || '');
      eq(S.historyState(pid).undoCount, initialSteps + 2, '新增子组织和停用各一步');
      const u = S.undo(pid);
      ok(u.ok, u.error || '');
      eq(S.G.org(S.getPlanData(pid).cur, 'O10').status, '有效', '当前组织恢复');
      eq(S.G.org(S.getPlanData(pid).cur, child.id).status, '有效', '下级组织恢复');
      eq(S.G.position(S.getPlanData(pid).cur, 'P10').orgId, 'O30', '撤销停用不撤销之前迁移');
      eq(S.historyState(pid).redoCount, 1, '停用作为一个重做动作');
      ok(S.redo(pid).ok, '重做停用');
      eq(S.G.org(S.getPlanData(pid).cur, 'O10').status, '停用', '重做恢复整批结果');
    });

    t('Undo/Redo：刷新保留历史，新的动作清空重做分支', () => {
      const pid = setupHuadong();
      const initialSteps = S.historyState(pid).undoCount;
      ok(S.apply(pid, 'editOrg', { id: 'O10', name: '产品中心' }).ok, '编辑组织');
      S.load();
      eq(S.historyState(pid).undoCount, initialSteps + 1, '刷新后保留历史');
      ok(S.undo(pid).ok, '刷新后撤销');
      eq(S.G.org(S.getPlanData(pid).cur, 'O10').name, '产品部', '撤销恢复原名');
      ok(S.apply(pid, 'editOrg', { id: 'O10', name: '产品中心二' }).ok, '撤销后新动作');
      eq(S.historyState(pid).redoCount, 0, '新动作清空重做分支');
      eq(S.G.org(S.getPlanData(pid).cur, 'O10').name, '产品中心二', '新动作保留');
    });

    t('Undo/Redo：最多保留最近 50 步，不倒退编号高水位', () => {
      const pid = setupHuadong();
      for (let i = 1; i <= 55; i++) ok(S.apply(pid, 'editOrg', { id: 'O10', name: '产品部' + i }).ok, '第 ' + i + ' 次编辑');
      eq(S.historyState(pid).undoCount, 50, '历史上限 50');
      for (let i = 0; i < 50; i++) ok(S.undo(pid).ok, '撤销第 ' + (i + 1) + ' 步');
      eq(S.G.org(S.getPlanData(pid).cur, 'O10').name, '产品部5', '最早 5 步已退出窗口');
      const add = S.apply(pid, 'addOrg', { parentId: 'O10', name: '新组织' });
      ok(add.ok, add.error || ''); eq(add.id, 'NO1', '新建组织编号从未被撤销历史倒退');
      const code = S.G.org(S.getPlanData(pid).cur, add.id).code;
      ok(S.undo(pid).ok, '撤销新建'); ok(S.redo(pid).ok, '重做新建');
      eq(S.G.org(S.getPlanData(pid).cur, add.id).code, code, '重做恢复原 ID 和编码');
      ok(S.undo(pid).ok, '再次撤销新建');
      const next = S.apply(pid, 'addOrg', { parentId: 'O10', name: '另一个新组织' });
      ok(next.ok, next.error); eq(next.id, 'NO2', '新分支不复用已消耗身份');
      ok(S.G.org(S.getPlanData(pid).cur, next.id).code !== code, '新分支不复用编码');
    });

    t('Undo/Redo：提交成功结束本轮历史，审批版本不受撤销影响', () => {
      const pid = setupHuadong(true);
      ok(S.apply(pid, 'editOrg', { id: 'O10', name: '产品中心' }).ok, '编辑组织');
      ok(S.historyState(pid).canUndo, '提交前可撤销');
      ok(S.apply(pid, 'submit', {}).ok, '提交成功');
      eq(S.historyState(pid).undoCount, 0, '提交后历史清空');
      ok(!S.undo(pid).ok, '审批中不可撤销');
      eq(S.getPlanData(pid).versions.length, 1, '审批版本保留');
      eq(S.getPlanData(pid).versions[0].snapshot.orgs.find(o => o.id === 'O10').name, '产品中心', '快照不受撤销影响');
    });

    /* ---- 无差异不可提交、纯排序可提交（12.3） ---- */
    t('无差异不可提交、纯排序可提交（12.3）', () => {
      const pid = setupHuadong();
      // 此用例隔离排序提交；待绑定阻断由专项用例验证。
      S.G.person(S.getPlanData(pid).cur, 'E02').headcountRequired = false;
      S.G.person(S.getPlanData(pid).base, 'E02').headcountRequired = false;
      ok(!S.hasChange(S.getPlan(pid)), '初始无变化');
      const s0 = S.apply(pid, 'submit', {});
      ok(!s0.ok && /暂无调整内容/.test(s0.error), '无差异提交被拒：' + (s0.error || ''));
      ok(S.apply(pid, 'reorderOrgs', { parentId: 'O00', orderedIds: ['O30', 'O10', 'O20', 'O40'] }).ok, '同级排序');
      ok(S.hasChange(S.getPlan(pid)), '纯排序后有结构变化');
      ok(S.apply(pid, 'submit', {}).ok, '纯排序可提交');
    });

    t('工作台排序字段与变更标签：组织/职位排序可落库且不显示变更', () => {
      const pid = setupHuadong();
      ok(S.apply(pid, 'editPosition', { id: 'P10', sequenceNo: 2 }).ok, '职位顺序号允许重复保存');
      const orgBefore = S.G.childrenOrgs(S.getPlanData(pid).cur, 'O00').map(o => o.id);
      ok(S.apply(pid, 'reorderOrgs', { parentId: 'O00', orderedIds: [orgBefore[2], orgBefore[0], orgBefore[1], orgBefore[3]] }).ok, '组织排序');
      const pBefore = S.G.positionsOfOrg(S.getPlanData(pid).cur, 'O10', false).map(p => p.id);
      ok(S.apply(pid, 'reorderPositions', { orgId: 'O10', orderedIds: [pBefore[1], pBefore[0]] }).ok, '职位排序');
      const g = S.getPlanData(pid).cur;
      eq(S.G.childrenOrgs(g, 'O00').map(o => o.id).join(','), [orgBefore[2], orgBefore[0], orgBefore[1], orgBefore[3]].join(','), '组织视图顺序');
      eq(S.G.positionsOfOrg(g, 'O10', false).map(p => p.id).join(','), [pBefore[1], pBefore[0]].join(','), '职位视图顺序');
      eq(S.G.childrenOrgs(g, 'O00').map(o => o.sortCode).join(','), '1,2,3,4', '组织排序码连续');
      eq(S.G.positionsOfOrg(g, 'O10', false).map(p => p.sequenceNo).join(','), '1,2', '职位顺序号连续');
      ok(!S.orgChangeTags(S.getPlan(pid), orgBefore[0]).length, '纯组织排序不显示变更胶囊');
      ok(!S.positionChangeTags(S.getPlan(pid), pBefore[0]).length, '纯职位排序不显示变更胶囊');
      eq(S.G.org(g, 'O10').sortCode, [orgBefore[2], orgBefore[0], orgBefore[1], orgBefore[3]].indexOf('O10') + 1, '组织排序码不由表单修改');
    });

    t('组织完整字段：必填、范围内上级和复制默认值', () => {
      const pid = setupHuadong();
      const parent = S.apply(pid, 'addOrg', {
        parentId: 'O10', name: '完整字段部门', virtualOrg: true, leaderId: null,
        hrbpId: 'HR01', hrbpOwnerId: 'D-DEFAULT', costCenterId: 'CC-DEFAULT', costCategory: '交付'
      });
      ok(parent.ok, parent.error);
      const g = S.getPlanData(pid).cur, o = S.G.org(g, parent.id);
      eq(o.hrbpId, 'HR01', '保存 HRBP'); eq(o.hrbpOwnerId, 'D-DEFAULT', '保存 HRBP 负责人');
      eq(o.costCategory, '交付', '保存成本分类'); eq(o.virtualOrg, true, '保存虚拟组织'); eq(o.effectiveDate, '2026-12-01', '变动生效日期为方案日');
      eq(S.computePending(S.getPlan(pid)).filter(x => x.id === parent.id).length, 0, '完整字段无待处理');
      ok(!S.apply(pid, 'addOrg', { parentId: null, name: '非法根组织' }).ok, '不允许新增根组织');
      ok(!S.apply(pid, 'addOrg', { parentId: 'G07', name: '范围外下级' }).ok, '不允许选择范围外上级');
      const copy = S.apply(pid, 'copyOrg', { id: 'O10', parentId: 'O30', copyDescendants: true });
      ok(copy.ok, copy.error);
      const copied = S.G.org(S.getPlanData(pid).cur, copy.id);
      eq(copied.leaderId, null, '复制顶层负责人默认空'); eq(copied.hrbpId, 'HR01', '复制顶层 HRBP 沿用源值');
      eq(copied.hrbpOwnerId, 'D-DEFAULT', '复制顶层 HRBP 负责人沿用源值'); eq(copied.virtualOrg, false, '复制顶层虚拟组织沿用源值');
    });

    t('职位完整字段：默认值、复制继承和组织复制同步', () => {
      const pid = setupHuadong();
      const add = S.apply(pid, 'addPosition', { orgId: 'O10', name: '默认职位', levelMin: 'P3-1', levelMax: 'P5-4', jobSequence: '默认', jobFamily: '默认', jobClass: '默认', costCategory: '默认', collarColor: '蓝领' });
      ok(add.ok, add.error); const g = S.getPlanData(pid).cur; const source = S.G.position(g, add.id);
      eq(source.sequenceNo, 3, '新增职位顺序号自动追加'); eq(source.effectiveDate, '2026-12-01', '新增职位生效日期为方案日'); eq(source.collarColor, '蓝领', '保存领色'); eq(source.syncIncumbency, true, '默认同步任职');
      const copy = S.apply(pid, 'copyPosition', { id: add.id, orgId: 'O30', name: '复制默认职位' });
      ok(copy.ok, copy.error); const copied = S.G.position(S.getPlanData(pid).cur, copy.id);
      eq(copied.orgId, 'O30', '复制职位可指定有效组织'); eq(copied.jobSequence, '默认', '复制职序'); eq(copied.jobFamily, '默认', '复制职族'); eq(copied.jobClass, '默认', '复制职类'); eq(copied.costCategory, '默认', '复制成本分类'); eq(copied.collarColor, '蓝领', '复制领色');
      const orgCopy = S.apply(pid, 'copyOrg', { id: 'O10', parentId: 'O30', copyMode: 'subtreePositions' });
      ok(orgCopy.ok, orgCopy.error); const copiedPos = orgCopy.positionIds.map(id => S.G.position(S.getPlanData(pid).cur, id)).find(p => p.name === '默认职位');
      ok(copiedPos, '组织复制包含职位'); eq(copiedPos.jobFamily, '默认', '随组织复制继承职族'); eq(copiedPos.collarColor, '蓝领', '随组织复制继承领色'); eq(copiedPos.syncIncumbency, true, '随组织复制默认同步任职');
    });

    t('编制表单字段：增编默认值、派生属性和可用空编变更', () => {
      const pid = setupHuadong();
      const add = S.apply(pid, 'addHeadcounts', { positionId: 'P10', level: 'P4-2', count: 2, category: 'B', overseas: true, costCenterId: 'CC-DEFAULT', workLocation: '默认', officeLocation: '默认', expectedArrivalDate: '2026-12-01', remark: '演示备注' });
      ok(add.ok, add.error); const g = S.getPlanData(pid).cur; const h = S.G.hc(g, add.ids[0]);
      eq(h.category, 'B', '保存 ABC 分类'); eq(h.overseas, true, '保存海外标记'); eq(h.collarColor, '白领', '领色由职位带出'); eq(h.costCategory, '默认', '成本分类由职位带出'); eq(h.remark, '演示备注', '保存备注');
      ok(S.apply(pid, 'moveHeadcountsByIds', { headcountIds: [add.ids[0]], targetPositionId: 'P20', category: 'A', overseas: false, costCenterId: 'CC-DEFAULT', workLocation: '默认', officeLocation: '默认', expectedArrivalDate: '2026-12-01', remark: '' }).ok, '变更可用空编');
      eq(S.G.hc(g, add.ids[0]).positionId, 'P20', '空编变更职位'); eq(S.G.hc(g, add.ids[0]).category, 'A', '空编变更 ABC 分类');
      ok(!S.apply(pid, 'moveHeadcountsByIds', { headcountIds: ['H01'], targetPositionId: 'P20', category: 'C', costCenterId: 'CC-DEFAULT', workLocation: '默认', officeLocation: '默认', expectedArrivalDate: '2026-12-01' }).ok, '占编不可通过空编变更');
    });

    /* ---- 暂存失败注入（UI-02、AT-61） ---- */
    t('暂存失败注入：内存生效、标记未持久化、提交被拦', () => {
      const pid = setupHuadong(true);
      S.setDemoFlag('persistFail', true);
      const r = S.apply(pid, 'editOrg', { id: 'O10', name: '产品中心' });
      ok(r.ok && r.persisted === false && r.persistError === '暂存失败', '操作生效但暂存失败可见');
      eq(S.getPlanData(pid).cur.orgs.find(o => o.id === 'O10').name, '产品中心', '内存保留最新确认结果');
      ok(!S.getPlanData(pid).lastPersistOk, 'lastPersistOk=false');
      const s = S.apply(pid, 'submit', {});
      ok(!s.ok && /暂存/.test(s.error), '存在未暂存变更时禁止提交');
      S.setDemoFlag('persistFail', false);
      ok(S.apply(pid, 'editOrg', { id: 'O10', name: '产品中心' }).ok, '重试暂存成功');
      ok(S.getPlanData(pid).lastPersistOk, '恢复可提交');
    });


    t('完整编制：案例二产品经理互斥分解、任职状态与未来事件', () => {
      S.resetAll(); const plan=S.getPlan('plan-case2'),g=S.getPlanData(plan.id).cur;
      const b=S.headcountBreakdown(g,S.G.hcsOf(g,'C2-P01'));
      eq([b.total,b.main,b.longTerm,b.shortTerm,b.floating,b.reserved,b.available].join(','),'13,5,1,1,1,4,1','完整分解');
      eq(b.total,b.main+b.longTerm+b.shortTerm+b.floating+b.reserved+b.available,'互斥守恒');
      eq(b.recruitment,2,'同一招聘需求占两个名额');eq(b.directHire,1,'直接入职预留');eq(b.transfer,1,'批准调入预留');
      const state=id=>S.assignmentHeadcountState(g,S.G.person(g,id),'main',plan.effDate);
      eq(state('C2-E01').status,'已占编','普通主职');eq(state('C2-E27').status,'不占编','不应占编');eq(state('C2-E28').status,'待绑定','应占未绑定');eq(state('C2-E24').status,'异常','职级异常');eq(state('C2-E25').marker,'浮动编制','共占标记');
      const groups=S.workbenchGroups(plan,'G04',false),p=groups.people.find(x=>x.position.id==='C2-P01');
      eq(p.people.length,9,'当前主职');eq(p.posts.length,2,'当前兼职');eq(p.events.length,9,'职位内事件');
      eq(p.events.find(e=>e.personId==='C2-F11').stage,'待入职','有 Offer 只显示最新阶段');
      const pending=p.events.find(e=>e.personId==='C2-F14');eq(pending.headcountId,null,'审批中不锁编');eq(pending.approvalStatus,'审批中','审批中仍显示');
      eq(p.events.filter(e=>e.stage==='待调出').length,2,'批准和审批中调出');eq(p.events.filter(e=>e.stage==='待离职').length,2,'批准和审批中离职');
      const target=S.workbenchGroups(plan,'G05',false).people.find(x=>x.position.id==='C2-P03');
      eq(target.events.find(e=>e.id==='C2-EV01').stage,'待调入','范围内调动目标归属');
      eq(S.futureEventsForGraph(g,plan.effDate).filter(e=>e.id==='C2-EV01').length,1,'同一调动事件去重');
      S._internals.assertGraph(g);
    });
    t('占用不变量：普通不能共占，浮动仅主职，兼职双向一致', () => {
      const invalid=mutate=>{S.resetAll();const g=S.getPlanData('plan-case2').cur;mutate(g);let failed=false;try{S._internals.assertGraph(g);}catch(e){failed=true;}ok(failed,'非法绑定应被拒绝');};
      invalid(g=>{S.G.person(g,'C2-E28').headcountId='C2-H01';});
      invalid(g=>{S.G.hc(g,'C2-H32').postId='C2-PT03';});
      invalid(g=>{S.G.post(g,'C2-PT03').headcountId='C2-H31';});
      invalid(g=>{S.G.hc(g,'C2-H30').personId='C2-E12';});
    });
    t('浮动解除：逐人解除保持其余占用，最后一人释放，刷新和撤销重做', () => {
      S.resetAll();const pid='plan-case2';
      ok(S.apply(pid,'releaseHeadcount',{personId:'C2-E25'}).ok,'解除第一人');
      let g=S.getPlanData(pid).cur;eq(S.G.hc(g,'C2-H32').state,'占编','仍占编');eq(S.G.hc(g,'C2-H32').personId,'C2-E26','兼容索引跟随剩余人');eq(S.G.person(g,'C2-E26').headcountId,'C2-H32','另一人未释放');
      S.load();ok(S.apply(pid,'releaseHeadcount',{personId:'C2-E26'}).ok,'解除最后一人');eq(S.G.hc(S.getPlanData(pid).cur,'C2-H32').state,'可用','最后一人后可用');
      ok(S.undo(pid).ok,'撤销最后解除');eq(S.G.hc(S.getPlanData(pid).cur,'C2-H32').state,'占编','撤销恢复');ok(S.redo(pid).ok,'重做解除');eq(S.G.hc(S.getPlanData(pid).cur,'C2-H32').state,'可用','重做释放');
    });
    t('浮动调岗：无论带编策略均只释放本人，全员不携带原编', () => {
      S.resetAll();const pid='plan-case2',row=id=>({personId:id,targetPositionId:'C2-P03',managerId:'M03',bringHeadcount:true});
      ok(S.apply(pid,'transferPersons',{rows:[row('C2-E25')]}).ok,'单人允许');
      let g=S.getPlanData(pid).cur;eq(S.G.hc(g,'C2-H32').positionId,'C2-P01','原浮动留原职');eq(S.G.person(g,'C2-E26').headcountId,'C2-H32','其他人保持');
      S.resetAll();ok(S.apply(pid,'transferPersons',{rows:[row('C2-E25'),row('C2-E26')]}).ok,'全部同目标允许');g=S.getPlanData(pid).cur;
      eq(S.G.hc(g,'C2-H32').positionId,'C2-P01','原浮动不迁移');eq(S.G.hc(g,'C2-H32').state,'可用','全员离开后空出');
      ok(S.G.person(g,'C2-E25').headcountId!=='C2-H32','第一人不携原编');ok(S.G.person(g,'C2-E26').headcountId!=='C2-H32','第二人不携原编');
    });
    t('匹配与兼职：排除不占编任职，按任职绑定，取消兼职仅释放本编', () => {
      S.resetAll();const pid='plan-case2';let g=S.getPlanData(pid).cur;
      const pv=S.apply(pid,'matchPreview',{positionId:'C2-P01'});eq(pv.pairs.length,1,'只有一名待绑定');eq(pv.pairs[0].personId,'C2-E28','排除不占编');ok(S.apply(pid,'applyAutoMatch',{positionId:'C2-P01',expectedPairs:pv.pairs}).ok,'应用匹配');eq(S.G.person(g,'C2-E27').headcountId,null,'不占编不被绑定');
      const mainHc=S.G.person(g,'C2-E11').headcountId;
      ok(S.apply(pid,'cancelPost',{postId:'C2-PT03'}).ok,'取消长期兼职');eq(S.G.hc(g,'C2-H30').state,'可用','仅兼职编制释放');eq(S.G.person(g,'C2-E11').headcountId,mainHc,'主职不变');
      const t=S.G.post(g,'C2-PT04'),h=S.G.hc(g,'C2-H31');t.headcountId=null;h.state='可用';h.personId=null;delete h.postId;
      const postPreview=S.apply(pid,'matchPreview',{positionId:'C2-P01'});eq(postPreview.pairs[0].postId,t.id,'按兼职配对');ok(S.apply(pid,'applyAutoMatch',{positionId:'C2-P01',expectedPairs:postPreview.pairs}).ok,'兼职匹配');eq(S.G.hc(g,t.headcountId).postId,t.id,'兼职双向绑定');S._internals.assertGraph(g);
    });
    t('提交边界：待绑定与异常必须修复，正常未来事件不阻断', () => {
      S.resetAll();const pid='plan-case2';
      ok(S.apply(pid,'editOrg',{id:'G04',name:'产品业务部'}).ok,'产生变更');ok(!S.apply(pid,'submit',{}).ok,'原始复杂样例阻止提交');
      ok(S.apply(pid,'applyAutoMatch',{positionId:'C2-P01'}).ok,'处理待绑定');ok(!S.apply(pid,'submit',{}).ok,'异常仍阻止');
      ok(S.apply(pid,'releaseHeadcount',{personId:'C2-E24'}).ok,'先解除异常绑定');ok(S.apply(pid,'moveHeadcountsByIds',{headcountIds:['C2-H29'],targetPositionId:'C2-P01',level:'P4-2'}).ok,'修正可用编制职级');ok(S.apply(pid,'applyAutoMatch',{positionId:'C2-P01'}).ok,'重新绑定');
      eq(S.computePending(S.getPlan(pid)).length,0,'全部修复');ok(S.apply(pid,'submit',{}).ok,'未来安排不阻断');
      const snap=S.getPlanData(pid).versions[0].snapshot;eq(snap.futureEvents.length,4,'快照保留事件');eq(S.G.hc(snap,'C2-H32').floatingUntil,'2027-02-28','保留浮动期限');
    });
    t('业务异常：不应占编却绑定、浮动过期均阻断，预留名额不可当空编操作', () => {
      S.resetAll();const pid='plan-case2',p=S.getPlan(pid),g=S.getPlanData(pid).cur;
      S.G.person(g,'C2-E01').headcountRequired=false;eq(S.assignmentHeadcountState(g,S.G.person(g,'C2-E01'),'main',p.effDate).status,'异常','不应占而绑定');
      S.G.hc(g,'C2-H32').floatingUntil='2026-11-01';eq(S.assignmentHeadcountState(g,S.G.person(g,'C2-E25'),'main',p.effDate).status,'异常','浮动过期');
      ['removeHeadcountsByIds','moveHeadcountsByIds'].forEach(type=>{const before=JSON.stringify(S.getPlanData(pid));ok(!S.apply(pid,type,{headcountIds:['C2-H33'],targetPositionId:'C2-P03'}).ok,'预留只读');eq(JSON.stringify(S.getPlanData(pid)),before,'边界原子性');});
    });


    t('未来引用：仅有审批中调入事件的目标职位不可停用', () => {
      S.resetAll();const pid='plan-case2',g=S.getPlanData(pid).cur;
      const r=S.apply(pid,'addPosition',{orgId:'G04',name:'调入准备职位',levelMin:'P3-1',levelMax:'P5-4'});ok(r.ok,'新增目标');
      g.futureEvents.push({id:'TEST-EVENT',personId:'C2-E01',type:'调动',date:'2027-04-01',approvalStatus:'审批中',fromPositionId:'C2-P01',toPositionId:r.id});
      const before=JSON.stringify(S.getPlanData(pid));ok(!S.apply(pid,'togglePosition',{id:r.id,action:'停用'}).ok,'未来引用阻断');eq(JSON.stringify(S.getPlanData(pid)),before,'失败无写入');
      eq(S.workbenchGroups(S.getPlan(pid),'G04',false).people.find(x=>x.position.id===r.id).events.length,1,'只含事件仍保留职位');
    });
    return results;
  }

  root.OA = root.OA || {};
  root.OA.selftest = { runAll };
})(typeof window !== 'undefined' ? window : globalThis);
