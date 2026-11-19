/* 组织先停用的草稿闭环：当前人员保留、未来与预留阻断、源名额关闭与撤销。 */
const assert=require('node:assert/strict');
module.exports=function(){
  const S=OA.store, pid='plan-case1',results=[];
  const graph=(id=pid)=>S.getPlanData(id).cur;
  const apply=(type,payload,id=pid)=>{const r=S.apply(id,type,payload);assert.equal(r.ok,true,r.error);return r;};
  const test=(name,fn)=>{try{S.resetAll();fn();results.push({name,pass:true});}catch(e){results.push({name,pass:false,error:e.stack});}};
  const stop=()=>apply('stopOrg',{orgId:'G05',mode:'manual'});
  const target=()=>apply('addPosition',{orgId:'G04',name:'接收项目团队',levelMin:'P1-1',levelMax:'P6-4'}).id;
  const row=(id,posId,bring=false)=>({personId:id,targetPositionId:posId,targetOrgId:'G04',managerId:'M02',bringHeadcount:bring});
  test('组织先停用：九名在职保留绑定，空编关闭、人员待处理并阻断提交',()=>{
    const before=S.previewStopOrg(S.getPlan(pid),'G05'),people=JSON.parse(JSON.stringify(before.employees)),occupied=before.headcounts.filter(h=>h.state==='占编').map(h=>h.id),vacant=before.headcounts.filter(h=>h.state==='可用').map(h=>h.id);
    assert.equal(people.length,9);assert.equal(before.blockingReason,'');stop();
    assert.equal(S.G.org(graph(),'G05').status,'停用');
    people.forEach(p=>{assert.deepEqual(S.G.person(graph(),p.id),p);assert.ok(S.assignmentStopReason(graph(),p,'main'));});
    occupied.forEach(id=>assert.ok(S.G.hc(graph(),id)));vacant.forEach(id=>assert.equal(S.G.hc(graph(),id),undefined));
    assert.equal(S.computePending(S.getPlan(pid)).filter(x=>x.kind==='person' && people.some(p=>p.id===x.id)).length,9);
    assert.equal(S.apply(pid,'submit',{}).ok,false);S._internals.assertGraph(graph());
    const snapshot=JSON.stringify(graph());S.load();assert.equal(JSON.stringify(graph()),snapshot);
  });
  test('停用后不带编调出：源空编关闭，一步撤销恢复绑定及名额，全部调出可提交',()=>{
    const position=target(),people=S.previewStopOrg(S.getPlan(pid),'G05').employees.map(p=>p.id);
    apply('addHeadcounts',{positionId:position,level:'P4-2',count:people.length});stop();const stopped=JSON.stringify(graph());
    const first=S.G.person(graph(),people[0]),oldHc=first.headcountId;
    apply('transferPersons',{rows:[row(first.id,position)]});assert.equal(S.G.hc(graph(),oldHc),undefined);
    assert.ok(S.G.person(graph(),first.id).headcountId);assert.equal(S.assignmentStopReason(graph(),S.G.person(graph(),first.id),'main'),'');
    assert.equal(S.undo(pid).ok,true);assert.equal(JSON.stringify(graph()),stopped);
    assert.equal(S.redo(pid).ok,true);assert.equal(S.G.hc(graph(),oldHc),undefined);
    apply('transferPersons',{rows:people.slice(1).map(id=>row(id,position))});
    assert.equal(S.computePending(S.getPlan(pid)).length,0);assert.equal(graph().headcounts.some(h=>S.G.position(graph(),h.positionId).orgId==='G05'),false);
    apply('submit',{});assert.equal(S.getPlan(pid).status,'审批中');
  });
  test('停用后带普通编调出：身份和绑定保留，不误删随人迁走的编制',()=>{
    const position=target();stop();const p=S.G.person(graph(),'C1-E03'),id=p.headcountId;
    apply('transferPersons',{rows:[row(p.id,position,true)]});
    assert.equal(S.G.person(graph(),p.id).headcountId,id);assert.equal(S.G.hc(graph(),id).positionId,position);S._internals.assertGraph(graph());
  });
  test('停用及重做：组织、职位、空编与全部占用一次恢复，启用不恢复关闭对象',()=>{
    const before=JSON.stringify(graph());stop();const stopped=JSON.stringify(graph());
    assert.equal(S.undo(pid).ok,true);assert.equal(JSON.stringify(graph()),before);
    assert.equal(S.redo(pid).ok,true);assert.equal(JSON.stringify(graph()),stopped);
    apply('toggleOrg',{id:'G05',action:'启用'});assert.equal(S.G.org(graph(),'G05').status,'有效');assert.equal(S.G.position(graph(),'C1-P03').status,'停用');
    assert.ok(S.computePending(S.getPlan(pid)).some(x=>x.kind==='person' && x.id==='C1-E03'));
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
  test('停用后的浮动名额：仅本人调出不影响其他人，末人离开才关闭；取消浮动可处理',()=>{
    const position=target(),g=graph(),p=S.G.person(g,'C1-E03'),other=S.G.person(g,'C1-E14'),h=S.G.hc(g,p.headcountId),old=S.G.hc(g,other.headcountId);
    old.state='可用';old.personId=null;other.headcountId=h.id;h.floatingUntil='2027-02-28';stop();
    apply('transferPersons',{rows:[row(p.id,position,true)]});assert.equal(S.G.person(graph(),other.id).headcountId,h.id);assert.equal(S.G.hc(graph(),h.id).personId,other.id);assert.equal(S.G.hc(graph(),h.id).positionId,'C1-P03');
    apply('transferPersons',{rows:[row(other.id,position,true)]});assert.equal(S.G.hc(graph(),h.id),undefined);assert.equal(S.undo(pid).ok,true);
    apply('cancelFloating',{headcountId:h.id});assert.equal(S.G.hc(graph(),h.id),undefined);assert.equal(S.G.person(graph(),other.id).headcountId,null);
  });
  test('停用后的兼职可停止：主职不受影响，源名额关闭且可撤销',()=>{
    const h=apply('addHeadcounts',{positionId:'C1-P03',level:'P4-2',count:1}).ids[0];
    const main=JSON.stringify(S.G.person(graph(),'C1-E01'));apply('bindHeadcount',{headcountId:h,personId:'C1-E01',assignmentType:'post',term:'长期'});
    const post=S.G.hc(graph(),h).postId;stop();assert.ok(S.computePending(S.getPlan(pid)).some(x=>x.kind==='post' && x.id===post));
    apply('cancelPost',{postId:post});assert.equal(S.G.hc(graph(),h),undefined);assert.equal(JSON.stringify(S.G.person(graph(),'C1-E01')),main);
    assert.equal(S.undo(pid).ok,true);assert.ok(S.G.hc(graph(),h));
  });
  test('停用组织不可调入、绑定或增编，非法整批操作无写入',()=>{
    stop();for(const [type,payload] of [
      ['transferPersons',{rows:[{...row('C1-E01','C1-P03'),targetOrgId:'G05'}]}],
      ['addHeadcounts',{positionId:'C1-P03',level:'P4-2',count:1}],
      ['bindHeadcount',{headcountId:'C1-H04',personId:'C1-E01',assignmentType:'main'}]
    ]){const before=JSON.stringify(graph());assert.equal(S.apply(pid,type,payload).ok,false);assert.equal(JSON.stringify(graph()),before);}
  });
  return results;
};
