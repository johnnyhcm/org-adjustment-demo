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
  const SCHEMA = 7; // v7：方案新增 adjustLevel/adjustReason（PRD F-01）；旧数据自动重建
  const FEATURES = { concurrentPost: false }; // Demo 展示开关（TECH 5.8）：false 时不渲染兼职 UI，数据层不变

  const LEVELS = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'].flatMap(g => [1, 2, 3, 4].map(n => g + '-' + n)); // 统一“序列-级-档”顺序
  const LEVEL_ALIASES = { P1: 'P1-1', P2: 'P2-1', P3: 'P3-2', P4: 'P4-2', P5: 'P5-1', P6: 'P6-1' }; // 兼容旧裸职级输入
  const canonicalLevel = l => LEVEL_ALIASES[l] || l;
  const STATUS = { DRAFT: '草稿', REVIEWING: '审批中', RETURNED: '退回修改', PENDING: '待生效', EFFECTIVE: '已生效', ABNORMAL: '生效异常', DISCARDED: '已作废' };
  const EDITABLE_STATUS = [STATUS.DRAFT, STATUS.RETURNED];
  const HISTORY_LIMIT = 50;
  /* 方案分类字段（PRD 0.5 之后新增，F-01）：选项与提示语只写一处，页面只渲染 */
  const ADJUST_LEVELS = ['BU/条线级', 'BU下设一级', 'BU下设二级', '其他'];
  const ADJUST_REASONS = ['外部原因', '内部原因'];
  const REASON_HINTS = {
    外部原因: '由组织外部环境变化引发的调整需求，这些因素通常超出组织控制范围。如市场环境、政策法规、战略调整、竞对变化等',
    内部原因: '外部环境未发生重大变化的情况下，组织内部自身因素变化引发的调整需求'
  };

  const clone = o => JSON.parse(JSON.stringify(o));
  const lvlIdx = l => LEVELS.indexOf(canonicalLevel(l));
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
    return { base: clone(graph), cur: graph, versions: [], seq: { org: 0, position: 0, hc: 0, person: 0, post: 0, demand: 0 }, history: { undo: [], redo: [] }, revision: 0, lastPersistOk: true };
  }
  function ensureHistory(pd) {
    if (!pd.history || typeof pd.history !== 'object') pd.history = { undo: [], redo: [] };
    if (!Array.isArray(pd.history.undo)) pd.history.undo = [];
    if (!Array.isArray(pd.history.redo)) pd.history.redo = [];
    if (pd.history.undo.length > HISTORY_LIMIT) pd.history.undo = pd.history.undo.slice(-HISTORY_LIMIT);
    if (pd.history.redo.length > HISTORY_LIMIT) pd.history.redo = pd.history.redo.slice(-HISTORY_LIMIT);
    return pd.history;
  }
  function checkRevision(planId) {
    const raw = LS.get(KEY_DATA + planId);
    if (raw && (JSON.parse(raw).revision || 0) !== (db.planData[planId].revision || 0))
      throw new Error('方案已在其他窗口更新，请刷新后继续');
  }
  function persist(force, planId) {
    if (!force && demoFlags.persistFail) throw new Error('PERSIST_FAIL'); // AT-61 故障注入
    if (planId) checkRevision(planId);
    const plans = planId ? db.plans.filter(p => p.id === planId) : db.plans;
    const index = planId ? JSON.parse(LS.get(KEY_PLANS) || '[]') : [];
    plans.forEach(p => {
      const i = index.findIndex(x => x.id === p.id);
      if (i >= 0) index[i] = p; else index.push(p);
    });
    LS.set(KEY_PLANS, JSON.stringify(index));
    LS.set(KEY_SCHEMA, String(SCHEMA));
    plans.forEach(p => {
      const pd = db.planData[p.id];
      const raw = LS.get(KEY_DATA + p.id), stored = raw ? JSON.parse(raw) : null;
      const revision = Math.max(pd.revision || 0, stored ? stored.revision || 0 : 0) + 1;
      LS.set(KEY_DATA + p.id, JSON.stringify(Object.assign({}, pd, { revision, meta: p })));
      pd.revision = revision;
    });
  }
  function load() {
    if (hasLS && localStorage.getItem(KEY_SCHEMA) === String(SCHEMA) && localStorage.getItem(KEY_PLANS)) {
      try {
        db = { schema: SCHEMA, plans: JSON.parse(localStorage.getItem(KEY_PLANS)), planData: {} };
        db.plans.forEach(p => {
          const raw = localStorage.getItem(KEY_DATA + p.id);
          const pd = raw ? JSON.parse(raw) : buildPlanData(p);
          if (pd.meta) { Object.assign(p, pd.meta); delete pd.meta; }
          db.planData[p.id] = pd;
          ensureHistory(pd);
        });
        const d = LS.get(KEY_DEMO); if (d) demoFlags = JSON.parse(d);
        ensureReactive();
        return;
      } catch (e) { /* 损坏则重建 */ }
    }
    db = defaultDb(); try { persist(true); } catch (e) { /* 忽略首建失败 */ }
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

  function historyEligible(type) {
    return !['undo', 'redo', 'submit', 'discardPlan', 'matchPreview'].includes(type) && !type.startsWith('demo');
  }
  function historyLabel(type, payload, result, before) {
    const labels = {
      addOrg: '新增组织', editOrg: '编辑组织', copyOrg: '复制组织', moveOrg: '移动组织', stopOrg: '停用组织', toggleOrg: '启用／停用组织',
      addPosition: '新增职位', editPosition: '编辑职位', copyPosition: '复制职位', movePositions: '整体移动职位', togglePosition: '启用／停用职位', togglePositions: '批量停用职位',
      transferPersons: '人员调岗', releaseHeadcount: '解除编制', releaseHeadcounts: '批量解除编制', addHeadcounts: '增编', removeHeadcounts: '减编', removeHeadcountsByIds: '减编',
      moveHeadcounts: '移动空编', moveHeadcountsByIds: '移动空编', applyAutoMatch: '自动匹配', cancelPost: '取消兼职', extendScope: '补充调整范围', reorderOrgs: '组织排序', reorderPositions: '职位排序'
    };
    const g = before.cur;
    const org = G.org(g, payload.id || payload.orgId);
    const position = G.position(g, payload.id || payload.positionId);
    const person = G.person(g, payload.personId);
    let note = payload.name || (org && org.name) || (position && position.name) || (person && person.name) || '';
    if (type === 'transferPersons') note = (payload.rows || []).length + ' 人';
    if (type === 'releaseHeadcounts') note = result.released.length + ' 人';
    if (type === 'togglePositions') note = result.changed.length + ' 个职位';
    if (type === 'movePositions') note = (payload.positionIds || []).length + ' 个职位';
    if (type === 'copyOrg') note += `（${result.orgCount} 个组织、${result.positionCount} 个职位）`;
    return (labels[type] || type) + (note ? '：' + note : '');
  }
  function stateSnapshot(plan, pd) {
    const meta = {};
    ['name', 'effDate', 'adjustLevel', 'adjustReason', 'desc', 'sourceScopeIds', 'targetScopeIds'].forEach(k => { meta[k] = plan[k]; });
    return { cur: clone(pd.cur), plan: clone(meta) };
  }
  function contentSignature(state) {
    const plan = clone(state.plan);
    delete plan.updatedAt;
    return JSON.stringify({ cur: state.cur, plan });
  }
  function sameState(a, b) { return contentSignature(a) === contentSignature(b); }
  function clearHistory(pd) { pd.history = { undo: [], redo: [] }; }
  function pushHistory(pd, frame) {
    const h = ensureHistory(pd);
    h.undo = h.undo.concat(frame).slice(-HISTORY_LIMIT);
    h.redo = [];
  }
  function restoreState(plan, pd, state) {
    pd.cur = clone(state.cur);
    Object.assign(plan, clone(state.plan));
  }

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
  function requiredOrgFields(g, o, base) {
    const fields = [];
    if (!(o.name || '').trim()) fields.push('组织名称');
    const original = base && G.org(base, o.id);
    const isRoot = original && !original.parentId;
    if ((!o.parentId && !isRoot) || (o.parentId && !G.org(g, o.parentId))) fields.push('上级组织');
    return fields;
  }

  function computePending(plan) {
    const pd = db.planData[plan.id], g = pd.cur, out = [];
    const scope = scopeOrgIds(plan);
    g.orgs.filter(o => scope.has(o.id) && o.status === '有效').forEach(o => {
      const fields = requiredOrgFields(g, o, pd.base);
      if (fields.length) out.push({ kind: 'org-required', id: o.id, fields, message: `缺少必填字段：${fields.join('、')}` });
    });
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

  function previewCopyOrg(plan, payload) {
    const pd = db.planData[plan.id], g = pd.cur;
    const src = G.org(g, payload && payload.id);
    if (!src) throw new Error('组织不存在');
    const copyDescendants = !!(payload && payload.copyDescendants);
    const copyPositions = !!(payload && payload.copyPositions);
    const allOrgIds = [src.id];
    const walk = parentId => {
      G.childrenOrgs(g, parentId).filter(o => o.status === '有效').forEach(o => { allOrgIds.push(o.id); walk(o.id); });
    };
    walk(src.id);
    const orgIds = copyDescendants ? allOrgIds : [src.id];
    const orgSet = new Set(orgIds);
    const positions = g.positions.filter(p => orgSet.has(p.orgId) && p.status === '有效')
      .sort((a, b) => (a.orgId === b.orgId ? a.order - b.order : a.orgId.localeCompare(b.orgId)));
    return {
      src, orgIds, positions, copyDescendants, copyPositions,
      orgCount: orgIds.length,
      positionCount: copyPositions ? positions.length : 0,
      availableOrgCount: allOrgIds.length,
      availablePositionCount: positions.length
    };
  }

  function previewStopOrg(plan, orgId) {
    const pd = db.planData[plan.id], g = pd.cur, org = G.org(g, orgId);
    if (!org) throw new Error('组织不存在');
    const orgIds = G.descendantIds(g, orgId, true);
    const orgSet = new Set(orgIds);
    const positions = g.positions.filter(p => orgSet.has(p.orgId));
    const positionIds = new Set(positions.map(p => p.id));
    const employees = g.persons.filter(p => p.status === '在职' && p.kind === 'employee' && positionIds.has(p.positionId));
    const future = g.persons.filter(p => p.status === '未来' && positionIds.has(p.targetPositionId));
    const headcounts = g.headcounts.filter(h => positionIds.has(h.positionId));
    const childOrgIds = orgIds.filter(id => id !== orgId);
    const directPositions = positions.filter(p => p.orgId === orgId);
    return { org, orgIds, childOrgIds, positions, directPositions, employees, future, headcounts };
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
        res.orgs.push({ id, changeType: '变更', name: co.name, fields, reason });
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
        res.positions.push({ id, changeType: '变更', name: cp.name, fields, reason });
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
        res.persons.push({ id, changeType: '变更', name: cp.name, fields, reason });
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
        res.headcounts.push({ id, changeType: '变更', name: ch.code, fields, reason });
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
      if (fields.length) res.posts.push({ id, changeType: '变更', name: labelPerson(c, ct.personId), fields, reason: '随职位整体迁移' });
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
        res.futureItems.push({ id, changeType: '变更', name: cp.name, fields, reason });
      }
    });
    return res;
  }
  function diffCounts(plan) { // CNT-10：发生最终差异的对象数（数据层始终六类）
    const d = diffPlan(plan);
    return { 组织: d.orgs.length, 职位: d.positions.length, 人员: d.persons.length, 编制: d.headcounts.length, 兼职: d.posts.length, 未来事项: d.futureItems.length };
  }
  function diffCountsVisible(plan) { // PRD 0.5：展示层页签/计数；关闭时只呈现五类
    const c = diffCounts(plan);
    if (!FEATURES.concurrentPost) delete c['兼职'];
    return c;
  }

  /* ---------------- 变化标签（ORG-02/03、POS-03） ---------------- */
  function orgChangeTags(plan, id) {
    const pd = db.planData[plan.id], bo = G.org(pd.base, id), co = G.org(pd.cur, id);
    if (co.status === '停用') return ['停用']; // ORG-03：停用优先显示（含新增后停用）
    if (!bo) return ['新增'];
    const d = diffPlan(plan).orgs.find(r => r.id === id);
    return d && d.fields.length ? ['变更'] : []; // WB-09：已有对象的任何属性变化统一为“变更”
  }
  function positionChangeTags(plan, id) {
    const pd = db.planData[plan.id], bp = G.position(pd.base, id), cp = G.position(pd.cur, id);
    if (cp.status === '停用') return ['停用']; // 同 ORG-03：停用优先
    if (!bp) return ['新增'];
    const d = diffPlan(plan).positions.find(r => r.id === id);
    return d && d.fields.length ? ['变更'] : [];
  }

  /* ---------------- 操作（全部经 apply 单一入口） ---------------- */
  const OPS = {
    /* ---- 方案 ---- */
    createPlan({ payload }) {
      const name = (payload.name || '').trim();
      if (!name) throw new Error('请填写方案名称');
      if (!ADJUST_LEVELS.includes(payload.adjustLevel)) throw new Error('请选择调整层级');
      if (!ADJUST_REASONS.includes(payload.adjustReason)) throw new Error('请选择调整原因');
      if (!payload.scopeOrgIds || !payload.scopeOrgIds.length) throw new Error('请选择调整范围');
      if (!payload.effDate) throw new Error('请选择生效日期');
      const universe = payload.universe || 'case1';
      const g = OA.seed.UNIVERSES[universe]();
      payload.scopeOrgIds.forEach(id => { if (!G.org(g, id)) throw new Error('调整范围包含不存在的组织'); });
      const id = 'plan-' + Date.now().toString(36) + Math.floor(Math.random() * 1000);
      db.plans.push({
        id, universe, name, effDate: payload.effDate,
        adjustLevel: payload.adjustLevel, adjustReason: payload.adjustReason, desc: payload.desc || '',
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
    stopOrg({ plan, pd, payload }) {
      const preview = previewStopOrg(plan, payload.orgId);
      const org = preview.org;
      if (org.status !== '有效') throw new Error('仅有效组织可停用');
      const mode = payload.mode === 'transfer' ? 'transfer' : 'manual';
      if (mode === 'transfer') {
        const targetId = payload.targetOrgId;
        const target = G.org(pd.cur, targetId);
        if (!target) throw new Error('请选择新上级组织');
        if (target.status !== '有效') throw new Error('新上级组织必须有效');
        if (preview.orgIds.includes(targetId)) throw new Error('新上级组织不能是当前组织或其下级');
        if (!scopeOrgIds(plan).has(targetId)) throw new Error('新上级组织不在调整范围内，请先加入范围');
        let orgOrder = G.childrenOrgs(pd.cur, targetId).length + 1;
        G.childrenOrgs(pd.cur, org.id).forEach(child => { child.parentId = targetId; child.order = orgOrder++; });
        let posOrder = pd.cur.positions.filter(p => p.orgId === targetId).length + 1;
        preview.directPositions.slice().sort((a, b) => a.order - b.order).forEach(p => { p.orgId = targetId; p.order = posOrder++; });
        org.status = '停用';
        return { mode, targetOrgId: targetId, movedOrgIds: preview.childOrgIds.slice(), movedPositionIds: preview.directPositions.map(p => p.id) };
      }
      org.status = '停用';
      const stopDescendantOrgs = !!payload.stopDescendantOrgs;
      const stopSubtreePositions = !!payload.stopSubtreePositions;
      const stoppedPositionIds = [];
      if (stopDescendantOrgs) {
        preview.childOrgIds.forEach(id => { const child = G.org(pd.cur, id); if (child && child.status === '有效') child.status = '停用'; });
      }
      if (stopSubtreePositions) {
        preview.positions.forEach(p => { if (p.status === '有效') { p.status = '停用'; stoppedPositionIds.push(p.id); } });
      }
      return { mode, stoppedOrgIds: [org.id].concat(stopDescendantOrgs ? preview.childOrgIds : []), stoppedPositionIds };
    },
    copyOrg({ plan, pd, payload }) {
      const preview = previewCopyOrg(plan, payload || {});
      const src = preview.src;
      const name = payload.name === undefined ? (src.name || '') + '副本' : (payload.name || '').trim();
      const parentId = payload.parentId === undefined ? src.parentId : (payload.parentId || null);
      const parent = parentId ? G.org(pd.cur, parentId) : null;
      if (!parentId) throw new Error('请选择上级组织');
      if (parentId && !parent) throw new Error('上级组织不存在');
      if (parent && parent.status === '停用') throw new Error('不能复制到已停用组织下');
      if (!name) throw new Error('请填写组织名称');
      const orgMap = {};
      const newOrgIds = [];
      preview.orgIds.forEach(sourceId => {
        const source = G.org(pd.cur, sourceId);
        const isRoot = sourceId === src.id;
        const newId = nextId(pd, 'org', 'NO');
        const newParentId = isRoot ? parentId : orgMap[source.parentId];
        if (!isRoot && !newParentId) throw new Error('复制下级组织层级失败');
        const newOrg = {
          id: newId,
          name: isRoot ? name : (source.name || ''),
          code: nextCode(pd, 'org'),
          parentId: newParentId || null,
          order: 1,
          status: '有效',
          setupDate: plan.effDate,
          leaderId: isRoot ? (payload.leaderId || null) : null,
          hrbpId: isRoot ? (payload.hrbpId || null) : null
        };
        const siblings = G.childrenOrgs(pd.cur, newParentId);
        newOrg.order = siblings.length + 1;
        pd.cur.orgs.push(newOrg);
        orgMap[sourceId] = newId;
        newOrgIds.push(newId);
        if (!plan.targetScopeIds.includes(newId)) plan.targetScopeIds.push(newId);
      });
      const newPositionIds = [];
      if (preview.copyPositions) {
        const orderByOrg = {};
        preview.positions.forEach(source => {
          const newOrgId = orgMap[source.orgId];
          orderByOrg[newOrgId] = (orderByOrg[newOrgId] || 0) + 1;
          const id = nextId(pd, 'position', 'NP');
          pd.cur.positions.push({
            id,
            name: source.name,
            code: nextCode(pd, 'position'),
            orgId: newOrgId,
            order: orderByOrg[newOrgId],
            status: '有效',
            setupDate: plan.effDate,
            levelMin: source.levelMin,
            levelMax: source.levelMax
          });
          newPositionIds.push(id);
        });
      }
      return { id: orgMap[src.id], orgIds: newOrgIds, positionIds: newPositionIds, orgCount: newOrgIds.length, positionCount: newPositionIds.length };
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
      const levelMin = canonicalLevel(payload.levelMin), levelMax = canonicalLevel(payload.levelMax);
      if (lvlIdx(levelMin) < 0 || lvlIdx(levelMax) < 0) throw new Error('请选择职级范围');
      if (lvlIdx(levelMin) > lvlIdx(levelMax)) throw new Error('最低职级不能高于最高职级');
      const id = nextId(pd, 'position', 'NP');
      pd.cur.positions.push({
        id, name, code: nextCode(pd, 'position'), orgId: payload.orgId,
        order: pd.cur.positions.filter(p => p.orgId === payload.orgId).length + 1,
        status: '有效', setupDate: plan.effDate, levelMin, levelMax
      });
      return { id };
    },
    editPosition({ pd, payload }) {
      const p = G.position(pd.cur, payload.id);
      if (!p) throw new Error('职位不存在');
      if (p.status === '停用') throw new Error('已停用职位不可编辑');
      if (payload.name !== undefined) { if (!(payload.name || '').trim()) throw new Error('职位名称不能为空'); p.name = payload.name.trim(); }
      if (payload.levelMin !== undefined) p.levelMin = canonicalLevel(payload.levelMin);
      if (payload.levelMax !== undefined) p.levelMax = canonicalLevel(payload.levelMax);
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
    togglePositions({ pd, payload }) {
      const ids = Array.from(new Set(payload.positionIds || []));
      const wanted = payload.action === '启用' ? '停用' : '有效';
      const valid = ids.map(id => G.position(pd.cur, id)).filter(p => p && p.status === wanted);
      if (!valid.length) throw new Error(payload.action === '启用' ? '所选职位均已启用' : '所选职位均已停用');
      valid.forEach(p => { p.status = payload.action === '启用' ? '有效' : '停用'; });
      return { changed: valid.map(p => p.id), skipped: ids.length - valid.length };
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
        // PER-12（2026-11-10）：下属自动更新直接上级，默认取下属所在组织负责人；
        // 负责人缺失或等于被调人时，回退到被调人原/新上级。不改变下属主职、职位、编制和兼职。
        G.subordinatesOf(pd.cur, r.personId).forEach(s => {
          const sp = G.position(pd.cur, s.positionId);
          const so = sp ? G.org(pd.cur, sp.orgId) : null;
          let next = so && so.leaderId ? so.leaderId : null;
          if (!next || next === r.personId || next === s.id) {
            next = oldManagerId && oldManagerId !== s.id ? oldManagerId : r.managerId;
          }
          if (next && next !== s.id) s.managerId = next;
        });
      });
      return {};
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
    releaseHeadcounts({ pd, payload }) {
      const ids = Array.from(new Set(payload.personIds || []));
      const targets = ids.map(id => G.person(pd.cur, id)).filter(p => p && p.status === '在职' && p.headcountId);
      if (!targets.length) throw new Error('所选人员均未占编');
      targets.forEach(p => {
        const h = G.hc(pd.cur, p.headcountId);
        h.state = '可用'; h.personId = null; p.headcountId = null;
      });
      return { released: targets.map(p => p.id), skipped: ids.length - targets.length };
    },
    addHeadcounts({ plan, pd, payload }) {
      const { positionId, count } = payload;
      const level = canonicalLevel(payload.level);
      const p = G.position(pd.cur, positionId);
      if (!p) throw new Error('职位不存在');
      if (!Number.isInteger(count) || count < 1) throw new Error('数量必须为正整数'); // HC-06
      if (lvlIdx(level) < lvlIdx(p.levelMin) || lvlIdx(level) > lvlIdx(p.levelMax)) throw new Error(`编制职级须在 ${p.levelMin}—${p.levelMax} 内`);
      const ids = [];
      for (let i = 0; i < count; i++) {
        const id = nextId(pd, 'hc', 'NH');
        pd.cur.headcounts.push({ id, code: nextCode(pd, 'hc'), positionId, level, category: 'C', state: '可用', personId: null, demandId: null }); // 每个名额独立编码
        ids.push(id);
      }
      return { ids };
    },
    removeHeadcounts({ pd, payload }) {
      const { positionId, count } = payload;
      const level = canonicalLevel(payload.level);
      const pool = G.availableHcs(pd.cur, positionId, level);
      if (!Number.isInteger(count) || count < 1) throw new Error('数量必须为正整数');
      if (pool.length < count) throw new Error(`该职级可用编制仅 ${pool.length} 个，不足以减编 ${count} 个`); // HC-07
      const removed = pool.slice(0, count).map(h => h.id);
      pd.cur.headcounts = pd.cur.headcounts.filter(h => !removed.includes(h.id)); // 预留/Offer 占用不参与
      return { removed };
    },
    removeHeadcountsByIds({ pd, payload }) { // HC-18：按具体编码减编
      const ids = Array.from(new Set(payload.headcountIds || []));
      if (!ids.length) throw new Error('请选择要减编的空编');
      const hcs = ids.map(id => G.hc(pd.cur, id));
      if (hcs.some(h => !h)) throw new Error('部分编制不存在');
      if (hcs.some(h => h.state !== '可用')) throw new Error('只能减可用空编，需求/Offer 占用不可减编');
      pd.cur.headcounts = pd.cur.headcounts.filter(h => !ids.includes(h.id));
      return { removed: ids };
    },
    moveHeadcounts({ pd, payload }) {
      const { fromPositionId, toPositionId, count } = payload;
      const level = canonicalLevel(payload.level);
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
    moveHeadcountsByIds({ pd, payload }) { // HC-09/10（2026-11-10）：按具体编码迁移，保留身份/职级/类别
      const ids = Array.from(new Set(payload.headcountIds || []));
      if (!ids.length) throw new Error('请选择要变更的空编');
      const to = G.position(pd.cur, payload.targetPositionId);
      if (!to) throw new Error('目标职位不存在');
      if (to.status === '停用') throw new Error('目标职位已停用');
      if (!G.isOrgEffective(pd.cur, to.orgId)) throw new Error('目标职位所属组织已停用');
      const hcs = ids.map(id => G.hc(pd.cur, id));
      if (hcs.some(h => !h)) throw new Error('部分编制不存在');
      if (hcs.some(h => h.state !== '可用')) throw new Error('只能变更可用空编，需求/Offer 占用不可迁移');
      if (hcs.every(h => h.positionId === to.id)) throw new Error('目标职位与当前职位相同');
      const bad = hcs.find(h => lvlIdx(h.level) < lvlIdx(to.levelMin) || lvlIdx(h.level) > lvlIdx(to.levelMax));
      if (bad) throw new Error(`编制 ${bad.code} 职级 ${bad.level} 不在目标职位 ${to.name} 允许范围（${to.levelMin}—${to.levelMax}）内`);
      hcs.forEach(h => { h.positionId = to.id; });
      return { moved: ids };
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
      if (!hasChange(plan)) throw new Error('暂无调整内容'); // 12.3：无最终差异不可提交（纯排序除外）
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
    payload = payload || {};
    if (type === 'createPlan') {
      try {
        const result = OPS.createPlan({ payload });
        const pd = db.planData[result.planId];
        let persisted = true;
        try { persist(false, result.planId); } catch (e) { persisted = false; pd.lastPersistOk = false; }
        return Object.assign({ ok: true, persisted, persistError: persisted ? null : '暂存失败' }, result);
      } catch (e) { return { ok: false, error: e.message }; }
    }
    const plan = getPlan(planId), pd = getPlanData(planId);
    if (!plan || !pd) return { ok: false, error: '方案不存在' };
    try { checkRevision(planId); } catch (e) { return { ok: false, error: e.message }; }
    const h = ensureHistory(pd), beforeState = stateSnapshot(plan, pd);
    const beforePlan = clone(plan), beforeSeq = clone(pd.seq), beforePersistOk = pd.lastPersistOk;
    const beforeHistory = { undo: clone(h.undo), redo: clone(h.redo) };
    const workflow = ['submit', 'discardPlan'].includes(type) || type.startsWith('demo');
    const beforeVersions = workflow ? clone(pd.versions) : null;
    let saveFailed = false;
    try {
      if (!EDITABLE_STATUS.includes(plan.status) && !workflow) throw new Error('方案当前状态不可编辑');
      let result;
      if (type === 'undo' || type === 'redo') result = navigateHistory(plan, pd, type);
      else {
        const fn = OPS[type];
        if (!fn) throw new Error('未知操作');
        result = fn({ plan, pd, payload }) || {};
      }
      if (result.rowErrors) throw Object.assign(new Error('存在不能确认的行'), { rowErrors: result.rowErrors });
      if (type === 'matchPreview') return Object.assign({ ok: true }, result);
      assertGraph(pd.cur);
      const changed = !sameState(beforeState, stateSnapshot(plan, pd));
      if (historyEligible(type) && changed) {
        pushHistory(pd, {
          actionId: 'A' + Date.now().toString(36) + Math.floor(Math.random() * 1000),
          type, label: historyLabel(type, payload, result, beforeState), at: fmtNow(), state: beforeState
        });
      }
      if (['submit', 'demoReturn', 'discardPlan'].includes(type)) clearHistory(pd);
      if (changed || workflow || type === 'undo' || type === 'redo') plan.updatedAt = fmtNow();
      let persisted = true;
      pd.lastPersistOk = true;
      try { persist(false, planId); }
      catch (e) {
        persisted = false; saveFailed = true; pd.lastPersistOk = false;
        if (workflow) throw new Error('流程变更未成功暂存，请重试暂存后再操作');
      }
      return Object.assign({ ok: true, persisted, persistError: persisted ? null : '暂存失败' }, result);
    } catch (e) {
      pd.cur = beforeState.cur;
      pd.seq = beforeSeq;
      pd.history = beforeHistory;
      if (beforeVersions) pd.versions = beforeVersions;
      Object.keys(plan).forEach(k => { if (!Object.prototype.hasOwnProperty.call(beforePlan, k)) delete plan[k]; });
      Object.assign(plan, beforePlan);
      pd.lastPersistOk = saveFailed ? false : beforePersistOk;
      return Object.assign({ ok: false, error: e.message }, e.rowErrors ? { rowErrors: e.rowErrors } : {});
    }
  }

  function navigateHistory(plan, pd, direction) {
    const h = ensureHistory(pd), from = direction === 'undo' ? 'undo' : 'redo', to = from === 'undo' ? 'redo' : 'undo';
    const frame = h[from][h[from].length - 1];
    if (!frame) throw new Error(from === 'undo' ? '没有可撤销的操作' : '没有可重做的操作');
    const inverse = Object.assign({}, frame, { state: stateSnapshot(plan, pd) });
    restoreState(plan, pd, frame.state);
    h[from] = h[from].slice(0, -1);
    h[to] = h[to].concat(inverse);
    return { label: frame.label };
  }
  function undo(planId) { return apply(planId, 'undo'); }
  function redo(planId) { return apply(planId, 'redo'); }
  function historyState(planId) {
    const pd = getPlanData(planId), plan = getPlan(planId);
    const h = pd && pd.history ? pd.history : { undo: [], redo: [] };
    const editable = !!plan && EDITABLE_STATUS.includes(plan.status);
    return {
      undoCount: h.undo.length, redoCount: h.redo.length,
      canUndo: editable && h.undo.length > 0, canRedo: editable && h.redo.length > 0,
      undoLabel: h.undo.length ? h.undo[h.undo.length - 1].label : '',
      redoLabel: h.redo.length ? h.redo[h.redo.length - 1].label : ''
    };
  }

  /* 是否有调整：有最终差异，或发生过纯排序（12.3：无差异不可提交，纯排序除外） */
  function hasChange(plan) {
    const c = diffCounts(plan);
    if (Object.keys(c).some(k => c[k] > 0)) return true;
    const pd = db.planData[plan.id];
    const ordMoved = (bArr, cArr) => cArr.some(o => { const b = bArr.find(x => x.id === o.id); return b && b.order !== o.order; });
    return ordMoved(pd.base.orgs, pd.cur.orgs) || ordMoved(pd.base.positions, pd.cur.positions);
  }

  /* ---------------- 对外读取接口 ---------------- */
  function getPlans() { return db.plans.slice().sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')); } // LIST-01
  function getPlan(id) { return db.plans.find(p => p.id === id) || null; }
  function getPlanData(id) { return db.planData[id] || null; }
  function resetPlan(id) { const p = getPlan(id); if (!p) return; const revision = db.planData[id].revision || 0; db.planData[id] = buildPlanData(p); db.planData[id].revision = revision; p.targetScopeIds = []; p.status = STATUS.DRAFT; delete p.completedAt; delete p.errorReason; p.updatedAt = fmtNow(); persist(true, id); }
  function resetAll() { db = defaultDb(); persist(true); ensureReactive(); }
  function setDemoFlag(k, v) { demoFlags[k] = v; saveDemoFlags(); }
  function retryPersist(planId) {
    const ids = planId ? [planId] : Object.keys(db.planData).filter(id => !db.planData[id].lastPersistOk);
    try {
      ids.forEach(id => {
        checkRevision(id);
        db.planData[id].lastPersistOk = true;
        try { persist(true, id); } catch (e) { db.planData[id].lastPersistOk = false; throw e; }
      });
      return { ok: true };
    } catch (e) { return { ok: false, error: e.message === 'PERSIST_FAIL' ? '暂存失败' : e.message }; }
  }
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
  function scopeTreeBase(planId) { // 对比页左图：调整前基准树（base 图，范围 + 必要祖先）
    const plan = getPlan(planId), g = db.planData[planId].base;
    const scope = scopeOrgIds(plan), ctx = contextOrgIds(plan);
    const include = id => scope.has(id) || ctx.has(id);
    const build = pid => G.childrenOrgs(g, pid).filter(o => include(o.id)).map(o => ({ id: o.id, name: o.name, status: o.status, inScope: scope.has(o.id), children: build(o.id) }));
    return build(null);
  }

  /* ---------------- 含人架构图（CMP-26—CMP-31） ---------------- */
  function chartTree(planId, side) {
    const plan = getPlan(planId), pd = db.planData[planId];
    const g = side === 'L' ? pd.base : pd.cur, base = pd.base;
    const scope = scopeOrgIds(plan), ctx = contextOrgIds(plan);
    const include = id => scope.has(id) || ctx.has(id);
    const changeOf = new Map(diffPlan(plan).positions.map(r => [r.id, r.changeType]));
    const positionNode = p => {
      const people = G.employeesAt(g, p.id)
        .map(x => ({ id: x.id, name: x.name, level: x.level || null, occupied: !!x.headcountId, future: null }))
        .concat(G.futurePersonsAt(g, p.id)
          .map(x => ({ id: x.id, name: x.name, level: x.level || null, occupied: false, future: x.futureType, date: x.date })));
      const hcs = G.hcsOf(g, p.id);
      const cnt = st => hcs.filter(h => h.state === st).length;
      const tags = !G.position(base, p.id) ? ['新增'] : (p.status === '停用' ? ['停用'] : (changeOf.has(p.id) ? ['变更'] : []));
      return {
        type: 'position', id: p.id, name: p.name, levelMin: p.levelMin, levelMax: p.levelMax, status: p.status,
        isNew: !G.position(base, p.id), tags,
        emp: people.filter(x => !x.future).length,
        hcTotal: hcs.length,
        hcAvailable: cnt('可用'), hcDemand: cnt('需求预留'), hcOccupied: cnt('占编'),
        hcOffer: cnt('Offer占用'), hcReserved: cnt('待调入预留'),
        hcVacant: cnt('可用') + cnt('需求预留'), // 与工作台“独立空编”同口径
        people
      };
    };
    const build = pid => G.childrenOrgs(g, pid).filter(o => include(o.id)).map(o => {
      const stoppedHere = side === 'R' && o.status === '停用';
      const node = {
        type: 'org', id: o.id, name: o.name, status: o.status, inScope: scope.has(o.id), leaderId: o.leaderId || null,
        isNew: !G.org(base, o.id), tags: orgChangeTags(plan, o.id).filter(t => t !== '新增' && t !== '停用'),
        placeholder: stoppedHere, children: [],
        positions: stoppedHere ? [] : g.positions.filter(p => p.orgId === o.id).sort((a, b) => a.order - b.order).map(positionNode)
      };
      if (!stoppedHere) node.children = build(o.id);
      return node;
    });
    return build(null);
  }

  root.OA = root.OA || {};
  root.OA.store = {
    load, apply, undo, redo, historyState, getPlans, getPlan, getPlanData, resetPlan, resetAll,
    setDemoFlag, getDemoFlags, retryPersist, getUiState, setUiState,
    scopeInfo, orgTree, universeTree, scopeTree, scopeTreeBase, chartTree, computePending, previewCopyOrg, previewStopOrg, diffPlan, diffCounts, diffCountsVisible, hasChange, orgChangeTags, positionChangeTags,
    FEATURES,
    CNT, G, STATUS, LEVELS, EDITABLE_STATUS, ADJUST_LEVELS, ADJUST_REASONS, REASON_HINTS, _internals: { OPS, validateTransfer: OPS.validateTransfer, scopeOrgIds, requiredOrgFields }
  };
})(typeof window !== 'undefined' ? window : globalThis);
