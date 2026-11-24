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
  // Pages 的独立版本同域，按发布路径隔离暂存，避免互相重置或覆盖。
  const STORAGE_PREFIX = root.location && root.location.pathname.includes('/weak-position/') ? 'oa.weak-position.' : 'oa.';
  const KEY_SCHEMA = STORAGE_PREFIX + 'schema', KEY_PLANS = STORAGE_PREFIX + 'plans', KEY_DATA = STORAGE_PREFIX + 'plan.', KEY_UI = STORAGE_PREFIX + 'ui.', KEY_DEMO = STORAGE_PREFIX + 'demo';
  const SCHEMA = 12; // v12：新增对象仅用临时身份，不预分配正式编码
  const FEATURES = { concurrentPost: false }; // Demo 展示开关（TECH 5.8）：其他页面 false 时不渲染兼职 UI；主工作台按 PRD 0.7 展示
  const PERMISSION_ROOTS = {
    huadong: ['O10', 'O20', 'O30'],
    case1: ['G03'],
    case2: ['G03'],
    scopeDemo: ['G03', 'S00', 'S05']
  };
  const MAX_ORG_LEVEL = 8;
  const DEFAULT_PERSON_ID = 'D-DEFAULT';
  const DEFAULT_COST_CENTER_ID = 'CC-DEFAULT';

  const LEVELS = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'].flatMap(g => [1, 2, 3, 4].map(n => g + '-' + n)); // 统一“序列-级-档”顺序
  const LEVEL_ALIASES = { P1: 'P1-1', P2: 'P2-1', P3: 'P3-2', P4: 'P4-2', P5: 'P5-1', P6: 'P6-1' }; // 兼容旧裸职级输入
  const canonicalLevel = l => LEVEL_ALIASES[l] || l;
  const STATUS = { DRAFT: '草稿', REVIEWING: '审批中', PENDING: '待生效', UPDATING: '数据更新中', EFFECTIVE: '已生效', MANUAL: '待手动处理', DISCARDED: '已作废' };
  const LEGACY_STATUS = { '退回修改': STATUS.DRAFT, '生效异常': STATUS.MANUAL };
  const EDITABLE_STATUS = [STATUS.DRAFT];
  const HISTORY_LIMIT = 50;
  /* 方案分类字段（PRD 0.5 之后新增，F-01）：选项与提示语只写一处，页面只渲染 */
  const ADJUST_LEVELS = ['BU/条线级', 'BU下设一级', 'BU下设二级', '其他'];
  const ADJUST_REASONS = ['外部原因', '内部原因'];
  const REASON_HINTS = {
    外部原因: '由组织外部环境变化引发的调整需求，这些因素通常超出组织控制范围。如市场环境、政策法规、战略调整、竞对变化等',
    内部原因: '外部环境未发生重大变化的情况下，组织内部自身因素变化引发的调整需求'
  };

  const TRANSFER_FIELDS = [
    { key: 'workCity', label: '工作城市', required: true },
    { key: 'officeLocation', label: '办公地点', required: true },
    { key: 'workRegion', label: '工作地区', required: true },
    { key: 'homeRegion', label: '归属大区', required: true },
    { key: 'divisionRegion', label: '划分区域', required: true },
    { key: 'employeeType1', label: '员工类型一级', required: true },
    { key: 'employeeType2', label: '员工类型二级', required: false }
  ];
  function normalizePersonFields(g) {
    (g.persons || []).forEach(p => {
      TRANSFER_FIELDS.forEach(f => { if (p[f.key] === undefined) p[f.key] = f.required ? '默认' : ''; });
      if (p.personnelType === undefined) p.personnelType = '默认';
    });
  }
  const clone = o => JSON.parse(JSON.stringify(o));
  function normalizeOrgFields(g) {
    g.costCenters = Array.isArray(g.costCenters) && g.costCenters.length ? g.costCenters : [{ id: DEFAULT_COST_CENTER_ID, name: '默认成本中心' }];
    if (!Array.isArray(g.persons)) g.persons = [];
    if (!g.persons.some(p => p.id === DEFAULT_PERSON_ID)) g.persons.push({ id: DEFAULT_PERSON_ID, name: '默认', status: '在职', kind: 'hrbp', positionId: null, level: 'P3-3', headcountId: null, managerId: null });
    (g.orgs || []).forEach(o => {
      o.effectiveDate = o.effectiveDate || null;
      o.virtualOrg = o.virtualOrg === true;
      o.hrbpId = o.hrbpId || DEFAULT_PERSON_ID;
      o.hrbpOwnerId = o.hrbpOwnerId || DEFAULT_PERSON_ID;
      o.costCenterId = o.costCenterId || DEFAULT_COST_CENTER_ID;
      o.costCategory = o.costCategory || '默认';
    });
    (g.positions || []).forEach(p => {
      p.effectiveDate = p.effectiveDate || null;
      p.jobSequence = p.jobSequence || '默认';
      p.jobFamily = p.jobFamily || '默认';
      p.jobClass = p.jobClass || '默认';
      p.costCategory = p.costCategory || '默认';
      p.collarColor = p.collarColor || '白领';
      p.syncIncumbency = p.syncIncumbency !== false;
    });
    (g.headcounts || []).forEach(h => {
      const p = (g.positions || []).find(x => x.id === h.positionId);
      const o = p ? (g.orgs || []).find(x => x.id === p.orgId) : null;
      h.category = h.category || 'C';
      h.collarColor = h.collarColor || (p && p.collarColor) || '白领';
      h.overseas = h.overseas === true;
      h.costCenterId = h.costCenterId || (o && o.costCenterId) || DEFAULT_COST_CENTER_ID;
      h.costCategory = h.costCategory || (p && p.costCategory) || '默认';
      h.workLocation = h.workLocation || '默认';
      h.officeLocation = h.officeLocation || '默认';
      h.expectedArrivalDate = h.expectedArrivalDate || '2026-12-01';
      h.remark = h.remark || '';
    });
    g.futureEvents = Array.isArray(g.futureEvents) ? g.futureEvents : [];
    normalizePersonFields(g);
    return g;
  }
  function normalizeOrdering(g) {
    normalizeOrgFields(g);
    (g.orgs || []).forEach(o => { o.sortCode = Number.isFinite(Number(o.sortCode)) ? Number(o.sortCode) : (Number(o.order) || 1); o.order = o.sortCode; });
    (g.positions || []).forEach(p => { p.sequenceNo = Number.isFinite(Number(p.sequenceNo)) ? Number(p.sequenceNo) : (Number(p.order) || 1); p.order = p.sequenceNo; });
    return g;
  }
  const IDENTITY_KINDS = {
    org: { list: 'orgs', prefix: 'NO', label: '新增组织' },
    position: { list: 'positions', prefix: 'NP', label: '新增职位' },
    headcount: { list: 'headcounts', prefix: 'NH', label: '新增编制' }
  };
  function temporaryCode(kind, id) {
    const spec = IDENTITY_KINDS[kind];
    const number = String(id || '').startsWith(spec.prefix) ? Number(String(id).slice(spec.prefix.length)) : 0;
    return spec.label + (number > 0 ? ' ' + String(number).padStart(3, '0') : '');
  }
  function displayCode(plan, kind, id, graph) {
    const pd = db.planData[plan.id], spec = IDENTITY_KINDS[kind];
    if (!pd || !spec) return '';
    const baseItem = pd.base[spec.list].find(x => x.id === id);
    if (baseItem) return baseItem.code || '';
    return (graph || pd.cur)[spec.list].some(x => x.id === id) ? temporaryCode(kind, id) : '';
  }
  function normalizeDraftCodes(pd, graph) {
    Object.values(IDENTITY_KINDS).forEach(spec => {
      const existing = new Set(pd.base[spec.list].map(x => x.id));
      graph[spec.list].forEach(x => { if (!existing.has(x.id)) x.code = ''; });
    });
  }
  function headcountOrder(a, b) {
    return Number(!a.code) - Number(!b.code) || String(a.code).localeCompare(String(b.code)) ||
      (Number(a.id.slice(2)) || 0) - (Number(b.id.slice(2)) || 0) || a.id.localeCompare(b.id);
  }
  const orgSort = o => Number.isFinite(Number(o && o.sortCode)) ? Number(o.sortCode) : (Number(o && o.order) || 0);
  const positionSort = p => Number.isFinite(Number(p && p.sequenceNo)) ? Number(p.sequenceNo) : (Number(p && p.order) || 0);
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
    childrenOrgs: (g, id) => g.orgs.filter(o => o.parentId === id).sort((a, b) => orgSort(a) - orgSort(b)),
    descendantIds(g, id, includeSelf) {
      const out = includeSelf ? [id] : [], walk = pid => g.orgs.filter(o => o.parentId === pid).forEach(o => { out.push(o.id); walk(o.id); });
      walk(id); return out;
    },
    pathNames(g, orgId) {
      const out = []; let cur = G.org(g, orgId), guard = 0;
      while (cur && guard++ < 50) { out.unshift(cur.name); cur = cur.parentId ? G.org(g, cur.parentId) : null; }
      return out;
    },
    orgLevel(g, orgId) {
      let level = 0, cur = G.org(g, orgId), guard = 0;
      while (cur && guard++ < 50) { level += 1; cur = cur.parentId ? G.org(g, cur.parentId) : null; }
      return level || null;
    },
    isOrgEffective(g, id) {
      let o=G.org(g,id),guard=0;
      if (!o) return false;
      while(o && guard++<50) { if(o.status!=='有效')return false;o=o.parentId ? G.org(g,o.parentId) : null; }
      return !o;
    },
    isPositionEffective: (g, id) => { const p = G.position(g, id); return !!p && p.status === '有效' && G.isOrgEffective(g, p.orgId); },
    positionsOfOrg(g, orgId, includeSub) {
      const ids = includeSub ? G.descendantIds(g, orgId, true) : [orgId];
      return g.positions.filter(p => ids.includes(p.orgId)).sort((a, b) => (a.orgId === b.orgId ? positionSort(a) - positionSort(b) : 0));
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
  function permissionRoots(universe) {
    return (PERMISSION_ROOTS[universe] || []).slice();
  }
  function graphPermissionRoots(g, universe) {
    const candidates = permissionRoots(universe).filter(id => !!G.org(g, id));
    const roots = new Set(candidates);
    candidates.forEach(id => {
      let cur = G.org(g, id), seen = new Set();
      while (cur && cur.parentId && !seen.has(cur.id)) {
        seen.add(cur.id);
        if (roots.has(cur.parentId)) { roots.delete(id); break; }
        cur = G.org(g, cur.parentId);
      }
    });
    return candidates.filter(id => roots.has(id));
  }
  function visiblePathNames(g, orgId, universe) {
    const full = G.pathNames(g, orgId), roots = new Set(permissionRoots(universe));
    let cur = G.org(g, orgId), chain = [];
    while (cur) { chain.unshift(cur.id); cur = cur.parentId ? G.org(g, cur.parentId) : null; }
    const idx = chain.findIndex(id => roots.has(id));
    return idx >= 0 ? full.slice(idx) : full;
  }
  function permissionForest(g, universe, effDate) {
    const roots = permissionRoots(universe), build = pid => G.childrenOrgs(g, pid)
      .filter(o => orgTimelineState(g, o, effDate || '9999-12-31') !== 'inactive')
      .map(o => ({ id: o.id, name: o.name, status: o.status, effectiveFrom: o.effectiveFrom || null, effectiveTo: o.effectiveTo || null, children: build(o.id) }));
    return roots.map(id => G.org(g, id)).filter(Boolean).filter(o => orgTimelineState(g, o, effDate || '9999-12-31') !== 'inactive')
      .map(o => ({ id: o.id, name: o.name, status: o.status, effectiveFrom: o.effectiveFrom || null, effectiveTo: o.effectiveTo || null, children: build(o.id) }));
  }

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
    const graph = normalizeOrdering(clone(OA.seed.UNIVERSES[planMeta.universe]()));
    return { base: clone(graph), cur: graph, versions: [], seq: { org: 0, position: 0, hc: 0, person: 0, post: 0, demand: 0 }, history: { undo: [], redo: [] }, revision: 0, lastPersistOk: true };
  }
  function normalizePlanStatus(plan) {
    if (plan && LEGACY_STATUS[plan.status]) plan.status = LEGACY_STATUS[plan.status];
    return plan;
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
    const storedSchema = hasLS ? localStorage.getItem(KEY_SCHEMA) : null;
    if (hasLS && ['7', '8', '9', '10', '11', String(SCHEMA)].includes(storedSchema) && localStorage.getItem(KEY_PLANS)) {
      try {
        db = { schema: SCHEMA, plans: JSON.parse(localStorage.getItem(KEY_PLANS)), planData: {} };
        db.plans.forEach(p => {
          const raw = localStorage.getItem(KEY_DATA + p.id);
          const pd = raw ? JSON.parse(raw) : buildPlanData(p);
          normalizeOrdering(pd.base); normalizeOrdering(pd.cur);
          normalizeDraftCodes(pd, pd.cur);
          if (pd.meta) { Object.assign(p, pd.meta); delete pd.meta; }
          normalizePlanStatus(p);
          db.planData[p.id] = pd;
          ensureHistory(pd);
          [...pd.history.undo, ...pd.history.redo].forEach(frame => { if (frame.state && frame.state.cur) { normalizePersonFields(frame.state.cur); normalizeDraftCodes(pd, frame.state.cur); } });
          (pd.versions || []).forEach(v => { if (v.snapshot) normalizePersonFields(v.snapshot); });
        });
        const d = LS.get(KEY_DEMO); if (d) demoFlags = JSON.parse(d);
        if (storedSchema !== String(SCHEMA)) persist(true);
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
    return !['undo', 'redo', 'submit', 'discardPlan', 'matchPreview', 'previewTransfer'].includes(type) && !type.startsWith('demo');
  }
  function historyLabel(type, payload, result, before) {
    const labels = {
      updatePlanInfo: '编辑方案信息', addOrg: '新增组织', editOrg: '编辑组织', copyOrg: '复制组织', moveOrg: '移动组织', cancelNewOrg: '取消新增组织', stopOrg: '停用组织', toggleOrg: '启用／停用组织',
      addPosition: '新增职位', editPosition: '编辑职位', copyPosition: '复制职位', copyPositions: '批量复制职位', cancelNewPosition: '取消新增职位', movePositions: '整体移动职位', togglePosition: '启用／停用职位', togglePositions: '批量停用职位',
      transferPersons: '人员调岗', releaseHeadcount: '解除绑定', releaseHeadcounts: '批量解除绑定', addHeadcounts: '增编', bindHeadcount: '绑定编制', cancelFloating: '取消浮动', removeHeadcounts: '减编', removeHeadcountsByIds: '减编', restoreHeadcounts: '恢复编制',
      moveHeadcounts: '移动空编', moveHeadcountsByIds: '调编', applyAutoMatch: '自动匹配', cancelPost: '停止兼职', extendScope: '补充调整范围', reorderOrgs: '组织排序', reorderPositions: '职位排序'
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
    if (type === 'copyPositions') note = (result.ids || []).length + ' 个职位';
    if (type === 'copyOrg') note += `（${result.orgCount} 个组织、${result.positionCount} 个职位）`;
    const label = result.restoredNew ? '恢复新增组织' : result.cancelledOrgId || result.cancelNew ? '取消新增组织' : result.cancelledPositionId ? '取消新增职位' : type==='togglePositions' ? '批量'+payload.action+'职位' : type==='togglePosition' ? payload.action+'职位' : type==='transferPersons' && result.bindingOnly ? '编制绑定' : labels[type] || type;
    return label + (note ? '：' + note : '');
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
  const IN_FLIGHT_WORKFLOW_STATUS = new Set(['审批中', '处理中']);
  function orgTimelineState(g, org, effDate) {
    if (!org) return 'missing';
    const start = org.effectiveFrom || org.setupDate || '1900-01-01';
    if (org.effectiveTo && org.effectiveTo <= effDate) return 'inactive';
    if (org.status === '停用' && !org.effectiveTo) return 'inactive';
    if (start > effDate) return 'future-start';
    if (org.effectiveTo && org.effectiveTo > effDate) return 'future-stop';
    return 'current';
  }
  function timelineMessage(org, state) {
    if (state === 'future-start') return `${org.name}：未来生效 ${org.effectiveFrom || org.setupDate}`;
    if (state === 'future-stop') return `${org.name}：计划停用 ${org.effectiveTo}`;
    return `${org.name}：方案生效日已停用`;
  }
  function validateScope(source, roots, effDate) {
    const g = typeof source === 'string' ? OA.seed.UNIVERSES[source]() : source;
    const warnings = [], blocking = [], excludedOrgIds = [], eligibleOrgIds = [], allOrgIds = [];
    const byId = new Map(g.orgs.map(o => [o.id, o])), children = new Map();
    g.orgs.forEach(o => { if (!children.has(o.parentId)) children.set(o.parentId, []); children.get(o.parentId).push(o); });
    const visited = new Set();
    const walk = (org, inherited) => {
      if (visited.has(org.id)) return;
      visited.add(org.id); allOrgIds.push(org.id);
      const state = orgTimelineState(g, org, effDate);
      const excluded = inherited || state !== 'current';
      if (excluded) excludedOrgIds.push(org.id); else eligibleOrgIds.push(org.id);
      if (!inherited && (state === 'future-start' || state === 'future-stop'))
        warnings.push({ code: state, orgId: org.id, message: timelineMessage(org, state) });
      (children.get(org.id) || []).forEach(child => walk(child, excluded));
    };
    if (!effDate) blocking.push({ code: 'DATE', message: '请选择生效日期' });
    const selectedRoots = Array.from(new Set(roots || []));
    // 父子同时选择时先取最上层根，保证排除分支不能经子节点选择重新纳入。
    const rootSet = new Set(selectedRoots);
    selectedRoots.filter(id => {
      let o = byId.get(id), seen = new Set();
      while (o && o.parentId && !seen.has(o.id)) { seen.add(o.id); if (rootSet.has(o.parentId)) return false; o = byId.get(o.parentId); }
      return true;
    }).forEach(id => {
      const org = byId.get(id);
      if (!org) { blocking.push({ code: 'ORG_MISSING', orgId: id, message: '调整范围包含不存在的组织' }); return; }
      let parent = byId.get(org.parentId), inherited = false, seen = new Set();
      while (parent && !seen.has(parent.id)) {
        seen.add(parent.id);
        const state = orgTimelineState(g, parent, effDate);
        if (state !== 'current') { inherited = true; blocking.push({ code: 'ANCESTOR', orgId: id, message: `${org.name} 的上级 ${parent.name} 在方案日不可调整，请先处理组织时间安排` }); break; }
        parent = byId.get(parent.parentId);
      }
      walk(org, inherited);
    });
    const eligible = new Set(eligibleOrgIds);
    (g.headcountWorkflows || []).filter(w => IN_FLIGHT_WORKFLOW_STATUS.has(w.status) && eligible.has(w.orgId)).forEach(w => {
      const org = byId.get(w.orgId);
      blocking.push({ code: 'HEADCOUNT_WORKFLOW', orgId: w.orgId, workflowId: w.id, message: `${org.name} 存在在途编制调整流程：${w.name}（${w.status}）` });
    });
    if (!eligibleOrgIds.length && !blocking.length) blocking.push({ code: 'SCOPE_EMPTY', message: '请至少选择一个在方案生效日可纳入的组织' });
    return { ok: !blocking.length, warnings, blocking, eligibleOrgIds, excludedOrgIds, allOrgIds };
  }
  function scopeSelectionState(source, roots, effDate) {
    const g = typeof source === 'string' ? OA.seed.UNIVERSES[source]() : source;
    const check = validateScope(source, roots, effDate);
    const byId = new Map((g.orgs || []).map(o => [o.id, o]));
    const ids = Array.from(byId.keys());
    const descendants = id => G.descendantIds(g, id, true).filter(x => x !== id);
    const stateById = {};
    ids.forEach(id => {
      const single = validateScope(source, [id], effDate);
      const org = byId.get(id);
      const timeline = orgTimelineState(g, org, effDate);
      const workflow = single.blocking.filter(x => x.code === 'HEADCOUNT_WORKFLOW');
      stateById[id] = { timeline, future: timeline === 'future-start' || timeline === 'future-stop', blocked: workflow.length > 0, blocking: workflow.map(x => x.message) };
    });
    const effective = new Set(check.eligibleOrgIds);
    const rootSet = new Set(roots || []);
    const indeterminate = new Set();
    ids.forEach(id => {
      const selectable = descendants(id).filter(x => !stateById[x].future && !stateById[x].blocked);
      if (!effective.has(id) && selectable.some(x => effective.has(x))) indeterminate.add(id);
    });
    return { check, effective, roots: Array.from(rootSet), stateById, descendants, indeterminate };
  }
  function normalizeScopeRoots(source, roots, effDate) {
    let current = Array.from(new Set(roots || []));
    for (let round = 0; round < 12; round++) {
      const info = scopeSelectionState(source, current, effDate);
      const all = Object.keys(info.stateById).sort((a, b) => info.descendants(b).length - info.descendants(a).length);
      let changed = false;
      for (const id of all) {
        if (current.includes(id) || info.stateById[id].future || info.stateById[id].blocked) continue;
        const selectable = info.descendants(id).filter(x => !info.stateById[x].future && !info.stateById[x].blocked);
        if (!selectable.length || !selectable.some(x => info.effective.has(x)) || !selectable.every(x => info.effective.has(x))) continue;
        const under = new Set(info.descendants(id));
        current = current.filter(root => !under.has(root));
        current.push(id);
        changed = true;
        break;
      }
      if (!changed) break;
    }
    return current;
  }
  function scopeOrgIdsForRoots(plan, roots) {
    const pd = db.planData[plan.id], g = pd.cur;
    // 当前方案中的停用仍需显示并处理；范围准入使用原始生命周期，而非当前编辑后的状态。
    const source = Object.assign({}, g, { orgs: g.orgs.map(o => {
      const base = G.org(pd.base, o.id);
      return Object.assign({}, o, { status: base ? base.status : '有效' });
    }) });
    return new Set(validateScope(source, Array.from(new Set(roots || [])), plan.effDate).eligibleOrgIds);
  }
  function scopeOrgIds(plan) {
    return scopeOrgIdsForRoots(plan, (plan.sourceScopeIds || []).concat(plan.targetScopeIds || []));
  }
  function contextOrgIds(plan) { // 必要祖先上下文（只读）
    const g = db.planData[plan.id].cur, scope = scopeOrgIds(plan), set = new Set();
    scope.forEach(id => { let o = G.org(g, id); while (o && o.parentId) { o = G.org(g, o.parentId); if (o && !scope.has(o.id)) set.add(o.id); } });
    return set;
  }

  function isNewOrg(plan, id) {
    const pd = db.planData[plan.id];
    return !!G.org(pd.cur, id) && !G.org(pd.base, id);
  }
  function canCancelNewOrg(plan, id) {
    const pd = db.planData[plan.id], g = pd.cur;
    return isNewOrg(plan, id)
      && !g.orgs.some(o => o.parentId === id)
      && !g.positions.some(p => p.orgId === id)
      && !(g.headcountWorkflows || []).some(w => w.orgId === id);
  }

  /* ---------------- 方案内临时身份（NEW-10；正式身份生效写入时分配） ---------------- */
  function nextId(pd, kind, prefix) { pd.seq[kind] += 1; return `${prefix}${pd.seq[kind]}`; }

  // 待恢复快照只包含基准内、已减编对象，跟随 graph 的持久化和历史。
  function rememberRemovedHeadcounts(pd, rows) {
    const saved = pd.cur.removedHeadcounts || [];
    rows.filter(h => !!G.hc(pd.base, h.id)).forEach(h => {
      const index = saved.findIndex(x => x.id === h.id);
      const snapshot = Object.assign(clone(h), { removedOrgId: (G.position(pd.cur,h.positionId) || {}).orgId });
      if (index >= 0) saved[index] = snapshot; else saved.push(snapshot);
    });
    if (saved.length) pd.cur.removedHeadcounts = saved;
  }
  function getRemovedHeadcount(plan, id) {
    const pd = db.planData[plan.id];
    const saved = (pd.cur.removedHeadcounts || []).find(h => h.id === id);
    if (saved) return clone(saved);
    // 兼容旧方案：最近一个仍包含该可用编制的历史帧就是减编前状态。
    const history = pd.history && pd.history.undo || [];
    for (let i = history.length - 1; i >= 0; i--) {
      const graph = history[i].state && history[i].state.cur;
      const h = graph && G.hc(graph, id);
      if (h && h.state === '可用') return clone(h);
    }
    const base = G.hc(pd.base, id);
    return base ? clone(base) : null;
  }

  /* ---------------- 不变量（PRD 12.2 INV-01—05） ---------------- */
  function assertGraph(g) {
    g.headcounts.forEach(h => {
      const x=headcountOccupancy(g,h), p=h.personId ? G.person(g,h.personId) : null;
      const code = h.code || temporaryCode('headcount', h.id);
      if(h.state==='占编') {
        if(h.postId) {
          const t=g.posts.find(t=>t.id===h.postId && t.status==='有效');
          if(!t || t.headcountId!==h.id || t.personId!==h.personId || t.concurrentPositionId!==h.positionId || h.floatingUntil || x.occupants.length!==1) throw new Error(`编制 ${code} 兼职占用关系不一致`);
        } else {
          if(!x.occupants.length || x.occupants.some(a=>a.assignmentType!=='main' || a.positionId!==h.positionId) || (!h.floatingUntil && x.occupants.length!==1) || !x.occupants.some(a=>a.personId===h.personId)) throw new Error(`编制 ${code} 占用关系不一致，普通编制不能共占`);
        }
      } else if(h.state==='可用') {
        if(h.personId || h.postId || h.demandId || g.persons.some(p=>p.headcountId===h.id) || g.posts.some(t=>t.headcountId===h.id)) throw new Error(`可用编制 ${code} 带有关联`);
      } else if(h.state==='需求预留') {
        if(!h.demandId || !G.demand(g,h.demandId) || h.personId) throw new Error(`需求预留编制 ${code} 关联不一致`);
      } else if(['Offer占用','待调入预留','入职预留'].includes(h.state)) {
        const event=(g.futureEvents || []).find(e=>e.headcountId===h.id && e.personId===h.personId && e.toPositionId===h.positionId && e.approvalStatus==='已批准');
        const future=p?.status==='未来' && p.headcountId===h.id && g.persons.filter(a=>a.headcountId===h.id).length===1 && p.approvalStatus!=='审批中';
        if(!p || (!future && !event) || x.occupants.length) throw new Error(`编制 ${code} 未来关联不一致`);
      }
    });
    g.persons.filter(p=>p.status==='在职' && p.headcountId).forEach(p=>{
      const h=G.hc(g,p.headcountId);
      if(!h || h.state!=='占编' || h.postId || p.positionId!==h.positionId || (!h.floatingUntil && h.personId!==p.id)) throw new Error(`人员 ${p.name} 占编关系不一致`);
    });
    g.posts.filter(t=>t.status==='有效' && t.headcountId).forEach(t=>{
      const h=G.hc(g,t.headcountId);
      if(!h || h.state!=='占编' || h.postId!==t.id) throw new Error('兼职占编关系不一致');
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


  // 主职与兼职各自绑定；浮动共占通过主职 headcountId 反查，不以单个 personId 计人。
  function headcountOccupancy(g, h) {
    const mains = g.persons.filter(p => p.status === '在职' && p.kind === 'employee' && p.headcountId === h.id);
    const posts = g.posts.filter(t => t.status === '有效' && t.headcountId === h.id);
    const occupants = mains.map(p => ({ personId:p.id, id:p.id, name:p.name, positionId:p.positionId, assignmentType:'main' }))
      .concat(posts.map(t => ({ personId:t.personId, id:t.id, postId:t.id, name:(G.person(g,t.personId)||{}).name || '—', positionId:t.concurrentPositionId, assignmentType:'post' })));
    let type = '预留';
    if (h.state === '可用') type = '可用空编';
    else if (h.state === '占编') type = h.floatingUntil ? '浮动' : h.postId ? ((G.post ? G.post(g,h.postId) : g.posts.find(t=>t.id===h.postId))?.term === '短期' ? '短期兼职' : '长期兼职') : '主职';
    const person = h.personId ? G.person(g,h.personId) : null, demand = h.demandId ? G.demand(g,h.demandId) : null;
    const event=(g.futureEvents || []).find(e=>e.headcountId===h.id);
    const source = demand ? '招聘需求' : event || person?.futureType === '待调入' ? '调入预留' : '直接入职';
    const stage = event ? '待调入' : person?.status === '未来' ? (person.futureType.includes('Offer') ? '已有 Offer' : person.futureType) : '';
    return { type, occupants, person, demand, event, source:type==='预留' ? source : '', stage };
  }
  function headcountBreakdown(g, headcounts) {
    const out = { total:headcounts.length, main:0, longTerm:0, shortTerm:0, floating:0, reserved:0, available:0, recruitment:0, directHire:0, transfer:0 };
    const key = { '主职':'main', '长期兼职':'longTerm', '短期兼职':'shortTerm', '浮动':'floating', '预留':'reserved', '可用空编':'available' };
    headcounts.forEach(h => { const x=headcountOccupancy(g,h);out[key[x.type]]++;if(x.type==='预留')out[x.source==='招聘需求'?'recruitment':x.source==='调入预留'?'transfer':'directHire']++; });
    return out;
  }
  // 一个组织内每人只计一次：主职优先，其次长期兼职、短期兼职。
  function personnelBreakdown(people, posts) {
    const main=new Set(people.map(p=>p.id)),longTerm=new Set(),shortTerm=new Set();
    posts.forEach(t=>{ if(!main.has(t.personId) && t.term!=='短期')longTerm.add(t.personId); });
    posts.forEach(t=>{ if(!main.has(t.personId) && !longTerm.has(t.personId) && t.term==='短期')shortTerm.add(t.personId); });
    return {main:main.size,longTerm:longTerm.size,shortTerm:shortTerm.size};
  }
  function assignmentHeadcountState(g, a, kind, effDate) {
    const post = kind === 'post', required = a.headcountRequired === undefined ? !post : a.headcountRequired;
    const h = a.headcountId ? G.hc(g,a.headcountId) : null, pos = G.position(g,post ? a.concurrentPositionId : a.positionId);
    const reasons = [];
    if (a.headcountId && !h) reasons.push('绑定的编制不存在');
    if (a.headcountId && !required) reasons.push('本任职不应占编，但已绑定编制');
    if (h) {
      if (h.state !== '占编' || h.positionId !== pos?.id || (post ? h.postId !== a.id || h.personId !== a.personId : !!h.postId)) reasons.push('编制占用关系与任职不一致');
      if (pos && (lvlIdx(h.level)<lvlIdx(pos.levelMin) || lvlIdx(h.level)>lvlIdx(pos.levelMax))) reasons.push('编制职级超出职位允许范围');
      const occupants=headcountOccupancy(g,h).occupants;
      if ((!h.floatingUntil && occupants.length!==1) || (h.floatingUntil && (occupants.some(x=>x.assignmentType!=='main') || !occupants.some(x=>x.personId===h.personId))) || (!post && !h.floatingUntil && h.personId!==a.id)) reasons.push('编制占用人数或占用人关联不一致');
      if (h.floatingUntil && effDate && h.floatingUntil < effDate) reasons.push('浮动编制共占期限已结束');
    }
    return { status:reasons.length ? '异常' : h ? '已占编' : required ? '待绑定' : '不占编', reasons, required, headcountId:a.headcountId || null,
      marker:post ? (a.term==='短期'?'短期兼职':'长期兼职') : h?.floatingUntil ? '浮动编制' : '',
      ruleReason:a.headcountRuleReason || (required ? '本任职应占编' : '本任职不占编') };
  }
  function futureEventsForGraph(g, effDate) {
    const events = (g.futureEvents || []).map(e=>({...e}));
    g.persons.filter(p=>p.status==='未来').forEach(p=>{
      const type=p.futureType==='待调入'?'调入':'入职';
      if(events.some(e=>e.personId===p.id && e.type===type))return;
      events.push({id:'future:'+p.id,personId:p.id,type,date:p.date,toPositionId:p.targetPositionId,
        stage:p.futureType.includes('Offer')?'已有 Offer':p.futureType,approvalStatus:p.approvalStatus || (type==='调入' && p.headcountId?'已批准':''),
        headcountId:p.headcountId || null,hasOffer:p.hasOffer===true || p.futureType.includes('Offer'),refs:p.refs || []});
    });
    return events.filter(e=>!effDate || e.date>effDate).map(e=>({...e,name:(G.person(g,e.personId)||{}).name || '—'})).sort((a,b)=>(a.date||'').localeCompare(b.date||'') || a.id.localeCompare(b.id));
  }
  function positionFutureEvents(g, positionId, effDate) {
    return futureEventsForGraph(g,effDate).filter(e=>e.toPositionId===positionId || e.fromPositionId===positionId).map(e=>({...e,
      stage:e.type==='调动' ? (e.fromPositionId===positionId?'待调出':'待调入') : e.type==='离职'?'待离职':e.stage || '待调入'}));
  }
  function releaseMainBinding(g, p) {
    const h=G.hc(g,p.headcountId);p.headcountId=null;
    const remaining=g.persons.filter(x=>x.status==='在职' && x.headcountId===h.id);
    h.personId=remaining[0]?.id || null;
    if(!remaining.length) { h.state='可用';h.demandId=null; }
  }

  /* ---------------- 待处理（FUT-02、F-03、ORG-09） ---------------- */
  function requiredOrgFields(g, o, base) {
    const fields = [];
    if (!(o.name || '').trim()) fields.push('组织名称');
    if (!o.parentId || !G.org(g, o.parentId)) fields.push('上级组织');
    if (!o.hrbpId || !G.person(g, o.hrbpId)) fields.push('HRBP');
    if (!o.hrbpOwnerId || !G.person(g, o.hrbpOwnerId)) fields.push('HRBP负责人');
    if (!o.costCenterId || !(g.costCenters || []).some(x => x.id === o.costCenterId)) fields.push('一级成本中心');
    if (!o.costCategory) fields.push('财务用-成本分类');
    return fields;
  }

  function assignmentStopReason(g, a, kind) {
    const pos=G.position(g,kind==='post' ? a.concurrentPositionId : a.positionId);
    if (!pos) return '';
    const action=kind==='post' ? '请停止兼职' : '请调出';
    if (!G.isOrgEffective(g,pos.orgId)) return '所属组织已停用，'+action;
    return pos.status==='停用' ? '所属职位已停用，'+action : '';
  }

  function computePending(plan) {
    const pd = db.planData[plan.id], g = pd.cur, out = [];
    const scope = scopeOrgIds(plan);
    g.orgs.filter(o => scope.has(o.id) && o.status === '有效').forEach(o => {
      const fields = requiredOrgFields(g, o, pd.base);
      if (fields.length) out.push({ kind: 'org-required', id: o.id, fields, message: `缺少必填字段：${fields.join('、')}` });
    });
    g.orgs.filter(o => o.status === '停用').forEach(o => {
      G.childrenOrgs(g, o.id).filter(x => x.status === '有效').forEach(child => {
        out.push({ kind: 'org', id: child.id, message: `上级组织 ${o.name} 已停用` });
      });
      const posIds = new Set(g.positions.filter(p => p.orgId === o.id).map(p => p.id));
      const people = g.persons.filter(p => p.status === '在职' && p.positionId && posIds.has(p.positionId)).length;
      const future = g.persons.filter(p => p.status === '未来' && p.targetPositionId && posIds.has(p.targetPositionId)).length;
      if (people || future) out.push({ kind: 'org', id: o.id, message: `仍有关联人员 ${people + future} 人` });
      if (!G.org(pd.base,o.id)) {
        G.childrenOrgs(g,o.id).filter(child=>!!G.org(pd.base,child.id)).forEach(child=>{
          out.push({kind:'org',id:child.id,message:`上级组织 ${o.name} 已取消新增，请先转出该既有组织`});
        });
        g.positions.filter(p=>p.orgId===o.id).forEach(p=>{
          if (G.position(pd.base,p.id)) out.push({kind:'position',id:p.id,message:'所属组织已取消新增，请先转出该既有职位'});
          else if (!positionClosureBlocked(g,p.id,plan.effDate) && cancelledPositionHasRefs(g,p.id))
            out.push({kind:'position',id:p.id,message:'所属组织已取消新增，职位仍有关联记录，请整体转移职位'});
        });
        if ((g.headcountWorkflows || []).some(w=>w.orgId===o.id)) out.push({kind:'org',id:o.id,message:'已取消新增组织仍有关联编制流程，请先处理'});
      }
    });
    g.positions.filter(p => p.status === '停用').forEach(p => {
      const emps = G.employeesAt(g, p.id).length, futs = G.futurePersonsAt(g, p.id).length;
      if (emps) out.push({ kind: 'position', id: p.id, message: `在职员工 ${emps} 人未处理` });
      if (futs) out.push({ kind: 'position', id: p.id, message: `未来人员引用 ${futs} 条` });
    });
    g.positions.filter(p => p.status === '有效' && !G.isOrgEffective(g, p.orgId)).forEach(p => {
      if (positionClosureBlocked(g, p.id, plan.effDate))
        out.push({ kind: 'position', id: p.id, message: `所属组织 ${G.org(g, p.orgId)?.name || '—'} 已停用，请处理关联人员或整体转移职位` });
    });
    g.positions.filter(p => !G.isOrgEffective(g, p.orgId)).forEach(p => {
      const locked = G.hcsOf(g,p.id).filter(h => !canCloseVacancy(g,h) && !headcountOccupancy(g,h).occupants.length);
      const demands = g.demands.filter(d => d.positionId===p.id && d.status!=='关闭' && d.status!=='取消');
      if (locked.length || demands.length) out.push({kind:'position',id:p.id,message:'所属组织已停用，仍有锁定编制或招聘预留，请先转移关联职位'});
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
    const checkAssignment=(a,kind)=>{
      const pos=G.position(g,kind==='post'?a.concurrentPositionId:a.positionId);
      if(!pos || !scope.has(pos.orgId))return;
      const stopReason=assignmentStopReason(g,a,kind);
      if(stopReason)out.push({kind:kind==='post'?'post':'person',id:a.id,orgId:pos.orgId,message:stopReason});
      const state=assignmentHeadcountState(g,a,kind,plan.effDate);
      if(state.status==='待绑定' || state.status==='异常')out.push({kind:kind==='post'?'post':'person',id:a.id,orgId:pos.orgId,message:state.status==='待绑定'?'本任职应占编，提交前必须绑定编制':state.reasons.join('；')});
    };
    g.persons.filter(p=>p.status==='在职' && p.kind==='employee').forEach(p=>checkAssignment(p,'main'));
    g.posts.filter(t=>t.status==='有效').forEach(t=>checkAssignment(t,'post'));
    (g.futureEvents || []).filter(e=>e.date>plan.effDate && e.toPositionId).forEach(e=>{
      const p=G.position(g,e.toPositionId);
      if(p && scope.has(p.orgId) && !G.isPositionEffective(g,p.id))out.push({kind:'person',id:e.personId,orgId:p.orgId,message:'未来调入目标已停用'});
    });
    return out;
  }

  function previewCopyOrg(plan, payload) {
    const pd = db.planData[plan.id], g = pd.cur;
    const src = G.org(g, payload && payload.id);
    if (!src) throw new Error('组织不存在');
    const copyMode = payload && payload.copyMode;
    const legacyCopyDescendants = !!(payload && payload.copyDescendants);
    const legacyCopyPositions = payload && payload.copyPositions !== undefined;
    const copyDescendants = copyMode ? (copyMode === 'subtree' || copyMode === 'subtreePositions') : legacyCopyDescendants;
    const copyPositions = copyMode ? (copyMode === 'orgPositions' || copyMode === 'subtreePositions') : (legacyCopyPositions ? !!payload.copyPositions : !!(payload && payload.copySourcePositions));
    const copyDescendantPositions = copyMode ? copyMode === 'subtreePositions' : (legacyCopyPositions ? !!payload.copyPositions : !!(payload && payload.copyDescendantPositions));
    const allOrgIds = [src.id];
    const walk = parentId => {
      G.childrenOrgs(g, parentId).filter(o => o.status === '有效').forEach(o => { allOrgIds.push(o.id); walk(o.id); });
    };
    walk(src.id);
    const orgIds = copyDescendants ? allOrgIds : [src.id];
    const descendantIds = allOrgIds.filter(id => id !== src.id);
    const positions = g.positions.filter(p => p.status === '有效' && ((copyPositions && p.orgId === src.id) || (copyDescendantPositions && descendantIds.includes(p.orgId))))
      .sort((a, b) => (a.orgId === b.orgId ? positionSort(a) - positionSort(b) : a.orgId.localeCompare(b.orgId)));
    return {
      src, orgIds, positions, copyMode: copyMode || (copyDescendants ? (copyDescendantPositions ? 'subtreePositions' : 'subtree') : (copyPositions ? 'orgPositions' : 'org')), copyDescendants, copyPositions, copyDescendantPositions,
      orgCount: orgIds.length,
      positionCount: positions.length,
      availableOrgCount: allOrgIds.length,
      availablePositionCount: g.positions.filter(p => p.status === '有效' && p.orgId === src.id).length,
      availableDescendantPositionCount: g.positions.filter(p => p.status === '有效' && descendantIds.includes(p.orgId)).length
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
    const futureEvents = (g.futureEvents || []).filter(e=>e.date>plan.effDate && positionIds.has(e.toPositionId));
    const reservations = headcounts.filter(h=>h.state!=='可用' && h.state!=='占编' || h.demandId || g.demands.some(d=>d.status!=='关闭' && d.status!=='取消' && (d.positionId===h.positionId || d.headcountIds.includes(h.id))));
    const demands = g.demands.filter(d=>d.status!=='关闭' && d.status!=='取消' && positionIds.has(d.positionId));
    const blockingReason = future.length || futureEvents.length ? '仍有未来人员 '+future.length+'、未来调入事项 '+futureEvents.length+'，请先处理。'
      : reservations.length || demands.length ? '仍有招聘需求、Offer、入职或调入预留，请先处理。' : '';
    return { org, orgIds, childOrgIds, positions, directPositions, employees, future, headcounts, futureEvents, blockingReason };
  }

  function canCloseVacancy(g,h) {
    return h.state==='可用' && !h.personId && !h.postId && !h.demandId && !headcountOccupancy(g,h).occupants.length && !g.demands.some(d=>d.headcountIds.includes(h.id));
  }
  function positionClosureBlocked(g,id,effDate) {
    return G.employeesAt(g,id).length || G.futurePersonsAt(g,id).length || G.postsOf(g,id).length ||
      (g.futureEvents || []).some(e=>e.date>effDate && e.toPositionId===id) ||
      g.demands.some(d=>d.positionId===id && d.status!=='关闭' && d.status!=='取消') ||
      G.hcsOf(g,id).some(h=>!canCloseVacancy(g,h));
  }
  function cancelledPositionHasRefs(g,id) {
    return g.persons.some(p=>p.positionId===id || p.targetPositionId===id) ||
      g.posts.some(p=>p.mainPositionId===id || p.concurrentPositionId===id) ||
      g.demands.some(d=>d.positionId===id) ||
      (g.futureEvents || []).some(e=>e.fromPositionId===id || e.toPositionId===id);
  }
  // 提交结果只读投影；草稿不提前改变职位状态或删除空编。
  function previewSubmission(plan) {
    const pd=db.planData[plan.id],g=clone(pd.cur), positions=[], headcounts=[],cancelledOrgs=[],cancelledPositions=[];
    if (EDITABLE_STATUS.includes(plan.status)) {
      const stoppedPositions=g.positions.filter(p=>!G.isOrgEffective(g,p.orgId));
      stoppedPositions.forEach(p=>{
        if (p.status==='有效' && !positionClosureBlocked(g,p.id,plan.effDate)) { positions.push(p.id); p.status='停用'; }
      });
      const ids=new Set(stoppedPositions.map(p=>p.id));
      g.headcounts=g.headcounts.filter(h=>{
        if (!ids.has(h.positionId) || !canCloseVacancy(g,h)) return true;
        headcounts.push(h); return false;
      });
      rememberRemovedHeadcounts({cur:g,base:db.planData[plan.id].base},headcounts);
      g.positions=g.positions.filter(p=>{
        const org=G.org(g,p.orgId);
        if (!org || org.status!=='停用' || G.org(pd.base,org.id) || G.position(pd.base,p.id) ||
            positionClosureBlocked(g,p.id,plan.effDate) || cancelledPositionHasRefs(g,p.id) || G.hcsOf(g,p.id).length) return true;
        cancelledPositions.push(clone(G.position(pd.cur,p.id)));return false;
      });
      let removable;
      do {
        removable=g.orgs.filter(o=>o.status==='停用' && !G.org(pd.base,o.id) &&
          !g.orgs.some(child=>child.parentId===o.id) && !g.positions.some(p=>p.orgId===o.id) &&
          !(g.headcountWorkflows || []).some(w=>w.orgId===o.id));
        const ids=new Set(removable.map(o=>o.id));cancelledOrgs.push(...removable);
        g.orgs=g.orgs.filter(o=>!ids.has(o.id));
      } while(removable.length);
    }
    const removedPositions=new Set(cancelledPositions.map(p=>p.id));
    return {graph:g,positionIds:positions.filter(id=>!removedPositions.has(id)),headcounts,cancelledOrgs,cancelledPositions};
  }

  function positionUsage(g, id) {
    const employees = G.employeesAt(g, id), headcounts = G.hcsOf(g, id);
    const future = G.futurePersonsAt(g, id).concat((g.futureEvents || []).filter(e=>e.fromPositionId===id || e.toPositionId===id)), posts = G.postsOf(g, id);
    const demands = g.demands.filter(d => d.positionId === id && d.status !== '关闭' && d.status !== '取消');
    return { employees, headcounts, future, posts, demands,
      blocked: !!(employees.length || headcounts.length || future.length || posts.length || demands.length) };
  }
  function positionStopError(g, id) {
    const u = positionUsage(g, id);
    return u.blocked ? `职位「${G.position(g, id).name}」仍有员工 ${u.employees.length}、编制 ${u.headcounts.length}、未来事项 ${u.future.length + u.demands.length + u.posts.length}，请先处理` : '';
  }
  // 展示投影只读；顺序按组织树，再按职位顺序，不依赖面板搜索或当前职位。
  function workbenchGroups(plan, orgId, includeSub) {
    const pd = db.planData[plan.id], g = pd.cur, scope = scopeOrgIds(plan), orgIds = [];
    const walk = id => { if (scope.has(id)) orgIds.push(id); if (includeSub) G.childrenOrgs(g, id).forEach(o => walk(o.id)); };
    if (G.org(g, orgId)) walk(orgId);
    const removed = pd.base.headcounts.filter(h => !G.hc(g, h.id)).map(h => getRemovedHeadcount(plan, h.id));
    const removedOrg = h => h.removedOrgId || (G.position(g,h.positionId) || G.position(pd.base,h.positionId) || {}).orgId;
    const groups = orgIds.flatMap(id => {
      const positions = g.positions.filter(p => p.orgId===id || removed.some(h=>h && h.positionId===p.id && removedOrg(h)===id))
        .sort((a,b)=>positionSort(a)-positionSort(b));
      return positions.map(position => {
        const current = position.orgId===id;
        const people = current ? G.employeesAt(g,position.id) : [], headcounts = current ? G.hcsOf(g,position.id) : [];
        const events = current ? positionFutureEvents(g,position.id,plan.effDate) : [];
        const removedHcs = removed.filter(h=>h && h.positionId===position.id && removedOrg(h)===id);
        const demands = g.demands.filter(d=>headcounts.some(h=>h.demandId===d.id));
        const availableHcs = headcounts.filter(h=>h.state==='可用');
        return { key:id+':'+position.id, org:G.org(g,id), position, people, events, headcounts, breakdown:headcountBreakdown(g,headcounts), availableHcs, removedHcs, demands,
          posts:current ? G.postsOf(g,position.id) : [], totalCount:headcounts.length, availableCount:availableHcs.length };
      });
    });
    return { orgIds, people: groups.filter(x => x.people.length || x.posts.length || x.events.length), headcounts: groups.filter(x => x.totalCount || x.removedHcs.length || x.demands.length) };
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

  function diffPlan(plan, graph) {
    const pd = db.planData[plan.id], b = pd.base, c = graph || pd.cur;
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
      { key: 'virtualOrg', label: '是否虚拟组织', labelFn: (g, v) => v ? '是' : '否' },
      { key: 'leaderId', label: '部门负责人', labelFn: labelPerson }, { key: 'hrbpId', label: 'HRBP', labelFn: labelPerson },
      { key: 'hrbpOwnerId', label: 'HRBP负责人', labelFn: labelPerson },
      { key: 'costCenterId', label: '一级成本中心', labelFn: (g, v) => ((g.costCenters || []).find(x => x.id === v) || {}).name || (v || '—') },
      { key: 'costCategory', label: '财务用-成本分类' },
      { key: 'status', label: '状态', derived: (g,o) => o.status==='停用' && !G.org(b,o.id) ? '已取消新增' : o.status }
    ];
    const specPos = [
      { key: 'name', label: '名称' }, { key: 'orgId', label: '所属组织', labelFn: labelOrg },
      { key: 'jobSequence', label: '职序' }, { key: 'jobFamily', label: '职族' }, { key: 'jobClass', label: '职类' },
      { key: 'levelMin', label: '最低职级' }, { key: 'levelMax', label: '最高职级' },
      { key: 'costCategory', label: '成本分类' }, { key: 'collarColor', label: '领色' }, { key: 'status', label: '状态' }
    ];
    // 人员（在职）：组织为派生值（职位所属组织）
    const specPerson = [
      { key: 'orgId', label: '主职组织', derived: (g, p) => (G.position(g, p.positionId) || {}).orgId, labelFn: labelOrg },
      { key: 'positionId', label: '职位', labelFn: labelPosition },
      { key: 'managerId', label: '直接上级', labelFn: labelPerson },
      { key: 'headcountId', label: '占编情况', labelFn: (g, v) => (v ? '占编' : '未占编') },
      ...TRANSFER_FIELDS.map(f => ({ key: f.key, label: f.label }))
    ];
    const specHc = [
      { key: 'orgId', label: '所属组织', derived: (g, h) => (G.position(g, h.positionId) || {}).orgId, labelFn: labelOrg },
      { key: 'positionId', label: '所属职位', labelFn: labelPosition },
      { key: 'level', label: '编制职级' },
      { key: 'category', label: '编制 ABC 分类' },
      { key: 'overseas', label: '是否海外编制', labelFn: (g, v) => v ? '是' : '否' },
      { key: 'costCenterId', label: '一级成本中心', labelFn: (g, v) => ((g.costCenters || []).find(x => x.id === v) || {}).name || (v || '—') },
      { key: 'workLocation', label: '编制工作地点' }, { key: 'officeLocation', label: '编制办公地点' },
      { key: 'expectedArrivalDate', label: '预计到岗时间' },
      { key: 'state', label: '状态' },
      { key: 'personId', label: '占用对象', labelFn: labelPerson },
      { key: 'postId', label: '兼职关系' },
      { key: 'floatingUntil', label: '浮动结束日期' }
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
      if (!bo) { if (co.status === '停用' && newStoppedOrgIsEmpty(plan, id)) return; res.orgs.push({ id, changeType: co.status==='停用' ? '取消新增' : '新增', name: co.name, fields: fieldRows(specOrg, { name: null, parentId: null, virtualOrg: null, leaderId: null, hrbpId: null, hrbpOwnerId: null, costCenterId: null, costCategory: null, status: null }, co, b, c), reason: null }); return; }
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
      if (!bp) { res.positions.push({ id, changeType: '新增', name: cp.name, fields: fieldRows(specPos, { name: null, orgId: null, jobSequence: null, jobFamily: null, jobClass: null, levelMin: null, levelMax: null, costCategory: null, collarColor: null, status: null }, cp, b, c), reason: null }); return; }
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
        const moved = bp.positionId !== cp.positionId;
        const followedPosition = fields.some(f => f.key === 'orgId') && !moved;
        const reason = moved ? '调岗' : (followedPosition ? '随职位整体迁移' : (fields.some(f => f.key === 'managerId') ? '上级变更' : '其他变化'));
        res.persons.push({ id, changeType: moved ? '调岗' : '变更', name: cp.name, fields, reason });
      }
    });
    // 编制
    const hcIds = new Set(b.headcounts.map(x => x.id).concat(c.headcounts.map(x => x.id)));
    hcIds.forEach(id => {
      const bh = G.hc(b, id), ch = G.hc(c, id);
      if (!bh) { res.headcounts.push({ id, changeType: '新增', name: displayCode(plan, 'headcount', id), fields: fieldRows(specHc, { orgId: null, positionId: null, level: null, category: null, overseas: null, costCenterId: null, workLocation: null, officeLocation: null, expectedArrivalDate: null, state: null, personId: null }, ch, b, c), reason: '增编' }); return; }
      if (!ch) { res.headcounts.push({ id, changeType: '减编', name: bh.code, fields: [], reason: '减编' }); return; }
      const fields = fieldRows(specHc, bh, ch, b, c);
      if (fields.length) {
        const reason = bh.positionId !== ch.positionId ? (bh.state === '可用' && ch.state === '可用' ? '空编移动' : '调岗带编') : (fields.some(f => f.key === 'orgId') ? '随职位整体迁移' : '编制属性变更');
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
        { key: 'status', label: '关系状态' },
        { key: 'term', label: '兼职类型' },
        { key: 'endDate', label: '兼职结束日期' },
        { key: 'headcountId', label: '编制' }
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
  function scopeRemovalImpact(plan, rootId) {
    const pd = db.planData[plan.id], b = pd.base, c = pd.cur;
    const removed = new Set();
    G.descendantIds(b, rootId, true).forEach(id => removed.add(id));
    G.descendantIds(c, rootId, true).forEach(id => removed.add(id));
    const d = diffPlan(plan), items = [], seen = new Set();
    const add = (kind, id, name, changeType) => {
      const key = kind + ':' + id;
      if (seen.has(key)) return;
      seen.add(key); items.push({ kind, id, name: name || id, changeType });
    };
    const posOrg = (g, positionId) => { const p = G.position(g, positionId); return p && p.orgId; };
    const touchesPosition = (bp, cp) => !!((bp && removed.has(bp.orgId)) || (cp && removed.has(cp.orgId)));
    d.orgs.forEach(r => { if (removed.has(r.id)) add('组织', r.id, r.name, r.changeType); });
    d.positions.forEach(r => {
      const bp = G.position(b, r.id), cp = G.position(c, r.id);
      if (touchesPosition(bp, cp)) add('职位', r.id, r.name, r.changeType);
    });
    d.persons.forEach(r => {
      const bp = G.person(b, r.id), cp = G.person(c, r.id);
      if ((bp && removed.has(posOrg(b, bp.positionId))) || (cp && removed.has(posOrg(c, cp.positionId)))) add('人员', r.id, r.name, r.changeType);
    });
    d.headcounts.forEach(r => {
      const bh = G.hc(b, r.id), ch = G.hc(c, r.id);
      if ((bh && removed.has(posOrg(b, bh.positionId))) || (ch && removed.has(posOrg(c, ch.positionId)))) add('编制', r.id, r.name, r.changeType);
    });
    d.posts.forEach(r => {
      const bt = G.post(b, r.id), ct = G.post(c, r.id);
      const bHit = bt && (removed.has(posOrg(b, bt.mainPositionId)) || removed.has(posOrg(b, bt.concurrentPositionId)));
      const cHit = ct && (removed.has(posOrg(c, ct.mainPositionId)) || removed.has(posOrg(c, ct.concurrentPositionId)));
      if (bHit || cHit) add('兼职', r.id, r.name, r.changeType);
    });
    d.futureItems.forEach(r => {
      const bp = G.person(b, r.id), cp = G.person(c, r.id);
      const bHit = bp && removed.has(posOrg(b, bp.targetPositionId));
      const cHit = cp && removed.has(posOrg(c, cp.targetPositionId));
      if (bHit || cHit) add('未来事项', r.id, r.name, r.changeType);
    });
    const orgIds = new Set((b.orgs || []).map(o => o.id).concat((c.orgs || []).map(o => o.id)));
    orgIds.forEach(id => {
      if (!removed.has(id)) return;
      const bo = G.org(b, id), co = G.org(c, id);
      if (bo && co && orgSort(bo) !== orgSort(co)) add('组织排序', id, co.name, '排序');
    });
    const posIds = new Set((b.positions || []).map(p => p.id).concat((c.positions || []).map(p => p.id)));
    posIds.forEach(id => {
      const bp = G.position(b, id), cp = G.position(c, id);
      if (touchesPosition(bp, cp) && bp && cp && positionSort(bp) !== positionSort(cp)) add('职位排序', id, cp.name, '排序');
    });
    return { ok: items.length === 0, count: items.length, items: items.slice(0, 20) };
  }
  function diffCounts(plan, graph) { // CNT-10：发生最终差异的对象数（数据层始终六类）
    const d = diffPlan(plan, graph);
    return { 组织: d.orgs.length, 职位: d.positions.length, 人员: d.persons.length, 编制: d.headcounts.length, 兼职: d.posts.length, 未来事项: d.futureItems.length };
  }
  function diffCountsVisible(plan, graph) { // PRD 0.5：展示层页签/计数；关闭时只呈现五类
    const c = diffCounts(plan, graph);
    if (!FEATURES.concurrentPost) delete c['兼职'];
    return c;
  }

  /* ---------------- 变化标签（ORG-02/03、POS-03） ---------------- */
  function newStoppedOrgIsEmpty(plan, id) {
    const pd = db.planData[plan.id], g = pd.cur, o = G.org(g, id);
    if (!o || G.org(pd.base, id) || o.status !== '停用') return false;
    if (G.descendantIds(g, id, true).length !== 1) return false;
    return !g.positions.some(p => p.orgId === id) && !g.persons.some(p => p.positionId && G.position(g, p.positionId)?.orgId === id) && !g.persons.some(p => p.targetPositionId && G.position(g, p.targetPositionId)?.orgId === id);
  }
  function orgDerivedChanged(plan, id) {
    const pd = db.planData[plan.id], b = pd.base, c = pd.cur, bo = G.org(b, id), co = G.org(c, id);
    if (!bo || !co) return false;
    return G.orgLevel(b, id) !== G.orgLevel(c, id) || G.pathNames(b, id).join('/') !== G.pathNames(c, id).join('/');
  }
  function orgChangeTags(plan, id) {
    const pd = db.planData[plan.id], bo = G.org(pd.base, id), co = G.org(pd.cur, id);
    if (co.status === '停用') return [bo ? '停用' : '已取消新增'];
    if (!bo) return ['新增'];
    const d = diffPlan(plan).orgs.find(r => r.id === id);
    return d && d.fields.length || orgDerivedChanged(plan, id) ? ['变更'] : []; // WB-09：直接或派生字段变化统一为“变更”
  }
  function positionChangeTags(plan, id) {
    const pd = db.planData[plan.id], bp = G.position(pd.base, id), cp = G.position(pd.cur, id);
    if (cp.status === '停用') return ['停用']; // 同 ORG-03：停用优先
    if (!bp) return ['新增'];
    const d = diffPlan(plan).positions.find(r => r.id === id);
    return d && d.fields.length ? ['变更'] : [];
  }
  function personChangeTags(plan, id) {
    const d = diffPlan(plan).persons.find(r => r.id === id);
    return d && d.changeType === '调岗' ? ['调岗'] : [];
  }
  function headcountChangeTags(plan, id) {
    const d = diffPlan(plan).headcounts.find(r => r.id === id);
    return d ? [d.changeType] : [];
  }

  /* ---------------- 操作（全部经 apply 单一入口） ---------------- */
  // PER-05—10a：预览与确认使用同一投影，不把草稿编制缺口当成结构错误。
  function previewTransfer(plan, pd, payload) {
    const rows = payload.rows || [], target = payload.targetHeadcountId;
    if (!rows.length) return { rowErrors: [{ message: '请选择人员' }] };
    const errors = OPS.validateTransfer(pd, rows, plan, payload);
    if (errors) return { rowErrors: errors };
    if (target) {
      const h = G.hc(pd.cur, target), first = G.person(pd.cur, rows[0].personId);
      if (!h || h.state !== '可用' || headcountOccupancy(pd.cur,h).occupants.length || rows.some(r=>r.targetPositionId!==h.positionId))
        return { rowErrors: [{ personId:first.id, name:first.name, message:'目标编制已不可用或不属于目标职位，请重新选择' }] };
      if (first.headcountRequired === false)
        return { rowErrors: [{ personId:first.id, name:first.name, message:'该人员不应占编，不能拖到具体空编；请拖到职位或组织' }] };
    }
    const projected = clone(pd.cur);
    try {
      const result = executeTransfer(projected, rows, plan, payload);
      assertGraph(projected);
      return result;
    } catch (e) { return { rowErrors: [{ message:e.message }] }; }
  }
  function executeTransfer(g, rows, plan, payload) {
    const carried = new Set(), floatingSources = new Set(), bindingOnly = new Set();
    let floatingCount = 0;
    rows.forEach(r => {
      const p = G.person(g,r.personId), h = G.hc(g,p.headcountId), oldManagerId = p.managerId;
      const samePosition = p.positionId === r.targetPositionId;
      if (samePosition) bindingOnly.add(p.id);
      const bring = !payload.targetHeadcountId && r.bringHeadcount && h && !h.floatingUntil && p.headcountRequired !== false;
      if (h?.floatingUntil) { floatingSources.add(h.id); floatingCount++; }
      if (h) {
        if (bring) { h.positionId = r.targetPositionId; carried.add(p.id); }
        else releaseMainBinding(g,p);
      }
      if (samePosition) return;
      p.positionId = r.targetPositionId; p.managerId = r.managerId;
      TRANSFER_FIELDS.forEach(f => { if (r[f.key] !== undefined) p[f.key] = String(r[f.key] || '').trim(); });
      p.transferDate = plan.effDate; p.transferReason = '组织架构调整'; p.isRotation = false;
      G.subordinatesOf(g,p.id).forEach(s => {
        const so = G.org(g,G.position(g,s.positionId)?.orgId);
        let next = so?.leaderId;
        if (!next || next === p.id || next === s.id) next = oldManagerId && oldManagerId !== s.id ? oldManagerId : r.managerId;
        if (next && next !== s.id) s.managerId = next;
      });
    });
    const available = g.headcounts.filter(h => {
      const pos=G.position(g,h.positionId);
      return h.state==='可用' && !h.personId && !h.postId && !h.demandId && !floatingSources.has(h.id) &&
        !headcountOccupancy(g,h).occupants.length && pos && lvlIdx(h.level)>=lvlIdx(pos.levelMin) && lvlIdx(h.level)<=lvlIdx(pos.levelMax);
    }).sort(headcountOrder);
    let boundCount = 0;
    rows.forEach((r,i) => {
      const p=G.person(g,r.personId);
      if (p.headcountId || p.headcountRequired===false) return;
      const preferred = i===0 && payload.targetHeadcountId ? available.find(h=>h.id===payload.targetHeadcountId) : null;
      const h = preferred || available.find(h=>h.positionId===p.positionId);
      if (!h) return;
      available.splice(available.indexOf(h),1);
      p.headcountId=h.id;h.personId=p.id;h.state='占编';delete h.floatingUntil;
      boundCount++;
    });
    const assignments = rows.map(r => {
      const p=G.person(g,r.personId),h=G.hc(g,p.headcountId),state=assignmentHeadcountState(g,p,'main',plan.effDate);
      return {personId:p.id,name:p.name,headcountId:h?.id || null,code:h ? displayCode(plan,'headcount',h.id) : '',status:state.status,
        reasons:state.reasons,carried:carried.has(p.id),bindingOnly:bindingOnly.has(p.id)};
    });
    return { assignments, signature:assignments.map(a=>[a.personId,a.headcountId,a.status]),boundCount,carriedCount:carried.size,floatingCount,
      pendingCount:assignments.filter(a=>a.status==='待绑定').length,abnormalCount:assignments.filter(a=>a.status==='异常').length,
      bindingOnly:bindingOnly.size===rows.length };
  }

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
      const scopeCheck = validateScope(universe, payload.scopeOrgIds, payload.effDate);
      if (scopeCheck.blocking.length) throw new Error(scopeCheck.blocking[0].message);
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
    updatePlanInfo({ plan, pd, payload }) {
      const name = (payload.name || '').trim();
      if (!name) throw new Error('请填写方案名称');
      if (!ADJUST_LEVELS.includes(payload.adjustLevel)) throw new Error('请选择调整层级');
      if (!ADJUST_REASONS.includes(payload.adjustReason)) throw new Error('请选择调整原因');
      if (payload.effDate !== undefined && payload.effDate !== plan.effDate) throw new Error('生效日期创建后不可修改');
      const sourceScopeIds = Array.from(new Set(payload.sourceScopeIds || []));
      const targetScopeIds = Array.from(new Set(payload.targetScopeIds || []));
      const roots = sourceScopeIds.concat(targetScopeIds);
      if (!roots.length) throw new Error('至少保留一个调整范围');
      const scopeCheck = validateScope(pd.cur, roots, plan.effDate);
      if (scopeCheck.blocking.length) throw new Error(scopeCheck.blocking[0].message);
      const oldRoots = (plan.sourceScopeIds || []).concat(plan.targetScopeIds || []);
      const nextRootSet = new Set(roots);
      oldRoots.filter(id => !nextRootSet.has(id)).forEach(id => {
        const impact = scopeRemovalImpact(plan, id);
        if (!impact.ok) throw new Error(`不能移除该组织范围：其及以下存在 ${impact.count} 项方案调整`);
      });
      plan.name = name;
      plan.adjustLevel = payload.adjustLevel;
      plan.adjustReason = payload.adjustReason;
      plan.desc = payload.desc || '';
      plan.sourceScopeIds = sourceScopeIds;
      plan.targetScopeIds = targetScopeIds;
      return {
        addedScopeIds: roots.filter(id => !oldRoots.includes(id)),
        removedScopeIds: oldRoots.filter(id => !nextRootSet.has(id))
      };
    },
    discardPlan({ plan, payload: { reason } = {} }) {
      if (!EDITABLE_STATUS.includes(plan.status)) throw new Error('当前状态不可放弃');
      plan.status = STATUS.DISCARDED;
      return {};
    },
    extendScope({ plan, pd, payload }) { // 兼容旧入口；主工作台由 updatePlanInfo 统一维护范围
      const ids = payload.orgIds || [];
      const scopeCheck = validateScope(pd.cur, ids, plan.effDate);
      if (scopeCheck.blocking.length) throw new Error(scopeCheck.blocking[0].message);
      const beforeScope = scopeOrgIds(plan);
      ids.forEach(id => {
        if (!G.org(pd.cur, id)) throw new Error('组织不存在');
        if (scopeOrgIds(plan).has(id)) return; // 已在范围（含子树）
        if (!plan.targetScopeIds.includes(id)) plan.targetScopeIds.push(id);
      });
      return { warnings: scopeCheck.warnings, addedCount: scopeCheck.eligibleOrgIds.filter(id => !beforeScope.has(id)).length };
    },

    /* ---- 组织（ORG-05—14） ---- */
    addOrg({ plan, pd, payload }) {
      const name = (payload.name || '').trim();
      if (!name) throw new Error('请填写组织名称');
      const parentError = validateOrgParent(plan, pd, payload.parentId, null);
      if (parentError) throw new Error(parentError);
      const parent = G.org(pd.cur, payload.parentId);
      const id = nextId(pd, 'org', 'NO');
      const sortCode = G.childrenOrgs(pd.cur, parent.id).length + 1;
      pd.cur.orgs.push({
        id, name, code: '', parentId: parent.id,
        sortCode, order: sortCode, status: '有效', setupDate: plan.effDate, effectiveDate: plan.effDate,
        virtualOrg: payload.virtualOrg === true, leaderId: payload.leaderId || null,
        hrbpId: payload.hrbpId || DEFAULT_PERSON_ID, hrbpOwnerId: payload.hrbpOwnerId || DEFAULT_PERSON_ID,
        costCenterId: payload.costCenterId || DEFAULT_COST_CENTER_ID, costCategory: payload.costCategory || '职能'
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
      if (payload.hrbpOwnerId !== undefined) o.hrbpOwnerId = payload.hrbpOwnerId;
      if (payload.costCenterId !== undefined) o.costCenterId = payload.costCenterId;
      if (payload.costCategory !== undefined) o.costCategory = payload.costCategory;
      if (payload.virtualOrg !== undefined) o.virtualOrg = payload.virtualOrg === true;
      if (!o.hrbpId || !G.person(pd.cur, o.hrbpId)) throw new Error('请选择 HRBP');
      if (!o.hrbpOwnerId || !G.person(pd.cur, o.hrbpOwnerId)) throw new Error('请选择 HRBP 负责人');
      if (!o.costCenterId || !(pd.cur.costCenters || []).some(x => x.id === o.costCenterId)) throw new Error('请选择一级成本中心');
      if (!o.costCategory) throw new Error('请选择财务用-成本分类');
      if (payload.parentId !== undefined && payload.parentId !== o.parentId) {
        const parentError = validateOrgParent(plan, pd, payload.parentId, payload.id);
        if (parentError) throw new Error(parentError);
        const err = validateMoveOrg(plan, pd, payload.id, payload.parentId);
        if (err) throw new Error(err);
        moveOrgMutate(pd, payload.id, payload.parentId);
      }
      o.effectiveDate = plan.effDate;
      return {};
    },
    moveOrg({ plan, pd, payload }) {
      const err = validateMoveOrg(plan, pd, payload.id, payload.newParentId);
      if (err) throw new Error(err);
      moveOrgMutate(pd, payload.id, payload.newParentId);
      return {};
    },
    cancelNewOrg({ plan, pd, payload }) {
      const org = G.org(pd.cur, payload.id);
      if (!org) throw new Error('组织不存在');
      if (!scopeOrgIds(plan).has(org.id)) throw new Error('组织不在调整范围内');
      if (!isNewOrg(plan,org.id)) throw new Error('仅本方案新增的组织可取消新增');
      if (!canCancelNewOrg(plan, org.id)) {
        if (payload.emptyOnly) throw new Error('组织已有关联内容，请重新打开取消新增处理表单');
        const preview=previewStopOrg(plan,org.id);
        if ((pd.cur.headcountWorkflows || []).some(w=>payload.mode==='transfer' ? w.orgId===org.id : preview.orgIds.includes(w.orgId))) throw new Error('仍有关联编制流程，请先处理');
        const result=OPS.stopOrg({plan,pd,payload:Object.assign({},payload,{orgId:org.id,cancelNew:true})});
        if (canCancelNewOrg(plan,org.id)) return Object.assign(result,OPS.cancelNewOrg({plan,pd,payload:{id:org.id}}));
        return Object.assign(result,{cancelNew:true});
      }
      pd.cur.orgs = pd.cur.orgs.filter(o => o.id !== org.id);
      plan.sourceScopeIds = (plan.sourceScopeIds || []).filter(id => id !== org.id);
      plan.targetScopeIds = (plan.targetScopeIds || []).filter(id => id !== org.id);
      return { cancelledOrgId: org.id, parentId: org.parentId };
    },
    toggleOrg({ plan, pd, payload }) {
      const o = G.org(pd.cur, payload.id);
      if (!o) throw new Error('组织不存在');
      if (payload.action === '停用') return OPS.stopOrg({ plan, pd, payload: { orgId: o.id, mode: 'manual', stopDescendantOrgs: true, stopSubtreePositions: true } });
      else if (payload.action === '启用' || payload.action === '恢复新增') {
        if (o.status !== '停用') throw new Error('仅停用或已取消新增组织可恢复');
        if (payload.action==='恢复新增' && !isNewOrg(plan,o.id)) throw new Error('仅本方案新增的组织可恢复新增');
        o.status = '有效';return {restoredNew:isNewOrg(plan,o.id)};
      } // ORG-09：不恢复已迁走对象
      else throw new Error('未知动作');
      return {};
    },
    stopOrg({ plan, pd, payload }) {
      if (isNewOrg(plan,payload.orgId) && !payload.cancelNew) return OPS.cancelNewOrg({plan,pd,payload:Object.assign({},payload,{id:payload.orgId})});
      const preview = previewStopOrg(plan, payload.orgId);
      const org = preview.org;
      if (org.status !== '有效') throw new Error('仅有效组织可停用');
      const mode = payload.mode === 'transfer' ? 'transfer' : 'manual';
      if (mode === 'transfer') {
        const targetId = payload.targetOrgId;
        const target = G.org(pd.cur, targetId);
        if (!target) throw new Error('请选择新上级组织');
        if (!G.isOrgEffective(pd.cur,targetId)) throw new Error('新上级组织必须有效');
        if (preview.orgIds.includes(targetId)) throw new Error('新上级组织不能是当前组织或其下级');
        if (!scopeOrgIds(plan).has(targetId)) throw new Error('新上级组织不在调整范围内，请先加入范围');
        let orgOrder = G.childrenOrgs(pd.cur, targetId).length + 1;
        G.childrenOrgs(pd.cur, org.id).forEach(child => { child.parentId = targetId; child.sortCode = orgOrder; child.order = orgOrder++; });
        let posOrder = pd.cur.positions.filter(p => p.orgId === targetId).length + 1;
        preview.directPositions.slice().sort((a, b) => positionSort(a) - positionSort(b)).forEach(p => { p.orgId = targetId; p.sequenceNo = posOrder; p.order = posOrder++; });
        org.status = '停用';
        return { mode, targetOrgId: targetId, movedOrgIds: preview.childOrgIds.slice(), movedPositionIds: preview.directPositions.map(p => p.id) };
      }
      if (preview.blockingReason) throw new Error(preview.blockingReason);
      preview.orgIds.forEach(id => { G.org(pd.cur, id).status = '停用'; });
      return { mode, stoppedOrgIds: preview.orgIds, stoppedPositionIds: [], removed: [] };
    },
    copyOrg({ plan, pd, payload }) {
      const preview = previewCopyOrg(plan, payload || {});
      const src = preview.src;
      if (!G.isOrgEffective(pd.cur,src.id)) throw new Error('仅有效组织可复制');
      const name = payload.name === undefined ? (src.name || '') + '副本' : (payload.name || '').trim();
      const sourceParentInScope = src.parentId && scopeOrgIds(plan).has(src.parentId) ? src.parentId : null;
      const parentId = payload.parentId === undefined ? sourceParentInScope : (payload.parentId || null);
      const parentError = validateOrgParent(plan, pd, parentId, null);
      if (parentError) throw new Error(parentError.replace('上级组织不在调整范围内，请先加入范围', '复制目标上级不在调整范围内，请先加入范围'));
      const parent = G.org(pd.cur, parentId);
      const sourceLevel = G.orgLevel(pd.cur, src.id);
      const copiedDepth = Math.max(...preview.orgIds.map(id => G.orgLevel(pd.cur, id) - sourceLevel));
      if (G.orgLevel(pd.cur, parent.id) + 1 + copiedDepth > MAX_ORG_LEVEL) throw new Error('复制后组织层级不能超过八级');
      if (!name) throw new Error('请填写组织名称');
      const orgMap = {};
      const newOrgIds = [];
      preview.orgIds.forEach(sourceId => {
        const source = G.org(pd.cur, sourceId);
        const isRoot = sourceId === src.id;
        const newId = nextId(pd, 'org', 'NO');
        const newParentId = isRoot ? parentId : orgMap[source.parentId];
        if (!isRoot && !newParentId) throw new Error('复制下级组织层级失败');
        const inherited = isRoot ? {
          leaderId: payload.leaderId || null,
          hrbpId: payload.hrbpId || src.hrbpId || DEFAULT_PERSON_ID,
          hrbpOwnerId: payload.hrbpOwnerId || src.hrbpOwnerId || DEFAULT_PERSON_ID,
          costCenterId: payload.costCenterId || src.costCenterId || DEFAULT_COST_CENTER_ID,
          costCategory: payload.costCategory || src.costCategory || '默认',
          virtualOrg: payload.virtualOrg === undefined ? !!src.virtualOrg : payload.virtualOrg === true
        } : (() => {
          const parentCopy = G.org(pd.cur, newParentId);
          return {
            leaderId: parentCopy ? parentCopy.leaderId || null : null,
            hrbpId: parentCopy ? parentCopy.hrbpId || DEFAULT_PERSON_ID : DEFAULT_PERSON_ID,
            hrbpOwnerId: parentCopy ? parentCopy.hrbpOwnerId || DEFAULT_PERSON_ID : DEFAULT_PERSON_ID,
            costCenterId: parentCopy ? parentCopy.costCenterId || DEFAULT_COST_CENTER_ID : DEFAULT_COST_CENTER_ID,
            costCategory: parentCopy ? parentCopy.costCategory || '默认' : '默认',
            virtualOrg: !!(parentCopy && parentCopy.virtualOrg)
          };
        })();
        const newOrg = {
          id: newId,
          name: isRoot ? name : (source.name || ''),
          code: '',
          parentId: newParentId || null,
          sortCode: G.childrenOrgs(pd.cur, newParentId).length + 1,
          order: G.childrenOrgs(pd.cur, newParentId).length + 1,
          status: '有效',
          setupDate: plan.effDate,
          effectiveDate: plan.effDate,
          leaderId: inherited.leaderId,
          hrbpId: inherited.hrbpId,
          hrbpOwnerId: inherited.hrbpOwnerId,
          costCenterId: inherited.costCenterId,
          costCategory: inherited.costCategory,
          virtualOrg: inherited.virtualOrg
        };
        pd.cur.orgs.push(newOrg);
        orgMap[sourceId] = newId;
        newOrgIds.push(newId);
        if (!plan.targetScopeIds.includes(newId)) plan.targetScopeIds.push(newId);
      });
      const newPositionIds = [];
      if (preview.positions.length) {
        const orderByOrg = {};
        preview.positions.forEach(source => {
          const newOrgId = orgMap[source.orgId];
          orderByOrg[newOrgId] = (orderByOrg[newOrgId] || 0) + 1;
          const id = nextId(pd, 'position', 'NP');
          pd.cur.positions.push({
            id,
            name: source.name,
            code: '',
            orgId: newOrgId,
            sequenceNo: orderByOrg[newOrgId],
            order: orderByOrg[newOrgId],
            status: '有效',
            setupDate: plan.effDate,
            effectiveDate: plan.effDate,
            jobSequence: source.jobSequence || '默认', jobFamily: source.jobFamily || '默认', jobClass: source.jobClass || '默认',
            costCategory: source.costCategory || '默认', collarColor: source.collarColor || '白领', syncIncumbency: true,
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
      orderedIds.forEach((id, i) => { const o = G.org(pd.cur, id); if (o && o.parentId === parentId) { o.sortCode = i + 1; o.order = o.sortCode; } });
      return {};
    },

    /* ---- 职位（POS-04—14） ---- */
    addPosition({ plan, pd, payload }) {
      const name = (payload.name || '').trim();
      if (!name) throw new Error('请填写职位名称');
      const org = G.org(pd.cur, payload.orgId);
      if (!org) throw new Error('所属组织不存在');
      if (!G.isOrgEffective(pd.cur,org.id)) throw new Error('所属组织及其祖先必须有效，不能新增职位');
      if (!scopeOrgIds(plan).has(payload.orgId)) throw new Error('所属组织不在调整范围内，请先加入范围');
      const levelMin = canonicalLevel(payload.levelMin), levelMax = canonicalLevel(payload.levelMax);
      if (lvlIdx(levelMin) < 0 || lvlIdx(levelMax) < 0) throw new Error('请选择职级范围');
      if (lvlIdx(levelMin) > lvlIdx(levelMax)) throw new Error('最低职级不能高于最高职级');
      const jobSequence = payload.jobSequence || '默认', jobFamily = payload.jobFamily || '默认', jobClass = payload.jobClass || '默认', costCategory = payload.costCategory || '默认', collarColor = payload.collarColor || '白领';
      if (!['白领', '蓝领', '灰领'].includes(collarColor)) throw new Error('请选择领色');
      const id = nextId(pd, 'position', 'NP');
      const sequenceNo = pd.cur.positions.filter(p => p.orgId === payload.orgId).length + 1;
      pd.cur.positions.push({
        id, name, code: '', orgId: payload.orgId,
        sequenceNo, order: sequenceNo, status: '有效', setupDate: plan.effDate, effectiveDate: plan.effDate,
        jobSequence, jobFamily, jobClass, costCategory, collarColor, syncIncumbency: true,
        levelMin, levelMax
      });
      return { id };
    },
    editPosition({ plan, pd, payload }) {
      const p = G.position(pd.cur, payload.id);
      if (!p) throw new Error('职位不存在');
      if (p.status === '停用') throw new Error('已停用职位不可编辑');
      if (!scopeOrgIds(plan).has(p.orgId)) throw new Error('职位不在调整范围内');
      if (payload.name !== undefined) { if (!(payload.name || '').trim()) throw new Error('职位名称不能为空'); p.name = payload.name.trim(); }
      if (payload.levelMin !== undefined) p.levelMin = canonicalLevel(payload.levelMin);
      if (payload.levelMax !== undefined) p.levelMax = canonicalLevel(payload.levelMax);
      if (payload.jobSequence !== undefined) p.jobSequence = payload.jobSequence;
      if (payload.jobFamily !== undefined) p.jobFamily = payload.jobFamily;
      if (payload.jobClass !== undefined) p.jobClass = payload.jobClass;
      if (payload.costCategory !== undefined) p.costCategory = payload.costCategory;
      if (payload.collarColor !== undefined) { if (!['白领', '蓝领', '灰领'].includes(payload.collarColor)) throw new Error('请选择领色'); p.collarColor = payload.collarColor; }
      if (!p.jobSequence || !p.jobFamily || !p.jobClass || !p.costCategory || !p.collarColor) throw new Error('请补充职位必填字段');
      if (lvlIdx(p.levelMin) < 0 || lvlIdx(p.levelMax) < 0 || lvlIdx(p.levelMin) > lvlIdx(p.levelMax)) throw new Error('请选择有效职级范围，最低职级不能高于最高职级');
      // F-03 Demo 约定：允许保存，原有编制不再匹配 → 待处理（computePending），提交前不能忽略
      if (payload.orgId !== undefined && payload.orgId !== p.orgId) {
        const err = validateMovePositions(plan, pd, [payload.id], payload.orgId);
        if (err) throw new Error(err);
        p.sequenceNo = nextPositionOrder(pd.cur,payload.orgId); p.order = p.sequenceNo;
        p.orgId = payload.orgId;
      }
      return {};
    },
    copyPosition({ plan, pd, payload }) {
      const src = G.position(pd.cur, payload.id);
      if (!src) throw new Error('职位不存在');
      const targetOrgId = payload.orgId === undefined ? src.orgId : payload.orgId;
      const targetOrg = G.org(pd.cur, targetOrgId);
      if (!targetOrg || !G.isOrgEffective(pd.cur,targetOrgId)) throw new Error('所属组织及其祖先必须有效');
      if (!scopeOrgIds(plan).has(targetOrgId)) throw new Error('所属组织不在调整范围内，请先加入范围');
      const jobSequence = payload.jobSequence || src.jobSequence || '默认', jobFamily = payload.jobFamily || src.jobFamily || '默认', jobClass = payload.jobClass || src.jobClass || '默认', costCategory = payload.costCategory || src.costCategory || '默认', collarColor = payload.collarColor || src.collarColor || '白领';
      if (!['白领', '蓝领', '灰领'].includes(collarColor)) throw new Error('请选择领色');
      const id = nextId(pd, 'position', 'NP');
      const levelMin = canonicalLevel(payload.levelMin === undefined ? src.levelMin : payload.levelMin);
      const levelMax = canonicalLevel(payload.levelMax === undefined ? src.levelMax : payload.levelMax);
      if (lvlIdx(levelMin) < 0 || lvlIdx(levelMax) < 0 || lvlIdx(levelMin) > lvlIdx(levelMax)) throw new Error('请选择有效职级范围，最低职级不能高于最高职级');
      const sequenceNo = pd.cur.positions.filter(p => p.orgId === targetOrgId).length + 1;
      pd.cur.positions.push({ // POS-06：仅属性，不复制员工/编制/兼职/未来
        id, name: (payload.name || '').trim() || (src.name + '副本'), code: '', orgId: targetOrgId,
        sequenceNo, order: sequenceNo,
        status: '有效', setupDate: plan.effDate, effectiveDate: plan.effDate,
        jobSequence, jobFamily, jobClass, costCategory, collarColor, syncIncumbency: true,
        levelMin, levelMax
      });
      return { id };
    },
    copyPositions({ plan, pd, payload }) {
      const ids = Array.from(new Set(payload.positionIds || []));
      if (!ids.length) throw new Error('请选择有效职位');
      const targetOrgId = payload.orgId;
      const targetOrg = G.org(pd.cur, targetOrgId);
      if (!targetOrg || !G.isOrgEffective(pd.cur,targetOrgId)) throw new Error('所属组织及其祖先必须有效');
      if (!scopeOrgIds(plan).has(targetOrgId)) throw new Error('所属组织不在调整范围内，请先加入范围');
      const sources = ids.map(id => G.position(pd.cur, id));
      if (sources.some(p => !p)) throw new Error('所选职位中存在不存在的职位');
      if (sources.some(p => p.status !== '有效')) throw new Error('停用职位不能批量复制');
      const out = [];
      let sequenceNo = pd.cur.positions.filter(p => p.orgId === targetOrgId).length + 1;
      sources.forEach(src => {
        const id = nextId(pd, 'position', 'NP');
        pd.cur.positions.push({
          id, name: (src.name || '') + '副本', code: '', orgId: targetOrgId,
          sequenceNo, order: sequenceNo++, status: '有效', setupDate: plan.effDate, effectiveDate: plan.effDate,
          jobSequence: src.jobSequence || '默认', jobFamily: src.jobFamily || '默认', jobClass: src.jobClass || '默认',
          costCategory: src.costCategory || '默认', collarColor: src.collarColor || '白领', syncIncumbency: true,
          levelMin: src.levelMin, levelMax: src.levelMax
        });
        out.push(id);
      });
      return { ids: out };
    },
    cancelNewPosition({ plan, pd, payload }) {
      const p = G.position(pd.cur,payload.id);
      if (!p) throw new Error('职位不存在');
      if (G.position(pd.base,p.id)) throw new Error('仅本方案新增职位可取消新增');
      if (!scopeOrgIds(plan).has(p.orgId)) throw new Error('职位不在调整范围内');
      const error = positionStopError(pd.cur,p.id);
      if (error) throw new Error(error);
      if (cancelledPositionHasRefs(pd.cur,p.id) || (pd.cur.removedHeadcounts || []).some(h=>h.positionId===p.id)) throw new Error('该职位仍有历史引用，请先转出关联或转移整个职位');
      pd.cur.positions = pd.cur.positions.filter(x=>x.id!==p.id);
      return {cancelledPositionId:p.id};
    },
    togglePosition({ plan, pd, payload }) {
      const p = G.position(pd.cur, payload.id);
      if (!p) throw new Error('职位不存在');
      if (!scopeOrgIds(plan).has(p.orgId)) throw new Error('职位不在调整范围内');
      if (payload.action === '停用' && !G.position(pd.base,p.id)) return OPS.cancelNewPosition({plan,pd,payload});
      if (payload.action === '停用') { if (p.status !== '有效') throw new Error('仅有效职位可停用'); const err = positionStopError(pd.cur, p.id); if (err) throw new Error(err); p.status = '停用'; }
      else if (payload.action === '启用') { if (p.status !== '停用') throw new Error('仅停用职位可启用'); if (!G.isOrgEffective(pd.cur,p.orgId)) throw new Error('请先启用所属组织及上级组织'); p.status = '有效'; }
      else throw new Error('未知动作');
      return {};
    },
    togglePositions({ plan, pd, payload }) {
      const ids = Array.from(new Set(payload.positionIds || []));
      if (!['启用','停用'].includes(payload.action)) throw new Error('未知动作');
      const wanted = payload.action === '启用' ? '停用' : '有效';
      if (!ids.length) throw new Error('请选择职位');
      const selected=ids.map(id=>G.position(pd.cur,id));
      if (selected.some(p=>!p)) throw new Error('所选职位中存在不存在的职位');
      if (selected.some(p=>p.status!==wanted)) throw new Error('请按有效或已停用状态分别选择职位');
      ids.forEach(id=>OPS.togglePosition({plan,pd,payload:{id,action:payload.action}}));
      return { changed:ids, skipped:0 };
    },
    movePositions({ plan, pd, payload }) {
      const { positionIds, targetOrgId } = payload;
      const err = validateMovePositions(plan, pd, positionIds, targetOrgId);
      if (err) throw new Error(err);
      let order=nextPositionOrder(pd.cur,targetOrgId);
      positionIds.forEach(id => { const p=G.position(pd.cur,id); p.orgId=targetOrgId; p.sequenceNo=order; p.order=order++; }); // POS-09：身份及关联保留
      return {};
    },
    reorderPositions({ pd, payload }) { // POS-13
      const { orderedIds, orgId } = payload;
      orderedIds.forEach((id, i) => { const p = G.position(pd.cur, id); if (p && (!orgId || p.orgId === orgId)) { p.sequenceNo = i + 1; p.order = p.sequenceNo; } });
      return {};
    },

    /* ---- 人员调岗（PER-05—14） ---- */
    validateTransfer(pd, rows, plan, options = {}) {
      const rowErrors = [];
      const managerMap = {}; // 本批次提议的经理关系（整批校验循环）
      const seen = new Set();
      rows.forEach((r, i) => {
        const p = G.person(pd.cur, r.personId);
        const fail = m => rowErrors[i] = { personId: r.personId, name: p ? p.name : r.personId, message: m };
        if (!p || p.status !== '在职' || p.kind !== 'employee') { fail('仅在职员工可调岗'); return; }
        if (seen.has(p.id)) { fail('同一人员不能重复调整'); return; }
        seen.add(p.id);
        const tp = G.position(pd.cur, r.targetPositionId);
        if (!tp) { fail('目标职位不存在'); return; }
        if (tp.status === '停用') { fail('目标职位已停用'); return; }
        if (!G.isOrgEffective(pd.cur, tp.orgId)) { fail('目标职位所属组织已停用'); return; }
        if (plan && !scopeOrgIds(plan).has(tp.orgId)) { fail('目标部门不在调整范围内'); return; }
        if (r.targetOrgId !== undefined && r.targetOrgId !== tp.orgId) { fail('目标职位不属于所选部门'); return; }
        const sourceHc = G.hc(pd.cur, p.headcountId);
        if (tp.id === p.positionId) {
          if (!options.targetHeadcountId || p.headcountRequired === false || (p.headcountId && !sourceHc?.floatingUntil)) { fail('目标职位与当前职位相同；仅浮动或待绑编人员可在本职位绑定空编'); return; }
          return; // 同职位仅绑定，不校验或修改调岗字段、上级。
        }
        const missing = TRANSFER_FIELDS.find(f => f.required && !String(r[f.key] === undefined ? (p[f.key] || '') : (r[f.key] || '')).trim());
        if (missing) { fail('请填写' + missing.label); return; }
        if (!p.level || !p.personnelType) { fail('人员职级或人员类型缺失'); return; }
        if (!r.managerId) { fail('请选择调整后直接上级'); return; }
        if (r.managerId === p.id) { fail('直接上级不能选择本人'); return; }
        if (!G.person(pd.cur, r.managerId) || G.person(pd.cur, r.managerId).status !== '在职') { fail('直接上级无效'); return; }
        managerMap[p.id] = { managerId: r.managerId, old: p.managerId, targetPositionId: tp.id, bring: !!r.bringHeadcount && !!p.headcountId };

      });
      if (rowErrors.some(Boolean)) return rowErrors;
      // 循环校验：把提议经理关系叠加后逐人走链
      rows.forEach(r => {
        if (!managerMap[r.personId]) return;
        let cur = managerMap[r.personId].managerId, guard = 0;
        while (cur && guard++ < 200) {
          if (cur === r.personId) { rowErrors[rows.indexOf(r)] = { personId: r.personId, name: G.person(pd.cur, r.personId).name, message: '直接上级选择形成汇报循环' }; return; }
          cur = managerMap[cur] ? managerMap[cur].managerId : (G.person(pd.cur, cur) || {}).managerId;
        }
      });
      if (rowErrors.some(Boolean)) return rowErrors;
      return null;
    },
    previewTransfer({ plan, pd, payload }) {
      return previewTransfer(plan, pd, payload);
    },
    transferPersons({ plan, pd, payload }) {
      const preview = previewTransfer(plan, pd, payload);
      if (preview.rowErrors) return { rowErrors: preview.rowErrors };
      if (payload.expectedAssignments && JSON.stringify(payload.expectedAssignments) !== JSON.stringify(preview.signature))
        throw new Error('编制分配已变化，请核对更新后的安排再确认');
      return executeTransfer(pd.cur, payload.rows || [], plan, payload);
    },

    /* ---- 编制（HC-01—14） ---- */
    releaseHeadcount({ pd, payload }) {
      const p = G.person(pd.cur, payload.personId);
      if (!p || p.status !== '在职') throw new Error('仅在职人员可解除绑定');
      if (!p.headcountId) throw new Error('该人员未占编');
      releaseMainBinding(pd.cur,p); // 浮动仍有人时保留占用，最后一人解除才变可用
      return {};
    },
    releaseHeadcounts({ pd, payload }) {
      const ids = Array.from(new Set(payload.personIds || []));
      const targets = ids.map(id => G.person(pd.cur, id)).filter(p => p && p.status === '在职' && p.headcountId);
      if (!targets.length) throw new Error('所选人员均未占编');
      targets.forEach(p => {
        releaseMainBinding(pd.cur,p);
      });
      return { released: targets.map(p => p.id), skipped: ids.length - targets.length };
    },
    cancelFloating({ plan, pd, payload }) {
      const h=G.hc(pd.cur,payload.headcountId),pos=h && G.position(pd.cur,h.positionId);
      if(!h || !h.floatingUntil || h.state!=='占编')throw new Error('该编制不是占用中的浮动编制');
      if(!pos || !scopeOrgIds(plan).has(pos.orgId))throw new Error('编制职位须位于方案范围内');
      const people=pd.cur.persons.filter(p=>p.headcountId===h.id);
      people.forEach(p=>releaseMainBinding(pd.cur,p));
      delete h.floatingUntil;
      h.state='可用';h.personId=null;delete h.postId;
      return {released:people.map(p=>p.id)};
    },
    bindHeadcount({ plan, pd, payload }) {
      const h=G.hc(pd.cur,payload.headcountId),p=G.person(pd.cur,payload.personId),pos=h && G.position(pd.cur,h.positionId);
      if(!h || h.state!=='可用' || headcountOccupancy(pd.cur,h).occupants.length)throw new Error('该编制已不可用，请重新选择');
      if(!pos || !G.isPositionEffective(pd.cur,pos.id) || !scopeOrgIds(plan).has(pos.orgId))throw new Error('编制职位须有效且位于方案范围内');
      if(lvlIdx(h.level)<lvlIdx(pos.levelMin) || lvlIdx(h.level)>lvlIdx(pos.levelMax))throw new Error('编制职级超出职位范围，请先调编');
      const mainPos=p && G.position(pd.cur,p.positionId);
      if(!p || p.kind!=='employee' || p.status!=='在职' || !mainPos || !G.isPositionEffective(pd.cur,mainPos.id) || !scopeOrgIds(plan).has(mainPos.orgId))throw new Error('请选择方案范围内有效主职的在职员工');
      if(payload.assignmentType==='main') {
        if(p.positionId!==h.positionId)throw new Error('只能绑定本职位员工，跨职位请先调岗');
        if(p.headcountRequired===false)throw new Error('该员工不应占编，不能绑定');
        if(p.headcountId)throw new Error('该员工已绑定编制');
        p.headcountId=h.id;
      } else if(payload.assignmentType==='post') {
        if(p.positionId===h.positionId)throw new Error('主职已在本职位，不能重复建立兼职');
        if(!['长期','短期'].includes(payload.term))throw new Error('请选择长期或短期兼职');
        const endDate=payload.term==='短期' ? payload.endDate : null;
        if(payload.term==='短期' && (!/^\d{4}-\d{2}-\d{2}$/.test(endDate || '') || !Number.isFinite(Date.parse(endDate)) || new Date(endDate).toISOString().slice(0,10)!==endDate || endDate<plan.effDate))throw new Error('请选择不早于方案生效日的有效短期结束日期');
        const existing=pd.cur.posts.filter(t=>t.status==='有效' && t.personId===p.id && t.concurrentPositionId===h.positionId);
        if(existing.length>1)throw new Error('存在重复兼职关系，请先处理');
        let t=existing[0];
        if(t && (t.headcountRequired!==true || t.headcountId))throw new Error(t.headcountId?'该员工在本职位的兼职已占编':'已有兼职不应占编，不能绑定');
        if(!t) { t={id:nextId(pd,'post','NPT'),personId:p.id,mainPositionId:p.positionId,concurrentPositionId:h.positionId,status:'有效',headcountRequired:true};pd.cur.posts.push(t); }
        Object.assign(t,{headcountId:h.id,term:payload.term,endDate});h.postId=t.id;
      } else throw new Error('请选择绑定类型');
      delete h.floatingUntil;h.state='占编';h.personId=p.id;
      return {headcountId:h.id,personId:p.id,postId:h.postId || null};
    },
    addHeadcounts({ plan, pd, payload }) {
      const { positionId, count } = payload;
      const level = canonicalLevel(payload.level);
      const p = G.position(pd.cur, positionId);
      if (!p) throw new Error('职位不存在');
      if (p.status === '停用' || !G.isOrgEffective(pd.cur, p.orgId)) throw new Error('编制职位及所属组织必须有效');
      if (!scopeOrgIds(plan).has(p.orgId)) throw new Error('编制职位所属部门不在方案范围内');
      const org = G.org(pd.cur, p.orgId);
      const costCenterId = payload.costCenterId === undefined ? ((org && org.costCenterId) || DEFAULT_COST_CENTER_ID) : payload.costCenterId;
      const workLocation = payload.workLocation === undefined ? '默认' : String(payload.workLocation || '').trim();
      const officeLocation = payload.officeLocation === undefined ? '默认' : String(payload.officeLocation || '').trim();
      const expectedArrivalDate = payload.expectedArrivalDate === undefined ? plan.effDate : payload.expectedArrivalDate;
      if (!Number.isInteger(count) || count < 1) throw new Error('数量必须为正整数'); // HC-06
      if (lvlIdx(level) < lvlIdx(p.levelMin) || lvlIdx(level) > lvlIdx(p.levelMax)) throw new Error(`编制职级须在 ${p.levelMin}—${p.levelMax} 内`);
      if (!['A', 'B', 'C'].includes(payload.category || 'C')) throw new Error('请选择编制 ABC 分类');
      if (!(pd.cur.costCenters || []).some(c => c.id === costCenterId)) throw new Error('请选择有效一级成本中心');
      if (!workLocation || !officeLocation) throw new Error('请填写编制工作地点和办公地点');
      if (!expectedArrivalDate || !/^\d{4}-\d{2}-\d{2}$/.test(expectedArrivalDate) || !Number.isFinite(Date.parse(expectedArrivalDate)) || new Date(expectedArrivalDate).toISOString().slice(0, 10) !== expectedArrivalDate) throw new Error('请选择有效预计到岗时间');
      const ids = [];
      for (let i = 0; i < count; i++) {
        const id = nextId(pd, 'hc', 'NH');
        pd.cur.headcounts.push({ id, code: '', positionId, level, category: payload.category || 'C', collarColor: p.collarColor || '白领', overseas: payload.overseas === true, costCenterId, costCategory: p.costCategory || '默认', workLocation, officeLocation, expectedArrivalDate, remark: payload.remark || '', state: '可用', personId: null, demandId: null }); // 每个名额独立临时身份，正式编码留空
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
      const selected = pool.slice(0, count);
      const removed = selected.map(h => h.id);
      rememberRemovedHeadcounts(pd, selected);
      pd.cur.headcounts = pd.cur.headcounts.filter(h => !removed.includes(h.id)); // 预留/Offer 占用不参与
      return { removed };
    },
    removeHeadcountsByIds({ pd, payload }) { // HC-18：按具体编码减编
      const ids = Array.from(new Set(payload.headcountIds || []));
      if (!ids.length) throw new Error('请选择要减编的空编');
      const hcs = ids.map(id => G.hc(pd.cur, id));
      if (hcs.some(h => !h)) throw new Error('部分编制不存在');
      if (hcs.some(h => h.state !== '可用')) throw new Error('只能减可用空编，需求/Offer 占用不可减编');
      rememberRemovedHeadcounts(pd, hcs);
      pd.cur.headcounts = pd.cur.headcounts.filter(h => !ids.includes(h.id));
      return { removed: ids };
    },
    restoreHeadcounts({ plan, pd, payload }) {
      const ids = Array.from(new Set(payload.headcountIds || []));
      if (!ids.length) throw new Error('请选择要恢复的编制');
      const existing = new Set(pd.cur.headcounts.map(h => h.id));
      const baseRows = ids.map(id => G.hc(pd.base, id));
      if (baseRows.some(h => !h)) throw new Error('只能恢复本方案基准中已减编的编制');
      if (baseRows.some(h => existing.has(h.id))) throw new Error('部分编制当前仍存在');
      const restored = ids.map(id => {
        const h = getRemovedHeadcount(plan,id);
        delete h.removedOrgId;
        return Object.assign(h,{state:'可用',personId:null,demandId:null});
      });
      restored.forEach(h => pd.cur.headcounts.push(h));
      if (pd.cur.removedHeadcounts) {
        pd.cur.removedHeadcounts = pd.cur.removedHeadcounts.filter(h => !ids.includes(h.id));
        if (!pd.cur.removedHeadcounts.length) delete pd.cur.removedHeadcounts;
      }
      return { restored: ids };
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
    moveHeadcountsByIds({ plan, pd, payload }) {
      const result = headcountChanges(plan, pd, payload);
      if (result.error) throw new Error(result.error);
      result.updates.forEach(row => Object.assign(G.hc(pd.cur, row.id), row.values));
      return { moved: result.updates.map(row => row.id) };
    },
    matchPreview({ plan, pd, payload }) { // 预览不修改数据；每个职位内部沿用既有配对顺序
      let positions;
      if (payload.orgId) {
        const groups = workbenchGroups(plan, payload.orgId, !!payload.includeSub);
        positions = groups.orgIds.flatMap(id=>pd.cur.positions.filter(p=>p.orgId===id && G.isPositionEffective(pd.cur,p.id)).sort((a,b)=>positionSort(a)-positionSort(b)));
      } else positions = pd.cur.positions.filter(p => p.id === payload.positionId && G.isPositionEffective(pd.cur, p.id));
      const groups = positions.map(pos => {
        const persons = G.employeesAt(pd.cur,pos.id).filter(p=>assignmentHeadcountState(pd.cur,p,'main',plan.effDate).status==='待绑定').map(p=>({...p,assignmentType:'main'}))
          .concat(G.postsOf(pd.cur,pos.id).filter(t=>assignmentHeadcountState(pd.cur,t,'post',plan.effDate).status==='待绑定').map(t=>({...t,id:t.personId,postId:t.id,name:(G.person(pd.cur,t.personId)||{}).name,assignmentType:'post'})));
        const pool=G.availableHcs(pd.cur,pos.id).filter(h=>lvlIdx(h.level)>=lvlIdx(pos.levelMin) && lvlIdx(h.level)<=lvlIdx(pos.levelMax));
        const pairs=persons.slice(0,pool.length).map((p,i)=>({personId:p.id,personName:p.name,postId:p.postId || null,assignmentType:p.assignmentType,level:p.level,hcId:pool[i].id,hcCode:displayCode(plan,'headcount',pool[i].id),positionId:pos.id,orgId:pos.orgId}));
        return { orgId:pos.orgId, orgName:G.org(pd.cur,pos.orgId).name, positionId:pos.id, positionName:pos.name, pairs, personCount:persons.length, poolCount:pool.length };
      });
      return { groups, pairs:groups.flatMap(g => g.pairs), personCount:groups.reduce((n,g)=>n+g.personCount,0), poolCount:groups.reduce((n,g)=>n+g.poolCount,0) };
    },
    applyAutoMatch({ plan, pd, payload }) {
      const { pairs } = OPS.matchPreview({ plan, pd, payload });
      if (payload.expectedPairs && JSON.stringify(pairs.map(p=>[p.personId,p.postId || null,p.hcId])) !== JSON.stringify(payload.expectedPairs.map(p=>[p.personId,p.postId || null,p.hcId]))) throw new Error('匹配候选已变化，请重新预览');
      if (!pairs.length) throw new Error('当前没有可匹配的人员与空编组合'); // HC-12
      pairs.forEach(pair => {
        const p = G.person(pd.cur, pair.personId), h = G.hc(pd.cur, pair.hcId);
        if(pair.postId) { const t=pd.cur.posts.find(t=>t.id===pair.postId);t.headcountId=h.id;h.postId=t.id; }
        else p.headcountId=h.id;
        h.state='占编';h.personId=p.id; // 按当前任职绑定，不修改同一人的另一任职
      });
      return { matched: pairs.length };
    },

    /* ---- 兼职（PT-02；addPost 仅自测 PTKEEP 用，界面不提供新增兼职） ---- */
    cancelPost({ pd, payload }) {
      const t = G.post(pd.cur, payload.postId);
      if (!t || t.status !== '有效') throw new Error('兼职关系不存在或已取消');
      if(t.headcountId) { const h=G.hc(pd.cur,t.headcountId);h.state='可用';h.personId=null;delete h.postId; }
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
      const closing=previewSubmission(plan);
      const autoClosure={positionIds:closing.positionIds,headcounts:clone(closing.headcounts),headcountOrder:pd.cur.headcounts.map(h=>h.id),removedHeadcounts:clone(pd.cur.removedHeadcounts || [])};
      if (!hasChange(plan,closing.graph)) throw new Error('暂无调整内容');
      if (closing.cancelledOrgs.length || closing.cancelledPositions.length) {
        Object.assign(autoClosure,{cancelledOrgs:clone(closing.cancelledOrgs),cancelledPositions:clone(closing.cancelledPositions),orgOrder:pd.cur.orgs.map(o=>o.id),positionOrder:pd.cur.positions.map(p=>p.id),scopeRoots:{sourceScopeIds:clone(plan.sourceScopeIds),targetScopeIds:clone(plan.targetScopeIds)}});
        const ids=new Set(closing.cancelledOrgs.map(o=>o.id));
        plan.sourceScopeIds=plan.sourceScopeIds.filter(id=>!ids.has(id));plan.targetScopeIds=plan.targetScopeIds.filter(id=>!ids.has(id));
      }
      pd.cur=closing.graph;
      const v = pd.versions.length + 1;
      pd.versions.push({ v, submittedAt: fmtNow(), snapshot: clone(pd.cur), autoClosure, approvals: [], returnComment: null });
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
      if (v.autoClosure) {
        if (v.autoClosure.cancelledOrgs) {
          pd.cur.orgs.push(...clone(v.autoClosure.cancelledOrgs));pd.cur.positions.push(...clone(v.autoClosure.cancelledPositions));
          const orgOrder=new Map(v.autoClosure.orgOrder.map((id,i)=>[id,i])),positionOrder=new Map(v.autoClosure.positionOrder.map((id,i)=>[id,i]));
          pd.cur.orgs.sort((a,b)=>orgOrder.get(a.id)-orgOrder.get(b.id));pd.cur.positions.sort((a,b)=>positionOrder.get(a.id)-positionOrder.get(b.id));
          Object.assign(plan,clone(v.autoClosure.scopeRoots));
        }
        v.autoClosure.positionIds.forEach(id=>{ const p=G.position(pd.cur,id); if(p)p.status='有效'; });
        pd.cur.headcounts.push(...clone(v.autoClosure.headcounts));
        const order=new Map(v.autoClosure.headcountOrder.map((id,i)=>[id,i]));
        pd.cur.headcounts.sort((a,b)=>order.get(a.id)-order.get(b.id));
        if (v.autoClosure.removedHeadcounts.length) pd.cur.removedHeadcounts=clone(v.autoClosure.removedHeadcounts);
        else delete pd.cur.removedHeadcounts;
      }
      plan.status = STATUS.DRAFT; // APR-02：退回直接回草稿，保留内容并再走确认
      return {};
    },
    demoExecuteSuccess({ plan, pd }) {
      if (plan.status !== STATUS.PENDING) throw new Error('仅待生效方案可执行');
      plan.status = STATUS.EFFECTIVE; plan.completedAt = fmtNow(); // EFF-02
      return {};
    },
    demoExecuteFail({ plan, pd, payload }) {
      if (plan.status !== STATUS.PENDING) throw new Error('仅待生效方案可模拟异常');
      plan.status = STATUS.MANUAL; plan.errorReason = (payload && payload.reason) || '执行异常（演示）';
      return {};
    }
  };

  // 编制属性编辑与归属迁移共用校验；纯计算，不修改 graph。
  function headcountChanges(plan, pd, payload) {
    const fail = error => ({ error, updates: [] });
    const ids = Array.from(new Set(payload.headcountIds || []));
    if (!ids.length) return fail('请选择要变更的编制');
    const hcs = ids.map(id => G.hc(pd.cur, id));
    if (hcs.some(h => !h)) return fail('部分编制不存在');
    if (hcs.some(h => !['可用', '占编'].includes(h.state))) return fail('预留编制不可变更');
    const occupied = hcs.filter(h => h.state === '占编');
    if (occupied.length && hcs.length !== 1) return fail('已绑定编制只支持单条属性变更，不能批量调整');
    if (occupied.length && occupied[0].positionId !== payload.targetPositionId) return fail('已绑定编制不能变更部门或编制职位，请通过人员调岗处理');
    const to = G.position(pd.cur, payload.targetPositionId);
    if (!to || !G.isPositionEffective(pd.cur, to.id)) return fail('请选择有效编制职位');
    if (!scopeOrgIds(plan).has(to.orgId)) return fail('编制职位所属部门不在方案范围内');
    if (payload.targetOrgId !== undefined && payload.targetOrgId !== to.orgId) return fail('编制职位不属于所选部门');
    const updates = [];
    for (const h of hcs) {
      const get = key => payload[key] === undefined ? h[key] : payload[key];
      const level = canonicalLevel(get('level'));
      if (lvlIdx(level) < 0 || lvlIdx(level) < lvlIdx(to.levelMin) || lvlIdx(level) > lvlIdx(to.levelMax))
        return fail(`编制 ${displayCode(plan, 'headcount', h.id)} 的职级须在 ${to.levelMin}—${to.levelMax} 内`);
      const category = get('category');
      if (!['A', 'B', 'C'].includes(category)) return fail('请选择编制 ABC 分类');
      const overseas = get('overseas');
      if (typeof overseas !== 'boolean') return fail('请选择是否海外编制');
      const costCenterId = get('costCenterId');
      if (!(pd.cur.costCenters || []).some(c => c.id === costCenterId)) return fail('请选择有效一级成本中心');
      const workLocation = String(get('workLocation') || '').trim();
      const officeLocation = String(get('officeLocation') || '').trim();
      const expectedArrivalDate = get('expectedArrivalDate');
      if (!workLocation) return fail('请填写编制工作地点');
      if (!officeLocation) return fail('请填写编制办公地点');
      if (!expectedArrivalDate || !/^\d{4}-\d{2}-\d{2}$/.test(expectedArrivalDate) || !Number.isFinite(Date.parse(expectedArrivalDate)) || new Date(expectedArrivalDate).toISOString().slice(0, 10) !== expectedArrivalDate)
        return fail('请选择有效预计到岗时间');
      const values = {
        positionId: to.id, level, category, overseas, costCenterId, workLocation, officeLocation, expectedArrivalDate,
        collarColor: to.collarColor || '白领', costCategory: to.costCategory || '默认', remark: String(get('remark') || '').trim()
      };
      updates.push({ id: h.id, values });
    }
    if (!updates.some(row => Object.entries(row.values).some(([key, value]) => G.hc(pd.cur, row.id)[key] !== value)))
      return fail('暂无调编内容');
    return { error: '', updates };
  }

  /* ---- 组织/职位移动校验（ORG-10、POS-08） ---- */
  function validateMoveOrg(plan, pd, orgId, newParentId) {
    const o = G.org(pd.cur, orgId);
    if (!o) return '组织不存在';
    if (!newParentId) return null; // 移到根级（Demo 数据均有上级，一般不出现）
    const target = G.org(pd.cur, newParentId);
    if (!target) return '目标组织不存在';
    if (newParentId === orgId) return '不能移动到自身';
    if (G.descendantIds(pd.cur, orgId, true).includes(newParentId)) return '不能移动到自身或其下级组织'; // 防循环
    if (!G.isOrgEffective(pd.cur,newParentId)) return '不能移动到已停用组织';
    if (!scopeOrgIds(plan).has(newParentId)) return '目标组织不在调整范围内，请先加入范围'; // ORG-10
    const targetLevel = G.orgLevel(pd.cur, newParentId) || 0;
    const subtreeMax = Math.max(...G.descendantIds(pd.cur, orgId, true).map(id => G.orgLevel(pd.cur, id) || 0));
    const currentLevel = G.orgLevel(pd.cur, orgId) || 0;
    if (targetLevel + 1 + (subtreeMax - currentLevel) > MAX_ORG_LEVEL) return `不能移动：移动后组织层级将超过${MAX_ORG_LEVEL}级`;
    return null;
  }
  function validateOrgParent(plan, pd, parentId, excludeId) {
    if (!parentId) return '请选择有效上级组织';
    const parent = G.org(pd.cur, parentId);
    if (!parent) return '上级组织不存在';
    if (excludeId && parentId === excludeId) return '不能选择自身作为上级组织';
    if (excludeId && G.descendantIds(pd.cur, excludeId, true).includes(parentId)) return '不能选择自身或其下级组织';
    if (parent.status === '停用') return '上级组织必须有效';
    if (!G.isOrgEffective(pd.cur,parentId)) return '上级组织及其祖先必须有效';
    if (!scopeOrgIds(plan).has(parentId)) return '上级组织不在调整范围内，请先加入范围';
    if ((G.orgLevel(pd.cur, parentId) || 0) >= MAX_ORG_LEVEL) return `八级组织不能新增下级组织`;
    return null;
  }
  function moveOrgMutate(pd, orgId, newParentId) {
    const o = G.org(pd.cur, orgId);
    o.parentId = newParentId; // BR-01：完整子树跟随（子组织引用 parentId，自动跟随）；身份不变
    o.sortCode = G.childrenOrgs(pd.cur, newParentId).length + 1; o.order = o.sortCode;
  }
  function nextPositionOrder(g,orgId) {
    return Math.max(0,...g.positions.filter(p=>p.orgId===orgId).map(positionSort))+1;
  }
  function validateMovePositions(plan, pd, positionIds, targetOrgId) {
    const target = G.org(pd.cur, targetOrgId);
    if (!target) return '目标组织不存在';
    if (!G.isOrgEffective(pd.cur,targetOrgId)) return '不能移动到已停用组织';
    if (!scopeOrgIds(plan).has(targetOrgId)) return '目标组织不在调整范围内，请先加入范围'; // POS-08 同 ORG-10
    if (!positionIds || !positionIds.length || new Set(positionIds).size!==positionIds.length) return '请选择不重复的职位';
    for (const id of positionIds) {
      const p = G.position(pd.cur, id);
      if (!p) return '职位不存在';
      if (!scopeOrgIds(plan).has(p.orgId)) return '职位不在调整范围内';
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
      if (type === 'matchPreview' || type === 'previewTransfer') return Object.assign({ ok: true }, result);
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
  function hasChange(plan, graph) {
    const c = diffCounts(plan,graph);
    if (Object.keys(c).some(k => c[k] > 0)) return true;
    const pd = db.planData[plan.id];
    const ordMoved = (bArr, cArr, field) => cArr.some(o => { const b = bArr.find(x => x.id === o.id); return b && (Number(o[field] ?? o.order) !== Number(b[field] ?? b.order)); });
    const current=graph || pd.cur;
    return ordMoved(pd.base.orgs, current.orgs, 'sortCode') || ordMoved(pd.base.positions, current.positions, 'sequenceNo');
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
  function universeTree(universe, effDate) { // 新建方案：从种子图取方案日可见组织树
    const g = OA.seed.UNIVERSES[universe]();
    const date = effDate || OA.seed.PLAN_EFF_DATE;
    return permissionForest(g, universe, date);
  }
  function scopeTree(planId) { // 工作台左树：范围 + 必要祖先上下文（ORG-04）
    const plan = getPlan(planId), g = db.planData[planId].cur;
    const scope = scopeOrgIds(plan), ctx = contextOrgIds(plan);
    const include = id => scope.has(id) || ctx.has(id);
    const build = o => {
      const children = G.childrenOrgs(g, o.id).map(build).filter(Boolean);
      if (!include(o.id) && !children.length) return null;
      return { id: o.id, name: o.name, status: o.status, inScope: scope.has(o.id), children };
    };
    return graphPermissionRoots(g, plan.universe).map(id => G.org(g, id)).filter(Boolean).map(build).filter(Boolean);
  }
  function scopeTreeBase(planId) { // 对比页左图：调整前基准树（base 图，范围 + 必要祖先）
    const plan = getPlan(planId), g = db.planData[planId].base;
    const scope = scopeOrgIds(plan), ctx = contextOrgIds(plan);
    const include = id => scope.has(id) || ctx.has(id);
    const build = o => {
      const children = G.childrenOrgs(g, o.id).map(build).filter(Boolean);
      if (!include(o.id) && !children.length) return null;
      return { id: o.id, name: o.name, status: o.status, inScope: scope.has(o.id), children };
    };
    return graphPermissionRoots(g, plan.universe).map(id => G.org(g, id)).filter(Boolean).map(build).filter(Boolean);
  }

  /* ---------------- 含人架构图（CMP-26—CMP-31） ---------------- */
  function chartTree(planId, side, graph) {
    const plan = getPlan(planId), pd = db.planData[planId];
    const g = side === 'L' ? pd.base : (graph || pd.cur), base = pd.base;
    const scope = scopeOrgIds(plan), ctx = contextOrgIds(plan);
    const include = id => scope.has(id) || ctx.has(id);
    const changeOf = new Map(diffPlan(plan,graph).positions.map(r => [r.id, r.changeType]));
    const positionNode = p => {
      const people = G.employeesAt(g, p.id)
        .map(x => ({ id: x.id, name: x.name, level: x.level || null, occupied: !!x.headcountId, future: null, tags: personChangeTags(plan, x.id) }))
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
    const build = o => {
      if (!o || (side === 'R' && o.status === '停用') || (!include(o.id) && !G.childrenOrgs(g, o.id).some(child => include(child.id)))) return null;
      const stoppedHere = false;
      const node = {
        type: 'org', id: o.id, name: o.name, status: o.status, inScope: scope.has(o.id), orgLevel: G.orgLevel(g, o.id), leaderId: o.leaderId || null,
        isNew: !G.org(base, o.id), tags: orgChangeTags(plan, o.id).filter(t => t !== '新增' && t !== '停用'),
        placeholder: stoppedHere, children: [],
        positions: stoppedHere ? [] : g.positions.filter(p => p.orgId === o.id).sort((a, b) => positionSort(a) - positionSort(b)).map(positionNode).filter(p => p.people.length || p.hcTotal)
      };
      if (!stoppedHere) node.children = G.childrenOrgs(g, o.id).map(build).filter(Boolean);
      return node;
    };
    return graphPermissionRoots(g, plan.universe).map(id => build(G.org(g, id))).filter(Boolean);
  }

  root.OA = root.OA || {};
  root.OA.store = {
    load, apply, undo, redo, historyState, getPlans, getPlan, getPlanData, resetPlan, resetAll,
    setDemoFlag, getDemoFlags, retryPersist, getUiState, setUiState,
    getRemovedHeadcount, workbenchGroups, positionUsage, scopeInfo, scopeOrgIdsForRoots, scopeRemovalImpact, scopeSelectionState, normalizeScopeRoots, orgTree, universeTree, scopeTree, scopeTreeBase, chartTree, validateScope, orgTimelineState, permissionRoots, visiblePathNames, computePending, previewCopyOrg, previewStopOrg, isNewOrg, canCancelNewOrg, diffPlan, diffCounts, diffCountsVisible, hasChange, orgChangeTags, positionChangeTags, personChangeTags, headcountChangeTags, displayCode,
    FEATURES, STORAGE_PREFIX,
    headcountOccupancy, headcountBreakdown, personnelBreakdown, assignmentHeadcountState, assignmentStopReason, futureEventsForGraph, previewSubmission,
    CNT, G, STATUS, LEVELS, TRANSFER_FIELDS, EDITABLE_STATUS, ADJUST_LEVELS, ADJUST_REASONS, REASON_HINTS, MAX_ORG_LEVEL, _internals: { OPS, assertGraph, validateTransfer: OPS.validateTransfer, scopeOrgIds, requiredOrgFields, headcountChanges }
  };
})(typeof window !== 'undefined' ? window : globalThis);
