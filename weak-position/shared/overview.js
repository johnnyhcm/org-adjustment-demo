/* AI 概览：只读事实、数量字典、独立文稿。浏览器与 Node 共用。 */
(function (root) {
  const OA = root.OA, S = OA.store;
  const copy = x => JSON.parse(JSON.stringify(x));
  const ordered = xs => xs.slice().sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const pick = (x, keys) => Object.fromEntries(keys.map(k => [k, x[k] === undefined ? null : x[k]]));
  const sizes = ['12px', '14px', '16px', '18px'];
  const colors = ['#333333', '#0e66fb', '#ff4d4f', '#00b259', '#d48806'];
  function canonical(value) {
    if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
    if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
    return JSON.stringify(value);
  }
  function orgPath(g, id, permitted) {
    const path = [], seen = new Set();
    let org = S.G.org(g, id);
    while (org && permitted.has(org.id) && !seen.has(org.id)) {
      seen.add(org.id); path.unshift({ id: org.id, name: org.name }); org = S.G.org(g, org.parentId);
    }
    return path;
  }
  function buildFacts(planId) {
    const plan = S.getPlan(planId), saved = S.getPlanData(planId);
    if (!plan || !saved) throw new Error('方案不存在');
    const pd = { ...saved, cur: S.previewSubmission(plan).graph };
    const roots = [...new Set([...(plan.sourceScopeIds || []), ...(plan.targetScopeIds || [])])].sort();
    const permitted = new Set(), scope = new Set();
    for (const g of [pd.base, pd.cur]) {
      S.permissionRoots(plan.universe).forEach(id => S.G.descendantIds(g, id, true).forEach(x => permitted.add(x)));
      roots.forEach(id => { if (S.G.org(g, id)) S.G.descendantIds(g, id, true).forEach(x => scope.add(x)); });
    }
    for (const id of scope) if (!permitted.has(id)) scope.delete(id);
    // 取消新增仅为处理中的草稿；关联对象两侧同时排除，避免过滤被误报为迁出或减编。
    const omittedOrgs = new Set(pd.cur.orgs.filter(o => scope.has(o.id) && !S.G.org(pd.base, o.id) && o.status === '停用')
      .flatMap(o => S.G.descendantIds(pd.cur, o.id, true)));
    const omittedPositions = new Set(pd.cur.positions.filter(p => omittedOrgs.has(p.orgId)).map(p => p.id));
    const omittedPersons = new Set(pd.cur.persons.filter(p => omittedPositions.has(p.positionId) || omittedPositions.has(p.targetPositionId)).map(p => p.id));
    const omittedPosts = new Set(pd.cur.posts.filter(t => omittedPositions.has(t.concurrentPositionId) || omittedPersons.has(t.personId)).map(t => t.id));
    const omittedHeadcounts = new Set(pd.cur.headcounts.filter(h => omittedPositions.has(h.positionId)).map(h => h.id));
    const uncertainPositions = new Set(omittedPositions), uncertainOrgs = new Set(omittedOrgs);
    for (const g of [pd.base, pd.cur]) {
      g.persons.filter(p => omittedPersons.has(p.id)).forEach(p => {
        [p.positionId, p.targetPositionId].filter(Boolean).forEach(id => uncertainPositions.add(id));
        if (p.headcountId && S.G.hc(pd.cur, p.headcountId)?.state === '可用') omittedHeadcounts.add(p.headcountId);
      });
      g.posts.filter(t => omittedPosts.has(t.id)).forEach(t => {
        uncertainPositions.add(t.concurrentPositionId);
        if (t.headcountId && S.G.hc(pd.cur, t.headcountId)?.state === '可用') omittedHeadcounts.add(t.headcountId);
      });
    }
    for (const g of [pd.base, pd.cur]) {
      g.headcounts.filter(h => omittedHeadcounts.has(h.id)).forEach(h => uncertainPositions.add(h.positionId));
      g.positions.filter(p => uncertainPositions.has(p.id)).forEach(p => uncertainOrgs.add(p.orgId));
    }
    omittedOrgs.forEach(id => scope.delete(id));
    const context = new Set(scope);
    for (const g of [pd.base, pd.cur]) for (const id of scope) orgPath(g, id, permitted).forEach(o => context.add(o.id));
    const scopeGraph = g => {
      const orgs = ordered(g.orgs.filter(o => context.has(o.id) && !omittedOrgs.has(o.id) && (S.G.org(pd.base, o.id) || o.status === '有效')));
      const orgIds = new Set(orgs.map(o => o.id));
      const positions = ordered(g.positions.filter(p => scope.has(p.orgId) && orgIds.has(p.orgId) && !omittedPositions.has(p.id) && (S.G.position(pd.base, p.id) || p.status === '有效')));
      const posIds = new Set(positions.map(p => p.id));
      const persons = ordered(g.persons.filter(p => !omittedPersons.has(p.id) && (posIds.has(p.positionId) || posIds.has(p.targetPositionId))));
      const hcs = ordered(g.headcounts.filter(h => posIds.has(h.positionId) && !omittedHeadcounts.has(h.id)));
      const hcIds = new Set(hcs.map(h => h.id));
      const label = id => (S.G.person(g, id) || {}).name || null;
      return {
        orgs: orgs.map(o => ({
          ...pick(o, scope.has(o.id) ? ['id', 'name', 'status', 'virtualOrg', 'costCategory', 'costCenterId'] : ['id', 'name', 'status']),
          inScope: scope.has(o.id), parentId: orgIds.has(o.parentId) ? o.parentId : null,
          level: S.G.orgLevel(g, o.id), path: orgPath(g, o.id, orgIds),
          leader: scope.has(o.id) && o.leaderId ? { id: o.leaderId, name: label(o.leaderId) } : null,
          hrbp: scope.has(o.id) && o.hrbpId ? { id: o.hrbpId, name: label(o.hrbpId) } : null,
          hrbpOwner: scope.has(o.id) && o.hrbpOwnerId ? { id: o.hrbpOwnerId, name: label(o.hrbpOwnerId) } : null
        })),
        positions: positions.map(p => pick(p, ['id', 'name', 'orgId', 'status', 'levelMin', 'levelMax', 'jobSequence', 'jobFamily', 'jobClass', 'costCategory', 'collarColor'])),
        persons: persons.map(p => ({ ...pick(p, ['id', 'name', 'kind', 'status', 'positionId', 'targetPositionId', 'level', 'headcountId', 'headcountRequired', 'futureType', 'date', 'approvalStatus', 'transferDate', 'transferReason', 'isRotation', ...S.TRANSFER_FIELDS.map(f => f.key)]), manager: p.managerId ? { id: p.managerId, name: label(p.managerId) } : null })),
        headcounts: hcs.map(h => pick(h, ['id', 'positionId', 'level', 'category', 'state', 'personId', 'postId', 'demandId', 'floatingUntil', 'costCenterId', 'workLocation', 'officeLocation', 'overseas', 'expectedArrivalDate', 'costCategory', 'collarColor'])),
        posts: ordered(g.posts.filter(t => posIds.has(t.concurrentPositionId) && !omittedPosts.has(t.id))).map(t => pick(t, ['id', 'personId', 'mainPositionId', 'concurrentPositionId', 'status', 'term', 'endDate', 'headcountId', 'headcountRequired', 'headcountRuleReason'])),
        futureEvents: ordered(S.futureEventsForGraph(g, plan.effDate).filter(e => !omittedPersons.has(e.personId) && !omittedPositions.has(e.fromPositionId) && !omittedPositions.has(e.toPositionId) && (posIds.has(e.fromPositionId) || posIds.has(e.toPositionId)))).map(e => ({ ...pick(e, ['id', 'personId', 'name', 'type', 'date', 'stage', 'approvalStatus', 'headcountId', 'hasOffer']), fromPositionId: posIds.has(e.fromPositionId) ? e.fromPositionId : null, toPositionId: posIds.has(e.toPositionId) ? e.toPositionId : null })),
        demands: ordered(g.demands.filter(d => (d.headcountIds || []).some(id => hcIds.has(id)))).map(d => ({ ...pick(d, ['id', 'name', 'status']), headcountIds: (d.headcountIds || []).filter(id => hcIds.has(id)).sort() }))
      };
    };
    const before = scopeGraph(pd.base), after = scopeGraph(pd.cur);
    // 仅保留当前一侧已授权范围内的引用；不泄露范围外目标／人员属性。
    for (const g of [before, after]) {
      const posIds = new Set(g.positions.map(p => p.id)), personIds = new Set(g.persons.map(p => p.id)), hcIds = new Set(g.headcounts.map(h => h.id));
      for (const p of g.persons) {
        if (!posIds.has(p.positionId)) p.positionId = null;
        if (!posIds.has(p.targetPositionId)) p.targetPositionId = null;
        if (!hcIds.has(p.headcountId)) p.headcountId = null;
      }
      for (const t of g.posts) {
        if (!posIds.has(t.mainPositionId)) t.mainPositionId = null;
        if (!hcIds.has(t.headcountId)) t.headcountId = null;
      }
      const postIds = new Set(g.posts.map(t => t.id));
      for (const h of g.headcounts) {
        if (!personIds.has(h.personId)) h.personId = null;
        if (!postIds.has(h.postId)) h.postId = null;
      }
      for (const e of g.futureEvents) if (!hcIds.has(e.headcountId)) e.headcountId = null;
    }
    const changes = {};
    for (const kind of ['orgs', 'positions', 'persons', 'headcounts', 'posts', 'futureEvents', 'demands']) {
      const b = new Map(before[kind].map(x => [x.id, x])), a = new Map(after[kind].map(x => [x.id, x]));
      changes[kind] = [...new Set([...b.keys(), ...a.keys()])].sort().flatMap(id => {
        const oldValue = b.get(id) || null, newValue = a.get(id) || null;
        if (canonical(oldValue) === canonical(newValue)) return [];
        const fields = [...new Set([...Object.keys(oldValue || {}), ...Object.keys(newValue || {})])].sort().filter(k => k !== 'id' && canonical(oldValue && oldValue[k]) !== canonical(newValue && newValue[k]));
        return [{ id, before: oldValue, after: newValue, fields }];
      });
    }
    const facts = [];
    const addFact = (id, text, values) => facts.push({ id, text, ...values });
    function stats(g, orgIds, posId) {
      const ids = new Set(orgIds);
      const ps = g.positions.filter(p => p.status === '有效' && (posId ? p.id === posId : ids.has(p.orgId)));
      const pids = new Set(ps.map(p => p.id));
      const people = g.persons.filter(p => p.status === '在职' && p.kind === 'employee' && pids.has(p.positionId));
      const hcs = g.headcounts.filter(h => pids.has(h.positionId));
      return { employees: new Set(people.map(p => p.id)).size, headcounts: hcs.length,
        vacant: hcs.filter(h => ['可用', '需求预留'].includes(h.state)).length,
        available: hcs.filter(h => h.state === '可用').length,
        reserved: hcs.filter(h => !['可用', '占编'].includes(h.state)).length,
        occupied: hcs.filter(h => h.state === '占编').length,
        futurePeople: new Set(g.persons.filter(p => p.status === '未来' && pids.has(p.targetPositionId)).map(p => p.id)).size,
        positions: ps.length, posts: g.posts.filter(t => t.status === '有效' && pids.has(t.concurrentPositionId)).length };
    }
    const metricLabels = { employees: ['员工', '人'], headcounts: ['总编', '个'], vacant: ['空编（可用及需求预留）', '个'], available: ['可用空编', '个'], reserved: ['预留编制', '个'], occupied: ['占用编制', '个'], futurePeople: ['未来人员', '人'], positions: ['有效职位', '个'], posts: ['兼职任职关系', '条'] };
    function compareStats(key, label, b, a) {
      for (const [metric, [name, unit]] of Object.entries(metricLabels)) {
        const bv = b ? b[metric] : null, av = a ? a[metric] : null;
        const delta = bv === null || av === null ? null : av - bv;
        const change = delta === null ? '' : delta === 0 ? '，保持不变' : '，' + (delta > 0 ? '增加' : '减少') + Math.abs(delta) + unit + '（' + (delta > 0 ? '+' : '') + delta + '）';
        addFact(key + ':' + metric, label + name + '：调整前' + (bv === null ? '不存在' : bv + unit) + '，调整后' + (av === null ? '不存在' : av + unit) + change, { metric, before: bv, after: av, delta, unit });
      }
    }
    if (!omittedOrgs.size) compareStats('scope', '方案范围内', stats(before, scope), stats(after, scope));
    const orgIds = [...new Set([...before.orgs, ...after.orgs].map(o => o.id))].sort();
    for (const id of orgIds) {
      const b = before.orgs.find(x => x.id === id), a = after.orgs.find(x => x.id === id), name = (a || b).name;
      for (const [mode, includeChildren] of [['direct', false], ['subtree', true]]) {
        if ([pd.base, pd.cur].some(g => (includeChildren ? S.G.descendantIds(g, id, true) : [id]).some(x => uncertainOrgs.has(x)))) continue;
        const ids = (g, exists) => !exists ? [] : includeChildren ? S.G.descendantIds(g, id, true).filter(x => scope.has(x)) : scope.has(id) ? [id] : [];
        compareStats('org:' + id + ':' + mode, name + (includeChildren ? '（含下级、限方案范围）' : '（直属、限方案范围）'), b ? stats(before, ids(pd.base, b)) : null, a ? stats(after, ids(pd.cur, a)) : null);
      }
      if (b && a) addFact('org:' + id + ':level', name + '组织层级：调整前' + b.level + '级，调整后' + a.level + '级' + (a.level === b.level ? '，保持不变' : '，' + (a.level > b.level ? '增加' : '减少') + Math.abs(a.level - b.level) + '级'), { before: b.level, after: a.level, delta: a.level - b.level });
    }
    for (const id of [...new Set([...before.positions, ...after.positions].map(p => p.id))].sort()) {
      if (uncertainPositions.has(id)) continue;
      const b = before.positions.find(p => p.id === id), a = after.positions.find(p => p.id === id);
      compareStats('position:' + id, (a || b).name + '职位', b ? stats(before, [], id) : null, a ? stats(after, [], id) : null);
    }
    function location(g, p, kind) {
      const posId = p && (kind === 'persons' && p.status === '未来' ? p.targetPositionId : p.positionId);
      const pos = g.positions.find(x => x.id === posId), org = pos && g.orgs.find(x => x.id === pos.orgId);
      return pos ? { orgId: pos.orgId, orgName: org ? org.name : '范围内组织', positionId: pos.id, positionName: pos.name, pathIds: (org && org.path || []).map(o => o.id) } : null;
    }
    const flows = { persons: [], headcounts: [] }, affected = new Set(), transferred = new Set(), structural = new Set();
    for (const kind of ['persons', 'headcounts']) {
      const grouped = new Map();
      for (const id of [...new Set([...before[kind], ...after[kind]].map(x => x.id))].sort()) {
        const b = before[kind].find(x => x.id === id), a = after[kind].find(x => x.id === id);
        if (kind === 'persons' && (b || a).status !== '在职') continue;
        const from = location(before, b, kind), to = location(after, a, kind);
        const moved = !!(from && to && from.positionId !== to.positionId);
        const pathChanged = posId => {
          const old = location(before, { positionId: posId }, 'headcounts'), now = location(after, { positionId: posId }, 'headcounts');
          return !!(old && now && canonical(old.pathIds) !== canonical(now.pathIds));
        };
        const inherited = !!(from && to && (pathChanged(from.positionId) || pathChanged(to.positionId)));
        const changed = !from || !to || moved || inherited;
        if (!changed) continue;
        if (kind === 'persons') { affected.add(id); if (moved) transferred.add(id); if (inherited) structural.add(id); }
        const created = kind === 'headcounts' && !pd.base.headcounts.some(h => h.id === id);
        const removed = kind === 'headcounts' && !pd.cur.headcounts.some(h => h.id === id);
        const type = !from ? created ? '增编' : '范围迁入' : !to ? removed ? '减编' : '范围迁出' : moved ? kind === 'persons' ? '个人调岗' : '编制调配' : '随组织结构调整';
        const key = canonical({ from, to, type });
        if (!grouped.has(key)) grouped.set(key, { from, to, type, ids: [] });
        grouped.get(key).ids.push(id);
      }
      flows[kind] = [...grouped.values()].map((v, i) => {
        const id = 'flow:' + kind + ':' + (i + 1), unit = kind === 'persons' ? '人' : '个编制';
        const label = x => x ? x.orgName + '／' + x.positionName : '方案范围外';
        const text = v.type === '增编' ? label(v.to) + '增编' + v.ids.length + '个' : v.type === '减编' ? label(v.from) + '减编' + v.ids.length + '个' : label(v.from) + ' → ' + label(v.to) + '：' + v.ids.length + unit + '（' + v.type + '）';
        addFact(id, text, { count: v.ids.length, unit });
        return { ...v, count: v.ids.length, factId: id };
      });
    }
    const added = after.headcounts.filter(h => !pd.base.headcounts.some(b => b.id === h.id)).length;
    const removed = before.headcounts.filter(h => !pd.cur.headcounts.some(a => a.id === h.id)).length;
    addFact('impact:people', '组织归属或岗位安排涉及' + affected.size + '名员工，其中个人调岗' + transferred.size + '人，随结构调整受到影响' + structural.size + '人，两类交集' + [...transferred].filter(id => structural.has(id)).length + '人；涉及人数已去重', { affected: affected.size, transferred: transferred.size, structural: structural.size, overlap: [...transferred].filter(id => structural.has(id)).length });
    addFact('impact:headcounts', '方案范围内增编' + added + '个、减编' + removed + '个；范围迁入迁出另见流向，不能把增减编数量当作总编净差', { added, removed });
    const operations = !omittedOrgs.size && Object.values(changes).some(xs => xs.length) ? (pd.history && pd.history.undo || []).filter(x => /Org|Position|Headcount|Persons/.test(x.type)).map(x => ({ type: x.type, note: '仅为可撤销动作类型线索，不代表完整操作历史或最终结果' })) : [];
    // 汇报按组织归纳，完整的职位流水和核对口径仍留在 facts／flows 中。
    const personBefore = new Map(before.persons.map(p => [p.id, p])), personAfter = new Map(after.persons.map(p => [p.id, p]));
    const employee = p => p && p.status === '在职' && p.kind === 'employee';
    const orgFlowMap = new Map();
    for (const kind of ['persons', 'headcounts']) for (const flow of flows[kind]) {
      if (!flow.from || !flow.to || flow.from.orgId === flow.to.orgId) continue;
      const key = flow.from.orgId + ':' + flow.to.orgId;
      if (!orgFlowMap.has(key)) orgFlowMap.set(key, { from: { id: flow.from.orgId, name: flow.from.orgName }, to: { id: flow.to.orgId, name: flow.to.orgName }, personIds: [], headcountIds: [] });
      const row = orgFlowMap.get(key);
      row[kind === 'persons' ? 'personIds' : 'headcountIds'].push(...flow.ids.filter(id => kind !== 'persons' || employee(personBefore.get(id)) && employee(personAfter.get(id))));
    }
    const organizationFlows = [...orgFlowMap.values()].sort((a, b) => (a.from.id + ':' + a.to.id).localeCompare(b.from.id + ':' + b.to.id)).map(row => {
      row.personIds = [...new Set(row.personIds)].sort(); row.headcountIds = [...new Set(row.headcountIds)].sort();
      const carriedIds = new Set(row.personIds.filter(id => personBefore.get(id).headcountId && personBefore.get(id).headcountId === personAfter.get(id).headcountId).map(id => personAfter.get(id).headcountId));
      return { ...row, employeeCount: row.personIds.length, headcountCount: row.headcountIds.length,
        allBringHeadcount: row.personIds.length > 0 && row.personIds.every(id => carriedIds.has(personAfter.get(id).headcountId)) && carriedIds.size === row.headcountIds.length && row.headcountIds.every(id => carriedIds.has(id)) };
    }).filter(row => row.employeeCount || row.headcountCount);
    const reportFacts = [], businessSignals = [];
    const report = (id, text, values) => { reportFacts.push({ id, text, ...values }); return id; };
    for (const [i, row] of organizationFlows.entries()) {
      const resources = row.employeeCount ? row.employeeCount + '名员工' + (row.allBringHeadcount ? '连同编制' : row.headcountCount ? '、' + row.headcountCount + '个编制' : '') : row.headcountCount + '个编制';
      row.reportFactId = report('report:flow:' + (i + 1), resources + '由' + row.from.name + (row.employeeCount ? '划转至' : '调配至') + row.to.name + '。', { employeeCount: row.employeeCount, headcountCount: row.headcountCount });
      row.resourcesText = resources;
    }
    for (const source of before.orgs.filter(o => o.inScope && o.status === '有效')) {
      if (uncertainOrgs.has(source.id)) continue;
      const currentSource = after.orgs.find(o => o.id === source.id);
      if (currentSource && currentSource.status === '有效' && currentSource.name === source.name) continue;
      const targets = new Map(); let originalEmployees = 0, locatedEmployees = 0;
      for (const kind of ['persons', 'headcounts']) for (const entity of before[kind]) {
        if (kind === 'persons' && !employee(entity)) continue;
        const from = location(before, entity, kind);
        if (!from || from.orgId !== source.id) continue;
        if (kind === 'persons') originalEmployees++;
        const next = kind === 'persons' ? personAfter.get(entity.id) : after.headcounts.find(h => h.id === entity.id);
        if (kind === 'persons' && !employee(next)) continue;
        const to = location(after, next, kind), org = to && after.orgs.find(o => o.id === to.orgId), pos = to && after.positions.find(p => p.id === to.positionId);
        if (!org || org.status !== '有效' || !pos || pos.status !== '有效') continue;
        if (!targets.has(org.id)) targets.set(org.id, { id: org.id, name: org.name, employeeCount: 0, headcountCount: 0 });
        targets.get(org.id)[kind === 'persons' ? 'employeeCount' : 'headcountCount']++;
        if (kind === 'persons') locatedEmployees++;
      }
      const parts = [...targets.values()].sort((a, b) => a.id === source.id ? -1 : b.id === source.id ? 1 : a.id.localeCompare(b.id));
      // 新部门承接且原部门更名保留／停止，才形成拆分线索；普通调入既有部门不命中。
      if (parts.length < 2 || !parts.some(t => !before.orgs.some(o => o.id === t.id)) || parts.some(t => t.id !== source.id && before.orgs.some(o => o.id === t.id))) continue;
      const names = parts.map(t => t.name), targetNames = names.length === 2 ? names.join('和') : names.slice(0, -1).join('、') + '和' + names[names.length - 1];
      const evidenceIds = [source.id, ...parts.map(t => t.id)].map(id => 'org:' + id);
      const actionId = report('report:split:' + source.id, '拟将' + source.name + '拆分为' + targetNames + '。', { evidenceIds });
      const allocationIds = [], retained = parts.find(t => t.id === source.id), outbound = organizationFlows.filter(row => row.from.id === source.id);
      for (const [i, row] of outbound.entries()) {
        const retainedText = outbound.length === 1 && retained && originalEmployees === locatedEmployees ? retained.employeeCount ? '，其余团队保留在' + retained.name : '，其余编制保留在' + retained.name : '';
        allocationIds.push(report('report:split:' + source.id + ':allocation:' + (i + 1), '其中，' + row.resourcesText + '划转至' + row.to.name + retainedText + '。', { employeeCount: row.employeeCount, headcountCount: row.headcountCount, evidenceIds }));
      }
      businessSignals.push({ id: 'split:' + source.id, type: '拆分', source: { id: source.id, name: source.name }, targets: parts, evidenceIds, reportFactIds: [actionId, ...allocationIds], basis: '原组织更名保留或停止，原团队／编制由原组织与新组织或多个新组织实际承接；不是仅凭更名推断' });
    }
    // 创建来源只作汇报依据，不进入业务字段差异；旧草稿仅从仍保留的快照取证。
    const origins = new Map(pd.cur.positions.filter(p => p.creationOrigin).map(p => [p.id, p.creationOrigin]));
    const history = pd.history && pd.history.undo || [];
    history.forEach((frame, i) => {
      if (!['copyOrg', 'addPosition', 'copyPosition'].includes(frame.type)) return;
      const old = frame.state.cur.positions, next = i + 1 < history.length ? history[i + 1].state.cur.positions : pd.cur.positions;
      for (const p of next) if (!origins.has(p.id) && !old.some(x => x.id === p.id)) {
        origins.set(p.id, { type: frame.type === 'copyOrg' ? 'org-copy' : frame.type === 'copyPosition' ? 'position-copy' : 'new', evidence: 'retained-history' });
      }
    });
    const positionCreations = after.positions.filter(p => p.status === '有效' && !pd.base.positions.some(b => b.id === p.id)).map(p => {
      const origin = origins.get(p.id) || { type: 'unknown' };
      const row = { id: p.id, name: p.name, orgId: p.orgId, origin: { type: origin.type }, headcountCount: after.headcounts.filter(h => h.positionId === p.id).length };
      if (origin.sourcePositionId && after.positions.concat(before.positions).some(x => x.id === origin.sourcePositionId)) row.origin.sourcePositionId = origin.sourcePositionId;
      if (origin.sourceOrgId && scope.has(origin.sourceOrgId)) row.origin.sourceOrgId = origin.sourceOrgId;
      if (origin.evidence) row.origin.evidence = origin.evidence;
      if (['new', 'position-copy'].includes(origin.type)) {
        const org = after.orgs.find(o => o.id === p.orgId);
        const allocation = row.headcountCount ? '，配置' + row.headcountCount + '个编制' : '';
        row.reportFactId = report('report:position:' + p.id, '下设' + p.name + '职位' + allocation + '。', { positionId: p.id, headcountCount: row.headcountCount });
        row.standaloneFactId = report('report:position:' + p.id + ':standalone', '拟在' + org.name + '下新设' + p.name + '职位。', { positionId: p.id });
        if (row.headcountCount) row.allocationFactId = report('report:position:' + p.id + ':allocation', '配置' + row.headcountCount + '个编制。', { positionId: p.id, headcountCount: row.headcountCount });
      }
      return row;
    });
    const actionPriority = { split: -1, merge: -1, reorganize: -1, create: 0, stop: 1, transfer: 2, rename: 3, leader: 4 };
    const organizationChanges = changes.orgs.filter(c => (c.after || c.before).inScope).flatMap(c => {
      const b = c.before, a = c.after;
      const action = !b ? 'create' : !a || b.status === '有效' && a.status === '停用' ? 'stop' : b.parentId !== a.parentId ? 'transfer' : b.name !== a.name ? 'rename' : canonical(b.leader) !== canonical(a.leader) ? 'leader' : null;
      return action ? [{ orgId: c.id, action, level: Math.min(...[b, a].filter(Boolean).map(o => o.level)), priority: actionPriority[action] }] : [];
    });
    organizationChanges.sort((a, b) => a.level - b.level || a.priority - b.priority || a.orgId.localeCompare(b.orgId));
    for (const [metric, label, unit] of [['employees', '方案覆盖员工', '人'], ['headcounts', '方案总编制', '个'], ['futurePeople', '未来人员', '人'], ['reserved', '预留编制', '个']]) {
      const value = facts.find(f => f.id === 'scope:' + metric);
      if (!value || !value.delta) continue;
      report('report:scope:' + metric, label + (value.delta > 0 ? '增加' : '减少') + Math.abs(value.delta) + unit + ('，调整后为' + value.after + unit) + '。', { before: value.before, after: value.after, delta: value.delta });
    }
    return { schema: 1, plan: pick(plan, ['id', 'name', 'effDate', 'adjustLevel', 'adjustReason', 'desc']), scopeIds: [...scope].sort(),
      definitions: { counts: '员工按在职主职身份去重；编制按稳定ID去重；范围内统计，不代表全企业增减；空编为可用加需求预留；未来不计当前员工', context: '只读祖先仅结构上下文；统计均限方案范围；不存在侧null', pending: '取消新增的待处理分支及关联不参与两侧比较；受影响汇总暂不提供，未处理去向不代表迁出或减编；只汇报已确定的变化', operations: '操作类型仅辅助，以最终结构和流向为准；同一拆分可通过保留或重建身份实现' },
      before, after, changes, flows, facts, operations, organizationFlows, businessSignals, positionCreations, organizationChanges, reportFacts };
  }
  async function fingerprint(facts) {
    const input = new TextEncoder().encode(canonical(facts));
    const crypto = root.crypto || (typeof require === 'function' ? require('node:crypto').webcrypto : null);
    const bytes = await crypto.subtle.digest('SHA-256', input);
    return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
  }
  function cleanDelta(delta) {
    if (!delta || !Array.isArray(delta.ops)) return { ops: [{ insert: '\n' }] };
    const ops = []; let total = 0;
    for (const op of delta.ops) {
      if (typeof op.insert !== 'string') continue;
      total += op.insert.length;
      if (total > 12000) throw new Error('概览内容过长，请控制在12000字以内');
      const attributes = {}, a = op.attributes || {};
      if (a.bold === true) attributes.bold = true;
      if (sizes.includes(a.size)) attributes.size = a.size;
      let color = typeof a.color === 'string' ? a.color.toLowerCase() : '';
      const rgb = color.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/);
      if (rgb && rgb.slice(1).every(n => Number(n) <= 255)) color = '#' + rgb.slice(1).map(n => Number(n).toString(16).padStart(2, '0')).join('');
      if (colors.includes(color)) attributes.color = color;
      if (op.insert) ops.push(Object.keys(attributes).length ? { insert: op.insert, attributes } : { insert: op.insert });
    }
    if (!ops.length || !ops[ops.length - 1].insert.endsWith('\n')) {
      if (total >= 12000) throw new Error('概览内容过长，请控制在12000字以内');
      ops.push({ insert: '\n' });
    }
    return { ops };
  }
  function plainText(delta) { return cleanDelta(delta).ops.map(op => op.insert).join('').trim(); }
  function key(planId) { return S.STORAGE_PREFIX + 'overview.' + planId; }
  function read(planId) {
    const raw = root.localStorage && root.localStorage.getItem(key(planId));
    if (!raw) return { revision: 0, delta: { ops: [{ insert: '\n' }] }, source: 'manual', sourceFactsHash: null };
    try { const d = JSON.parse(raw); return { ...d, delta: cleanDelta(d.delta) }; }
    catch (e) { throw new Error('概览文稿无法读取，请先备份当前浏览器数据'); }
  }
  function checkBusinessRevision(planId) {
    const raw = root.localStorage && root.localStorage.getItem(S.STORAGE_PREFIX + 'plan.' + planId);
    if (raw && (JSON.parse(raw).revision || 0) !== (S.getPlanData(planId).revision || 0)) throw new Error('方案已在其他窗口更新，请重新打开后继续');
  }
  function save(planId, value, expectedRevision) {
    const plan = S.getPlan(planId);
    if (!plan || !S.EDITABLE_STATUS.includes(plan.status)) throw new Error('当前方案不可编辑概览');
    checkBusinessRevision(planId);
    if (read(planId).revision !== expectedRevision) throw new Error('概览已在其他窗口修改，请重新打开后继续');
    const doc = { ...copy(value), delta: cleanDelta(value.delta), revision: expectedRevision + 1, updatedAt: new Date().toISOString() };
    root.localStorage.setItem(key(planId), JSON.stringify(doc));
    return doc;
  }
  function remove(planId) { if (root.localStorage) root.localStorage.removeItem(key(planId)); }
  function clearAll() {
    if (!root.localStorage) return;
    const prefix = S.STORAGE_PREFIX + 'overview.';
    const keys = [];
    for (let i = 0; i < root.localStorage.length; i++) { const k = root.localStorage.key(i); if (k && k.startsWith(prefix)) keys.push(k); }
    // Node 的既有测试垫片不实现 length/key。
    if (root.localStorage._m) Object.keys(root.localStorage._m).filter(k => k.startsWith(prefix)).forEach(k => keys.push(k));
    keys.forEach(k => root.localStorage.removeItem(k));
  }
  function snapshot(planId) { const d = read(planId); return plainText(d.delta) ? copy(d) : null; }
  function paragraphsToDelta(paragraphs) {
    const ops = [];
    for (const p of paragraphs) { for (const run of p.runs) ops.push(run.bold ? { insert: run.text, attributes: { bold: true } } : { insert: run.text }); ops.push({ insert: '\n' }); }
    return cleanDelta({ ops });
  }
  function render(container, delta) {
    container.replaceChildren();
    for (const op of cleanDelta(delta).ops) {
      const parts = op.insert.split('\n');
      parts.forEach((part, i) => {
        if (part) {
          const span = container.ownerDocument.createElement(op.attributes && op.attributes.bold ? 'strong' : 'span');
          span.textContent = part;
          if (op.attributes && op.attributes.size) span.style.fontSize = op.attributes.size;
          if (op.attributes && op.attributes.color) span.style.color = op.attributes.color;
          container.appendChild(span);
        }
        if (i < parts.length - 1) container.appendChild(container.ownerDocument.createElement('br'));
      });
    }
  }
  OA.Overview = { buildFacts, fingerprint, canonical, cleanDelta, plainText, read, save, remove, clearAll, snapshot, paragraphsToDelta, render, sizes, colors, checkBusinessRevision };
})(typeof window !== 'undefined' ? window : globalThis);
