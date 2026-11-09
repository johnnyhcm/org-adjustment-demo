/* 种子数据：PRD 第 13 章（华东，仅内部自测）+ 第 17 章（案例一 CASE-01 / 案例二 CASE-02）。
 * 全部虚构；标识（O10/P10/H01/E01…）是测试身份，不是正式编码规则（PRD 0.1）。
 * 图（graph）结构：{orgs, positions, headcounts, persons, demands, posts, seq}
 * persons.status: '在职' | '未来'；未来人以 targetPositionId+date+refs 表达（BR-08、PER-02）。
 */
(function (root) {
  const today = '2026-12-01'; // 方案生效日期（PRD 2.2 Demo 约定）

  function seqMap() { return { org: 0, position: 0, hc: 0, person: 0, post: 0, demand: 0 }; }

  /* ============ 华东宇宙（PRD 13.1–13.3） ============ */
  function huadong() {
    return {
      orgs: [
        { id: 'O00', name: '总部', code: '0001', parentId: null, order: 1, status: '有效', setupDate: '2018-01-01', leaderId: null, hrbpId: null },
        { id: 'O10', name: '产品部', code: '0100', parentId: 'O00', order: 1, status: '有效', setupDate: '2018-01-01', leaderId: 'M01', hrbpId: 'HR01' },
        { id: 'O20', name: '研发部', code: '0200', parentId: 'O00', order: 2, status: '有效', setupDate: '2018-01-01', leaderId: null, hrbpId: null },
        { id: 'O21', name: '业务支持部', code: '0210', parentId: 'O20', order: 1, status: '有效', setupDate: '2019-01-01', leaderId: null, hrbpId: null },
        { id: 'O30', name: '运营部', code: '0300', parentId: 'O00', order: 3, status: '有效', setupDate: '2018-01-01', leaderId: 'M02', hrbpId: null },
        { id: 'O40', name: '仓储部', code: '0400', parentId: 'O00', order: 4, status: '有效', setupDate: '2018-01-01', leaderId: null, hrbpId: null }
      ],
      positions: [
        { id: 'P10', name: '产品经理', code: 'GW0101', orgId: 'O10', order: 1, status: '有效', setupDate: '2018-01-01', levelMin: 'P3', levelMax: 'P5' },
        { id: 'P11', name: '产品设计师', code: 'GW0102', orgId: 'O10', order: 2, status: '有效', setupDate: '2018-01-01', levelMin: 'P3', levelMax: 'P5' },
        { id: 'P20', name: '运营经理', code: 'GW0301', orgId: 'O30', order: 1, status: '有效', setupDate: '2018-01-01', levelMin: 'P4', levelMax: 'P6' },
        { id: 'P21', name: '运营助理', code: 'GW0302', orgId: 'O30', order: 2, status: '有效', setupDate: '2018-01-01', levelMin: 'P1', levelMax: 'P3' },
        { id: 'P40', name: '仓储主管', code: 'GW0401', orgId: 'O40', order: 1, status: '有效', setupDate: '2018-01-01', levelMin: 'P3', levelMax: 'P5' }
      ],
      headcounts: [
        { id: 'H01', code: '202611060001', positionId: 'P10', level: 'P4', state: '占编', personId: 'E01', demandId: null },
        { id: 'H02', code: '202611060002', positionId: 'P10', level: 'P4', state: 'Offer占用', personId: 'C01', demandId: 'R01' },
        { id: 'H03', code: '202611060003', positionId: 'P10', level: 'P4', state: '可用', personId: null, demandId: null },
        { id: 'H04', code: '202611060004', positionId: 'P10', level: 'P4', state: '需求预留', personId: null, demandId: 'R01' },
        { id: 'H05', code: '202611060005', positionId: 'P10', level: 'P4', state: '需求预留', personId: null, demandId: 'R01' },
        { id: 'H06', code: '202611060006',positionId: 'P10', level: 'P4', state: '待调入预留', personId: 'E03', demandId: null },
        { id: 'H07', code: '202611060007', positionId: 'P11', level: 'P4', state: '占编', personId: 'E04', demandId: null },
        { id: 'H08', code: '202611060008', positionId: 'P20', level: 'P5', state: '占编', personId: 'E05', demandId: null },
        { id: 'H09', code: '202611060009', positionId: 'P20', level: 'P5', state: '可用', personId: null, demandId: null },
        { id: 'H40', code: '202611060010', positionId: 'P40', level: 'P4', state: '占编', personId: 'E06', demandId: null }
      ],
      persons: [
        { id: 'M01', name: '李经理', status: '在职', kind: 'manager', positionId: null, level: null, headcountId: null, managerId: null },
        { id: 'M02', name: '王经理', status: '在职', kind: 'manager', positionId: null, level: null, headcountId: null, managerId: null },
        { id: 'HR01', name: '陈敏', status: '在职', kind: 'hrbp', positionId: null, level: null, headcountId: null, managerId: null },
        { id: 'E01', name: '张三', status: '在职', kind: 'employee', positionId: 'P10', level: 'P4', headcountId: 'H01', managerId: 'M01' },
        { id: 'E02', name: '李四', status: '在职', kind: 'employee', positionId: 'P10', level: 'P4', headcountId: null, managerId: 'M01' },
        { id: 'E04', name: '陈七', status: '在职', kind: 'employee', positionId: 'P11', level: 'P4', headcountId: 'H07', managerId: 'E01' },
        { id: 'E05', name: '孙八', status: '在职', kind: 'employee', positionId: 'P20', level: 'P5', headcountId: 'H08', managerId: 'M02' },
        { id: 'E06', name: '王强', status: '在职', kind: 'employee', positionId: 'P40', level: 'P4', headcountId: 'H40', managerId: null },
        { id: 'C01', name: '王五', status: '未来', kind: 'employee', futureType: '已接收Offer', targetPositionId: 'P10', headcountId: 'H02', date: '2027-01-12', refs: [{ type: 'Offer', note: 'Offer 关联，需求 R01' }] },
        { id: 'C02', name: '王六', status: '未来', kind: 'employee', futureType: '待入职', targetPositionId: 'P10', headcountId: null, date: '2027-01-03', refs: [{ type: '入职', note: '待入职单' }] },
        { id: 'E03', name: '赵六', status: '未来', kind: 'employee', futureType: '待调入', targetPositionId: 'P10', headcountId: 'H06', date: '2027-01-05', refs: [{ type: '调入', note: '外部现任职调入' }] }
      ],
      demands: [
        { id: 'R01', name: '产品经理招聘需求', headcountIds: ['H02', 'H04', 'H05'] }
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
      { id: 'G01', name: '集团', code: '9001', parentId: null, order: 1, status: '有效', setupDate: '2010-01-01', leaderId: null, hrbpId: null },
      { id: 'G02', name: 'HRAS', code: '9010', parentId: 'G01', order: 1, status: '有效', setupDate: '2015-01-01', leaderId: null, hrbpId: null },
      { id: 'G03', name: '技术部', code: '9011', parentId: 'G02', order: 1, status: '有效', setupDate: '2015-01-01', leaderId: 'M01', hrbpId: 'HR01' },
      { id: 'G04', name: '产品部', code: '9012', parentId: 'G03', order: 1, status: '有效', setupDate: '2016-01-01', leaderId: 'M02', hrbpId: 'HR02' },
      { id: 'G05', name: '项目部', code: '9013', parentId: 'G03', order: 2, status: '有效', setupDate: '2016-01-01', leaderId: 'M03', hrbpId: null },
      { id: 'G06', name: '数据部', code: '9014', parentId: 'G03', order: 3, status: '有效', setupDate: '2017-01-01', leaderId: 'M04', hrbpId: null },
      { id: 'G07', name: '财经管理部', code: '9020', parentId: 'G01', order: 2, status: '有效', setupDate: '2010-06-01', leaderId: null, hrbpId: null },
      { id: 'G08', name: '人力资源部', code: '9021', parentId: 'G02', order: 2, status: '有效', setupDate: '2015-06-01', leaderId: null, hrbpId: null }
    ];
  }

  /* 管理人员与 HRBP（两案例通用，不占职位编制） */
  function caseLeaders() {
    return [
      { id: 'M01', name: '王经理', status: '在职', kind: 'manager', positionId: null, level: null, headcountId: null, managerId: null },
      { id: 'M02', name: '李经理', status: '在职', kind: 'manager', positionId: null, level: null, headcountId: null, managerId: null },
      { id: 'M03', name: '陈经理', status: '在职', kind: 'manager', positionId: null, level: null, headcountId: null, managerId: null },
      { id: 'M04', name: '赵经理', status: '在职', kind: 'manager', positionId: null, level: null, headcountId: null, managerId: null },
      { id: 'HR01', name: '陈敏', status: '在职', kind: 'hrbp', positionId: null, level: null, headcountId: null, managerId: null },
      { id: 'HR02', name: '周敏', status: '在职', kind: 'hrbp', positionId: null, level: null, headcountId: null, managerId: null }
    ];
  }

  /* ============ 案例一 CASE-01（PRD 17.2.2，V0.3 扩充：范围内 7 职位 9 人 12 编制，无特殊状态） ============ */
  function case1() {
    return {
      orgs: caseOrgs(),
      positions: [
        { id: 'C1-P01', name: '产品经理', code: '202611070001', orgId: 'G04', order: 1, status: '有效', setupDate: '2016-01-01', levelMin: 'P4', levelMax: 'P5' },
        { id: 'C1-P02', name: '产品运营', code: '202611070002', orgId: 'G04', order: 2, status: '有效', setupDate: '2016-01-01', levelMin: 'P3', levelMax: 'P4' },
        { id: 'C1-P05', name: '产品设计师', code: '202611070003', orgId: 'G04', order: 3, status: '有效', setupDate: '2017-01-01', levelMin: 'P3', levelMax: 'P4' },
        { id: 'C1-P03', name: '项目经理', code: '202611070004', orgId: 'G05', order: 1, status: '有效', setupDate: '2016-01-01', levelMin: 'P4', levelMax: 'P5' },
        { id: 'C1-P04', name: '项目专员', code: '202611070005', orgId: 'G05', order: 2, status: '有效', setupDate: '2016-01-01', levelMin: 'P2', levelMax: 'P3' },
        { id: 'C1-P06', name: '测试工程师', code: '202611070006', orgId: 'G05', order: 3, status: '有效', setupDate: '2017-01-01', levelMin: 'P2', levelMax: 'P4' },
        { id: 'C1-P07', name: '数据分析师', code: '202611070007', orgId: 'G06', order: 1, status: '有效', setupDate: '2017-01-01', levelMin: 'P3', levelMax: 'P5' },
        { id: 'C1-P08', name: '资金管理专员', code: '202611070008', orgId: 'G07', order: 1, status: '有效', setupDate: '2015-01-01', levelMin: 'P3', levelMax: 'P4' },
        { id: 'C1-P09', name: '招聘专员', code: '202611070009', orgId: 'G08', order: 1, status: '有效', setupDate: '2015-01-01', levelMin: 'P2', levelMax: 'P4' }
      ],
      headcounts: [
        { id: 'C1-H01', code: '202611070011', positionId: 'C1-P01', level: 'P4', state: '占编', personId: 'C1-E01', demandId: null },
        { id: 'C1-H02', code: '202611070012', positionId: 'C1-P02', level: 'P3', state: '占编', personId: 'C1-E02', demandId: null },
        { id: 'C1-H03', code: '202611070013', positionId: 'C1-P02', level: 'P3', state: '可用', personId: null, demandId: null },
        { id: 'C1-H04', code: '202611070014', positionId: 'C1-P03', level: 'P4', state: '占编', personId: 'C1-E03', demandId: null },
        { id: 'C1-H05', code: '202611070015', positionId: 'C1-P04', level: 'P3', state: '占编', personId: 'C1-E04', demandId: null },
        { id: 'C1-H06', code: '202611070016', positionId: 'C1-P05', level: 'P4', state: '占编', personId: 'C1-E05', demandId: null },
        { id: 'C1-H07', code: '202611070017', positionId: 'C1-P05', level: 'P3', state: '占编', personId: 'C1-E06', demandId: null },
        { id: 'C1-H08', code: '202611070018', positionId: 'C1-P05', level: 'P4', state: '可用', personId: null, demandId: null },
        { id: 'C1-H09', code: '202611070019', positionId: 'C1-P06', level: 'P3', state: '占编', personId: 'C1-E07', demandId: null },
        { id: 'C1-H10', code: '202611070020', positionId: 'C1-P06', level: 'P2', state: '占编', personId: 'C1-E08', demandId: null },
        { id: 'C1-H11', code: '202611070021', positionId: 'C1-P07', level: 'P4', state: '占编', personId: 'C1-E09', demandId: null },
        { id: 'C1-H12', code: '202611070022', positionId: 'C1-P07', level: 'P4', state: '可用', personId: null, demandId: null },
        { id: 'C1-H13', code: '202611070023', positionId: 'C1-P08', level: 'P3', state: '占编', personId: 'C1-E10', demandId: null },
        { id: 'C1-H14', code: '202611070024', positionId: 'C1-P09', level: 'P3', state: '占编', personId: 'C1-E11', demandId: null }
      ],
      persons: caseLeaders().concat([
        { id: 'C1-E01', name: '张三', status: '在职', kind: 'employee', positionId: 'C1-P01', level: 'P4', headcountId: 'C1-H01', managerId: 'M02' },
        { id: 'C1-E02', name: '李四', status: '在职', kind: 'employee', positionId: 'C1-P02', level: 'P3', headcountId: 'C1-H02', managerId: 'M02' },
        { id: 'C1-E03', name: '王五', status: '在职', kind: 'employee', positionId: 'C1-P03', level: 'P4', headcountId: 'C1-H04', managerId: 'M03' },
        { id: 'C1-E04', name: '赵六', status: '在职', kind: 'employee', positionId: 'C1-P04', level: 'P3', headcountId: 'C1-H05', managerId: 'M03' },
        { id: 'C1-E05', name: '孙八', status: '在职', kind: 'employee', positionId: 'C1-P05', level: 'P4', headcountId: 'C1-H06', managerId: 'M02' },
        { id: 'C1-E06', name: '钱七', status: '在职', kind: 'employee', positionId: 'C1-P05', level: 'P3', headcountId: 'C1-H07', managerId: 'M02' },
        { id: 'C1-E07', name: '周九', status: '在职', kind: 'employee', positionId: 'C1-P06', level: 'P3', headcountId: 'C1-H09', managerId: 'M03' },
        { id: 'C1-E08', name: '吴十', status: '在职', kind: 'employee', positionId: 'C1-P06', level: 'P2', headcountId: 'C1-H10', managerId: 'M03' },
        { id: 'C1-E09', name: '冯十', status: '在职', kind: 'employee', positionId: 'C1-P07', level: 'P4', headcountId: 'C1-H11', managerId: 'M04' },
        { id: 'C1-E10', name: '何一', status: '在职', kind: 'employee', positionId: 'C1-P08', level: 'P3', headcountId: 'C1-H13', managerId: null },
        { id: 'C1-E11', name: '王二', status: '在职', kind: 'employee', positionId: 'C1-P09', level: 'P3', headcountId: 'C1-H14', managerId: null }
      ]),
      demands: [],
      posts: [],
      seq: seqMap()
    };
  }

  /* ============ 案例二 CASE-02（PRD 17.3.2，V0.3 扩充：范围内 7 职位 7 在职 3 未来 14 编制 2 兼职 1 需求） ============ */
  function case2() {
    return {
      orgs: caseOrgs(),
      positions: [
        { id: 'C2-P01', name: '产品经理', code: '202611080001', orgId: 'G04', order: 1, status: '有效', setupDate: '2016-01-01', levelMin: 'P4', levelMax: 'P5' },
        { id: 'C2-P02', name: '产品设计师', code: '202611080002', orgId: 'G04', order: 2, status: '有效', setupDate: '2016-01-01', levelMin: 'P3', levelMax: 'P4' },
        { id: 'C2-P05', name: '产品运营', code: '202611080003', orgId: 'G04', order: 3, status: '有效', setupDate: '2017-01-01', levelMin: 'P3', levelMax: 'P4' },
        { id: 'C2-P03', name: '项目经理', code: '202611080004', orgId: 'G05', order: 1, status: '有效', setupDate: '2016-01-01', levelMin: 'P4', levelMax: 'P5' },
        { id: 'C2-P04', name: '项目专员', code: '202611080005', orgId: 'G05', order: 2, status: '有效', setupDate: '2016-01-01', levelMin: 'P2', levelMax: 'P3' },
        { id: 'C2-P06', name: '测试工程师', code: '202611080006', orgId: 'G05', order: 3, status: '有效', setupDate: '2017-01-01', levelMin: 'P2', levelMax: 'P4' },
        { id: 'C2-P07', name: '数据分析师', code: '202611080007', orgId: 'G06', order: 1, status: '有效', setupDate: '2017-01-01', levelMin: 'P3', levelMax: 'P5' },
        { id: 'C2-P08', name: '资金管理专员', code: '202611080008', orgId: 'G07', order: 1, status: '有效', setupDate: '2015-01-01', levelMin: 'P3', levelMax: 'P4' },
        { id: 'C2-P09', name: '招聘专员', code: '202611080009', orgId: 'G08', order: 1, status: '有效', setupDate: '2015-01-01', levelMin: 'P2', levelMax: 'P4' }
      ],
      headcounts: [
        { id: 'C2-H01', code: '202611080011', positionId: 'C2-P01', level: 'P4', state: '占编', personId: 'C2-E01', demandId: null },
        { id: 'C2-H05', code: '202611080015', positionId: 'C2-P01', level: 'P4', state: '可用', personId: null, demandId: null },
        { id: 'C2-H13', code: '202611080019', positionId: 'C2-P01', level: 'P4', state: '占编', personId: 'C2-E06', demandId: null },
        { id: 'C2-H02', code: '202611080012', positionId: 'C2-P02', level: 'P3', state: 'Offer占用', personId: 'C2-E02', demandId: null },
        { id: 'C2-H06', code: '202611080016', positionId: 'C2-P05', level: 'P3', state: '占编', personId: 'C2-E07', demandId: null },
        { id: 'C2-H07', code: '202611080017', positionId: 'C2-P05', level: 'P4', state: '占编', personId: 'C2-E08', demandId: null },
        { id: 'C2-H08', code: '202611080018', positionId: 'C2-P05', level: 'P3', state: '可用', personId: null, demandId: null },
        { id: 'C2-H09', code: '202611080020', positionId: 'C2-P05', level: 'P3', state: '需求预留', personId: null, demandId: 'R01' },
        { id: 'C2-H10', code: '202611080021', positionId: 'C2-P05', level: 'P3', state: '需求预留', personId: null, demandId: 'R01' },
        { id: 'C2-H03', code: '202611080013', positionId: 'C2-P03', level: 'P5', state: '占编', personId: 'C2-E03', demandId: null },
        { id: 'C2-H04', code: '202611080014', positionId: 'C2-P04', level: 'P3', state: '待调入预留', personId: 'C2-E04', demandId: null },
        { id: 'C2-H11', code: '202611080022', positionId: 'C2-P06', level: 'P3', state: '占编', personId: 'C2-E09', demandId: null },
        { id: 'C2-H12', code: '202611080023', positionId: 'C2-P06', level: 'P3', state: '可用', personId: null, demandId: null },
        { id: 'C2-H14', code: '202611080024', positionId: 'C2-P07', level: 'P4', state: '占编', personId: 'C2-E10', demandId: null },
        { id: 'C2-H15', code: '202611080025', positionId: 'C2-P08', level: 'P3', state: '占编', personId: 'C2-E11', demandId: null },
        { id: 'C2-H16', code: '202611080026', positionId: 'C2-P09', level: 'P3', state: '占编', personId: 'C2-E12', demandId: null }
      ],
      persons: caseLeaders().concat([
        { id: 'C2-E01', name: '王强', status: '在职', kind: 'employee', positionId: 'C2-P01', level: 'P4', headcountId: 'C2-H01', managerId: 'M02' },
        { id: 'C2-E06', name: '李四', status: '在职', kind: 'employee', positionId: 'C2-P01', level: 'P4', headcountId: 'C2-H13', managerId: 'M02' },
        { id: 'C2-E07', name: '钱七', status: '在职', kind: 'employee', positionId: 'C2-P05', level: 'P3', headcountId: 'C2-H06', managerId: 'M02' },
        { id: 'C2-E08', name: '孙八', status: '在职', kind: 'employee', positionId: 'C2-P05', level: 'P4', headcountId: 'C2-H07', managerId: 'M02' },
        { id: 'C2-E03', name: '陈七', status: '在职', kind: 'employee', positionId: 'C2-P03', level: 'P5', headcountId: 'C2-H03', managerId: 'M03' },
        { id: 'C2-E09', name: '周九', status: '在职', kind: 'employee', positionId: 'C2-P06', level: 'P3', headcountId: 'C2-H11', managerId: 'M03' },
        { id: 'C2-E10', name: '冯十', status: '在职', kind: 'employee', positionId: 'C2-P07', level: 'P4', headcountId: 'C2-H14', managerId: 'M04' },
        { id: 'C2-E11', name: '吴二', status: '在职', kind: 'employee', positionId: 'C2-P08', level: 'P3', headcountId: 'C2-H15', managerId: null },
        { id: 'C2-E12', name: '郑三', status: '在职', kind: 'employee', positionId: 'C2-P09', level: 'P3', headcountId: 'C2-H16', managerId: null },
        { id: 'C2-E02', name: '王五', status: '未来', kind: 'employee', futureType: '已接收Offer', targetPositionId: 'C2-P02', headcountId: 'C2-H02', date: '2027-01-12', refs: [{ type: 'Offer', note: 'Offer 关联 C2-H02' }] },
        { id: 'C2-E04', name: '赵六', status: '未来', kind: 'employee', futureType: '待调入', targetPositionId: 'C2-P04', headcountId: 'C2-H04', date: '2027-01-05', refs: [{ type: '调入', note: '外部现任职调入' }] },
        { id: 'C2-E05', name: '王六', status: '未来', kind: 'employee', futureType: '待入职', targetPositionId: 'C2-P06', headcountId: null, date: '2027-01-20', refs: [{ type: '入职', note: '待入职单，无编制预留' }] }
      ]),
      demands: [
        { id: 'R01', name: '产品运营招聘需求', headcountIds: ['C2-H09', 'C2-H10'] }
      ],
      posts: [
        { id: 'C2-PT01', personId: 'C2-E01', mainPositionId: 'C2-P01', concurrentPositionId: 'C2-P03', status: '有效' },
        { id: 'C2-PT02', personId: 'C2-E09', mainPositionId: 'C2-P06', concurrentPositionId: 'C2-P05', status: '有效' }
      ],
      seq: seqMap()
    };
  }

  /* 预置方案：PRD 17.4 —— 案例一、案例二作为方案列表中的两个独立方案 */
  const PLAN_EFF_DATE = today;
  const DEFAULT_PLANS = [
    {
      id: 'plan-case1', universe: 'case1',
      name: '技术部组织拆分方案',
      effDate: PLAN_EFF_DATE, desc: '产品与项目团队按方向拆分，先建目标组织，再整体迁移职位。',
      sourceScopeIds: ['G03'], targetScopeIds: [], status: '草稿'
    },
    {
      id: 'plan-case2', universe: 'case2',
      name: '技术部组织拆分方案（含兼职与未来关联）',
      effDate: PLAN_EFF_DATE, desc: '同源组织拆分，覆盖兼职、Offer、待调入与停用冲突场景。',
      sourceScopeIds: ['G03'], targetScopeIds: [], status: '草稿'
    }
  ];

  const UNIVERSES = { huadong, case1, case2 };

  root.OA = root.OA || {};
  root.OA.seed = { UNIVERSES, DEFAULT_PLANS, PLAN_EFF_DATE, today };
})(typeof window !== 'undefined' ? window : globalThis);
