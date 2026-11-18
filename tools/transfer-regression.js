/* 调岗草稿的业务结果回归：自动占编、浮动释放、预览一致及提交闭环。 */
const assert = require('node:assert/strict');
module.exports = function () {
  const S=OA.store, pid='plan-case2', results=[];
  const graph=()=>S.getPlanData(pid).cur;
  const row=(id,positionId,bring=false)=>({personId:id,targetPositionId:positionId,managerId:'M03',bringHeadcount:bring});
  const test=(name,fn)=>{try {S.resetAll();fn();results.push({name,pass:true});}catch(e){results.push({name,pass:false,error:e.stack});}};
  function target(count=0) {
    const pos=S.apply(pid,'addPosition',{orgId:'G05',name:'自动占编验证',levelMin:'P3-1',levelMax:'P5-4'});
    assert.equal(pos.ok,true,pos.error);
    const hcs=count ? S.apply(pid,'addHeadcounts',{positionId:pos.id,level:'P4-2',count}) : {ok:true,ids:[]};
    assert.equal(hcs.ok,true,hcs.error);return {positionId:pos.id,ids:hcs.ids};
  }
  const preview=payload=>S.apply(pid,'previewTransfer',payload);
  test('自动占编：多人缺编仍全部移动，只分配合法名额，待绑编阻止提交',()=>{
    const t=target(2),rows=['C2-E25','C2-E26','C2-E28'].map(id=>row(id,t.positionId));
    const r=S.apply(pid,'transferPersons',{rows});assert.equal(r.ok,true,r.error);
    assert.equal(r.boundCount,2);assert.equal(r.pendingCount,1);
    rows.forEach(x=>assert.equal(S.G.person(graph(),x.personId).positionId,t.positionId));
    assert.deepEqual(r.assignments.map(a=>a.headcountId),[...t.ids,null]);
    assert.ok(S.computePending(S.getPlan(pid)).some(x=>x.id==='C2-E28'));
    assert.equal(S.apply(pid,'submit',{}).ok,false);S._internals.assertGraph(graph());
  });
  test('自动占编：目标无空编仍移动，不使用组织其他职位名额',()=>{
    const t=target(),r=S.apply(pid,'transferPersons',{rows:[row('C2-E25',t.positionId)]});
    assert.equal(r.ok,true);assert.equal(r.pendingCount,1);assert.equal(r.boundCount,0);
    assert.equal(S.G.person(graph(),'C2-E25').headcountId,null);
    assert.equal(S.G.person(graph(),'C2-E26').headcountId,'C2-H32');
    assert.equal(S.G.hc(graph(),'C2-H32').floatingUntil,'2027-02-28');
  });
  test('自动占编：异常空编不绑定，数量充足也可能待绑编',()=>{
    const t=target(2);t.ids.forEach(id=>S.G.hc(graph(),id).level='P6-1');
    const r=S.apply(pid,'transferPersons',{rows:[row('C2-E25',t.positionId)]});
    assert.equal(r.ok,true);assert.equal(r.pendingCount,1);t.ids.forEach(id=>assert.equal(S.G.hc(graph(),id).state,'可用'));
  });
  test('自动占编：带编优先，浮动强制释放，不占编不消耗目标名额',()=>{
    const t=target(1),r=S.apply(pid,'transferPersons',{rows:[row('C2-E01',t.positionId,true),row('C2-E27',t.positionId),row('C2-E25',t.positionId,true)]});
    assert.equal(r.ok,true);assert.equal(r.carriedCount,1);assert.equal(r.boundCount,1);assert.equal(r.pendingCount,0);
    assert.equal(S.G.person(graph(),'C2-E27').headcountId,null);assert.equal(S.G.person(graph(),'C2-E25').headcountId,t.ids[0]);
    assert.equal(S.G.hc(graph(),'C2-H32').positionId,'C2-P01');assert.equal(S.G.person(graph(),'C2-E26').headcountId,'C2-H32');
  });
  test('自动占编：只分配本批人员，不处理目标已有待绑编人员',()=>{
    const t=target(1);S.G.person(graph(),'C2-E28').positionId=t.positionId;
    const r=S.apply(pid,'transferPersons',{rows:[row('C2-E25',t.positionId)]});
    assert.equal(r.ok,true);assert.equal(S.G.person(graph(),'C2-E25').headcountId,t.ids[0]);assert.equal(S.G.person(graph(),'C2-E28').headcountId,null);
  });
  test('空编落点：优先具体名额，忽略带编策略，其他人员按编码分配',()=>{
    const t=target(2),rows=[row('C2-E25',t.positionId,true),row('C2-E26',t.positionId,true),row('C2-E28',t.positionId,true)];
    const r=S.apply(pid,'transferPersons',{rows,targetHeadcountId:t.ids[1]});
    assert.equal(r.ok,true);assert.equal(r.carriedCount,0);assert.equal(r.pendingCount,1);
    assert.deepEqual(r.assignments.map(a=>a.headcountId),[t.ids[1],t.ids[0],null]);
    assert.equal(S.G.hc(graph(),'C2-H32').state,'可用');
  });
  test('同职位浮动转绑：不改变调岗字段、经理或其他共占人，一步撤销',()=>{
    const h=S.apply(pid,'addHeadcounts',{positionId:'C2-P01',level:'P4-2',count:1});
    const before=JSON.stringify(graph()),p={...S.G.person(graph(),'C2-E25')},steps=S.historyState(pid).undoCount;
    const r=S.apply(pid,'transferPersons',{rows:[{personId:p.id,targetPositionId:p.positionId,managerId:p.id,workCity:'不得改变'}],targetHeadcountId:h.ids[0]});
    assert.equal(r.ok,true,r.error);assert.equal(r.bindingOnly,true);
    assert.deepEqual(S.G.person(graph(),p.id),{...p,headcountId:h.ids[0]});
    assert.equal(S.G.person(graph(),'C2-E26').headcountId,'C2-H32');
    assert.equal(S.historyState(pid).undoCount,steps+1);assert.equal(S.undo(pid).ok,true);assert.equal(JSON.stringify(graph()),before);
    assert.equal(S.redo(pid).ok,true);S.load();assert.equal(S.G.person(graph(),p.id).headcountId,h.ids[0]);
  });
  test('同职位待绑编：仅绑定，不要求调岗字段；普通已绑定者仍拒绝换编',()=>{
    const g=graph(),p=S.G.person(g,'C2-E28'),h=S.G.availableHcs(g,p.positionId)[0],before={...p};
    const r=S.apply(pid,'transferPersons',{rows:[{personId:p.id,targetPositionId:p.positionId}],targetHeadcountId:h.id});
    assert.equal(r.ok,true,r.error);assert.deepEqual(S.G.person(graph(),p.id),{...before,headcountId:h.id});
    const h2=S.apply(pid,'addHeadcounts',{positionId:p.positionId,level:'P4-2',count:1});
    const snap=JSON.stringify(graph());assert.equal(S.apply(pid,'transferPersons',{rows:[{personId:p.id,targetPositionId:p.positionId}],targetHeadcountId:h2.ids[0]}).ok,false);assert.equal(JSON.stringify(graph()),snap);
  });
  test('空编落点：不应占编起点拒绝，混合批次其他不占编人员可移动',()=>{
    const t=target(1),before=JSON.stringify(graph());
    assert.equal(S.apply(pid,'transferPersons',{rows:[row('C2-E27',t.positionId)],targetHeadcountId:t.ids[0]}).ok,false);
    assert.equal(JSON.stringify(graph()),before);
    const r=S.apply(pid,'transferPersons',{rows:[row('C2-E25',t.positionId),row('C2-E27',t.positionId)],targetHeadcountId:t.ids[0]});
    assert.equal(r.ok,true);assert.equal(r.pendingCount,0);assert.equal(S.G.person(graph(),'C2-E27').positionId,t.positionId);assert.equal(S.G.person(graph(),'C2-E27').headcountId,null);
  });
  test('调岗预览只读：不改变图、暂存及历史，确认结果与预览相同',()=>{
    const t=target(1),payload={rows:[row('C2-E25',t.positionId),row('C2-E26',t.positionId)]};
    const before=JSON.stringify(S.getPlanData(pid)),pv=preview(payload);assert.equal(pv.ok,true);
    assert.equal(JSON.stringify(S.getPlanData(pid)),before);
    const r=S.apply(pid,'transferPersons',{...payload,expectedAssignments:pv.signature});assert.equal(r.ok,true);assert.deepEqual(r.signature,pv.signature);
  });
  test('调岗预览变化：旧分配签名不能确认，原浮动绑定不提前释放',()=>{
    const t=target(2),payload={rows:[row('C2-E25',t.positionId)]},pv=preview(payload);
    assert.equal(S.apply(pid,'transferPersons',{rows:[row('C2-E26',t.positionId)]}).ok,true);
    const before=JSON.stringify(graph()),r=S.apply(pid,'transferPersons',{...payload,expectedAssignments:pv.signature});
    assert.equal(r.ok,false);assert.match(r.error,/分配已变化/);assert.equal(JSON.stringify(graph()),before);assert.equal(S.G.person(graph(),'C2-E25').headcountId,'C2-H32');
  });
  test('编制变为已占用或预留：具体落点不能抢占，整批不移动',()=>{
    const t=target(1);assert.equal(S.apply(pid,'transferPersons',{rows:[row('C2-E26',t.positionId)]}).ok,true);
    let before=JSON.stringify(graph());assert.equal(S.apply(pid,'transferPersons',{rows:[row('C2-E25',t.positionId)],targetHeadcountId:t.ids[0]}).ok,false);assert.equal(JSON.stringify(graph()),before);
    const h=graph().headcounts.find(h=>h.positionId==='C2-P01' && ['需求预留','Offer占用','待调入预留','入职预留'].includes(h.state));assert.ok(h);
    before=JSON.stringify(graph());assert.equal(S.apply(pid,'transferPersons',{rows:[row('C2-E28','C2-P01')],targetHeadcountId:h.id}).ok,false);assert.equal(JSON.stringify(graph()),before);
  });
  test('整批硬校验：重复人员、错误部门及经理循环均不提前解绑',()=>{
    const t=target(2),r=row('C2-E25',t.positionId),before=JSON.stringify(graph());
    for (const rows of [[r,r],[r,{...row('C2-E26',t.positionId),targetOrgId:'G04'}],[r,{...row('C2-E26',t.positionId),managerId:'C2-E26'}]]) {
      assert.equal(S.apply(pid,'transferPersons',{rows}).ok,false);assert.equal(JSON.stringify(graph()),before);
    }
  });
  test('待处理闭环：缺编移动后增编及匹配，可解除该人员待处理',()=>{
    const t=target();assert.equal(S.apply(pid,'transferPersons',{rows:[row('C2-E25',t.positionId)]}).ok,true);
    assert.ok(S.computePending(S.getPlan(pid)).some(x=>x.id==='C2-E25'));
    assert.equal(S.apply(pid,'addHeadcounts',{positionId:t.positionId,level:'P4-2',count:1}).ok,true);
    assert.equal(S.apply(pid,'applyAutoMatch',{positionId:t.positionId}).ok,true);
    assert.equal(S.computePending(S.getPlan(pid)).some(x=>x.id==='C2-E25'),false);
  });
  test('提交闭环：清除初始问题后，缺编调岗阻断；补编匹配后可提交快照',()=>{
    for (const [type,payload] of [
      ['applyAutoMatch',{positionId:'C2-P01'}],['releaseHeadcount',{personId:'C2-E24'}],
      ['moveHeadcountsByIds',{headcountIds:['C2-H29'],targetPositionId:'C2-P01',level:'P4-2'}],['applyAutoMatch',{positionId:'C2-P01'}]
    ]) {const r=S.apply(pid,type,payload);assert.equal(r.ok,true,r.error);}
    assert.equal(S.computePending(S.getPlan(pid)).length,0);
    const t=target();assert.equal(S.apply(pid,'transferPersons',{rows:[row('C2-E25',t.positionId)]}).ok,true);
    assert.equal(S.apply(pid,'submit',{}).ok,false);
    assert.equal(S.apply(pid,'addHeadcounts',{positionId:t.positionId,level:'P4-2',count:1}).ok,true);
    assert.equal(S.apply(pid,'applyAutoMatch',{positionId:t.positionId}).ok,true);
    assert.equal(S.computePending(S.getPlan(pid)).length,0);assert.equal(S.apply(pid,'submit',{}).ok,true);
    const snap=S.getPlanData(pid).versions[0].snapshot;assert.equal(S.G.person(snap,'C2-E25').positionId,t.positionId);assert.ok(S.G.person(snap,'C2-E25').headcountId);
  });
  return results;
};
