/* =============================================================
 * 组织调整 Demo 数据层（PRD V0.2 / TECH V0.1 第 4—5 节）
 * - localStorage 是唯一事实源（UI-02）：每次确认的操作写穿暂存
 * - 所有业务操作经 apply() 单一入口：改数据 → 不变量自检 → 暂存
 * - 差异永远对方案原始基准 base 计算（APR-03），提交生成只读快照
 * - 纯 JS、无框架依赖：浏览器与 Node 自测共用（INV/NUM 断言）
 * ============================================================= */
(function (root) {
  const hasLS = typeof localStorage !== 'undefined';
  const LS = {
    get(k) { return hasLS ? localStorage.getItem(k) : (LS._m[k] || null); },
    set(k, v) { if (hasLS) localStorage.setItem(k, v); else LS._m[k] = v; },
    del(k) { if (hasLS) localStorage.removeItem(k); else delete LS._m[k]; },
    _m: {}
  };
  const KEY_SCHEMA = 'oa.schema', KEY_PLANS = 'oa.plans', KEY_DATA = 'oa.plan.', KEY_UI = 'oa.ui.', KEY_DEMO = 'oa.demo';
  const SCHEMA = 2; // v2：两案例种子扩充（PRD V0.3），旧数据自动重建

  const LEVELS = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6']; // 预设等级顺序（PER-08：不按文本排序）
  const STATUS = { DRAFT: '草稿', REVIEWING: '审批中', RETURNED: '退回修改', PENDING: '待生效', EFFECTIVE: '已生效', ABNORMAL: '生效异常', DISCARDED: '已作废' };
  const EDITABLE_STATUS = [STATUS.DRAFT, STATUS.RETURNED];

  const clone = o => JSON.parse(JSON.stringify(o));
  const lvlIdx = l => LEVELS.indexOf(l);
  function fmtNow() {
    const d = new Date(), p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  /* ---------------- 图 helpers ---------------- */
  const G = {
    org: (g, id) => g.orgs.find(x => x.id === id),
    position: (g, id) => g.positions.find(x => x.id === id),
    person: (g, id) => g.persons.find(x => x.id === id),
    hc: (g, id) => g.headcounts.find(x => x.id === id),
    demand: (g, id) => g.demands.find(x => x.id === id),
    post: (g, id) => g.posts.find(x => x.id === id),
    childrenOrgs: (g, id) => g.orgs.filter(o => o.parentId === id).sort((a, b) => a.order - b.order),
    descendantIds(g, id, includeSelf) {
      const out = includeSelf ? [id] : [], walk = pid => g.orgs.filter(o => o.parentId === pid).forEach(o => { out.push(o.id); walk(o.id); });
      walk(id); return out;
    },
    pathNames(g, orgId) {
      const out = []; let cur = G.org(g, orgId), guard = 0;
      while (cur && guard++ < 50) { out.unshift(cur.name); cur = cur.parentId ? G.org(g, cur.parentId) : null; }
      return out;
    },
    isOrgEffective: (g, id) => { const o = G.org(g, id); return !!o && o.status === '有效'; },
    isPositionEffective: (g, id) => { const p = G.position(g, id); return !!p && p.status === '有效' && G.isOrgEffective(g, p.orgId); },
    positionsOfOrg(g, orgId, includeSub) {
      const ids = includeSub ? G.descendantIds(g, orgId, true) : [orgId];
      return g.positions.filter(p => ids.includes(p.orgId)).sort((a, b) => (a.orgId === b.orgId ? a.order - b.order : 0));
    },
    employeesAt(g, pid) { return g.persons.filter(p => p.status === '在职' && p.kind === 'employee' && p.positionId === pid); },
    futurePersonsAt(g, pid) { return g.persons.filter(p => p.status === '未来' && p.targetPositionId === pid); },
    peopleAt(g, pid) { return G.employeesAt(g, pid).concat(G.futurePersonsAt(g, pid)); }, // CNT-02（ persons 唯一即去重）
    hcsOf(g, pid) { return g.headcounts.filter(h => h.positionId === pid); },
    availableHcs(g, pid, level) { return g.headcounts.filter(h => h.positionId === pid && h.state === '可用' && (!level || h.level === level)); },
    postsOf(g, pid) { return g.posts.filter(t => t.status === '有效' && t.concurrentPositionId === pid); },
    subordinatesOf(g, personId) { return g.persons.filter(p => p.status === '在职' && p.managerId === personId); },
    managerChainOk(g, personId, managerId) { // 提议 managerId 后不得形成环（PER-11）
      let cur = managerId, guard = 0;
      while (cur && guard++ < 200) { if (cur === personId) return false; const p = G.person(g, cur); cur = p ? p.managerId : null; }
      return true;
    }
  };

  /* ---------------- 存储骨架 ---------------- */
  let db = null;
  let demoFlags = { persistFail: false };

  function defaultDb() {
    const plans = clone(OA.seed.DEFAULT_PLANS);
    const planData = {};
    plans.forEach(p => { planData[p.id] = buildPlanData(p); });
    return { schema: SCHEMA, plans, planData };
  }
  function buildPlanData(planMeta) {
    const graph = clone(OA.seed.UNIVERSES[planMeta.universe]());
    return { base: clone(graph), cur: graph, versions: [], seq: { org: 0, position: 0, hc: 0, person: 0, post: 0, demand: 0 }, lastPersistOk: true };
  }
  function persist(force) {
    if (!force && demoFlags.persistFail) throw new Error('PERSIST_FAIL'); // AT-61 故障注入
    LS.set(KEY_PLANS, JSON.stringify(db.plans));
    Object.keys(db.planData).forEach(id => LS.set(KEY_DATA + id, JSON.stringify(db.planData[id])));
    LS.set(KEY_SCHEMA, String(SCHEMA));
  }
  function load() {
    if (hasLS && localStorage.getItem(KEY_SCHEMA) === String(SCHEMA) && localStorage.getItem(KEY_PLANS)) {
      try {
        db = { schema: SCHEMA, plans: JSON.parse(localStorage.getItem(KEY_PLANS)), planData: {} };
        db.plans.forEach(p => { const raw = localStorage.getItem(KEY_DATA + p.id); db.planData[p.id] = raw ? JSON.parse(raw) : buildPlanData(p); });
        const d = LS.get(KEY_DEMO); if (d) demoFlags = JSON.parse(d);
        ensureReactive();
        return;
      } catch (e) { /* 损坏则重建 */ }
    }
    db = defaultDb(); try { persist(); } catch (e) { /* 忽略首建失败 */ }
    ensureReactive();
  }
  /* 浏览器环境下把数据库接入 Vue 响应式：页面读 proxy、store 写 proxy，
     界面随每次 apply 自动刷新（否则 Vue 看不见普通对象的变更，UI 会停留在旧值）。Node 自测无 Vue，自动跳过。 */
  function ensureReactive() {
    if (!(root.Vue && typeof root.Vue.reactive === 'function')) return;
    if (db && !db.__isReactive) {
      db = root.Vue.reactive(db);
      try { db.__isReactive = true; } catch (e) { /* 忽略 */ }
    }
  }
  function saveDemoFlags() { LS.set(KEY_DEMO, JSON.stringify(demoFlags)); }

  /* ---------------- 范围（NEW-02/03） ---------------- */
  function scopeOrgIds(plan) { // 源范围完整子树 + 目标组织
    const g = db.planData[plan.id].cur, set = new Set();
    plan.sourceScopeIds.concat(plan.targetScopeIds).forEach(id => G.descendantIds(g, id, true).forEach(x => set.add(x)));
    return set;
  }
  function contextOrgIds(plan) { // 必要祖先上下文（只读）
    const g = db.planData[plan.id].cur, scope = scopeOrgIds(plan), set = new Set();
    scope.forEach(id => { let o = G.org(g, id); while (o && o.parentId) { o = G.org(g, o.parentId); if (o && !scope.has(o.id)) set.add(o.id); } });
    return set;
  }

  /* ---------------- 编号生成（OPEN-03 Demo 约定） ---------------- */
  function nextId(pd, kind, prefix) { pd.seq[kind] += 1; return `${prefix}${pd.seq[kind]}`; }
  function nextCode(pd, kind) { // 调用前先 nextId，编码用当前计数（OPEN-03 Demo 约定：唯一只读编码）
    if (kind === 'org') return 'N' + String(1000 + pd.seq.org).padStart(4, '0');
    if (kind === 'position') return 'GW' + String(9000 + pd.seq.position);
    if (kind === 'hc') return '20261201' + String(pd.seq.hc).padStart(4, '0');
    return 'X' + Date.now();
  }

  /* ---------------- 不变量（PRD 12.2 INV-01—05） ---------------- */
  function assertGraph(g) {
    g.headcounts.forEach(h => {
      const p = h.personId ? G.person(g, h.personId) : null;
      if (h.state === '占编') {
        if (!p || p.status !== '在职' || p.headcountId !== h.id || p.positionId !== h.positionId) throw new Error(`编制 ${h.code} 占用关系不一致`);
      } else if (h.state === '可用') {
        if (h.personId || h.demandId) throw new Error(`可用编制 ${h.code} 带有关联`);
        if (g.persons.some(x => x.headcountId === h.id)) throw new Error(`可用编制 ${h.code} 被人员引用`);
      } else if (h.state === '需求预留') {
        if (!h.demandId || !G.demand(g, h.demandId) || h.personId) throw new Error(`需求预留编制 ${h.code} 关联不一致`);
      } else if (h.state === 'Offer占用' || h.state === '待调入预留') {
        if (!p || p.status !== '未来' || p.headcountId !== h.id) throw new Error(`编制 ${h.code} 未来关联不一致`);
      }
    });
    g.persons.filter(p => p.status === '在职' && p.headcountId).forEach(p => {
      const h = G.hc(g, p.headcountId);
      if (!h || h.state !== '占编' || h.personId !== p.id) throw new Error(`人员 ${p.name} 占编关系不一致`);
    });
    g.persons.filter(p => p.status === '在职').forEach(p => { // 经理链不成环（PER-11）
      const seen = new Set(); let cur = p.managerId;
      while (cur && !seen.has(cur)) { seen.add(cur); if (cur === p.id) throw new Error('直接上级形成汇报循环'); cur = (G.person(g, cur) || {}).managerId; }
    });
    g.demands.forEach(d => d.headcountIds.forEach(hid => { if (!G.hc(g, hid)) throw new Error(`需求 ${d.name} 引用了不存在的编制`); }));
    g.posts.forEach(t => {
      if (!G.person(g, t.personId) || !G.position(g, t.mainPositionId) || !G.position(g, t.concurrentPositionId)) throw new Error('兼职关系引用不一致');
    });
  }

  /* ---------------- 待处理（FUT-02、F-03、ORG-09） ---------------- */
  function computePending(plan) {
    const g = db.planData[plan.id].cur, out = [];
    g.orgs.filter(o => o.status === '停用').forEach(o => {
      const subs = G.childrenOrgs(g, o.id).filter(x => x.status === '有效').length;
      const poss = g.positions.filter(p => p.orgId === o.id && p.status === '有效').length;
      if (subs) out.push({ kind: 'org', id: o.id, message: `下级组织 ${subs} 个仍有效` });
      if (poss) out.push({ kind: 'org', id: o.id, message: `职位 ${poss} 个仍有效` });
    });
    g.positions.filter(p => p.status === '停用').forEach(p => {
      const emps = G.employeesAt(g, p.id).length, hcs = G.hcsOf(g, p.id).length, futs = G.futurePersonsAt(g, p.id).length;
      if (emps) out.push({ kind: 'position', id: p.id, message: `在职员工 ${emps} 人未处理` });
      if (hcs) out.push({ kind: 'position', id: p.id, message: `有效编制 ${hcs} 个未处理` });
      if (futs) out.push({ kind: 'position', id: p.id, message: `未来人员引用 ${futs} 条` });
    });
    g.headcounts.forEach(h => {
      const p = G.position(g, h.positionId);
      if (p && (lvlIdx(h.level) < lvlIdx(p.levelMin) || lvlIdx(h.level) > lvlIdx(p.levelMax)))
        out.push({ kind: 'headcount', id: h.id, message: `编制职级 ${h.level} 超出职位 ${p.name} 范围（${p.levelMin}—${p.levelMax}）` });
    });
    g.persons.filter(p => p.status === '未来').forEach(p => {
      const tp = G.position(g, p.targetPositionId);
      if (tp && (tp.status === '停用' || !G.isOrgEffective(g, tp.orgId)))
        out.push({ kind: 'person', id: p.id, message: `${p.name} 的${p.futureType}目标已停用` });
    });
    return out;
  }

  /* ---------------- 数量口径（CNT-01—09，只写一处） ---------------- */
  const CNT = {
    positionEmployees: (g, pid) => G.employeesAt(g, pid).length,                                             // CNT-01
    positionPeople: (g, pid) => G.peopleAt(g, pid).length,                                                   // CNT-02
    available: (g, pid) => G.availableHcs(g, pid).length,                                                    // CNT-04
    demandReserved: (g, pid) => g.headcounts.filter(h => h.positionId === pid && h.state === '需求预留').length, // CNT-05
    independentVacant: (g, pid) => CNT.available(g, pid) + CNT.demandReserved(g, pid),                       // CNT-03
    totalHeadcounts: (g, pid) => G.hcsOf(g, pid).length,                                                     // CNT-06
    posts: (g, pid) => G.postsOf(g, pid).length,                                                             // CNT-07
    futureMatters(g, pid) {                                                                                  // CNT-08
      const persons = new Set(G.futurePersonsAt(g, pid).map(p => p.id));
      const demands = new Set(g.headcounts.filter(h => h.positionId === pid && h.state === '需求预留').map(h => h.demandId));
      return persons.size + demands.size;
    },
    orgSummary(g, orgId) {                                                                                   // CNT-09
      const ids = G.descendantIds(g, orgId, true), orgSet = new Set(ids);
      const poss = g.positions.filter(p => orgSet.has(p.orgId) && p.status === '有效');
      const posIds = new Set(poss.map(p => p.id));
      const emps = new Set(g.persons.filter(p => p.status === '在职' && p.kind === 'employee' && posIds.has(p.positionId)).map(p => p.id));
      const hcs = g.headcounts.filter(h => posIds.has(h.positionId)).length;
      const futs = new Set(g.persons.filter(p => p.status === '未来' && posIds.has(p.targetPositionId)).map(p => p.id));
      return { positions: poss.length, employees: emps.size, headcounts: hcs, future: futs.size };
    },
    rangeTotals(g, orgIds) { // 范围合计（13.1）：按组织集合
      const orgSet = new Set(); orgIds.forEach(id => G.descendantIds(g, id, true).forEach(x => orgSet.add(x)));
      const poss = g.positions.filter(p => orgSet.has(p.orgId) && p.status === '有效');
      const posIds = new Set(poss.map(p => p.id));
      return {
        positions: poss.length,
        employees: new Set(g.persons.filter(p => p.status === '在职' && p.kind === 'employee' && posIds.has(p.positionId)).map(p => p.id)).size,
        future: new Set(g.persons.filter(p => p.status === '未来' && posIds.has(p.targetPositionId)).map(p => p.id)).size,
        headcounts: g.headcounts.filter(h => posIds.has(h.positionId)).length,
        available: g.headcounts.filter(h => posIds.has(h.positionId) && h.state === '可用').length,
        demandReserved: g.headcounts.filter(h => posIds.has(h.positionId) && h.state === '需求预留').length,
        posts: g.posts.filter(t => t.status === '有效' && posIds.has(t.concurrentPositionId)).length
      };
    }
  };

  /* ---------------- 差异引擎（CMP-11—18：对 base 算最终差异） ---------------- */
  function labelOrg(g, v) { return v ? (G.org(g, v) || {}).name || v : '—'; }
  function labelPosition(g, v) { return v ? (G.position(g, v) || {}).name || v : '—'; }
  function labelPerson(g, v) { return v ? (G.person(g, v) || {}).name || v : '—'; }

  function diffPlan(plan) {
    const pd = db.planData[plan.id], b = pd.base, c = pd.cur;
    const res = { orgs: [], positions: [], persons: [], headcounts: [], posts: [], futureItems: [] };
    const fieldRows = (spec, bo, co, bGraph, cGraph) => {
      const fields = [];
      spec.forEach(f => {
        const ov = f.derived ? f.derived(bGraph, bo) : bo[f.key];
        const nv = f.derived ? f.derived(cGraph, co) : co[f.key];
        if (ov !== nv) fields.push({ key: f.key, label: f.label, old: f.labelFn ? f.labelFn(bGraph, ov) : ov, new: f.labelFn ? f.labelFn(cGraph, nv) : nv });
      });
      return fields;
    };
    const specOrg = [
      { key: 'name', label: '名称' }, { key: 'parentId', label: '上级组织', labelFn: labelOrg },
      { key: 'leaderId', label: '部门负责人', labelFn: labelPerson }, { key: 'hrbpId', label: 'HRBP', labelFn: labelPerson },
      { key: 'status', label: '状态' }
    ];
    const specPos = [
      { key: 'name', label: '名称' }, { key: 'orgId', label: '所属组织', labelFn: labelOrg },
      { key: 'levelMin', label: '最低职级' }, { key: 'levelMax', label: '最高职级' }, { key: 'status', label: '状态' }
    ];
    // 人员（在职）：组织为派生值（职位所属组织）
    const specPerson = [
      { key: 'orgId', label: '主职组织', derived: (g, p) => (G.position(g, p.positionId) || {}).orgId, labelFn: labelOrg },
      { key: 'positionId', label: '职位', labelFn: labelPosition },
      { key: 'managerId', label: '直接上级', labelFn: labelPerson },
      { key: 'headcountId', label: '占编情况', labelFn: (g, v) => (v ? '占编' : '未占编') }
    ];
    const specHc = [
      { key: 'orgId', label: '所属组织', derived: (g, h) => (G.position(g, h.positionId) || {}).orgId, labelFn: labelOrg },
      { key: 'positionId', label: '所属职位', labelFn: labelPosition },
      { key: 'level', label: '编制职级' },
      { key: 'state', label: '状态' },
      { key: 'personId', label: '占用对象', labelFn: labelPerson }
    ];
    const specFuture = [
      { key: 'orgId', label: '目标组织', derived: (g, p) => (G.position(g, p.targetPositionId) || {}).orgId, labelFn: labelOrg },
      { key: 'targetPositionId', label: '目标职位', labelFn: labelPosition },
      { key: 'futureType', label: '事项类型' },
      { key: 'date', label: '计划日期' }
    ];

    // 组织
    const orgIds = new Set(b.orgs.map(x => x.id).concat(c.orgs.map(x => x.id)));
    orgIds.forEach(id => {
      const bo = G.org(b, id), co = G.org(c, id);
      if (!bo) { res.orgs.push({ id, changeType: '新增', name: co.name, fields: fieldRows(specOrg, { name: null, parentId: null, leaderId: null, hrbpId: null, status: null }, co, b, c), reason: null }); return; }
      if (!co) { res.orgs.push({ id, changeType: '移除', name: bo.name, fields: [], reason: null }); return; }
      const fields = fieldRows(specOrg, bo, co, b, c);
      if (fields.length) {
        let reason = null;
        if (fields.some(f => f.key === 'parentId')) reason = '上级调整';
        else if (fields.some(f => f.key === 'name')) reason = '更名';
        else reason = '其他属性变更';
        res.orgs.push({ id, changeType: '修改', name: co.name, fields, reason });
      }
    });
    // 职位
    const posIds = new Set(b.positions.map(x => x.id).concat(c.positions.map(x => x.id)));
    posIds.forEach(id => {
      const bp = G.position(b, id), cp = G.position(c, id);
      if (!bp) { res.positions.push({ id, changeType: '新增', name: cp.name, fields: fieldRows(specPos, { name: null, orgId: null, levelMin: null, levelMax: null, status: null }, cp, b, c), reason: null }); return; }
      if (!cp) { res.positions.push({ id, changeType: '移除', name: bp.name, fields: [], reason: null }); return; }
      const fields = fieldRows(specPos, bp, cp, b, c);
      if (fields.length) {
        const reason = bp.orgId === cp.orgId ? (fields.some(f => f.key === 'name') ? '更名' : null) : '整体移动';
        res.positions.push({ id, changeType: '修改', name: cp.name, fields, reason });
      }
    });
    // 人员（仅在职；未来人进未来事项）
    const personIds = new Set(b.persons.filter(x => x.status === '在职').map(x => x.id).concat(c.persons.filter(x => x.status === '在职').map(x => x.id)));
    personIds.forEach(id => {
      const bp = G.person(b, id), cp = G.person(c, id);
      if (!bp || !cp) return; // 在职↔未来不互换
      const fields = fieldRows(specPerson, bp, cp, b, c);
      if (fields.length) {
        const reason = bp.positionId === cp.positionId ? '随职位整体迁移' : '调岗';
        res.persons.push({ id, changeType: '修改', name: cp.name, fields, reason });
      }
    });
    // 编制
    const hcIds = new Set(b.headcounts.map(x => x.id).concat(c.headcounts.map(x => x.id)));
    hcIds.forEach(id => {
      const bh = G.hc(b, id), ch = G.hc(c, id);
      if (!bh) { res.headcounts.push({ id, changeType: '新增', name: ch.code, fields: fieldRows(specHc, { orgId: null, positionId: null, level: null, state: null, personId: null }, ch, b, c), reason: '增编' }); return; }
      if (!ch) { res.headcounts.push({ id, changeType: '减编', name: bh.code, fields: [], reason: '减编' }); return; }
      const fields = fieldRows(specHc, bh, ch, b, c);
      if (fields.length) {
        const reason = bh.positionId !== ch.positionId ? (bh.state === '可用' && ch.state === '可用' ? '空编移动' : '调岗带编') : '随职位整体迁移';
        res.headcounts.push({ id, changeType: '修改', name: ch.code, fields, reason });
      }
    });
    // 兼职
    const postIds = new Set(b.posts.map(x => x.id).concat(c.posts.map(x => x.id)));
    postIds.forEach(id => {
      const bt = G.post(b, id), ct = G.post(c, id);
      if (!bt) { res.posts.push({ id, changeType: '新增', name: labelPerson(c, ct.personId), fields: [], reason: null }); return; }
      if (!ct) { res.posts.push({ id, changeType: '取消', name: labelPerson(b, bt.personId), fields: [{ key: 'status', label: '关系状态', old: '有效', new: '已取消' }], reason: null }); return; }
      const specPost = [
        { key: 'orgId', label: '兼职组织', derived: (g, t) => (G.position(g, t.concurrentPositionId) || {}).orgId, labelFn: labelOrg },
        { key: 'concurrentPositionId', label: '兼职职位', labelFn: labelPosition },
        { key: 'status', label: '关系状态' }
      ];
      const fields = fieldRows(specPost, bt, ct, b, c);
      if (fields.length) res.posts.push({ id, changeType: '修改', name: labelPerson(c, ct.personId), fields, reason: '随职位整体迁移' });
    });
    // 未来事项
    const fIds = new Set(b.persons.filter(x => x.status === '未来').map(x => x.id).concat(c.persons.filter(x => x.status === '未来').map(x => x.id)));
    fIds.forEach(id => {
      const bp = G.person(b, id), cp = G.person(c, id);
      if (!bp && cp) { res.futureItems.push({ id, changeType: '新增', name: cp.name, fields: fieldRows(specFuture, { orgId: null, targetPositionId: null, futureType: null, date: null }, cp, b, c), reason: null }); return; }
      if (bp && !cp) { res.futureItems.push({ id, changeType: '移除', name: bp.name, fields: [], reason: null }); return; }
      if (!bp || !cp) return;
      const fields = fieldRows(specFuture, bp, cp, b, c);
      if (fields.length) {
        const reason = bp.targetPositionId === cp.targetPositionId ? '随职位整体迁移' : null;
        res.futureItems.push({ id, changeType: '修改', name: cp.name, fields, reason });
      }
    });
    return res;
  }
  function diffCounts(plan) { // CNT-10：发生最终差异的对象数
    const d = diffPlan(plan);
    return { 组织: d.orgs.length, 职位: d.positions.length, 人员: d.persons.length, 编制: d.headcounts.length, 兼职: d.posts.length, 未来事项: d.futureItems.length };
  }

  /* ---------------- 变化标签（ORG-02/03、POS-03） ---------------- */
  function orgChangeTags(plan, id) {
    const pd = db.planData[plan.id], bo = G.org(pd.base, id), co = G.org(pd.cur, id);
    if (co.status === '停用') return ['停用']; // ORG-03：停用优先显示（含新增后停用）
    if (!bo) return ['新增'];
    const tags = [];
    const d = diffPlan(plan).orgs.find(r => r.id === id);
    if (d) {
      if (d.fields.some(f => f.key === 'parentId')) tags.push('上级调整');
      if (d.fields.some(f => f.key === 'name')) tags.push('更名');
      if (d.fields.some(f => ['leaderId', 'hrbpId'].includes(f.key))) tags.push('其他属性变更');
    }
    return tags;
  }
  function positionChangeTags(plan, id) {
    const pd = db.planData[plan.id], bp = G.position(pd.base, id), cp = G.position(pd.cur, id);
    if (cp.status === '停用') return ['停用']; // 同 ORG-03：停用优先
    if (!bp) return ['新增'];
    const d = diffPlan(plan).positions.find(r => r.id === id);
    const tags = [];
    if (d) {
      if (d.fields.some(f => f.key === 'name')) tags.push('更名');
      if (d.fields.some(f => f.key === 'orgId')) tags.push('变更组织');
      if (d.fields.some(f => ['levelMin', 'levelMax'].includes(f.key))) tags.push('职级调整');
    }
    return tags;
  }

  /* ---------------- 操作（全部经 apply 单一入口） ---------------- */
  const OPS = {
    /* ---- 方案 ---- */
    createPlan({ payload }) {
      const name = (payload.name || '').trim();
      if (!name) throw new Error('请填写方案名称');
      if (!payload.scopeOrgIds || !payload.scopeOrgIds.length) throw new Error('请选择调整范围');
      if (!payload.effDate) throw new Error('请选择生效日期');
      const universe = payload.universe || 'case1';
      const g = OA.seed.UNIVERSES[universe]();
      payload.scopeOrgIds.forEach(id => { if (!G.org(g, id)) throw new Error('调整范围包含不存在的组织'); });
      const id = 'plan-' + Date.now().toString(36) + Math.floor(Math.random() * 1000);
      db.plans.push({
        id, universe, name, effDate: payload.effDate, desc: payload.desc || '',
        sourceScopeIds: payload.scopeOrgIds.slice(), targetScopeIds: [],
        status: STATUS.DRAFT, createdAt: fmtNow(), updatedAt: fmtNow()
      });
      db.planData[id] = buildPlanData(db.plans[db.plans.length - 1]);
      return { planId: id };
    },
    discardPlan({ plan, payload: { reason } = {} }) {
      if (!EDITABLE_STATUS.includes(plan.status)) throw new Error('当前状态不可放弃');
      plan.status = STATUS.DISCARDED;
      return {};
    },
    extendScope({ plan, pd, payload }) { // NEW-04：仅允许补充组织
      (payload.orgIds || []).forEach(id => {
        if (!G.org(pd.cur, id)) throw new Error('组织不存在');
        if (scopeOrgIds(plan).has(id)) return; // 已在范围（含子树）
        if (!plan.targetScopeIds.includes(id)) plan.targetScopeIds.push(id);
      });
      return {};
    },

    /* ---- 组织（ORG-05—14） ---- */
    addOrg({ plan, pd, payload }) {
      const name = (payload.name || '').trim();
      if (!name) throw new Error('请填写组织名称');
      const parent = payload.parentId ? G.org(pd.cur, payload.parentId) : null;
      if (payload.parentId && !parent) throw new Error('上级组织不存在');
      if (parent && parent.status === '停用') throw new Error('已停用组织下不可新增组织');
      const id = nextId(pd, 'org', 'NO');
      pd.cur.orgs.push({
        id, name, code: nextCode(pd, 'org'), parentId: payload.parentId || null,
        order: parent ? G.childrenOrgs(pd.cur, parent.id).length + 1 : 1,
        status: '有效', setupDate: plan.effDate, leaderId: payload.leaderId || null, hrbpId: payload.hrbpId || null
      });
      if (!plan.targetScopeIds.includes(id)) plan.targetScopeIds.push(id); // 新增组织进入方案
      return { id };
    },
    editOrg({ plan, pd, payload }) {
      const o = G.org(pd.cur, payload.id);
      if (!o) throw new Error('组织不存在');
      if (o.status === '停用' && payload.name !== undefined && payload.name !== o.name) throw new Error('已停用组织不可编辑');
      if (payload.name !== undefined) { if (!(payload.name || '').trim()) throw new Error('组织名称不能为空'); o.name = payload.name.trim(); }
      if (payload.leaderId !== undefined) o.leaderId = payload.leaderId;
      if (payload.hrbpId !== undefined) o.hrbpId = payload.hrbpId;
      if (payload.parentId !== undefined && payload.parentId !== o.parentId) {
        const err = validateMoveOrg(plan, pd, payload.id, payload.parentId);
        if (err) throw new Error(err);
        moveOrgMutate(pd, payload.id, payload.parentId);
      }
      return {};
    },
    moveOrg({ plan, pd, payload }) {
      const err = validateMoveOrg(plan, pd, payload.id, payload.newParentId);
      if (err) throw new Error(err);
      moveOrgMutate(pd, payload.id, payload.newParentId);
      return {};
    },
    toggleOrg({ plan, pd, payload }) {
      const o = G.org(pd.cur, payload.id);
      if (!o) throw new Error('组织不存在');
      if (payload.action === '停用') { if (o.status !== '有效') throw new Error('仅有效组织可停用'); o.status = '停用'; }
      else if (payload.action === '启用') { if (o.status !== '停用') throw new Error('仅停用组织可启用'); o.status = '有效'; } // ORG-09：不恢复已迁走对象
      else throw new Error('未知动作');
      return {};
    },
    copyOrg({ plan, pd, payload }) {
      const src = G.org(pd.cur, payload.id);
      if (!src) throw new Error('组织不存在');
      const name = (payload.name || '').trim() || (src.name + '副本');
      const id = nextId(pd, 'org', 'NO');
      pd.cur.orgs.push({ // ORG-07：仅复制属性，不复制下级/职位/人编/角色
        id, name, code: nextCode(pd, 'org'), parentId: src.parentId,
        order: G.childrenOrgs(pd.cur, src.parentId).length + 1,
        status: '有效', setupDate: plan.effDate, leaderId: null, hrbpId: null
      });
      if (!plan.targetScopeIds.includes(id)) plan.targetScopeIds.push(id);
      return { id };
    },
    reorderOrgs({ pd, payload }) { // ORG-14：同级排序，无确认、不进差异
      const { parentId, orderedIds } = payload;
      orderedIds.forEach((id, i) => { const o = G.org(pd.cur, id); if (o && o.parentId === parentId) o.order = i + 1; });
      return {};
    },

    /* ---- 职位（POS-04—14） ---- */
    addPosition({ plan, pd, payload }) {
      const name = (payload.name || '').trim();
      if (!name) throw new Error('请填写职位名称');
      const org = G.org(pd.cur, payload.orgId);
      if (!org) throw new Error('所属组织不存在');
      if (org.status === '停用') throw new Error('已停用组织下不可新增职位');
      if (lvlIdx(payload.levelMin) < 0 || lvlIdx(payload.levelMax) < 0) throw new Error('请选择职级范围');
      if (lvlIdx(payload.levelMin) > lvlIdx(payload.levelMax)) throw new Error('最低职级不能高于最高职级');
      const id = nextId(pd, 'position', 'NP');
      pd.cur.positions.push({
        id, name, code: nextCode(pd, 'position'), orgId: payload.orgId,
        order: pd.cur.positions.filter(p => p.orgId === payload.orgId).length + 1,
        status: '有效', setupDate: plan.effDate, levelMin: payload.levelMin, levelMax: payload.levelMax
      });
      return { id };
    },
    editPosition({ pd, payload }) {
      const p = G.position(pd.cur, payload.id);
      if (!p) throw new Error('职位不存在');
      if (p.status === '停用') throw new Error('已停用职位不可编辑');
      if (payload.name !== undefined) { if (!(payload.name || '').trim()) throw new Error('职位名称不能为空'); p.name = payload.name.trim(); }
      if (payload.levelMin !== undefined) p.levelMin = payload.levelMin;
      if (payload.levelMax !== undefined) p.levelMax = payload.levelMax;
      if (lvlIdx(p.levelMin) > lvlIdx(p.levelMax)) throw new Error('最低职级不能高于最高职级');
      // F-03 Demo 约定：允许保存，原有编制不再匹配 → 待处理（computePending），提交前不能忽略
      if (payload.orgId !== undefined && payload.orgId !== p.orgId) {
        const err = validateMovePositions(plan, pd, [payload.id], payload.orgId);
        if (err) throw new Error(err);
        p.orgId = payload.orgId;
      }
      return {};
    },
    copyPosition({ plan, pd, payload }) {
      const src = G.position(pd.cur, payload.id);
      if (!src) throw new Error('职位不存在');
      const id = nextId(pd, 'position', 'NP');
      pd.cur.positions.push({ // POS-06：仅属性，不复制员工/编制/兼职/未来
        id, name: (payload.name || '').trim() || (src.name + '副本'), code: nextCode(pd, 'position'), orgId: src.orgId,
        order: pd.cur.positions.filter(p => p.orgId === src.orgId).length + 1,
        status: '有效', setupDate: plan.effDate, levelMin: src.levelMin, levelMax: src.levelMax
      });
      return { id };
    },
    togglePosition({ pd, payload }) {
      const p = G.position(pd.cur, payload.id);
      if (!p) throw new Error('职位不存在');
      if (payload.action === '停用') { if (p.status !== '有效') throw new Error('仅有效职位可停用'); p.status = '停用'; }
      else if (payload.action === '启用') { if (p.status !== '停用') throw new Error('仅停用职位可启用'); p.status = '有效'; }
      else throw new Error('未知动作');
      return {};
    },
    movePositions({ plan, pd, payload }) {
      const { positionIds, targetOrgId } = payload;
      const err = validateMovePositions(plan, pd, positionIds, targetOrgId);
      if (err) throw new Error(err);
      positionIds.forEach(id => { G.position(pd.cur, id).orgId = targetOrgId; }); // POS-09：身份保留，人员/编制/兼职/未来跟随
      return {};
    },
    reorderPositions({ pd, payload }) { // POS-13
      const { orderedIds } = payload;
      orderedIds.forEach((id, i) => { const p = G.position(pd.cur, id); if (p) p.order = i + 1; });
      return {};
    },

    /* ---- 人员调岗（PER-05—14） ---- */
    validateTransfer(pd, rows) {
      const rowErrors = [];
      const managerMap = {}; // 本批次提议的经理关系（整批校验循环）
      rows.forEach((r, i) => {
        const p = G.person(pd.cur, r.personId);
        const fail = m => rowErrors[i] = { personId: r.personId, name: p ? p.name : r.personId, message: m };
        if (!p || p.status !== '在职' || p.kind !== 'employee') { fail('仅在职员工可调岗'); return; }
        const tp = G.position(pd.cur, r.targetPositionId);
        if (!tp) { fail('目标职位不存在'); return; }
        if (tp.status === '停用') { fail('目标职位已停用'); return; }
        if (!G.isOrgEffective(pd.cur, tp.orgId)) { fail('目标职位所属组织已停用'); return; }
        if (tp.id === p.positionId) { fail('目标职位与当前职位相同'); return; }
        if (!r.managerId) { fail('请选择调整后直接上级'); return; }
        if (r.managerId === p.id) { fail('直接上级不能选择本人'); return; }
        if (!G.person(pd.cur, r.managerId) || G.person(pd.cur, r.managerId).status !== '在职') { fail('直接上级无效'); return; }
        managerMap[p.id] = { managerId: r.managerId, old: p.managerId, targetPositionId: tp.id, bring: !!r.bringHeadcount && !!p.headcountId };
        if (r.bringHeadcount && p.headcountId) { // PER-08：带编职级必须在目标职位允许范围
          const ok = lvlIdx(p.level) >= lvlIdx(tp.levelMin) && lvlIdx(p.level) <= lvlIdx(tp.levelMax);
          if (!ok) fail(`编制职级 ${p.level} 不在目标职位 ${tp.name} 允许范围（${tp.levelMin}—${tp.levelMax}）内`);
        }
      });
      if (rowErrors.some(Boolean)) return rowErrors;
      // 循环校验：把提议经理关系叠加后逐人走链
      rows.forEach(r => {
        let cur = managerMap[r.personId].managerId, guard = 0;
        while (cur && guard++ < 200) {
          if (cur === r.personId) { rowErrors[rows.indexOf(r)] = { personId: r.personId, name: G.person(pd.cur, r.personId).name, message: '直接上级选择形成汇报循环' }; return; }
          cur = managerMap[cur] ? managerMap[cur].managerId : (G.person(pd.cur, cur) || {}).managerId;
        }
      });
      if (rowErrors.some(Boolean)) return rowErrors;
      return null;
    },
    transferPersons({ plan, pd, payload }) {
      const rows = payload.rows || [];
      const errs = OPS.validateTransfer(pd, rows);
      if (errs) return { rowErrors: errs }; // PER-10：整批不能确认，不提前移动
      rows.forEach(r => {
        const p = G.person(pd.cur, r.personId);
        const oldManagerId = p.managerId;
        const tp = G.position(pd.cur, r.targetPositionId);
        p.positionId = tp.id;
        p.managerId = r.managerId;
        if (p.headcountId) {
          const h = G.hc(pd.cur, p.headcountId);
          if (r.bringHeadcount) { h.positionId = tp.id; /* 带编：编制身份不变，归属目标职位（PER-09） */ }
          else { h.state = '可用'; h.personId = null; p.headcountId = null; /* 不带编：原编制回来源职位可用空编 */ }
        }
        if (payload.syncSubs) { // PER-12 Demo 规则：下属经理改为被调动人原经理；不改变下属主职
          G.subordinatesOf(pd.cur, r.personId).forEach(s => { if (oldManagerId) s.managerId = oldManagerId; });
        }
      });
      return {};
    },
    subSyncPreview({ pd, payload }) { // PER-12 预览：名单含下属、原经理、新经理
      const rows = payload.rows || [], out = [];
      rows.forEach(r => {
        const p = G.person(pd.cur, r.personId);
        if (!p || p.status !== '在职') return;
        G.subordinatesOf(pd.cur, r.personId).forEach(s => {
          out.push({ personId: s.id, name: s.name, positionName: labelPosition(pd.cur, s.positionId), oldManager: p.name, newManager: p.managerId ? labelPerson(pd.cur, p.managerId) : '—' });
        });
      });
      return { list: out };
    },

    /* ---- 编制（HC-01—14） ---- */
    releaseHeadcount({ pd, payload }) {
      const p = G.person(pd.cur, payload.personId);
      if (!p || p.status !== '在职') throw new Error('仅在职人员可解除编制');
      if (!p.headcountId) throw new Error('该人员未占编');
      const h = G.hc(pd.cur, p.headcountId);
      h.state = '可用'; h.personId = null; p.headcountId = null; // HC-02：人留原职位，编制变可用，总量不变
      return {};
    },
    addHeadcounts({ plan, pd, payload }) {
      const { positionId, level, count } = payload;
      const p = G.position(pd.cur, positionId);
      if (!p) throw new Error('职位不存在');
      if (!Number.isInteger(count) || count < 1) throw new Error('数量必须为正整数'); // HC-06
      if (lvlIdx(level) < lvlIdx(p.levelMin) || lvlIdx(level) > lvlIdx(p.levelMax)) throw new Error(`编制职级须在 ${p.levelMin}—${p.levelMax} 内`);
      const ids = [];
      for (let i = 0; i < count; i++) {
        const id = nextId(pd, 'hc', 'NH');
        pd.cur.headcounts.push({ id, code: nextCode(pd, 'hc'), positionId, level, state: '可用', personId: null, demandId: null }); // 每个名额独立编码
        ids.push(id);
      }
      return { ids };
    },
    removeHeadcounts({ pd, payload }) {
      const { positionId, level, count } = payload;
      const pool = G.availableHcs(pd.cur, positionId, level);
      if (!Number.isInteger(count) || count < 1) throw new Error('数量必须为正整数');
      if (pool.length < count) throw new Error(`该职级可用编制仅 ${pool.length} 个，不足以减编 ${count} 个`); // HC-07
      const removed = pool.slice(0, count).map(h => h.id);
      pd.cur.headcounts = pd.cur.headcounts.filter(h => !removed.includes(h.id)); // 预留/Offer 占用不参与
      return { removed };
    },
    moveHeadcounts({ pd, payload }) {
      const { fromPositionId, toPositionId, level, count } = payload;
      const to = G.position(pd.cur, toPositionId);
      if (!to) throw new Error('目标职位不存在');
      if (to.status === '停用') throw new Error('目标职位已停用');
      if (toPositionId === fromPositionId) throw new Error('目标职位与来源相同'); // HC-10
      if (lvlIdx(level) < lvlIdx(to.levelMin) || lvlIdx(level) > lvlIdx(to.levelMax))
        throw new Error(`编制职级 ${level} 不在目标职位 ${to.name} 允许范围（${to.levelMin}—${to.levelMax}）内`); // HC-09
      const pool = G.availableHcs(pd.cur, fromPositionId, level);
      if (!Number.isInteger(count) || count < 1 || pool.length < count) throw new Error(`来源该职级可用编制仅 ${pool.length} 个`);
      const moved = pool.slice(0, count).map(h => h.id);
      moved.forEach(id => { G.hc(pd.cur, id).positionId = toPositionId; }); // 身份、职级不变（HC-10）
      return { moved };
    },
    matchPreview({ pd, payload }) { // HC-11：预览不修改数据
      const persons = pd.cur.persons.filter(p => p.status === '在职' && p.kind === 'employee' && p.positionId === payload.positionId && !p.headcountId);
      const pool = G.availableHcs(pd.cur, payload.positionId);
      const pairs = [];
      for (let i = 0; i < Math.min(persons.length, pool.length); i++) pairs.push({ personId: persons[i].id, personName: persons[i].name, level: persons[i].level, hcId: pool[i].id, hcCode: pool[i].code });
      return { pairs, personCount: persons.length, poolCount: pool.length };
    },
    applyAutoMatch({ pd, payload }) {
      const { pairs } = OPS.matchPreview({ pd, payload });
      if (!pairs.length) throw new Error('当前没有可匹配的人员与空编组合'); // HC-12
      pairs.forEach(pair => {
        const p = G.person(pd.cur, pair.personId), h = G.hc(pd.cur, pair.hcId);
        p.headcountId = h.id; h.state = '占编'; h.personId = p.id; // HC-13：应用后人员标占编，可用减少
      });
      return { matched: pairs.length };
    },

    /* ---- 兼职（PT-02；addPost 仅自测 PTKEEP 用，界面不提供新增兼职） ---- */
    cancelPost({ pd, payload }) {
      const t = G.post(pd.cur, payload.postId);
      if (!t || t.status !== '有效') throw new Error('兼职关系不存在或已取消');
      pd.cur.posts = pd.cur.posts.filter(x => x.id !== payload.postId); // 主职与主职编制不变
      return {};
    },
    addPost({ pd, payload }) {
      const id = nextId(pd, 'post', 'NPT');
      pd.cur.posts.push({ id, personId: payload.personId, mainPositionId: payload.mainPositionId, concurrentPositionId: payload.concurrentPositionId, status: '有效' });
      return { id };
    },

    /* ---- 提交与演示流转（SUB、APR、EFF） ---- */
    submit({ plan, pd }) {
      if (!EDITABLE_STATUS.includes(plan.status)) throw new Error('当前状态不可提交');
      const pending = computePending(plan);
      if (pending.length) throw new Error('存在未解决的待处理事项，不能提交'); // FUT-02、SUB-01
      if (!pd.lastPersistOk) throw new Error('存在未成功暂存的变更，请先重试暂存'); // AT-61
      const v = pd.versions.length + 1;
      pd.versions.push({ v, submittedAt: fmtNow(), snapshot: clone(pd.cur), approvals: [], returnComment: null });
      plan.status = STATUS.REVIEWING; // SUB-03：进入只读，不重复确认
      return { version: v };
    },
    demoApprove({ plan, pd }) {
      if (plan.status !== STATUS.REVIEWING) throw new Error('仅审批中方案可通过');
      const v = pd.versions[pd.versions.length - 1];
      v.approvals.push({ action: '通过', at: fmtNow(), comment: null });
      plan.status = STATUS.PENDING; // EFF-01：保留计划生效日期，不等于已生效
      return {};
    },
    demoReturn({ plan, pd, payload }) {
      if (plan.status !== STATUS.REVIEWING) throw new Error('仅审批中方案可退回');
      const v = pd.versions[pd.versions.length - 1];
      v.approvals.push({ action: '退回', at: fmtNow(), comment: (payload && payload.comment) || '' });
      v.returnComment = (payload && payload.comment) || '';
      plan.status = STATUS.RETURNED; // APR-02：回工作台保留内容，重提须再走确认
      return {};
    },
    demoExecuteSuccess({ plan, pd }) {
      if (plan.status !== STATUS.PENDING) throw new Error('仅待生效方案可执行');
      plan.status = STATUS.EFFECTIVE; plan.completedAt = fmtNow(); // EFF-02
      return {};
    },
    demoExecuteFail({ plan, pd, payload }) {
      if (plan.status !== STATUS.PENDING) throw new Error('仅待生效方案可模拟异常');
      plan.status = STATUS.ABNORMAL; plan.errorReason = (payload && payload.reason) || '执行异常（演示）';
      return {};
    }
  };

  /* ---- 组织/职位移动校验（ORG-10、POS-08） ---- */
  function validateMoveOrg(plan, pd, orgId, newParentId) {
    const o = G.org(pd.cur, orgId);
    if (!o) return '组织不存在';
    if (!newParentId) return null; // 移到根级（Demo 数据均有上级，一般不出现）
    const target = G.org(pd.cur, newParentId);
    if (!target) return '目标组织不存在';
    if (newParentId === orgId) return '不能移动到自身';
    if (G.descendantIds(pd.cur, orgId, true).includes(newParentId)) return '不能移动到自身或其下级组织'; // 防循环
    if (target.status === '停用') return '不能移动到已停用组织';
    if (!scopeOrgIds(plan).has(newParentId)) return '目标组织不在调整范围内，请先加入范围'; // ORG-10
    return null;
  }
  function moveOrgMutate(pd, orgId, newParentId) {
    const o = G.org(pd.cur, orgId);
    o.parentId = newParentId; // BR-01：完整子树跟随（子组织引用 parentId，自动跟随）；身份不变
    o.order = G.childrenOrgs(pd.cur, newParentId).length + 1;
  }
  function validateMovePositions(plan, pd, positionIds, targetOrgId) {
    const target = G.org(pd.cur, targetOrgId);
    if (!target) return '目标组织不存在';
    if (target.status === '停用') return '不能移动到已停用组织';
    if (!scopeOrgIds(plan).has(targetOrgId)) return '目标组织不在调整范围内，请先加入范围'; // POS-08 同 ORG-10
    for (const id of positionIds) {
      const p = G.position(pd.cur, id);
      if (!p) return '职位不存在';
      if (p.status === '停用') return '已停用职位不可移动';
      if (p.orgId === targetOrgId) return '目标组织与当前相同';
    }
    return null;
  }

  /* ---------------- apply 单一入口 ---------------- */
  function apply(planId, type, payload) {
    if (type === 'createPlan') { // 无方案的顶层操作
      try {
        const result = OPS.createPlan({ payload: payload || {} }) || {};
        let persisted = true;
        try { persist(); } catch (e) { persisted = false; }
        return Object.assign({ ok: true, persisted, persistError: persisted ? null : '暂存失败' }, result);
      } catch (e) { return { ok: false, error: e.message }; }
    }
    const plan = db.plans.find(p => p.id === planId);
    if (!plan) return { ok: false, error: '方案不存在' };
    const pd = db.planData[planId];
    const before = clone(pd.cur), beforePlan = clone(plan);
    try {
      const fn = OPS[type];
      if (!fn) throw new Error('未知操作');
      if (!EDITABLE_STATUS.includes(plan.status) && !type.startsWith('demo') && type !== 'submit' && type !== 'discardPlan')
        throw new Error('方案当前状态不可编辑'); // UI-05：写操作关闭
      const result = fn({ plan, pd, payload: payload || {} }) || {};
      assertGraph(pd.cur);
      plan.updatedAt = fmtNow();
      let persisted = true;
      try { persist(); pd.lastPersistOk = true; } catch (e) { persisted = false; pd.lastPersistOk = false; } // AT-61
      if (result && result.rowErrors) return { ok: false, rowErrors: result.rowErrors, error: '存在不能确认的行', persisted, persistError: persisted ? null : '暂存失败' }; // PER-10
      return Object.assign({ ok: true, persisted, persistError: persisted ? null : '暂存失败' }, result);
    } catch (e) {
      db.planData[planId].cur = before; // 取消/失败零残留（UI-01、12.3）
      db.plans[db.plans.findIndex(p => p.id === planId)] = beforePlan;
      try { persist(); } catch (e2) { /* 忽略 */ }
      if (e.message === 'PERSIST_FAIL') return { ok: true, persisted: false, persistError: '暂存失败' };
      return { ok: false, error: e.message };
    }
  }

  /* ---------------- 对外读取接口 ---------------- */
  function getPlans() { return db.plans.slice().sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')); } // LIST-01
  function getPlan(id) { return db.plans.find(p => p.id === id) || null; }
  function getPlanData(id) { return db.planData[id] || null; }
  function resetPlan(id) { const p = getPlan(id); if (!p) return; db.planData[id] = buildPlanData(p); p.targetScopeIds = []; p.status = STATUS.DRAFT; delete p.completedAt; delete p.errorReason; p.updatedAt = fmtNow(); persist(true); }
  function resetAll() { db = defaultDb(); persist(true); ensureReactive(); }
  function setDemoFlag(k, v) { demoFlags[k] = v; saveDemoFlags(); }
  function getDemoFlags() { return clone(demoFlags); }
  function getUiState(planId) { try { return JSON.parse(LS.get(KEY_UI + planId) || '{}'); } catch (e) { return {}; } }
  function setUiState(planId, s) { LS.set(KEY_UI + planId, JSON.stringify(s || {})); }
  function scopeInfo(plan) { return { scope: Array.from(scopeOrgIds(plan)), context: Array.from(contextOrgIds(plan)) }; }
  function orgTree(planId, opts) { // 全量树（新建方案选择器用 universe 图；工作台用 cur）
    const pd = db.planData[planId];
    const g = (opts && opts.full) ? OA.seed.UNIVERSES[getPlan(planId).universe]() : pd.cur;
    const build = pid => G.childrenOrgs(g, pid).map(o => ({ id: o.id, name: o.name, status: o.status, children: build(o.id) }));
    return build(null);
  }
  function universeTree(universe) { // 新建方案：从种子图取全量组织树
    const g = OA.seed.UNIVERSES[universe]();
    const build = pid => G.childrenOrgs(g, pid).map(o => ({ id: o.id, name: o.name, status: o.status, children: build(o.id) }));
    return build(null);
  }
  function scopeTree(planId) { // 工作台左树：范围 + 必要祖先上下文（ORG-04）
    const plan = getPlan(planId), g = db.planData[planId].cur;
    const scope = scopeOrgIds(plan), ctx = contextOrgIds(plan);
    const include = id => scope.has(id) || ctx.has(id);
    const build = pid => G.childrenOrgs(g, pid).filter(o => include(o.id)).map(o => ({ id: o.id, name: o.name, status: o.status, inScope: scope.has(o.id), children: build(o.id) }));
    return build(null);
  }

  root.OA = root.OA || {};
  root.OA.store = {
    load, apply, getPlans, getPlan, getPlanData, resetPlan, resetAll,
    setDemoFlag, getDemoFlags, getUiState, setUiState,
    scopeInfo, orgTree, universeTree, scopeTree, computePending, diffPlan, diffCounts, orgChangeTags, positionChangeTags,
    CNT, G, STATUS, LEVELS, EDITABLE_STATUS, _internals: { OPS, validateTransfer: OPS.validateTransfer, scopeOrgIds }
  };
})(typeof window !== 'undefined' ? window : globalThis);
