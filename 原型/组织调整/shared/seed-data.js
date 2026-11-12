/* 种子数据：PRD 第 13 章（华东，仅内部自测）+ 第 17 章（案例一 CASE-01 / 案例二 CASE-02）。
 * 全部虚构；标识（O10/P10/H01/E01…）是测试身份，不是正式编码规则（PRD 0.1）。
 * 图（graph）结构：{orgs, positions, headcounts, persons, demands, posts, headcountWorkflows, seq}
 * persons.status: '在职' | '未来'；未来人以 targetPositionId+date+refs 表达（BR-08、PER-02）。
 */
(function (root) {
  const today = '2026-12-01'; // 方案生效日期（PRD 2.2 Demo 约定）

  function seqMap() { return { org: 0, position: 0, hc: 0, person: 0, post: 0, demand: 0 }; }

  /* Demo 编制类别：A/B/C 稳定标记，Demo 数据默认 C 类。 */
  function tagHeadcounts(list) {
    return list.map(h => ({ ...h, category: h.category || 'C' }));
  }

  /* 职级统一格式：P/M + 级 + 档，例如 P2-1、P3-4、M2-1。 */
  const LEVEL_VALUE_MAP = { P1: 'P1-1', P2: 'P2-1', P3: 'P3-2', P4: 'P4-2', P5: 'P5-1', P6: 'P6-1' };
  const LEVEL_MIN_MAP = { P1: 'P1-1', P2: 'P2-1', P3: 'P3-1', P4: 'P4-1', P5: 'P5-1', P6: 'P6-1' };
  const LEVEL_MAX_MAP = { P1: 'P1-4', P2: 'P2-4', P3: 'P3-4', P4: 'P4-4', P5: 'P5-4', P6: 'P6-4' };
  const MANAGER_LEVEL_MAP = { M01: 'M2-1', M02: 'M2-2', M03: 'M3-1', M04: 'M3-2', HR01: 'P3-3', HR02: 'P3-3' };
  const levelValue = v => LEVEL_VALUE_MAP[v] || v;
  const levelMin = v => LEVEL_MIN_MAP[v] || v;
  const levelMax = v => LEVEL_MAX_MAP[v] || v;

  function normalizeGraphLevels(g) {
    (g.orgs || []).forEach(o => { if (o.sortCode === undefined) o.sortCode = Number(o.order) || 1; });
    (g.positions || []).forEach(p => { if (p.sequenceNo === undefined) p.sequenceNo = Number(p.order) || 1; });
    g.positions.forEach(p => {
      p.levelMin = levelMin(p.levelMin);
      p.levelMax = levelMax(p.levelMax);
    });
    g.headcounts.forEach(h => {
      h.level = levelValue(h.level);
      h.category = h.category || 'C';
    });
    g.persons.forEach(p => {
      if (p.kind === 'manager' || p.kind === 'hrbp') p.level = MANAGER_LEVEL_MAP[p.id] || 'P3-3';
      else if (p.level) p.level = levelValue(p.level);
      else {
        const tp = g.positions.find(x => x.id === (p.targetPositionId || p.positionId));
        p.level = tp ? tp.levelMin : 'P3-2';
      }
    });
    (g.demands || []).forEach(d => { if (d.level) d.level = levelValue(d.level); });
    return g;
  }

  /* ============ 华东宇宙（PRD 13.1–13.3） ============ */
  function huadong() {
    return {
      orgs: [
        { id: 'O00', name: '总部', code: '0001', parentId: null, sortCode: 1, status: '有效', setupDate: '2018-01-01', leaderId: null, hrbpId: null },
        { id: 'O10', name: '产品部', code: '0100', parentId: 'O00', sortCode: 1, status: '有效', setupDate: '2018-01-01', leaderId: 'M01', hrbpId: 'HR01' },
        { id: 'O20', name: '研发部', code: '0200', parentId: 'O00', sortCode: 2, status: '有效', setupDate: '2018-01-01', leaderId: null, hrbpId: null },
        { id: 'O21', name: '业务支持部', code: '0210', parentId: 'O20', sortCode: 1, status: '有效', setupDate: '2019-01-01', leaderId: null, hrbpId: null },
        { id: 'O30', name: '运营部', code: '0300', parentId: 'O00', sortCode: 3, status: '有效', setupDate: '2018-01-01', leaderId: 'M02', hrbpId: null },
        { id: 'O40', name: '仓储部', code: '0400', parentId: 'O00', sortCode: 4, status: '有效', setupDate: '2018-01-01', leaderId: null, hrbpId: null }
      ],
      positions: [
        { id: 'P10', name: '产品经理', code: 'GW0101', orgId: 'O10', sequenceNo: 1, status: '有效', setupDate: '2018-01-01', levelMin: 'P3-1', levelMax: 'P5-4' },
        { id: 'P11', name: '产品设计师', code: 'GW0102', orgId: 'O10', sequenceNo: 2, status: '有效', setupDate: '2018-01-01', levelMin: 'P3-1', levelMax: 'P5-4' },
        { id: 'P20', name: '运营经理', code: 'GW0301', orgId: 'O30', sequenceNo: 1, status: '有效', setupDate: '2018-01-01', levelMin: 'P4-1', levelMax: 'P6-4' },
        { id: 'P21', name: '运营助理', code: 'GW0302', orgId: 'O30', sequenceNo: 2, status: '有效', setupDate: '2018-01-01', levelMin: 'P1-1', levelMax: 'P3-4' },
        { id: 'P40', name: '仓储主管', code: 'GW0401', orgId: 'O40', sequenceNo: 1, status: '有效', setupDate: '2018-01-01', levelMin: 'P3-1', levelMax: 'P5-4' }
      ],
      headcounts: tagHeadcounts([
        { id: 'H01', code: '202611060001', positionId: 'P10', level: 'P4-2', state: '占编', personId: 'E01', demandId: null },
        { id: 'H02', code: '202611060002', positionId: 'P10', level: 'P4-2', state: 'Offer占用', personId: 'C01', demandId: 'R01' },
        { id: 'H03', code: '202611060003', positionId: 'P10', level: 'P4-2', state: '可用', personId: null, demandId: null },
        { id: 'H04', code: '202611060004', positionId: 'P10', level: 'P4-2', state: '需求预留', personId: null, demandId: 'R01' },
        { id: 'H05', code: '202611060005', positionId: 'P10', level: 'P4-2', state: '需求预留', personId: null, demandId: 'R01' },
        { id: 'H06', code: '202611060006',positionId: 'P10', level: 'P4-2', state: '待调入预留', personId: 'E03', demandId: null },
        { id: 'H07', code: '202611060007', positionId: 'P11', level: 'P4-2', state: '占编', personId: 'E04', demandId: null },
        { id: 'H08', code: '202611060008', positionId: 'P20', level: 'P5-1', state: '占编', personId: 'E05', demandId: null },
        { id: 'H09', code: '202611060009', positionId: 'P20', level: 'P5-1', state: '可用', personId: null, demandId: null },
        { id: 'H40', code: '202611060010', positionId: 'P40', level: 'P4-2', state: '占编', personId: 'E06', demandId: null }
      ]),
      persons: [
        { id: 'M01', name: '李经理', status: '在职', kind: 'manager', positionId: null, level: 'M2-1', headcountId: null, managerId: null },
        { id: 'M02', name: '王经理', status: '在职', kind: 'manager', positionId: null, level: 'M2-2', headcountId: null, managerId: null },
        { id: 'HR01', name: '陈敏', status: '在职', kind: 'hrbp', positionId: null, level: 'P3-3', headcountId: null, managerId: null },
        { id: 'E01', name: '张三', status: '在职', kind: 'employee', positionId: 'P10', level: 'P4-2', headcountId: 'H01', managerId: 'M01' },
        { id: 'E02', name: '李四', status: '在职', kind: 'employee', positionId: 'P10', level: 'P4-2', headcountId: null, managerId: 'M01' },
        { id: 'E04', name: '陈七', status: '在职', kind: 'employee', positionId: 'P11', level: 'P4-2', headcountId: 'H07', managerId: 'E01' },
        { id: 'E05', name: '孙八', status: '在职', kind: 'employee', positionId: 'P20', level: 'P5-1', headcountId: 'H08', managerId: 'M02' },
        { id: 'E06', name: '王强', status: '在职', kind: 'employee', positionId: 'P40', level: 'P4-2', headcountId: 'H40', managerId: null },
        { id: 'C01', name: '王五', status: '未来', kind: 'employee', futureType: '已接收Offer', targetPositionId: 'P10', headcountId: 'H02', date: '2027-01-12', refs: [{ type: 'Offer', note: 'Offer 关联，需求 R01' }] },
        { id: 'C02', name: '王六', status: '未来', kind: 'employee', futureType: '待入职', targetPositionId: 'P10', headcountId: null, date: '2027-01-03', refs: [{ type: '入职', note: '待入职单' }] },
        { id: 'E03', name: '赵六', status: '未来', kind: 'employee', futureType: '待调入', targetPositionId: 'P10', headcountId: 'H06', date: '2027-01-05', refs: [{ type: '调入', note: '外部现任职调入' }] }
      ],
      demands: [
        { id: 'R01', code: '202611030003', name: '产品经理招聘需求', level: 'P4-2', headcountIds: ['H02', 'H04', 'H05'] }
      ],
      posts: [
        { id: 'PT01', personId: 'E06', mainPositionId: 'P40', concurrentPositionId: 'P10', status: '有效' }
      ],
      seq: seqMap()
    };
  }

  /* ============ 第 17.1 节共用组织树（V0.3 扩充：含范围内数据部与范围外上下文） ============ */
  function caseOrgs() {
    return [
      { id: 'G01', name: '集团', code: '9001', parentId: null, sortCode: 1, status: '有效', setupDate: '2010-01-01', leaderId: null, hrbpId: null },
      { id: 'G02', name: 'HRAS', code: '9010', parentId: 'G01', sortCode: 1, status: '有效', setupDate: '2015-01-01', leaderId: null, hrbpId: null },
      { id: 'G03', name: '技术部', code: '9011', parentId: 'G02', sortCode: 1, status: '有效', setupDate: '2015-01-01', leaderId: 'M01', hrbpId: 'HR01' },
      { id: 'G04', name: '产品部', code: '9012', parentId: 'G03', sortCode: 1, status: '有效', setupDate: '2016-01-01', leaderId: 'M02', hrbpId: 'HR02' },
      { id: 'G05', name: '项目部', code: '9013', parentId: 'G03', sortCode: 2, status: '有效', setupDate: '2016-01-01', leaderId: 'M03', hrbpId: null },
      { id: 'G06', name: '数据部', code: '9014', parentId: 'G03', sortCode: 3, status: '有效', setupDate: '2017-01-01', leaderId: 'M04', hrbpId: null },
      { id: 'G07', name: '财经管理部', code: '9020', parentId: 'G01', sortCode: 2, status: '有效', setupDate: '2010-06-01', leaderId: null, hrbpId: null },
      { id: 'G08', name: '人力资源部', code: '9021', parentId: 'G02', sortCode: 2, status: '有效', setupDate: '2015-06-01', leaderId: null, hrbpId: null }
    ];
  }

  /* 管理人员与 HRBP（两案例通用，不占职位编制） */
  function caseLeaders() {
    return [
      { id: 'M01', name: '王经理', status: '在职', kind: 'manager', positionId: null, level: 'M2-1', headcountId: null, managerId: null },
      { id: 'M02', name: '李经理', status: '在职', kind: 'manager', positionId: null, level: 'M2-2', headcountId: null, managerId: null },
      { id: 'M03', name: '陈经理', status: '在职', kind: 'manager', positionId: null, level: 'M3-1', headcountId: null, managerId: null },
      { id: 'M04', name: '赵经理', status: '在职', kind: 'manager', positionId: null, level: 'M3-2', headcountId: null, managerId: null },
      { id: 'HR01', name: '陈敏', status: '在职', kind: 'hrbp', positionId: null, level: 'P3-3', headcountId: null, managerId: null },
      { id: 'HR02', name: '周敏', status: '在职', kind: 'hrbp', positionId: null, level: 'P3-3', headcountId: null, managerId: null }
    ];
  }

  /* ============ 案例一 CASE-01（PRD 17.2.2，V0.4：范围内 9 职位 24 人 28 编制 4 可用，无特殊状态） ============ */
  function case1() {
    return {
      orgs: caseOrgs(),
      positions: [
        { id: 'C1-P01', name: '产品经理', code: '202611070001', orgId: 'G04', sequenceNo: 1, status: '有效', setupDate: '2016-01-01', levelMin: 'P4-1', levelMax: 'P6-4' },
        { id: 'C1-P02', name: '产品运营', code: '202611070002', orgId: 'G04', sequenceNo: 2, status: '有效', setupDate: '2016-01-01', levelMin: 'P3-1', levelMax: 'P4-4' },
        { id: 'C1-P05', name: '产品设计师', code: '202611070003', orgId: 'G04', sequenceNo: 3, status: '有效', setupDate: '2017-01-01', levelMin: 'P3-1', levelMax: 'P4-4' },
        { id: 'C1-P03', name: '项目经理', code: '202611070004', orgId: 'G05', sequenceNo: 1, status: '有效', setupDate: '2016-01-01', levelMin: 'P4-1', levelMax: 'P6-4' },
        { id: 'C1-P04', name: '项目专员', code: '202611070005', orgId: 'G05', sequenceNo: 2, status: '有效', setupDate: '2016-01-01', levelMin: 'P2-1', levelMax: 'P3-4' },
        { id: 'C1-P06', name: '测试工程师', code: '202611070006', orgId: 'G05', sequenceNo: 3, status: '有效', setupDate: '2017-01-01', levelMin: 'P2-1', levelMax: 'P4-4' },
        { id: 'C1-P07', name: '数据分析师', code: '202611070007', orgId: 'G06', sequenceNo: 1, status: '有效', setupDate: '2017-01-01', levelMin: 'P3-1', levelMax: 'P5-4' },
        { id: 'C1-P08', name: '算法工程师', code: '202611070008', orgId: 'G06', sequenceNo: 2, status: '有效', setupDate: '2018-01-01', levelMin: 'P4-1', levelMax: 'P6-4' },
        { id: 'C1-P09', name: '数据专员', code: '202611070009', orgId: 'G06', sequenceNo: 3, status: '有效', setupDate: '2018-01-01', levelMin: 'P2-1', levelMax: 'P4-4' },
        { id: 'C1-P10', name: '资金管理专员', code: '202611070010', orgId: 'G07', sequenceNo: 1, status: '有效', setupDate: '2015-01-01', levelMin: 'P3-1', levelMax: 'P4-4' },
        { id: 'C1-P11', name: '招聘专员', code: '202611070011', orgId: 'G08', sequenceNo: 1, status: '有效', setupDate: '2015-01-01', levelMin: 'P2-1', levelMax: 'P4-4' }
      ],
      headcounts: tagHeadcounts([
        { id: 'C1-H01', code: '202611070101', positionId: 'C1-P01', level: 'P5-1', state: '占编', personId: 'C1-E01', demandId: null },
        { id: 'C1-H06', code: '202611070102', positionId: 'C1-P01', level: 'P4-2', state: '占编', personId: 'C1-E05', demandId: null },
        { id: 'C1-H07', code: '202611070103', positionId: 'C1-P01', level: 'P4-2', state: '占编', personId: 'C1-E06', demandId: null },
        { id: 'C1-H08', code: '202611070104', positionId: 'C1-P01', level: 'P4-2', state: '占编', personId: 'C1-E07', demandId: null },
        { id: 'C1-H09', code: '202611070105', positionId: 'C1-P01', level: 'P5-1', state: '占编', personId: 'C1-E08', demandId: null },
        { id: 'C1-H10', code: '202611070106', positionId: 'C1-P01', level: 'P4-2', state: '可用', personId: null, demandId: null },
        { id: 'C1-H11', code: '202611070107', positionId: 'C1-P01', level: 'P4-2', state: '可用', personId: null, demandId: null },
        { id: 'C1-H02', code: '202611070108', positionId: 'C1-P02', level: 'P3-2', state: '占编', personId: 'C1-E02', demandId: null },
        { id: 'C1-H12', code: '202611070109', positionId: 'C1-P02', level: 'P4-2', state: '占编', personId: 'C1-E09', demandId: null },
        { id: 'C1-H13', code: '202611070110', positionId: 'C1-P02', level: 'P3-2', state: '占编', personId: 'C1-E10', demandId: null },
        { id: 'C1-H14', code: '202611070111', positionId: 'C1-P02', level: 'P3-2', state: '占编', personId: 'C1-E11', demandId: null },
        { id: 'C1-H03', code: '202611070112', positionId: 'C1-P02', level: 'P3-2', state: '可用', personId: null, demandId: null },
        { id: 'C1-H15', code: '202611070113', positionId: 'C1-P05', level: 'P4-2', state: '占编', personId: 'C1-E12', demandId: null },
        { id: 'C1-H16', code: '202611070114', positionId: 'C1-P05', level: 'P3-2', state: '占编', personId: 'C1-E13', demandId: null },
        { id: 'C1-H17', code: '202611070115', positionId: 'C1-P05', level: 'P4-2', state: '可用', personId: null, demandId: null },
        { id: 'C1-H04', code: '202611070116', positionId: 'C1-P03', level: 'P4-2', state: '占编', personId: 'C1-E03', demandId: null },
        { id: 'C1-H18', code: '202611070117', positionId: 'C1-P03', level: 'P5-1', state: '占编', personId: 'C1-E14', demandId: null },
        { id: 'C1-H05', code: '202611070118', positionId: 'C1-P04', level: 'P3-2', state: '占编', personId: 'C1-E04', demandId: null },
        { id: 'C1-H19', code: '202611070119', positionId: 'C1-P04', level: 'P3-2', state: '占编', personId: 'C1-E15', demandId: null },
        { id: 'C1-H20', code: '202611070120', positionId: 'C1-P04', level: 'P2-1', state: '占编', personId: 'C1-E16', demandId: null },
        { id: 'C1-H21', code: '202611070121', positionId: 'C1-P06', level: 'P4-2', state: '占编', personId: 'C1-E17', demandId: null },
        { id: 'C1-H22', code: '202611070122', positionId: 'C1-P06', level: 'P3-2', state: '占编', personId: 'C1-E18', demandId: null },
        { id: 'C1-H23', code: '202611070123', positionId: 'C1-P06', level: 'P3-2', state: '占编', personId: 'C1-E19', demandId: null },
        { id: 'C1-H24', code: '202611070124', positionId: 'C1-P06', level: 'P2-1', state: '占编', personId: 'C1-E20', demandId: null },
        { id: 'C1-H25', code: '202611070125', positionId: 'C1-P07', level: 'P4-2', state: '占编', personId: 'C1-E21', demandId: null },
        { id: 'C1-H26', code: '202611070126', positionId: 'C1-P07', level: 'P3-2', state: '占编', personId: 'C1-E22', demandId: null },
        { id: 'C1-H27', code: '202611070127', positionId: 'C1-P08', level: 'P5-1', state: '占编', personId: 'C1-E23', demandId: null },
        { id: 'C1-H28', code: '202611070128', positionId: 'C1-P09', level: 'P3-2', state: '占编', personId: 'C1-E24', demandId: null },
        { id: 'C1-H29', code: '202611070129', positionId: 'C1-P10', level: 'P3-2', state: '占编', personId: 'C1-E25', demandId: null },
        { id: 'C1-H30', code: '202611070130', positionId: 'C1-P11', level: 'P3-2', state: '占编', personId: 'C1-E26', demandId: null }
      ]),
      persons: caseLeaders().concat([
        { id: 'C1-E01', name: '张三', status: '在职', kind: 'employee', positionId: 'C1-P01', level: 'P5-1', headcountId: 'C1-H01', managerId: 'M02' },
        { id: 'C1-E05', name: '孙八', status: '在职', kind: 'employee', positionId: 'C1-P01', level: 'P4-2', headcountId: 'C1-H06', managerId: 'M02' },
        { id: 'C1-E06', name: '周九', status: '在职', kind: 'employee', positionId: 'C1-P01', level: 'P4-2', headcountId: 'C1-H07', managerId: 'M02' },
        { id: 'C1-E07', name: '吴十', status: '在职', kind: 'employee', positionId: 'C1-P01', level: 'P4-2', headcountId: 'C1-H08', managerId: 'M02' },
        { id: 'C1-E08', name: '郑一', status: '在职', kind: 'employee', positionId: 'C1-P01', level: 'P5-1', headcountId: 'C1-H09', managerId: 'M02' },
        { id: 'C1-E02', name: '李四', status: '在职', kind: 'employee', positionId: 'C1-P02', level: 'P3-2', headcountId: 'C1-H02', managerId: 'M02' },
        { id: 'C1-E09', name: '王二', status: '在职', kind: 'employee', positionId: 'C1-P02', level: 'P4-2', headcountId: 'C1-H12', managerId: 'M02' },
        { id: 'C1-E10', name: '冯三', status: '在职', kind: 'employee', positionId: 'C1-P02', level: 'P3-2', headcountId: 'C1-H13', managerId: 'M02' },
        { id: 'C1-E11', name: '陈四', status: '在职', kind: 'employee', positionId: 'C1-P02', level: 'P3-2', headcountId: 'C1-H14', managerId: 'M02' },
        { id: 'C1-E12', name: '褚五', status: '在职', kind: 'employee', positionId: 'C1-P05', level: 'P4-2', headcountId: 'C1-H15', managerId: 'M02' },
        { id: 'C1-E13', name: '卫六', status: '在职', kind: 'employee', positionId: 'C1-P05', level: 'P3-2', headcountId: 'C1-H16', managerId: 'M02' },
        { id: 'C1-E03', name: '王五', status: '在职', kind: 'employee', positionId: 'C1-P03', level: 'P4-2', headcountId: 'C1-H04', managerId: 'M03' },
        { id: 'C1-E14', name: '蒋七', status: '在职', kind: 'employee', positionId: 'C1-P03', level: 'P5-1', headcountId: 'C1-H18', managerId: 'M03' },
        { id: 'C1-E04', name: '赵六', status: '在职', kind: 'employee', positionId: 'C1-P04', level: 'P3-2', headcountId: 'C1-H05', managerId: 'M03' },
        { id: 'C1-E15', name: '沈八', status: '在职', kind: 'employee', positionId: 'C1-P04', level: 'P3-2', headcountId: 'C1-H19', managerId: 'M03' },
        { id: 'C1-E16', name: '韩九', status: '在职', kind: 'employee', positionId: 'C1-P04', level: 'P2-1', headcountId: 'C1-H20', managerId: 'M03' },
        { id: 'C1-E17', name: '杨十', status: '在职', kind: 'employee', positionId: 'C1-P06', level: 'P4-2', headcountId: 'C1-H21', managerId: 'M03' },
        { id: 'C1-E18', name: '朱一', status: '在职', kind: 'employee', positionId: 'C1-P06', level: 'P3-2', headcountId: 'C1-H22', managerId: 'M03' },
        { id: 'C1-E19', name: '秦二', status: '在职', kind: 'employee', positionId: 'C1-P06', level: 'P3-2', headcountId: 'C1-H23', managerId: 'M03' },
        { id: 'C1-E20', name: '尤三', status: '在职', kind: 'employee', positionId: 'C1-P06', level: 'P2-1', headcountId: 'C1-H24', managerId: 'M03' },
        { id: 'C1-E21', name: '许四', status: '在职', kind: 'employee', positionId: 'C1-P07', level: 'P4-2', headcountId: 'C1-H25', managerId: 'M04' },
        { id: 'C1-E22', name: '何五', status: '在职', kind: 'employee', positionId: 'C1-P07', level: 'P3-2', headcountId: 'C1-H26', managerId: 'M04' },
        { id: 'C1-E23', name: '吕六', status: '在职', kind: 'employee', positionId: 'C1-P08', level: 'P5-1', headcountId: 'C1-H27', managerId: 'M04' },
        { id: 'C1-E24', name: '施七', status: '在职', kind: 'employee', positionId: 'C1-P09', level: 'P3-2', headcountId: 'C1-H28', managerId: 'M04' },
        { id: 'C1-E25', name: '张八', status: '在职', kind: 'employee', positionId: 'C1-P10', level: 'P3-2', headcountId: 'C1-H29', managerId: null },
        { id: 'C1-E26', name: '刘一', status: '在职', kind: 'employee', positionId: 'C1-P11', level: 'P3-2', headcountId: 'C1-H30', managerId: null }
      ]),
      demands: [],
      posts: [],
      seq: seqMap()
    };
  }

  /* ============ 案例二 CASE-02（PRD 17.3.2，V0.4：范围内 8 职位 18 在职 3 未来 26 编制 4 可用 2 兼职 1 需求） ============ */
  function case2() {
    return {
      orgs: caseOrgs(),
      positions: [
        { id: 'C2-P01', name: '产品经理', code: '202611080001', orgId: 'G04', sequenceNo: 1, status: '有效', setupDate: '2016-01-01', levelMin: 'P4-1', levelMax: 'P6-4' },
        { id: 'C2-P02', name: '产品设计师', code: '202611080002', orgId: 'G04', sequenceNo: 2, status: '有效', setupDate: '2016-01-01', levelMin: 'P3-1', levelMax: 'P5-4' },
        { id: 'C2-P05', name: '产品运营', code: '202611080003', orgId: 'G04', sequenceNo: 3, status: '有效', setupDate: '2017-01-01', levelMin: 'P3-1', levelMax: 'P5-4' },
        { id: 'C2-P03', name: '项目经理', code: '202611080004', orgId: 'G05', sequenceNo: 1, status: '有效', setupDate: '2016-01-01', levelMin: 'P4-1', levelMax: 'P6-4' },
        { id: 'C2-P04', name: '项目专员', code: '202611080005', orgId: 'G05', sequenceNo: 2, status: '有效', setupDate: '2016-01-01', levelMin: 'P2-1', levelMax: 'P4-4' },
        { id: 'C2-P06', name: '测试工程师', code: '202611080006', orgId: 'G05', sequenceNo: 3, status: '有效', setupDate: '2017-01-01', levelMin: 'P2-1', levelMax: 'P5-4' },
        { id: 'C2-P07', name: '数据分析师', code: '202611080007', orgId: 'G06', sequenceNo: 1, status: '有效', setupDate: '2017-01-01', levelMin: 'P3-1', levelMax: 'P5-4' },
        { id: 'C2-P08', name: '算法工程师', code: '202611080008', orgId: 'G06', sequenceNo: 2, status: '有效', setupDate: '2018-01-01', levelMin: 'P4-1', levelMax: 'P6-4' },
        { id: 'C2-P09', name: '资金管理专员', code: '202611080009', orgId: 'G07', sequenceNo: 1, status: '有效', setupDate: '2015-01-01', levelMin: 'P3-1', levelMax: 'P4-4' },
        { id: 'C2-P10', name: '招聘专员', code: '202611080010', orgId: 'G08', sequenceNo: 1, status: '有效', setupDate: '2015-01-01', levelMin: 'P2-1', levelMax: 'P4-4' }
      ],
      headcounts: tagHeadcounts([
        { id: 'C2-H01', code: '202611080101', positionId: 'C2-P01', level: 'P4-2', state: '占编', personId: 'C2-E01', demandId: null },
        { id: 'C2-H13', code: '202611080102', positionId: 'C2-P01', level: 'P4-2', state: '占编', personId: 'C2-E06', demandId: null },
        { id: 'C2-H23', code: '202611080103', positionId: 'C2-P01', level: 'P4-2', state: '占编', personId: 'C2-E13', demandId: null },
        { id: 'C2-H24', code: '202611080104', positionId: 'C2-P01', level: 'P4-2', state: '占编', personId: 'C2-E14', demandId: null },
        { id: 'C2-H05', code: '202611080105', positionId: 'C2-P01', level: 'P4-2', state: '可用', personId: null, demandId: null },
        { id: 'C2-H02', code: '202611080106', positionId: 'C2-P02', level: 'P3-2', state: 'Offer占用', personId: 'C2-E02', demandId: null },
        { id: 'C2-H16', code: '202611080107', positionId: 'C2-P02', level: 'P3-2', state: '占编', personId: 'C2-E15', demandId: null },
        { id: 'C2-H06', code: '202611080108', positionId: 'C2-P05', level: 'P3-2', state: '占编', personId: 'C2-E07', demandId: null },
        { id: 'C2-H07', code: '202611080109', positionId: 'C2-P05', level: 'P4-2', state: '占编', personId: 'C2-E08', demandId: null },
        { id: 'C2-H15', code: '202611080110', positionId: 'C2-P05', level: 'P3-2', state: '占编', personId: 'C2-E16', demandId: null },
        { id: 'C2-H08', code: '202611080111', positionId: 'C2-P05', level: 'P3-2', state: '可用', personId: null, demandId: null },
        { id: 'C2-H09', code: '202611080112', positionId: 'C2-P05', level: 'P3-2', state: '需求预留', personId: null, demandId: 'R01' },
        { id: 'C2-H10', code: '202611080113', positionId: 'C2-P05', level: 'P3-2', state: '需求预留', personId: null, demandId: 'R01' },
        { id: 'C2-H03', code: '202611080114', positionId: 'C2-P03', level: 'P5-1', state: '占编', personId: 'C2-E03', demandId: null },
        { id: 'C2-H17', code: '202611080115', positionId: 'C2-P03', level: 'P4-2', state: '占编', personId: 'C2-E17', demandId: null },
        { id: 'C2-H04', code: '202611080116', positionId: 'C2-P04', level: 'P3-2', state: '待调入预留', personId: 'C2-E04', demandId: null },
        { id: 'C2-H18', code: '202611080117', positionId: 'C2-P04', level: 'P3-2', state: '占编', personId: 'C2-E18', demandId: null },
        { id: 'C2-H19', code: '202611080118', positionId: 'C2-P04', level: 'P2-1', state: '占编', personId: 'C2-E19', demandId: null },
        { id: 'C2-H20', code: '202611080119', positionId: 'C2-P04', level: 'P3-2', state: '可用', personId: null, demandId: null },
        { id: 'C2-H11', code: '202611080120', positionId: 'C2-P06', level: 'P3-2', state: '占编', personId: 'C2-E09', demandId: null },
        { id: 'C2-H21', code: '202611080121', positionId: 'C2-P06', level: 'P3-2', state: '占编', personId: 'C2-E21', demandId: null },
        { id: 'C2-H22', code: '202611080122', positionId: 'C2-P06', level: 'P4-2', state: '占编', personId: 'C2-E20', demandId: null },
        { id: 'C2-H12', code: '202611080123', positionId: 'C2-P06', level: 'P3-2', state: '可用', personId: null, demandId: null },
        { id: 'C2-H14', code: '202611080124', positionId: 'C2-P07', level: 'P4-2', state: '占编', personId: 'C2-E10', demandId: null },
        { id: 'C2-H25', code: '202611080125', positionId: 'C2-P07', level: 'P3-2', state: '占编', personId: 'C2-E22', demandId: null },
        { id: 'C2-H26', code: '202611080126', positionId: 'C2-P08', level: 'P5-1', state: '占编', personId: 'C2-E23', demandId: null },
        { id: 'C2-H27', code: '202611080127', positionId: 'C2-P09', level: 'P3-2', state: '占编', personId: 'C2-E11', demandId: null },
        { id: 'C2-H28', code: '202611080128', positionId: 'C2-P10', level: 'P3-2', state: '占编', personId: 'C2-E12', demandId: null }
      ]),
      persons: caseLeaders().concat([
        { id: 'C2-E01', name: '王强', status: '在职', kind: 'employee', positionId: 'C2-P01', level: 'P4-2', headcountId: 'C2-H01', managerId: 'M02' },
        { id: 'C2-E06', name: '李四', status: '在职', kind: 'employee', positionId: 'C2-P01', level: 'P4-2', headcountId: 'C2-H13', managerId: 'M02' },
        { id: 'C2-E13', name: '周天', status: '在职', kind: 'employee', positionId: 'C2-P01', level: 'P4-2', headcountId: 'C2-H23', managerId: 'M02' },
        { id: 'C2-E14', name: '吴地', status: '在职', kind: 'employee', positionId: 'C2-P01', level: 'P4-2', headcountId: 'C2-H24', managerId: 'M02' },
        { id: 'C2-E15', name: '冯二', status: '在职', kind: 'employee', positionId: 'C2-P02', level: 'P3-2', headcountId: 'C2-H16', managerId: 'M02' },
        { id: 'C2-E07', name: '钱七', status: '在职', kind: 'employee', positionId: 'C2-P05', level: 'P3-2', headcountId: 'C2-H06', managerId: 'M02' },
        { id: 'C2-E08', name: '孙八', status: '在职', kind: 'employee', positionId: 'C2-P05', level: 'P4-2', headcountId: 'C2-H07', managerId: 'M02' },
        { id: 'C2-E16', name: '郑二', status: '在职', kind: 'employee', positionId: 'C2-P05', level: 'P3-2', headcountId: 'C2-H15', managerId: 'M02' },
        { id: 'C2-E03', name: '陈七', status: '在职', kind: 'employee', positionId: 'C2-P03', level: 'P5-1', headcountId: 'C2-H03', managerId: 'M03' },
        { id: 'C2-E17', name: '林一', status: '在职', kind: 'employee', positionId: 'C2-P03', level: 'P4-2', headcountId: 'C2-H17', managerId: 'M03' },
        { id: 'C2-E18', name: '何二', status: '在职', kind: 'employee', positionId: 'C2-P04', level: 'P3-2', headcountId: 'C2-H18', managerId: 'M03' },
        { id: 'C2-E19', name: '高三', status: '在职', kind: 'employee', positionId: 'C2-P04', level: 'P2-1', headcountId: 'C2-H19', managerId: 'M03' },
        { id: 'C2-E09', name: '周九', status: '在职', kind: 'employee', positionId: 'C2-P06', level: 'P3-2', headcountId: 'C2-H11', managerId: 'M03' },
        { id: 'C2-E21', name: '吴十', status: '在职', kind: 'employee', positionId: 'C2-P06', level: 'P3-2', headcountId: 'C2-H21', managerId: 'M03' },
        { id: 'C2-E20', name: '宋七', status: '在职', kind: 'employee', positionId: 'C2-P06', level: 'P4-2', headcountId: 'C2-H22', managerId: 'M03' },
        { id: 'C2-E10', name: '冯十', status: '在职', kind: 'employee', positionId: 'C2-P07', level: 'P4-2', headcountId: 'C2-H14', managerId: 'M04' },
        { id: 'C2-E22', name: '任八', status: '在职', kind: 'employee', positionId: 'C2-P07', level: 'P3-2', headcountId: 'C2-H25', managerId: 'M04' },
        { id: 'C2-E23', name: '彭九', status: '在职', kind: 'employee', positionId: 'C2-P08', level: 'P5-1', headcountId: 'C2-H26', managerId: 'M04' },
        { id: 'C2-E11', name: '吴二', status: '在职', kind: 'employee', positionId: 'C2-P09', level: 'P3-2', headcountId: 'C2-H27', managerId: null },
        { id: 'C2-E12', name: '郑三', status: '在职', kind: 'employee', positionId: 'C2-P10', level: 'P3-2', headcountId: 'C2-H28', managerId: null },
        { id: 'C2-E02', name: '王五', status: '未来', kind: 'employee', futureType: '已接收Offer', targetPositionId: 'C2-P02', headcountId: 'C2-H02', date: '2027-01-12', refs: [{ type: 'Offer', note: 'Offer 关联 C2-H02' }] },
        { id: 'C2-E04', name: '赵六', status: '未来', kind: 'employee', futureType: '待调入', targetPositionId: 'C2-P04', headcountId: 'C2-H04', date: '2027-01-05', refs: [{ type: '调入', note: '外部现任职调入' }] },
        { id: 'C2-E05', name: '王六', status: '未来', kind: 'employee', futureType: '待入职', targetPositionId: 'C2-P06', headcountId: null, date: '2027-01-20', refs: [{ type: '入职', note: '待入职单，无编制预留' }] }
      ]),
      demands: [
        { id: 'R01', code: '202611030004', name: '产品运营招聘需求', level: 'P3-2', headcountIds: ['C2-H09', 'C2-H10'] }
      ],
      posts: [
        { id: 'C2-PT01', personId: 'C2-E01', mainPositionId: 'C2-P01', concurrentPositionId: 'C2-P03', status: '有效' },
        { id: 'C2-PT02', personId: 'C2-E09', mainPositionId: 'C2-P06', concurrentPositionId: 'C2-P05', status: '有效' }
      ],
      seq: seqMap()
    };
  }


  /* 新建方案范围校验专用宇宙：保留案例一数据，额外加入时间轴与在途编制流程示例。 */
  function scopeDemo() {
    const g = case1();
    g.orgs = g.orgs.concat([
      { id: 'S00', name: '创新业务中心', code: '9090', parentId: 'G02', sortCode: 3, status: '有效', setupDate: '2018-01-01', leaderId: null, hrbpId: null },
      { id: 'S01', name: '未来启用部', code: '9091', parentId: 'S00', sortCode: 1, status: '有效', setupDate: '2027-01-01', effectiveFrom: '2027-01-01', leaderId: null, hrbpId: null },
      { id: 'S02', name: '计划停用部', code: '9092', parentId: 'S00', sortCode: 2, status: '有效', setupDate: '2018-01-01', effectiveTo: '2027-06-30', leaderId: null, hrbpId: null },
      { id: 'S03', name: '创新支持部', code: '9093', parentId: 'S00', sortCode: 3, status: '有效', setupDate: '2018-01-01', leaderId: null, hrbpId: null },
      { id: 'S04', name: '历史业务部', code: '9094', parentId: 'S00', sortCode: 4, status: '停用', setupDate: '2018-01-01', effectiveTo: '2026-12-01', leaderId: null, hrbpId: null },
      { id: 'S05', name: '区域服务中心', code: '9095', parentId: 'G02', sortCode: 4, status: '有效', setupDate: '2018-01-01', leaderId: null, hrbpId: null },
      { id: 'S06', name: '编制审批部', code: '9096', parentId: 'S05', sortCode: 1, status: '有效', setupDate: '2018-01-01', leaderId: null, hrbpId: null }
    ]);
    g.headcountWorkflows = [
      { id: 'WF-S06-01', orgId: 'S06', name: '编制审批部年度编制调整', status: '审批中' }
    ];
    return g;
  }

  /* 预置方案：PRD 17.4 —— 案例一、案例二作为方案列表中的两个独立方案 */
  const PLAN_EFF_DATE = today;
  const DEFAULT_PLANS = [
    {
      id: 'plan-case1', universe: 'case1',
      name: '技术部组织拆分方案',
      adjustLevel: 'BU下设一级', adjustReason: '内部原因',
      effDate: PLAN_EFF_DATE, desc: '产品与项目团队按方向拆分，先建目标组织，再整体迁移职位。',
      sourceScopeIds: ['G03'], targetScopeIds: [], status: '草稿',
      createdAt: '2026-11-08 09:00', updatedAt: '2026-11-09 10:35'
    },
    {
      id: 'plan-case2', universe: 'case2',
      name: '技术部组织拆分方案（含未来人员与停用冲突）',
      adjustLevel: 'BU下设一级', adjustReason: '内部原因',
      effDate: PLAN_EFF_DATE, desc: '同源组织拆分，覆盖 Offer、待调入与停用冲突场景。',
      sourceScopeIds: ['G03'], targetScopeIds: [], status: '草稿',
      createdAt: '2026-11-08 10:00', updatedAt: '2026-11-09 10:20'
    }
  ];

  const RAW_UNIVERSES = { huadong, case1, case2, scopeDemo };
  const UNIVERSES = Object.fromEntries(Object.entries(RAW_UNIVERSES).map(([key, make]) => [key, () => normalizeGraphLevels(make())]));

  root.OA = root.OA || {};
  root.OA.seed = { UNIVERSES, DEFAULT_PLANS, PLAN_EFF_DATE, today };
})(typeof window !== 'undefined' ? window : globalThis);
