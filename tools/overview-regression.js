/* AI 概览事实与文稿回归；只使用内存 localStorage。 */
const assert = require('node:assert/strict');
module.exports = function () {
  require('../原型/组织调整/shared/overview.js');
  const S = OA.store, O = OA.Overview, id = 'plan-case1', results = [];
  const test = (name, fn) => { try { S.resetAll(); fn(); results.push({ name: '概览：' + name, pass: true }); } catch(e) { results.push({ name: '概览：' + name, pass: false, error: e.stack }); } };
  const apply = (type, p) => { const r = S.apply(id, type, p); assert.equal(r.ok, true, r.error); return r; };
  const facts = () => O.buildFacts(id), fact = (f, key) => f.facts.find(x => x.id === key);
  test('全范围数量与图表口径一致，权限外不入包', () => {
    const f = facts(); assert.equal(fact(f, 'scope:employees').before, 24); assert.equal(fact(f, 'scope:headcounts').before, 28);
    assert.equal(fact(f, 'scope:available').before, 4); assert.equal(fact(f, 'scope:positions').before, 9);
    assert.ok(!JSON.stringify(f).includes('C1-P10')); assert.ok(!JSON.stringify(f).includes('C1-P11'));
    assert.equal(f.changes.orgs.length, 0); assert.equal(fact(f,'impact:people').affected,0);
  });
  test('复杂占用、未来人员和兼职分别计数', () => {
    const f = O.buildFacts('plan-case2'); assert.equal(fact(f,'scope:employees').before,23); assert.equal(fact(f,'scope:headcounts').before,35);
    assert.equal(fact(f,'scope:futurePeople').before,8); assert.equal(fact(f,'scope:posts').before,4); assert.ok(f.before.futureEvents.length > 8);
  });
  test('增减编差值预计算为 +3、-2', () => {
    apply('addHeadcounts',{positionId:'C1-P03',level:'P4-2',count:3});
    apply('removeHeadcountsByIds',{headcountIds:['C1-H10','C1-H11']});
    const f=facts(); assert.equal(fact(f,'position:C1-P03:headcounts').delta,3); assert.equal(fact(f,'position:C1-P01:headcounts').delta,-2);
    assert.equal(fact(f,'scope:headcounts').delta,1); assert.equal(fact(f,'impact:headcounts').added,3); assert.equal(fact(f,'impact:headcounts').removed,2);
  });
  test('单纯更名保留身份，改回基准无最终差异', () => {
    const before = facts(); apply('editOrg',{id:'G04',name:'产品一部'}); let f=facts();
    const change=f.changes.orgs.find(x=>x.id==='G04'); assert.ok(change.before && change.after); assert.ok(change.fields.includes('name'));
    assert.equal(fact(f,'impact:people').affected,0);assert.equal(f.businessSignals.length,0);assert.equal(f.reportFacts.length,0);
    apply('editOrg',{id:'G04',name:'产品部'}); f=facts(); assert.equal(f.changes.orgs.length,0); assert.equal(O.canonical(f),O.canonical(before));
  });
  test('个人调岗和结构影响独立，交集去重', () => {
    apply('transferPersons',{rows:[{personId:'C1-E01',targetPositionId:'C1-P03',managerId:'M03',bringHeadcount:true}]});
    let f=facts(), impact=fact(f,'impact:people'); assert.equal(impact.transferred,1); assert.equal(impact.structural,0); assert.equal(impact.affected,1);
    apply('moveOrg',{id:'G05',newParentId:'G04'}); f=facts(); impact=fact(f,'impact:people');
    assert.equal(impact.transferred,1); assert.equal(impact.overlap,1); assert.equal(impact.affected,impact.structural);
    assert.equal(f.flows.persons.reduce((n,x)=>n+x.count,0),impact.affected);
  });
  test('更名加设立可拆分，保留最终流向事实', () => {
    apply('editOrg',{id:'G04',name:'产品一部'});const org=apply('addOrg',{parentId:'G03',name:'产品二部'}).id;
    const pos=apply('addPosition',{orgId:org,name:'产品经理',levelMin:'P4-1',levelMax:'P6-4'}).id;
    apply('transferPersons',{rows:[{personId:'C1-E01',targetPositionId:pos,managerId:'M03',bringHeadcount:true}]});
    const f=facts();assert.equal(f.flows.persons[0].from.orgName,'产品部');assert.equal(f.flows.persons[0].to.orgName,'产品二部');
    assert.equal(f.changes.orgs.find(x=>x.id==='G04').after.name,'产品一部');assert.equal(f.changes.orgs.find(x=>x.id===org).before,null);
    assert.equal(fact(f,'org:'+org+':direct:employees').before,null);assert.equal(f.businessSignals[0].type,'拆分');
  });
  test('撤销原组织再设立的拆分也提供最终稳定人员流向', () => {
    const targets=['产品一部','产品二部'].map(name=> {const org=apply('addOrg',{parentId:'G03',name}).id;return apply('addPosition',{orgId:org,name:'团队岗位',levelMin:'P1-1',levelMax:'P6-4'}).id;});
    const g=S.getPlanData(id).cur, src=new Set(g.positions.filter(p=>p.orgId==='G04').map(p=>p.id));
    const people=g.persons.filter(p=>p.status==='在职'&&src.has(p.positionId));
    apply('transferPersons',{rows:people.map((p,i)=>({personId:p.id,targetPositionId:targets[i%2],managerId:'M03',bringHeadcount:true}))});
    apply('stopOrg',{orgId:'G04',mode:'manual'});
    const f=facts();assert.equal(f.changes.orgs.find(x=>x.id==='G04').after.status,'停用');
    assert.equal(f.flows.persons.reduce((n,x)=>n+x.count,0),people.length);assert.equal(new Set(f.flows.persons.map(x=>x.to.orgName)).size,2);assert.equal(f.businessSignals[0].type,'拆分');assert.equal(f.businessSignals[0].targets.length,2);
  });
  test('跨职位各3名带编汇总为组织拆分及6名员工安排', () => {
    apply('editOrg',{id:'G04',name:'产品一部'});const org=apply('addOrg',{parentId:'G03',name:'产品二部'}).id;
    const manager=apply('addPosition',{orgId:org,name:'产品经理',levelMin:'P4-1',levelMax:'P6-4'}).id;
    const ops=apply('addPosition',{orgId:org,name:'产品运营',levelMin:'P3-1',levelMax:'P4-4'}).id;
    apply('transferPersons',{rows:['C1-E01','C1-E05','C1-E06','C1-E02','C1-E09','C1-E10'].map((personId,i)=>({personId,targetPositionId:i<3?manager:ops,managerId:'M03',bringHeadcount:true}))});
    const f=facts(), row=f.organizationFlows[0], signal=f.businessSignals[0];
    assert.equal(f.flows.persons.length,2);assert.equal(f.flows.headcounts.length,2);assert.equal(f.organizationFlows.length,1);
    assert.equal(row.employeeCount,6);assert.equal(row.headcountCount,6);assert.equal(row.allBringHeadcount,true);
    assert.equal(signal.source.id,'G04');assert.equal(signal.type,'拆分');
    const text=signal.reportFactIds.map(id=>f.reportFacts.find(x=>x.id===id).text).join('');
    assert.equal(text,'拟将产品部拆分为产品一部和产品二部。其中，6名员工连同编制划转至产品二部，其余团队保留在产品一部。');
    assert.ok(!f.reportFacts.filter(x=>!x.id.startsWith('report:position:')).some(x=>/28|24|保持不变|交集|去重|0人|3个编制/.test(x.text)));
    assert.equal(fact(f,'scope:headcounts').before,28);assert.equal(fact(f,'scope:headcounts').after,28);
    assert.equal(fact(f,'impact:people').affected,6);assert.equal(fact(f,'impact:people').overlap,0);
  });
  test('普通调往既有部门不是拆分', () => {
    apply('editOrg',{id:'G04',name:'产品一部'});
    apply('transferPersons',{rows:[{personId:'C1-E05',targetPositionId:'C1-P03',managerId:'M03',bringHeadcount:true}]});
    const f=facts();assert.equal(f.businessSignals.length,0);assert.equal(f.organizationFlows[0].employeeCount,1);
  });
  test('更名并新设空部门不能仅凭操作推断拆分', () => {
    apply('editOrg',{id:'G04',name:'产品一部'});apply('addOrg',{parentId:'G03',name:'产品二部'});
    assert.equal(facts().businessSignals.length,0);
  });
  test('人数与编制数相同但不是原绑定随人走时不能说连同编制', () => {
    const org=apply('addOrg',{parentId:'G03',name:'产品二部'}).id;
    const pos=apply('addPosition',{orgId:org,name:'产品经理',levelMin:'P4-1',levelMax:'P6-4'}).id;
    apply('moveHeadcountsByIds',{headcountIds:['C1-H10'],targetPositionId:pos,level:'P4-2'});
    apply('transferPersons',{rows:[{personId:'C1-E05',targetPositionId:pos,managerId:'M03',bringHeadcount:false}]});
    const f=facts(), row=f.organizationFlows[0];assert.equal(row.employeeCount,1);assert.equal(row.headcountCount,1);assert.equal(row.allBringHeadcount,false);
    assert.ok(!f.reportFacts.some(x=>x.text.includes('连同编制')));
  });
  test('只调配编制不写成带员工划转', () => {
    apply('moveHeadcountsByIds',{headcountIds:['C1-H10','C1-H11'],targetPositionId:'C1-P03',level:'P4-2'});
    const f=facts(), row=f.organizationFlows[0];assert.equal(row.employeeCount,0);assert.equal(row.headcountCount,2);assert.equal(row.allBringHeadcount,false);
    assert.match(f.reportFacts[0].text,/2个编制由产品部调配至项目部/);assert.ok(!f.reportFacts[0].text.includes('员工'));
  });
  test('只将发生变化的总量加入汇报事实', () => {
    assert.deepEqual(facts().reportFacts,[]);apply('addHeadcounts',{positionId:'C1-P03',level:'P4-2',count:3});
    const f=facts();assert.equal(f.reportFacts.find(x=>x.id==='report:scope:headcounts').text,'方案总编制增加3个，调整后为31个。');
    assert.ok(!f.reportFacts.some(x=>x.id==='report:scope:employees'));
  });
  test('独立新设岗位附带预计算编制，撤销重做与刷新保留来源', () => {
    const org=apply('addOrg',{parentId:'G03',name:'AI应用部'}).id;
    const pos=apply('addPosition',{orgId:org,name:'AI架构师',levelMin:'P4-1',levelMax:'P6-4'}).id;
    apply('addHeadcounts',{positionId:pos,level:'P4-2',count:2});
    const row=facts().positionCreations.find(p=>p.id===pos);assert.equal(row.origin.type,'new');assert.equal(row.headcountCount,2);
    assert.equal(facts().reportFacts.find(f=>f.id===row.reportFactId).text,'下设AI架构师职位，配置2个编制。');
    assert.equal(facts().reportFacts.find(f=>f.id==='report:scope:headcounts').text,'方案总编制增加2个，调整后为30个。');
    assert.equal(S.undo(id).ok,true);assert.equal(facts().positionCreations.find(p=>p.id===pos).headcountCount,0);
    assert.equal(S.redo(id).ok,true);S.load();assert.equal(facts().positionCreations.find(p=>p.id===pos).origin.type,'new');
    assert.equal(S.undo(id).ok,true);assert.equal(S.undo(id).ok,true);assert.ok(!facts().positionCreations.some(p=>p.id===pos));
  });
  test('随组织复制岗位不罗列，之后新建及单独复制岗位仍提供事实', () => {
    const copied=apply('copyOrg',{id:'G04',parentId:'G03',name:'智能产品部',copyMode:'orgPositions'});
    let f=facts();assert.ok(copied.positionIds.length>0);
    for(const pid of copied.positionIds){const row=f.positionCreations.find(p=>p.id===pid);assert.equal(row.origin.type,'org-copy');assert.equal(row.reportFactId,undefined);}
    apply('editPosition',{id:copied.positionIds[0],name:'改名后的复制岗位'});
    const manual=apply('addPosition',{orgId:copied.id,name:'产品经理',levelMin:'P4-1',levelMax:'P6-4'}).id;
    const single=apply('copyPosition',{id:copied.positionIds[0],name:'独立AI岗位'}).id;
    S.load();f=facts();assert.equal(f.positionCreations.find(p=>p.id===manual).origin.type,'new');assert.equal(f.positionCreations.find(p=>p.id===single).origin.type,'position-copy');
    assert.ok(f.positionCreations.find(p=>p.id===manual).reportFactId);assert.ok(f.positionCreations.find(p=>p.id===single).reportFactId);
    assert.equal(f.positionCreations.find(p=>p.id===copied.positionIds[0]).reportFactId,undefined);
    apply('togglePosition',{id:manual,action:'停用'});assert.ok(!facts().positionCreations.some(p=>p.id===manual));
  });
  test('旧草稿按保留快照识别复制，无证据标记未知且不按名称猜测', () => {
    const copied=apply('copyOrg',{id:'G04',parentId:'G03',name:'历史副本',copyMode:'orgPositions'});
    const pd=S.getPlanData(id);for(const pid of copied.positionIds)delete pd.cur.positions.find(p=>p.id===pid).creationOrigin;
    let f=facts();assert.ok(f.positionCreations.every(p=>p.origin.type==='org-copy'&&!p.reportFactId));
    pd.history.undo=[];f=facts();assert.ok(f.positionCreations.every(p=>p.origin.type==='unknown'&&!p.reportFactId));
  });
  test('组织动作按自身变化及层级提供，祖先划转不重复列下级', () => {
    apply('moveOrg',{id:'G04',newParentId:'G05'});
    const f=facts();assert.deepEqual(f.organizationChanges.map(x=>x.orgId),['G04']);assert.equal(f.organizationChanges[0].action,'transfer');
    apply('editOrg',{id:'G03',name:'技术中心'});assert.equal(facts().organizationChanges[0].orgId,'G03');
  });
  test('末尾总编制下降为零仍提供调整后总量', () => {
    const pd=S.getPlanData(id);pd.cur.headcounts=[];
    assert.equal(facts().reportFacts.find(x=>x.id==='report:scope:headcounts').text,'方案总编制减少28个，调整后为0个。');
  });
  test('新增后停用空组织不冒充新架构', () => {
    const org=apply('addOrg',{parentId:'G03',name:'净零测试'}).id;apply('stopOrg',{orgId:org,mode:'manual'});
    const f=facts();assert.ok(!f.after.orgs.some(x=>x.id===org));assert.ok(!f.changes.orgs.some(x=>x.id===org));
  });
  test('人员调动扩展字段及编制属性完整供给', () => {
    const pd=S.getPlanData(id);pd.cur.persons.find(x=>x.id==='C1-E01').workCity='上海';
    pd.cur.headcounts.find(x=>x.id==='C1-H10').costCategory='变更分类';
    const f=facts();assert.ok(f.changes.persons.find(x=>x.id==='C1-E01').fields.includes('workCity'));
    assert.ok(f.changes.headcounts.find(x=>x.id==='C1-H10').fields.includes('costCategory'));
  });
  test('富文本仅保留白名单，移除嵌入和可执行格式', () => {
    const d=O.cleanDelta({ops:[{insert:{image:'bad'}},{insert:'标题',attributes:{bold:true,color:'#FF4D4F',size:'18px',link:'javascript:bad',script:'super'}},{insert:'正文',attributes:{color:'red',size:'99px'}}]});
    assert.deepEqual(d,{ops:[{insert:'标题',attributes:{bold:true,size:'18px',color:'#ff4d4f'}},{insert:'正文'},{insert:'\n'}]});
    assert.throws(()=>O.cleanDelta({ops:[{insert:'x'.repeat(12001)}]}),/过长/);
    assert.equal(O.cleanDelta({ops:[{insert:'红',attributes:{color:'rgb(255, 77, 79)'}}]}).ops[0].attributes.color,'#ff4d4f');
  });
  test('编号事项分行及主句格式在富文本文稿保存后保留', () => {
    const delta=O.paragraphsToDelta([
      {runs:[{text:'1. ',bold:true},{text:'拟拆分产品部。',bold:true},{text:'相关安排跟在同一项。'}]},
      {runs:[{text:'2. '},{text:'产品一部下新设AI应用部。'}]},
      {runs:[{text:'3. '},{text:'数据部划转到项目部管理下。'}]}
    ]);
    O.save(id,{delta,source:'ai',sourceFactsHash:'test'},0);
    const doc=O.read(id);assert.equal(O.plainText(doc.delta),'1. 拟拆分产品部。相关安排跟在同一项。\n2. 产品一部下新设AI应用部。\n3. 数据部划转到项目部管理下。');
    assert.equal(doc.delta.ops[0].attributes.bold,true);assert.equal(doc.delta.ops[2].attributes,undefined);assert.equal(doc.delta.ops[4].attributes,undefined);
  });
  const save = (text, rev=0) => O.save(id,{delta:{ops:[{insert:text+'\n'}]},source:'manual',sourceFactsHash:'test'},rev);
  test('文稿保存不改业务版本或Undo，刷新持久化', () => {
    const before=JSON.stringify(S.getPlanData(id));save('手工概览');assert.equal(JSON.stringify(S.getPlanData(id)),before);
    apply('editOrg',{id:'G04',name:'产品一部'});assert.equal(S.undo(id).ok,true);assert.equal(O.plainText(O.read(id).delta),'手工概览');
    S.load();assert.equal(O.read(id).revision,1);
  });
  test('文稿冲突及旧业务窗口拒绝覆盖', () => {
    save('原文');assert.throws(()=>save('覆盖',0),/其他窗口/);
    const key=S.STORAGE_PREFIX+'plan.'+id, data=JSON.parse(localStorage.getItem(key));data.revision++;localStorage.setItem(key,JSON.stringify(data));
    assert.throws(()=>save('过期',1),/方案已/);assert.equal(O.plainText(O.read(id).delta),'原文');
  });
  test('提交冻结、只读、退回再提交不改历史', () => {
    save('第一版');apply('editOrg',{id:'G04',name:'产品一部'});apply('submit',{});
    const v1=JSON.stringify({snapshot:S.getPlanData(id).versions[0].snapshot,overview:S.getPlanData(id).versions[0].overview});assert.throws(()=>save('覆盖',1),/不可编辑/);
    apply('demoReturn',{comment:'修订'});save('第二版',1);apply('submit',{});
    assert.equal(JSON.stringify({snapshot:S.getPlanData(id).versions[0].snapshot,overview:S.getPlanData(id).versions[0].overview}),v1);assert.equal(O.plainText(S.getPlanData(id).versions[1].overview.delta),'第二版');
  });
  test('resetPlan和resetAll清除概览，空文稿不强制提交', () => {
    save('清除');S.resetPlan(id);assert.equal(O.read(id).revision,0);save('再次');S.resetAll();assert.equal(O.read(id).revision,0);
    apply('editOrg',{id:'G04',name:'产品一部'});apply('submit',{});assert.equal(S.getPlanData(id).versions[0].overview,null);
  });
  test('批量复制岗位同时保留临时身份和独立创建来源', () => {
    const result=apply('copyPositions',{positionIds:['C1-P01','C1-P02'],orgId:'G04'});
    const f=facts();
    result.ids.forEach(id=>{
      const p=S.G.position(S.getPlanData('plan-case1').cur,id);
      assert.equal(p.code,'');assert.equal(p.creationOrigin.type,'position-copy');
      assert.ok(f.positionCreations.some(x=>x.id===id && x.origin.type==='position-copy'));
    });
  });
  function prepareSubmissionClosure() {
    const position=apply('addPosition',{orgId:'G04',name:'承接团队',levelMin:'P1-1',levelMax:'P6-4'}).id;
    const people=S.previewStopOrg(S.getPlan(id),'G05').employees.map(p=>p.id);
    apply('addHeadcounts',{positionId:position,level:'P4-2',count:people.length});
    apply('stopOrg',{orgId:'G05',mode:'manual'});
    apply('transferPersons',{rows:people.map(personId=>({personId,targetPositionId:position,targetOrgId:'G04',managerId:'M02',bringHeadcount:false}))});
    return S.previewSubmission(S.getPlan(id));
  }
  test('停用收尾的图表、AI编制事实与提交投影一致且不修改草稿', () => {
    const preview=prepareSubmissionClosure(),raw=JSON.stringify(S.getPlanData(id).cur);
    assert.ok(preview.headcounts.length>0);const f=facts();
    assert.equal(fact(f,'scope:headcounts').after,S.CNT.orgSummary(preview.graph,'G03').headcounts);
    preview.headcounts.forEach(h=>assert.ok(!f.after.headcounts.some(x=>x.id===h.id)));
    preview.positionIds.forEach(pid=>assert.equal(f.after.positions.find(x=>x.id===pid).status,'停用'));
    assert.equal(JSON.stringify(S.getPlanData(id).cur),raw);
  });
  test('自动收尾与AI概览同时冻结，退回精确恢复且历史概览不变', () => {
    const preview=prepareSubmissionClosure(),raw=JSON.stringify(S.getPlanData(id).cur);
    save('收尾方案概览');apply('submit',{});
    const version=S.getPlanData(id).versions[0],frozen=JSON.stringify({snapshot:version.snapshot,overview:version.overview});
    assert.equal(O.plainText(version.overview.delta),'收尾方案概览');
    assert.deepEqual(version.autoClosure.positionIds,preview.positionIds);
    assert.deepEqual(version.snapshot,preview.graph);
    apply('demoReturn',{comment:'修订'});assert.equal(JSON.stringify(S.getPlanData(id).cur),raw);
    save('修订概览',1);assert.equal(JSON.stringify({snapshot:version.snapshot,overview:version.overview}),frozen);
  });
  return results;
};
