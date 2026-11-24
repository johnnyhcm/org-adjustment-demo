/* 组织先停用的草稿闭环：职位／名额保留、未来与预留阻断、提交收尾及退回。 */
const assert=require('node:assert/strict');
module.exports=function(){
  const S=OA.store, pid='plan-case1',results=[];
  const graph=(id=pid)=>S.getPlanData(id).cur;
  const apply=(type,payload,id=pid)=>{const r=S.apply(id,type,payload);assert.equal(r.ok,true,r.error);return r;};
  const test=(name,fn)=>{try{S.resetAll();fn();results.push({name,pass:true});}catch(e){results.push({name,pass:false,error:e.stack});}};
  const stop=()=>apply('stopOrg',{orgId:'G05',mode:'manual'});
  const target=()=>apply('addPosition',{orgId:'G04',name:'接收项目团队',levelMin:'P1-1',levelMax:'P6-4'}).id;
  const row=(id,posId,bring=false)=>({personId:id,targetPositionId:posId,targetOrgId:'G04',managerId:'M02',bringHeadcount:bring});
  test('组织先停用：九名在职保留绑定，职位／空编保留、人员待处理并阻断提交',()=>{
    const before=S.previewStopOrg(S.getPlan(pid),'G05'),people=JSON.parse(JSON.stringify(before.employees)),occupied=before.headcounts.filter(h=>h.state==='占编').map(h=>h.id),vacant=before.headcounts.filter(h=>h.state==='可用').map(h=>h.id);
    assert.equal(people.length,9);assert.equal(before.blockingReason,'');stop();
    assert.equal(S.G.org(graph(),'G05').status,'停用');
    people.forEach(p=>{assert.deepEqual(S.G.person(graph(),p.id),p);assert.ok(S.assignmentStopReason(graph(),p,'main'));});
    occupied.concat(vacant).forEach(id=>assert.ok(S.G.hc(graph(),id)));
    before.positions.forEach(p=>assert.equal(S.G.position(graph(),p.id).status,p.status));
    assert.equal(S.computePending(S.getPlan(pid)).filter(x=>x.kind==='person' && people.some(p=>p.id===x.id)).length,9);
    assert.equal(S.apply(pid,'submit',{}).ok,false);S._internals.assertGraph(graph());
    const snapshot=JSON.stringify(graph());S.load();assert.equal(JSON.stringify(graph()),snapshot);
  });
  test('停用后不带编调出：草稿空编保留、撤销恢复绑定，提交快照统一关闭',()=>{
    const position=target(),people=S.previewStopOrg(S.getPlan(pid),'G05').employees.map(p=>p.id);
    apply('addHeadcounts',{positionId:position,level:'P4-2',count:people.length});stop();const stopped=JSON.stringify(graph());
    const first=S.G.person(graph(),people[0]),oldHc=first.headcountId;
    apply('transferPersons',{rows:[row(first.id,position)]});assert.equal(S.G.hc(graph(),oldHc).state,'可用');
    assert.ok(S.G.person(graph(),first.id).headcountId);assert.equal(S.assignmentStopReason(graph(),S.G.person(graph(),first.id),'main'),'');
    assert.equal(S.undo(pid).ok,true);assert.equal(JSON.stringify(graph()),stopped);
    assert.equal(S.redo(pid).ok,true);assert.equal(S.G.hc(graph(),oldHc).state,'可用');
    apply('transferPersons',{rows:people.slice(1).map(id=>row(id,position))});
    assert.equal(S.computePending(S.getPlan(pid)).length,0);assert.ok(S.G.hc(graph(),oldHc));
    const before=JSON.stringify(graph()),preview=S.previewSubmission(S.getPlan(pid));
    assert.equal(JSON.stringify(graph()),before);assert.ok(preview.positionIds.length);assert.ok(preview.headcounts.length);
    assert.ok(S.diffPlan(S.getPlan(pid),preview.graph).positions.some(p=>p.id==='C1-P03' && p.fields.some(f=>f.key==='status' && f.new==='停用')));
    apply('submit',{});assert.equal(S.getPlan(pid).status,'审批中');
    assert.equal(graph().headcounts.some(h=>S.G.position(graph(),h.positionId).orgId==='G05'),false);
    const v=S.getPlanData(pid).versions[0],snapshot=JSON.stringify(v.snapshot);
    assert.deepEqual(graph(),preview.graph);assert.equal(JSON.stringify(graph()),snapshot);
    apply('demoReturn',{});assert.equal(JSON.stringify(graph()),before);assert.equal(JSON.stringify(v.snapshot),snapshot);
    S.load();assert.equal(JSON.stringify(graph()),before);
    apply('submit',{});assert.equal(JSON.stringify(S.getPlanData(pid).versions[0].snapshot),snapshot);
  });
  test('停用后带普通编调出：身份和绑定保留，不误删随人迁走的编制',()=>{
    const position=target();stop();const p=S.G.person(graph(),'C1-E03'),id=p.headcountId;
    apply('transferPersons',{rows:[row(p.id,position,true)]});
    assert.equal(S.G.person(graph(),p.id).headcountId,id);assert.equal(S.G.hc(graph(),id).positionId,position);S._internals.assertGraph(graph());
  });
  test('停用及重做：整步恢复；重新启用后职位有效，人员不再因组织停用待处理',()=>{
    const before=JSON.stringify(graph());stop();const stopped=JSON.stringify(graph());
    assert.equal(S.undo(pid).ok,true);assert.equal(JSON.stringify(graph()),before);
    assert.equal(S.redo(pid).ok,true);assert.equal(JSON.stringify(graph()),stopped);
    apply('toggleOrg',{id:'G05',action:'启用'});assert.equal(S.G.org(graph(),'G05').status,'有效');assert.equal(S.G.position(graph(),'C1-P03').status,'有效');
    assert.equal(S.computePending(S.getPlan(pid)).length,0);assert.equal(JSON.stringify(graph()),before);
  });
  test('未来人员／招聘预留：保留前置阻断，失败数据和历史均不变',()=>{
    for(const orgId of ['G04','G05']){
      const id='plan-case2',before=JSON.stringify(S.getPlanData(id)),r=S.apply(id,'stopOrg',{orgId,mode:'manual'});
      assert.equal(r.ok,false);assert.match(r.error,/未来|预留/);assert.equal(JSON.stringify(S.getPlanData(id)),before);
    }
    const h=apply('addHeadcounts',{positionId:'C1-P03',level:'P4-2',count:1}).ids[0];
    graph().demands.push({id:'TEST-R',name:'预留阻断',headcountIds:[h]});Object.assign(S.G.hc(graph(),h),{state:'需求预留',demandId:'TEST-R'});
    const before=JSON.stringify(graph());const r=S.apply(pid,'stopOrg',{orgId:'G05',mode:'manual'});
    assert.equal(r.ok,false);assert.match(r.error,/预留/);assert.equal(JSON.stringify(graph()),before);
  });
  test('无锁编的审批中未来调入仍阻断；未来调出不免除当前人员待处理',()=>{
    graph().futureEvents.push({id:'TEST-IN',personId:'C1-E01',type:'调动',date:'2027-01-15',approvalStatus:'审批中',fromPositionId:'C1-P01',toPositionId:'C1-P03'});
    const before=JSON.stringify(graph());let r=S.apply(pid,'stopOrg',{orgId:'G05',mode:'manual'});assert.equal(r.ok,false);assert.match(r.error,/未来调入/);assert.equal(JSON.stringify(graph()),before);
    graph().futureEvents=[];graph().futureEvents.push({id:'TEST-OUT',personId:'C1-E03',type:'调动',date:'2027-01-15',approvalStatus:'已批准',fromPositionId:'C1-P03',toPositionId:'C1-P01'});
    stop();assert.ok(S.computePending(S.getPlan(pid)).some(x=>x.kind==='person' && x.id==='C1-E03'));
  });
  test('停用后的浮动名额：仅本人调出不影响其他人，末人离开或取消后保留空编',()=>{
    const position=target(),g=graph(),p=S.G.person(g,'C1-E03'),other=S.G.person(g,'C1-E14'),h=S.G.hc(g,p.headcountId),old=S.G.hc(g,other.headcountId);
    old.state='可用';old.personId=null;other.headcountId=h.id;h.floatingUntil='2027-02-28';stop();
    apply('transferPersons',{rows:[row(p.id,position,true)]});assert.equal(S.G.person(graph(),other.id).headcountId,h.id);assert.equal(S.G.hc(graph(),h.id).personId,other.id);assert.equal(S.G.hc(graph(),h.id).positionId,'C1-P03');
    apply('transferPersons',{rows:[row(other.id,position,true)]});assert.equal(S.G.hc(graph(),h.id).state,'可用');assert.equal(S.undo(pid).ok,true);
    apply('cancelFloating',{headcountId:h.id});assert.equal(S.G.hc(graph(),h.id).state,'可用');assert.equal(S.G.person(graph(),other.id).headcountId,null);
  });
  test('停用后的兼职可停止：主职不受影响，源名额保留且可撤销',()=>{
    const h=apply('addHeadcounts',{positionId:'C1-P03',level:'P4-2',count:1}).ids[0];
    const main=JSON.stringify(S.G.person(graph(),'C1-E01'));apply('bindHeadcount',{headcountId:h,personId:'C1-E01',assignmentType:'post',term:'长期'});
    const post=S.G.hc(graph(),h).postId;stop();assert.ok(S.computePending(S.getPlan(pid)).some(x=>x.kind==='post' && x.id===post));
    apply('cancelPost',{postId:post});assert.equal(S.G.hc(graph(),h).state,'可用');assert.equal(JSON.stringify(S.G.person(graph(),'C1-E01')),main);
    assert.equal(S.undo(pid).ok,true);assert.ok(S.G.hc(graph(),h));
  });
  test('停用组织不可调入、绑定或增编，非法整批操作无写入',()=>{
    stop();for(const [type,payload] of [
      ['transferPersons',{rows:[{...row('C1-E01','C1-P03'),targetOrgId:'G05'}]}],
      ['addHeadcounts',{positionId:'C1-P03',level:'P4-2',count:1}],
      ['bindHeadcount',{headcountId:'C1-H04',personId:'C1-E01',assignmentType:'main'}]
    ]){const before=JSON.stringify(graph());assert.equal(S.apply(pid,type,payload).ok,false);assert.equal(JSON.stringify(graph()),before);}
  });
  test('编辑所属组织：复杂人编／浮动／预留／未来关联整体跟随，日期审批绑定不变',()=>{
    const id='plan-case2',plan=S.getPlan(id),g=graph(id),pos='C2-P01';
    const associations=JSON.stringify({persons:g.persons,headcounts:g.headcounts,posts:g.posts,demands:g.demands,futureEvents:g.futureEvents});
    const count=g.positions.length,copy=apply('copyPosition',{id:pos,orgId:'G06',name:'产品经理'},id).id;
    const order=S.G.position(g,copy).sequenceNo;
    apply('editPosition',{id:pos,orgId:'G06'},id);
    assert.equal(S.G.position(graph(id),pos).orgId,'G06');assert.ok(S.G.position(graph(id),pos).sequenceNo>order);
    assert.equal(graph(id).positions.length,count+1);
    assert.equal(JSON.stringify({persons:g.persons,headcounts:g.headcounts,posts:g.posts,demands:g.demands,futureEvents:g.futureEvents}),associations);
    assert.ok(S.diffPlan(plan).futureItems.some(f=>f.fields.some(x=>x.key==='orgId' && x.new==='数据部')));
    assert.ok(S.diffPlan(plan).persons.some(f=>f.fields.some(x=>x.key==='orgId' && x.new==='数据部')));
    S._internals.assertGraph(g);assert.equal(S.undo(id).ok,true);assert.equal(S.G.position(graph(id),pos).orgId,'G04');
    assert.equal(S.redo(id).ok,true);S.load();assert.equal(S.G.position(graph(id),pos).orgId,'G06');
  });
  test('未来计划闭环：先转移项目部关联职位，再停用空部门，不修改未来单据',()=>{
    const id='plan-case2';assert.equal(S.apply(id,'stopOrg',{orgId:'G05',mode:'manual'}).ok,false);
    const before=JSON.stringify(graph(id).futureEvents),positions=graph(id).positions.filter(p=>p.orgId==='G05').map(p=>p.id);
    positions.forEach(pos=>apply('editPosition',{id:pos,orgId:'G06'},id));
    assert.equal(S.previewStopOrg(S.getPlan(id),'G05').blockingReason,'');apply('stopOrg',{orgId:'G05',mode:'manual'},id);
    assert.equal(JSON.stringify(graph(id).futureEvents),before);
    assert.ok(!S.computePending(S.getPlan(id)).some(x=>x.kind==='org' && x.id==='G05'));
    positions.forEach(pos=>assert.equal(S.G.position(graph(id),pos).status,'有效'));
    assert.ok(!S.previewSubmission(S.getPlan(id)).positionIds.some(pos=>positions.includes(pos)));
  });
  test('编辑／批量转移校验：范围外来源、停用或范围外目标整批回滚，不消耗顺序',()=>{
    for (const [type,payload] of [
      ['editPosition',{id:'C1-P03',name:'不应写入',orgId:'G07'}],
      ['editPosition',{id:'C1-P10',orgId:'G04'}],
      ['movePositions',{positionIds:['C1-P03','C1-P10'],targetOrgId:'G04'}]
    ]) {const before=JSON.stringify(S.getPlanData(pid));assert.equal(S.apply(pid,type,payload).ok,false);assert.equal(JSON.stringify(S.getPlanData(pid)),before);}
    stop();const before=JSON.stringify(S.getPlanData(pid));
    assert.equal(S.apply(pid,'editPosition',{id:'C1-P01',orgId:'G05'}).ok,false);assert.equal(JSON.stringify(S.getPlanData(pid)),before);
    apply('movePositions',{positionIds:['C1-P03','C1-P04'],targetOrgId:'G04'});
    const ordered=S.G.positionsOfOrg(graph(),'G04',false);
    assert.deepEqual(ordered.slice(-2).map(p=>p.id),['C1-P03','C1-P04']);
  });
  test('取消新增收尾提交失败原子回滚；退回恢复草稿且不复活主动取消的新增职位',()=>{
    apply('editOrg',{id:'G04',name:'产品部调整'}); // 保留真实差异，取消新增本身不构成可提交内容。
    const org=apply('addOrg',{parentId:'G04',name:'收尾部门'}).id;
    const active=apply('addPosition',{orgId:org,name:'空职位',levelMin:'P3-1',levelMax:'P5-4'}).id;
    const manual=apply('addPosition',{orgId:org,name:'主动停用职位',levelMin:'P3-1',levelMax:'P5-4'}).id;
    const hc=apply('addHeadcounts',{positionId:active,level:'P4-2',count:2}).ids;
    apply('togglePosition',{id:manual,action:'停用'});apply('stopOrg',{orgId:org,mode:'manual'});
    apply('toggleOrg',{id:org,action:'启用'});assert.equal(S.G.position(graph(),manual),undefined);
    apply('stopOrg',{orgId:org,mode:'manual'});assert.equal(S.computePending(S.getPlan(pid)).length,0);
    const before=JSON.stringify(graph()),versions=JSON.stringify(S.getPlanData(pid).versions),roots=JSON.stringify([S.getPlan(pid).sourceScopeIds,S.getPlan(pid).targetScopeIds]);
    try {S.setDemoFlag('persistFail',true);assert.equal(S.apply(pid,'submit',{}).ok,false);}
    finally {S.setDemoFlag('persistFail',false);}
    assert.equal(JSON.stringify(graph()),before);assert.equal(JSON.stringify(S.getPlanData(pid).versions),versions);
    assert.equal(JSON.stringify([S.getPlan(pid).sourceScopeIds,S.getPlan(pid).targetScopeIds]),roots);
    assert.equal(S.getPlan(pid).status,'草稿');assert.equal(S.retryPersist(pid).ok,true);
    apply('submit',{});hc.forEach(id=>assert.equal(S.G.hc(graph(),id),undefined));assert.equal(S.G.position(graph(),active),undefined);assert.equal(S.G.org(graph(),org),undefined);
    apply('demoReturn',{});assert.equal(S.G.position(graph(),active).status,'有效');assert.equal(S.G.position(graph(),manual),undefined);
    hc.forEach(id=>assert.ok(S.G.hc(graph(),id)));assert.equal(JSON.stringify(graph()),before);
  });
  test('取消新增：新建／仅复制及属性编辑后仍可取消，无残留差异或范围',()=>{
    const plan=S.getPlan(pid),before=JSON.stringify(graph()),roots=JSON.stringify([plan.sourceScopeIds,plan.targetScopeIds]);
    for(const type of ['addOrg','copyOrg']){
      const id=apply(type,{id:'G05',parentId:'G04',name:'可取消部门',copyMode:'org'}).id;
      apply('editOrg',{id,name:'修改名称',parentId:'G06',leaderId:'M03',virtualOrg:true});
      assert.equal(S.canCancelNewOrg(plan,id),true);
      // 源／目标根都不能残留已删除身份。
      plan.sourceScopeIds.push(id);
      const r=apply('cancelNewOrg',{id});assert.equal(r.parentId,'G06');
      assert.equal(S.G.org(graph(),id),undefined);assert.equal(S.diffPlan(plan).orgs.some(o=>o.id===id),false);
      assert.equal(S.hasChange(plan),false);assert.equal(JSON.stringify(graph()),before);
      assert.equal(JSON.stringify([plan.sourceScopeIds,plan.targetScopeIds]),roots);
    }
  });
  test('取消新增：关联空／停用子组织或职位阻断简单删除，既有空组织不可删除',()=>{
    const plan=S.getPlan(pid),id=apply('addOrg',{parentId:'G04',name:'有关联部门'}).id;
    const child=apply('addOrg',{parentId:id,name:'空下级'}).id;
    const reject=()=>{const before=JSON.stringify(S.getPlanData(pid));assert.equal(S.canCancelNewOrg(plan,id),false);assert.equal(S.apply(pid,'cancelNewOrg',{id,emptyOnly:true}).ok,false);assert.equal(JSON.stringify(S.getPlanData(pid)),before);};
    reject();apply('stopOrg',{orgId:id,mode:'manual'});reject();assert.ok(S.G.org(graph(),child));
    apply('toggleOrg',{id,action:'启用'});apply('cancelNewOrg',{id:child});
    const pos=apply('addPosition',{orgId:id,name:'空职位',levelMin:'P3-1',levelMax:'P5-4'}).id;
    reject();S.G.position(graph(),pos).status='停用';reject(); // 兼容旧草稿中已有的新增停用职位
    const existing='G05';apply('movePositions',{positionIds:graph().positions.filter(p=>p.orgId===existing).map(p=>p.id),targetOrgId:'G04'});
    assert.equal(S.canCancelNewOrg(plan,existing),false);assert.equal(S.apply(pid,'cancelNewOrg',{id:existing}).ok,false);
    apply('stopOrg',{orgId:existing,mode:'manual'});assert.equal(S.G.org(graph(),existing).status,'停用');
  });
  test('取消新增：确认时关联变化、流程引用及范围外来源均保护数据',()=>{
    const plan=S.getPlan(pid),id=apply('addOrg',{parentId:'G04',name:'确认时复核'}).id;
    assert.equal(S.canCancelNewOrg(plan,id),true);
    apply('addPosition',{orgId:id,name:'后来增加的职位',levelMin:'P3-1',levelMax:'P5-4'});
    let before=JSON.stringify(S.getPlanData(pid));assert.equal(S.apply(pid,'cancelNewOrg',{id,emptyOnly:true}).ok,false);assert.equal(JSON.stringify(S.getPlanData(pid)),before);
    const empty=apply('addOrg',{parentId:'G04',name:'有流程部门'}).id;
    graph().headcountWorkflows=[{id:'TEST-WF',orgId:empty,status:'已完成'}];
    assert.equal(S.canCancelNewOrg(plan,empty),false);before=JSON.stringify(S.getPlanData(pid));assert.equal(S.apply(pid,'cancelNewOrg',{id:empty}).ok,false);assert.equal(JSON.stringify(S.getPlanData(pid)),before);
    graph().headcountWorkflows=[];S.G.org(graph(),empty).parentId='G02';plan.targetScopeIds=plan.targetScopeIds.filter(x=>x!==empty);
    before=JSON.stringify(S.getPlanData(pid));assert.equal(S.apply(pid,'cancelNewOrg',{id:empty}).ok,false);assert.equal(JSON.stringify(S.getPlanData(pid)),before);
  });
  test('取消新增：一步撤销重做／刷新还原身份及范围，序号不复用',()=>{
    const plan=S.getPlan(pid),id=apply('addOrg',{parentId:'G04',name:'撤销验证部'}).id;
    const before=JSON.stringify(graph()),roots=JSON.stringify([plan.sourceScopeIds,plan.targetScopeIds]);
    const n=S.getPlanData(pid).history.undo.length;
    apply('cancelNewOrg',{id});assert.equal(S.getPlanData(pid).history.undo.length,n+1);
    assert.match(S.historyState(pid).undoLabel,/取消新增组织/);
    S.load();assert.equal(S.G.org(graph(),id),undefined);
    assert.equal(S.undo(pid).ok,true);assert.equal(JSON.stringify(graph()),before);
    assert.equal(JSON.stringify([S.getPlan(pid).sourceScopeIds,S.getPlan(pid).targetScopeIds]),roots);
    assert.equal(S.redo(pid).ok,true);S.load();assert.equal(S.G.org(graph(),id),undefined);
    const next=apply('addOrg',{parentId:'G04',name:'下个部门'}).id;assert.notEqual(next,id);
    assert.equal(S.displayCode(S.getPlan(pid),'org',next),'新增组织 002');
    assert.equal(S.undo(pid).ok,true);const third=apply('addOrg',{parentId:'G04',name:'新分支'}).id;
    assert.equal(S.displayCode(S.getPlan(pid),'org',third),'新增组织 003');
  });
  test('取消新增：旧停用入口统一取消；父级级联保留下级，审批中禁止取消',()=>{
    for(const type of ['stopOrg','toggleOrg']){
      const id=apply('addOrg',{parentId:'G04',name:'旧入口'}).id;
      const r=apply(type,{id,orgId:id,action:'停用',mode:'manual'});assert.equal(r.cancelledOrgId,id);assert.equal(S.G.org(graph(),id),undefined);
    }
    const parent=apply('addOrg',{parentId:'G04',name:'父部门'}).id,child=apply('addOrg',{parentId:parent,name:'子部门'}).id;
    apply('stopOrg',{orgId:parent,mode:'manual'});assert.equal(S.G.org(graph(),child).status,'停用');
    assert.equal(S.canCancelNewOrg(S.getPlan(pid),child),true);
    apply('toggleOrg',{id:parent,action:'启用'});apply('toggleOrg',{id:child,action:'启用'});apply('submit',{});
    const before=JSON.stringify(S.getPlanData(pid));assert.equal(S.apply(pid,'cancelNewOrg',{id:child}).ok,false);assert.equal(JSON.stringify(S.getPlanData(pid)),before);
  });
  test('统一取消：有人新增组织保留主职及绑定，支持撤销重做和恢复新增',()=>{
    const org=apply('addOrg',{parentId:'G04',name:'有人的新增部门'}).id;
    const pos=apply('addPosition',{orgId:org,name:'新职位',levelMin:'P1-1',levelMax:'P6-4'}).id;
    apply('transferPersons',{rows:[{personId:'C1-E01',targetPositionId:pos,managerId:'M02',bringHeadcount:true}]});
    const before=JSON.stringify(graph()),person=JSON.stringify(S.G.person(graph(),'C1-E01')),hc=JSON.stringify(graph().headcounts);
    assert.equal(apply('cancelNewOrg',{id:org,mode:'manual'}).cancelNew,true);
    assert.deepEqual(S.orgChangeTags(S.getPlan(pid),org),['已取消新增']);
    assert.equal(S.diffPlan(S.getPlan(pid)).orgs.find(o=>o.id===org).changeType,'取消新增');
    assert.equal(S.diffPlan(S.getPlan(pid)).orgs.find(o=>o.id===org).fields.find(f=>f.key==='status').new,'已取消新增');
    assert.equal(JSON.stringify(S.G.person(graph(),'C1-E01')),person);assert.equal(JSON.stringify(graph().headcounts),hc);assert.equal(S.G.position(graph(),pos).status,'有效');
    assert.ok(S.computePending(S.getPlan(pid)).some(x=>x.id==='C1-E01'));assert.equal(S.apply(pid,'submit',{}).ok,false);
    const cancelled=JSON.stringify(graph());assert.equal(S.undo(pid).ok,true);assert.equal(JSON.stringify(graph()),before);assert.equal(S.redo(pid).ok,true);S.load();assert.equal(JSON.stringify(graph()),cancelled);
    apply('toggleOrg',{id:org,action:'恢复新增'});assert.equal(JSON.stringify(graph()),before);assert.equal(S.computePending(S.getPlan(pid)).length,0);
    assert.match(S.historyState(pid).undoLabel,/恢复新增/);
  });
  test('统一取消：未来和预留仍阻断直接取消，整体转移保留复杂关联并移除新增源',()=>{
    const id='plan-case2',org=apply('addOrg',{parentId:'G04',name:'复杂引用容器'},id).id;
    apply('movePositions',{positionIds:['C2-P01'],targetOrgId:org},id);
    const before=JSON.stringify(S.getPlanData(id)),associations=JSON.stringify({persons:graph(id).persons,headcounts:graph(id).headcounts,posts:graph(id).posts,futureEvents:graph(id).futureEvents,demands:graph(id).demands});
    const r=S.apply(id,'cancelNewOrg',{id:org,mode:'manual'});assert.equal(r.ok,false);assert.match(r.error,/未来|预留/);assert.equal(JSON.stringify(S.getPlanData(id)),before);
    const invalid=S.apply(id,'cancelNewOrg',{id:org,mode:'transfer',targetOrgId:org});assert.equal(invalid.ok,false);assert.equal(JSON.stringify(S.getPlanData(id)),before);
    apply('cancelNewOrg',{id:org,mode:'transfer',targetOrgId:'G06'},id);
    assert.equal(S.G.org(graph(id),org),undefined);assert.equal(S.G.position(graph(id),'C2-P01').orgId,'G06');
    assert.equal(JSON.stringify({persons:graph(id).persons,headcounts:graph(id).headcounts,posts:graph(id).posts,futureEvents:graph(id).futureEvents,demands:graph(id).demands}),associations);
    assert.equal(S.undo(id).ok,true);assert.ok(S.G.org(graph(id),org));assert.equal(S.G.position(graph(id),'C2-P01').orgId,org);
  });
  test('统一取消：迁入既有职位／下级组织必须先转出，禁止作为空结构清理',()=>{
    const org=apply('addOrg',{parentId:'G04',name:'既有结构容器'}).id;
    apply('moveOrg',{id:'G05',newParentId:org});
    apply('movePositions',{positionIds:['C1-P01'],targetOrgId:org});
    apply('cancelNewOrg',{id:org,mode:'manual'});
    const pending=S.computePending(S.getPlan(pid));
    assert.ok(pending.some(x=>x.id==='G05' && /既有组织/.test(x.message)));assert.ok(pending.some(x=>x.id==='C1-P01' && /既有职位/.test(x.message)));
    const preview=S.previewSubmission(S.getPlan(pid));assert.ok(S.G.org(preview.graph,'G05'));assert.ok(S.G.position(preview.graph,'C1-P01'));assert.ok(S.G.org(preview.graph,org));
    const before=JSON.stringify(S.getPlanData(pid));assert.equal(S.apply(pid,'submit',{}).ok,false);assert.equal(JSON.stringify(S.getPlanData(pid)),before);
    apply('toggleOrg',{id:org,action:'恢复新增'});apply('toggleOrg',{id:'G05',action:'启用'});
    apply('moveOrg',{id:'G05',newParentId:'G03'});apply('movePositions',{positionIds:['C1-P01'],targetOrgId:'G04'});
    apply('cancelNewOrg',{id:org});assert.equal(S.G.org(graph(),org),undefined);assert.ok(S.G.org(graph(),'G05'));assert.ok(S.G.position(graph(),'C1-P01'));
  });
  test('统一取消：安全新增结构提交移除，退回恢复图／顺序／范围和原快照',()=>{
    apply('editOrg',{id:'G04',name:'产品部保留调整'});
    const copied=apply('copyOrg',{id:'G05',parentId:'G04',name:'取消结构副本',copyMode:'subtreePositions'});
    const pos=copied.positionIds[0],hc=apply('addHeadcounts',{positionId:pos,level:'P4-2',count:2}).ids;
    apply('cancelNewOrg',{id:copied.id,mode:'manual'});
    assert.equal(S.computePending(S.getPlan(pid)).length,0);
    const before=JSON.stringify(graph()),roots=JSON.stringify([S.getPlan(pid).sourceScopeIds,S.getPlan(pid).targetScopeIds]),preview=S.previewSubmission(S.getPlan(pid));
    assert.equal(JSON.stringify(graph()),before);copied.orgIds.forEach(id=>assert.equal(S.G.org(preview.graph,id),undefined));copied.positionIds.forEach(id=>assert.equal(S.G.position(preview.graph,id),undefined));hc.forEach(id=>assert.equal(S.G.hc(preview.graph,id),undefined));
    assert.equal(S.diffPlan(S.getPlan(pid),preview.graph).orgs.some(o=>copied.orgIds.includes(o.id)),false);
    apply('submit',{});assert.deepEqual(graph(),preview.graph);assert.equal(S.getPlan(pid).targetScopeIds.some(id=>copied.orgIds.includes(id)),false);
    const snapshot=JSON.stringify(S.getPlanData(pid).versions[0].snapshot);apply('demoReturn',{});
    assert.equal(JSON.stringify(graph()),before);assert.equal(JSON.stringify([S.getPlan(pid).sourceScopeIds,S.getPlan(pid).targetScopeIds]),roots);assert.equal(JSON.stringify(S.getPlanData(pid).versions[0].snapshot),snapshot);
    S.load();assert.equal(JSON.stringify(graph()),before);apply('submit',{});assert.equal(JSON.stringify(S.getPlanData(pid).versions[0].snapshot),snapshot);
  });
  test('统一取消：纯新增后取消无最终差异不可提交；其他历史引用不静默删除',()=>{
    const org=apply('addOrg',{parentId:'G04',name:'净零部门'}).id;
    const pos=apply('addPosition',{orgId:org,name:'净零职位',levelMin:'P3-1',levelMax:'P5-4'}).id;
    apply('cancelNewOrg',{id:org,mode:'manual'});
    assert.equal(S.hasChange(S.getPlan(pid),S.previewSubmission(S.getPlan(pid)).graph),false);
    const before=JSON.stringify(S.getPlanData(pid));const r=S.apply(pid,'submit',{});assert.equal(r.ok,false);assert.match(r.error,/暂无调整/);assert.equal(JSON.stringify(S.getPlanData(pid)),before);
    graph().futureEvents.push({id:'HISTORY',personId:'C1-E01',fromPositionId:pos,type:'离职',date:'2026-01-01',approvalStatus:'已批准'});
    assert.ok(S.computePending(S.getPlan(pid)).some(x=>x.id===pos && /关联记录/.test(x.message)));assert.ok(S.G.position(S.previewSubmission(S.getPlan(pid)).graph,pos));
  });
  test('统一取消：恢复新增不恢复迁出对象或下级，停用祖先仍禁止新建',()=>{
    const org=apply('addOrg',{parentId:'G04',name:'恢复边界'}).id,child=apply('addOrg',{parentId:org,name:'子部门'}).id;
    apply('cancelNewOrg',{id:org,mode:'manual'});apply('toggleOrg',{id:child,action:'恢复新增'});
    const before=JSON.stringify(S.getPlanData(pid));assert.equal(S.apply(pid,'addOrg',{parentId:child,name:'非法后代'}).ok,false);assert.equal(JSON.stringify(S.getPlanData(pid)),before);
    assert.equal(S.G.isOrgEffective(graph(),child),false);
    for(const [op,payload] of [
      ['copyOrg',{id:child,parentId:'G04',name:'非法来源'}],
      ['movePositions',{positionIds:['C1-P01'],targetOrgId:child}],
      ['moveOrg',{id:'G05',newParentId:child}]
    ]) { assert.equal(S.apply(pid,op,payload).ok,false);assert.equal(JSON.stringify(S.getPlanData(pid)),before); }
    apply('toggleOrg',{id:child,action:'停用'});apply('toggleOrg',{id:org,action:'恢复新增'});
    // 空下级已通过旧停用入口直接移除；恢复父组织不会把它重建。
    assert.equal(S.G.org(graph(),child),undefined);assert.equal(S.G.org(graph(),org).status,'有效');
    assert.equal(S.apply(pid,'toggleOrg',{id:'G05',action:'恢复新增'}).ok,false);
  });
  return results;
};
