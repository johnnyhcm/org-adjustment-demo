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
    const t = (name, fn) => { try { fn(); results.push({ name, pass: true }); } catch (e) { results.push({ name, pass: false, error: e.message }); } };
    const eq = (actual, expected, label) => { if (actual !== expected) throw new Error(`${label}: 期望 ${expected}，实际 ${actual}`); };
    const ok = (cond, label) => { if (!cond) throw new Error(label || '断言失败'); };

    const setupHuadong = () => {
      S.resetAll();
      const r = S.apply(null, 'createPlan', { name: '华东组织调整方案', effDate: '2026-12-01', scopeOrgIds: ['O10', 'O20'], desc: '', universe: 'huadong' });
      if (!r.ok) throw new Error('创建华东方案失败: ' + r.error);
      S.apply(r.planId, 'extendScope', { orgIds: ['O30'] });
      return r.planId;
    };
    const cnt = (pid, posId) => {
      const g = S.getPlanData(pid).cur, C = S.CNT;
      return { emp: C.positionEmployees(g, posId), ppl: C.positionPeople(g, posId), total: C.totalHeadcounts(g, posId), avail: C.available(g, posId), dem: C.demandReserved(g, posId), ind: C.independentVacant(g, posId), fut: C.futureMatters(g, posId), post: C.posts(g, posId) };
    };
    const rangeTotal = (pid, orgIds) => S.CNT.rangeTotals(S.getPlanData(pid).cur, orgIds);
    const move = (pid, personId, targetPositionId, managerId, bringHeadcount, syncSubs) =>
      S.apply(pid, 'transferPersons', { rows: [{ personId, targetPositionId, managerId, bringHeadcount: !!bringHeadcount }], syncSubs: syncSubs !== false });

    /* ---- BASE 初始数量（13.1/13.3） ---- */
    t('BASE：P10/P20 初始数量与范围合计', () => {
      const pid = setupHuadong();
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
    t('NUM-01：带编调岗（含下属同步默认开）', () => {
      const pid = setupHuadong();
      const r = move(pid, 'E01', 'P20', 'M02', true, true);
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
    t('NUM-01b：带编调岗（取消下属同步）', () => {
      const pid = setupHuadong();
      const r = move(pid, 'E01', 'P20', 'M02', true, false);
      ok(r.ok, r.error || '');
      eq(S.G.person(S.getPlanData(pid).cur, 'E04').managerId, 'E01', '取消同步：陈七经理仍张三');
    });

    /* ---- NUM-02：张三不带编调到 P20 ---- */
    t('NUM-02：不带编调岗', () => {
      const pid = setupHuadong();
      const r = move(pid, 'E01', 'P20', 'M02', false, false);
      ok(r.ok, r.error || '');
      const p10 = cnt(pid, 'P10'), p20 = cnt(pid, 'P20');
      eq(p10.emp, 1, 'P10 员工'); eq(p10.ppl, 4, 'P10 人员'); eq(p10.total, 6, 'P10 总编制'); eq(p10.avail, 2, 'P10 可用'); eq(p10.ind, 4, 'P10 独立');
      eq(p20.emp, 2, 'P20 员工'); eq(p20.total, 2, 'P20 总编制'); eq(p20.avail, 1, 'P20 可用');
      const g = S.getPlanData(pid).cur, h01 = S.G.hc(g, 'H01');
      eq(h01.positionId, 'P10', 'H01 留 P10'); eq(h01.state, '可用', 'H01 变可用'); ok(!S.G.person(g, 'E01').headcountId, '张三不占编');
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
      const r = S.apply(pid, 'addHeadcounts', { positionId: 'P10', level: 'P4', count: 2 });
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
      ok(!S.apply(pid, 'addHeadcounts', { positionId: 'P10', level: 'P4', count: 0 }).ok, '0 拒绝');
      ok(!S.apply(pid, 'addHeadcounts', { positionId: 'P10', level: 'P4', count: -1 }).ok, '负数拒绝');
      ok(!S.apply(pid, 'addHeadcounts', { positionId: 'P10', level: 'P4', count: 1.5 }).ok, '小数拒绝');
    });

    /* ---- NUM-06：P10 减编 1 个 P4 ---- */
    t('NUM-06：减编 1（只动可用，预留不动）', () => {
      const pid = setupHuadong();
      const r = S.apply(pid, 'removeHeadcounts', { positionId: 'P10', level: 'P4', count: 1 });
      ok(r.ok, r.error || '');
      eq(JSON.stringify(r.removed), JSON.stringify(['H03']), '仅 H03 减编');
      const p10 = cnt(pid, 'P10');
      eq(p10.total, 5, '总编制 5'); eq(p10.avail, 0, '可用 0'); eq(p10.ind, 2, '独立 2');
      const g = S.getPlanData(pid).cur;
      eq(S.G.hc(g, 'H04').state, '需求预留', 'H04 不动'); eq(S.G.hc(g, 'H05').state, '需求预留', 'H05 不动');
    });
    t('NUM-06b：减编超量拒绝（可用 1 减 2）', () => {
      const pid = setupHuadong();
      const r = S.apply(pid, 'removeHeadcounts', { positionId: 'P10', level: 'P4', count: 2 });
      ok(!r.ok, '超过可用数量应拒绝'); ok(/仅 .* 个/.test(r.error), '提示可用数量');
    });

    /* ---- NUM-07：H03 移到 P20 ---- */
    t('NUM-07：空编移动（身份与职级不变）', () => {
      const pid = setupHuadong();
      const r = S.apply(pid, 'moveHeadcounts', { fromPositionId: 'P10', toPositionId: 'P20', level: 'P4', count: 1 });
      ok(r.ok, 'P4 在 P20 范围内应可移动: ' + (r.error || ''));
      const p10 = cnt(pid, 'P10'), p20 = cnt(pid, 'P20');
      eq(p10.total, 5, 'P10 总编制 5'); eq(p10.avail, 0, 'P10 可用 0'); eq(p10.ind, 2, 'P10 独立 2');
      eq(p20.total, 3, 'P20 总编制 3'); eq(p20.avail, 2, 'P20 可用 2'); eq(p20.ind, 2, 'P20 独立 2');
      const rt = rangeTotal(pid, ['O10', 'O20', 'O30']);
      eq(rt.headcounts, 9, '全范围总编制仍 9');
      const h03 = S.G.hc(S.getPlanData(pid).cur, 'H03');
      eq(h03.positionId, 'P20', 'H03 归属 P20'); eq(h03.level, 'P4', '职级不变');
    });
    t('NUM-07b：空编移到职级不匹配职位拒绝', () => {
      const pid = setupHuadong();
      const r = S.apply(pid, 'moveHeadcounts', { fromPositionId: 'P10', toPositionId: 'P21', level: 'P4', count: 1 });
      ok(!r.ok, 'P21 为 P1—P3，P4 应拒绝'); ok(S.G.hc(S.getPlanData(pid).cur, 'H03').positionId === 'P10', '原编制不变化');
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
      const r = move(pid, 'E01', 'P20', 'M02', true, true);
      ok(r.ok, r.error || '');
      g = S.getPlanData(pid).cur;
      const pt02 = g.posts.find(x => x.personId === 'E01' && x.concurrentPositionId === 'P11');
      ok(pt02, 'PT02 仍指向 P11'); eq(S.CNT.posts(g, 'P11'), 1, 'P11 兼职仍 1');
      eq(S.G.person(g, 'E01').positionId, 'P20', '张三主职已调'); eq(S.G.hc(g, 'H01').personId, 'E01', '主职编制随人');
    });

    /* ---- 校验边界（PER-08/10/11、ORG-10） ---- */
    t('PER-08/10：带编职级不匹配整批拒绝，不带编放行', () => {
      const pid = setupHuadong();
      const bad = S.apply(pid, 'transferPersons', { rows: [{ personId: 'E01', targetPositionId: 'P21', managerId: 'M02', bringHeadcount: true }], syncSubs: false });
      ok(!bad.ok && bad.rowErrors && bad.rowErrors[0], '带编 P4→P1—P3 应拒绝: ' + JSON.stringify(bad.rowErrors || bad.error));
      eq(S.G.person(S.getPlanData(pid).cur, 'E01').positionId, 'P10', '未提前移动');
      const good = S.apply(pid, 'transferPersons', { rows: [{ personId: 'E01', targetPositionId: 'P21', managerId: 'M02', bringHeadcount: false }], syncSubs: false });
      ok(good.ok, '不带编放行: ' + (good.error || ''));
    });
    t('PER-11：经理循环拒绝', () => {
      const pid = setupHuadong();
      const r = S.apply(pid, 'transferPersons', { rows: [{ personId: 'E01', targetPositionId: 'P20', managerId: 'E04', bringHeadcount: true }], syncSubs: false });
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
      const pid = setupHuadong();
      ok(S.apply(pid, 'editPosition', { id: 'P10', levelMax: 'P3' }).ok, '允许保存（F-03 Demo 约定）');
      const pending = S.computePending(S.getPlan(pid));
      ok(pending.length >= 6, '6 个 P4 编制不匹配应全部标待处理，实际 ' + pending.length);
      ok(!S.apply(pid, 'submit', {}).ok, '提交被阻止');
      ok(S.apply(pid, 'editPosition', { id: 'P10', levelMax: 'P5' }).ok, '恢复职级范围');
      eq(S.computePending(S.getPlan(pid)).length, 0, '待处理清空');
    });
    t('停用有引用的职位 → 待处理 → 启用恢复（DEMO-C）', () => {
      const pid = setupHuadong();
      ok(S.apply(pid, 'togglePosition', { id: 'P10', action: '停用' }).ok, '停用 P10');
      const pending = S.computePending(S.getPlan(pid));
      ok(pending.some(x => x.kind === 'position' && x.id === 'P10'), 'P10 停用后有待处理');
      ok(!S.apply(pid, 'submit', {}).ok, '提交被阻止');
      ok(S.apply(pid, 'togglePosition', { id: 'P10', action: '启用' }).ok, '启用');
      eq(S.computePending(S.getPlan(pid)).length, 0, '启用后待处理重新计算清空');
    });

    /* ---- 提交快照与版本（APR-03/04、UI-05、AT-55） ---- */
    t('提交快照不可变，退回重提 V2 保留 V1', () => {
      const pid = setupHuadong();
      ok(S.apply(pid, 'editOrg', { id: 'O10', name: '产品中心' }).ok, '改名');
      const s1 = S.apply(pid, 'submit', {});
      ok(s1.ok, '提交 V1: ' + (s1.error || ''));
      eq(s1.version, 1, 'V1');
      ok(S.apply(pid, 'editOrg', { id: 'O10', name: '产品中心二' }).ok === false, '审批中不可编辑（UI-05）');
      const pd = S.getPlanData(pid);
      eq(pd.versions[0].snapshot.orgs.find(o => o.id === 'O10').name, '产品中心', 'V1 快照冻结');
      ok(S.apply(pid, 'demoReturn', { comment: '请核对 HRBP' }).ok, '退回');
      eq(S.getPlan(pid).status, '退回修改', '状态退回修改');
      ok(S.apply(pid, 'editOrg', { id: 'O10', hrbpId: 'HR01' }).ok, '退回后可继续调整');
      const s2 = S.apply(pid, 'submit', {});
      ok(s2.ok && s2.version === 2, '再次提交 V2');
      eq(S.getPlanData(pid).versions.length, 2, '两个版本');
      eq(S.getPlanData(pid).versions[0].snapshot.orgs.find(o => o.id === 'O10').name, '产品中心', 'V1 材料不被 V2 替换');
      ok(S.apply(pid, 'demoApprove', {}).ok, '审批通过');
      eq(S.getPlan(pid).status, '待生效', '待生效（EFF-01）');
      ok(S.apply(pid, 'demoExecuteSuccess', {}).ok, '到期执行成功');
      eq(S.getPlan(pid).status, '已生效', '已生效（EFF-02）');
    });

    /* ---- 放弃方案（LIST-03） ---- */
    t('放弃草稿 → 已作废只读', () => {
      const pid = setupHuadong();
      ok(S.apply(pid, 'discardPlan', {}).ok, '放弃');
      eq(S.getPlan(pid).status, '已作废', '状态已作废');
      ok(!S.apply(pid, 'editOrg', { id: 'O10', name: 'X' }).ok, '已作废不可编辑');
    });

    /* ---- 案例一种子（17.2.2） ---- */
    t('案例一 BASE：4 职位 4 员工 5 编制 1 可用', () => {
      S.resetAll();
      const pid = 'plan-case1', g = S.getPlanData(pid).cur;
      eq(g.positions.length, 4, '职位 4'); eq(S.CNT.rangeTotals(g, ['G03']).employees, 4, '员工 4');
      eq(g.headcounts.length, 5, '编制 5'); eq(S.CNT.available(g, 'C1-P02'), 1, '可用空编 1（C1-H03）');
      eq(g.orgs.length, 5, '组织 5');
    });

    /* ---- 案例二主线（17.3.3 → 17.3.4） ---- */
    t('案例二主线：三新组织、四职位迁移、停用阻断与解除', () => {
      S.resetAll();
      const pid = 'plan-case2';
      const n1 = S.apply(pid, 'addOrg', { parentId: 'G03', name: '产品一部' });
      const n2 = S.apply(pid, 'addOrg', { parentId: 'G03', name: '产品二部' });
      const n3 = S.apply(pid, 'addOrg', { parentId: 'G03', name: 'AI 应用部' });
      ok(n1.ok && n2.ok && n3.ok, '新建三个目标组织: ' + ((n1.error || n2.error || n3.error) || ''));
      ok(S.apply(pid, 'movePositions', { positionIds: ['C2-P01'], targetOrgId: n1.id }).ok, '产品经理 → 产品一部');
      ok(S.apply(pid, 'movePositions', { positionIds: ['C2-P02'], targetOrgId: n2.id }).ok, '产品设计师 → 产品二部');
      ok(S.apply(pid, 'movePositions', { positionIds: ['C2-P03'], targetOrgId: n3.id }).ok, '项目经理 → AI 应用部');
      ok(S.apply(pid, 'toggleOrg', { id: 'G05', action: '停用' }).ok, '停用项目部');
      const pending = S.computePending(S.getPlan(pid));
      ok(pending.some(x => x.id === 'G05'), '项目部停用有待处理（C2-P04 仍在）');
      ok(!S.apply(pid, 'submit', {}).ok, '提交被阻止（FUT-02）');
      ok(S.apply(pid, 'movePositions', { positionIds: ['C2-P04'], targetOrgId: n3.id }).ok, '项目专员 → AI 应用部（解除阻断）');
      eq(S.computePending(S.getPlan(pid)).length, 0, '阻断消除（项目部已停用且无有效职位）');
      const g = S.getPlanData(pid).cur;
      // 17.3.4 关键口径
      eq(S.CNT.positionEmployees(g, 'C2-P01'), 1, '产品一部在职 1（王强）');
      eq(S.CNT.positionPeople(g, 'C2-P02'), 1, '产品二部未来 1（王五 Offer）');
      eq(S.CNT.positionEmployees(g, 'C2-P02'), 0, '产品二部在职 0');
      eq(S.CNT.positionEmployees(g, 'C2-P03'), 1, 'AI 应用部在职 1（陈七）');
      eq(S.CNT.futureMatters(g, 'C2-P04'), 1, '赵六待调入 1');
      eq(S.CNT.posts(g, 'C2-P03'), 1, '王强兼职 1（随职位归属到 AI 应用部）');
      const rt = S.CNT.rangeTotals(g, ['G03', n1.id, n2.id, n3.id]);
      eq(rt.employees, 2, '调整后在职 2'); eq(rt.future, 2, '未来人员 2'); eq(rt.posts, 1, '兼职 1');
      eq(S.CNT.available(g, 'C2-P01'), 1, '可用空编仅 C2-H05 1 个');
      eq(S.G.hc(g, 'C2-H02').state, 'Offer占用', 'C2-H02 不进独立空编');
      eq(S.CNT.independentVacant(g, 'C2-P02'), 0, '产品设计师独立空编 0');
      const zhao = S.G.person(g, 'C2-E04');
      eq(zhao.futureType, '待调入', '赵六仍待调入'); eq(zhao.date, '2027-01-05', '日期保持'); eq(zhao.targetPositionId, 'C2-P04', '目标跟随职位');
      ok(S.apply(pid, 'submit', {}).ok, '提交成功');
    });

    /* ---- 案例一主线（17.2.3 → 17.2.4） ---- */
    t('案例一主线：三新组织、四职位迁移、两旧组织停用', () => {
      S.resetAll();
      const pid = 'plan-case1';
      const n1 = S.apply(pid, 'addOrg', { parentId: 'G03', name: '产品一部' });
      const n2 = S.apply(pid, 'addOrg', { parentId: 'G03', name: '产品二部' });
      const n3 = S.apply(pid, 'addOrg', { parentId: 'G03', name: 'AI 应用部' });
      ok(S.apply(pid, 'movePositions', { positionIds: ['C1-P01'], targetOrgId: n1.id }).ok, 'C1-P01 → 产品一部');
      ok(S.apply(pid, 'movePositions', { positionIds: ['C1-P02'], targetOrgId: n2.id }).ok, 'C1-P02 → 产品二部（C1-H02/H03、李四跟随）');
      ok(S.apply(pid, 'movePositions', { positionIds: ['C1-P03', 'C1-P04'], targetOrgId: n3.id }).ok, 'C1-P03/P04 → AI 应用部');
      ok(S.apply(pid, 'toggleOrg', { id: 'G04', action: '停用' }).ok, '停用产品部');
      ok(S.apply(pid, 'toggleOrg', { id: 'G05', action: '停用' }).ok, '停用项目部');
      const g = S.getPlanData(pid).cur;
      const rt = S.CNT.rangeTotals(g, ['G03', n1.id, n2.id, n3.id, 'G04', 'G05']);
      eq(rt.positions, 4, '职位仍 4'); eq(rt.employees, 4, '员工仍 4'); eq(rt.headcounts, 5, '编制仍 5'); eq(rt.available, 1, '可用空编仍 1');
      eq(S.G.hc(g, 'C1-H03').positionId, 'C1-P02', 'C1-H03 空编跟随产品运营');
      eq(S.G.person(g, 'C1-E02').positionId, 'C1-P02', '李四跟随');
      const d = S.diffPlan(S.getPlan(pid));
      ok(d.persons.length === 4 && d.persons.every(x => x.reason === '随职位整体迁移'), '人员差异原因均为随职位整体迁移');
      eq(S.computePending(S.getPlan(pid)).length, 0, '无待处理');
      ok(S.apply(pid, 'submit', {}).ok, '提交成功');
    });

    /* ---- 暂存失败注入（UI-02、AT-61） ---- */
    t('暂存失败注入：内存生效、标记未持久化、提交被拦', () => {
      const pid = setupHuadong();
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

    return results;
  }

  root.OA = root.OA || {};
  root.OA.selftest = { runAll };
})(typeof window !== 'undefined' ? window : globalThis);
