const assert = require('assert/strict');
module.exports = function () {
  const S = OA.store, results = [];
  const test = (name, fn) => { try { S.resetAll(); fn(); results.push({name,pass:true}); } catch(e) { results.push({name,pass:false,error:e.message}); } };
  test('组织投影：独立分组、空职位隐藏、下级顺序及数量守恒', () => {
    const p = S.getPlan('plan-case1');
    const empty = S.apply(p.id,'addPosition',{ orgId:'G03',name:'预备职位',levelMin:'P3-1',levelMax:'P5-4' });
    assert.equal(empty.ok,true);
    const all = S.workbenchGroups(p,'G03',true), direct = S.workbenchGroups(p,'G03',false);
    assert.deepEqual(all.orgIds,['G03','G04','G05','G06']);
    assert.equal(all.people.some(g=>g.position.id===empty.id),false);
    assert.equal(all.headcounts.some(g=>g.position.id===empty.id),false);
    assert.equal(direct.people.length,0);
    assert.equal(all.people.flatMap(g=>g.people).filter(p=>p.status==='在职').length,24);
    assert.equal(all.headcounts.reduce((n,g)=>n+g.totalCount,0),28);
  });
  test('组织范围匹配：预览只读、分组配对、单步应用撤销', () => {
    const p=S.getPlan('plan-case1');
    S.apply(p.id,'releaseHeadcounts',{personIds:['C1-E01','C1-E02']});
    const before=JSON.stringify(S.getPlanData(p.id));
    const preview=S.apply(p.id,'matchPreview',{orgId:'G03',includeSub:true});
    assert.equal(preview.ok,true); assert.ok(preview.pairs.length);
    assert.equal(JSON.stringify(S.getPlanData(p.id)),before);
    const graph=S.getPlanData(p.id).cur;
    preview.pairs.forEach(pair=>assert.equal(S.G.person(graph,pair.personId).positionId,S.G.hc(graph,pair.hcId).positionId));
    const steps=S.historyState(p.id).undoCount;
    assert.equal(S.apply(p.id,'applyAutoMatch',{orgId:'G03',includeSub:true}).ok,true);
    assert.equal(S.historyState(p.id).undoCount,steps+1);
    assert.equal(S.undo(p.id).ok,true);
    assert.deepEqual(S.getPlanData(p.id).cur,JSON.parse(before).cur);
  });
  test('减编投影：基准历史原位保留，新增净零不产生历史', () => {
    const p=S.getPlan('plan-case1');
    S.apply(p.id,'removeHeadcountsByIds',{headcountIds:['C1-H10','C1-H11']});
    const group=S.workbenchGroups(p,'G04',false).headcounts.find(g=>g.position.id==='C1-P01');
    assert.equal(group.removedHcs.length,2);assert.equal(group.totalCount,5);
    const pos=S.apply(p.id,'addPosition',{orgId:'G04',name:'新职位',levelMin:'P3-1',levelMax:'P5-4'});
    const add=S.apply(p.id,'addHeadcounts',{positionId:pos.id,level:'P4-2',count:1});
    const id=S.G.hcsOf(S.getPlanData(p.id).cur,pos.id)[0].id;
    assert.equal(add.ok,true);S.apply(p.id,'removeHeadcountsByIds',{headcountIds:[id]});
    assert.equal(S.workbenchGroups(p,'G04',false).headcounts.some(g=>g.position.id===pos.id),false);
  });
  test('职位停用：整批前置校验无部分状态修改',()=>{
    const p=S.getPlan('plan-case1');
    const pos=S.apply(p.id,'addPosition',{orgId:'G04',name:'空职位',levelMin:'P3-1',levelMax:'P5-4'});
    const before=JSON.stringify(S.getPlanData(p.id));
    const result=S.apply(p.id,'togglePositions',{positionIds:[pos.id,'C1-P01'],action:'停用'});
    assert.equal(result.ok,false);assert.match(result.error,/员工/);assert.equal(JSON.stringify(S.getPlanData(p.id)),before);
  });
  test('减编历史：后续整体转移组织不改变减编前展示归属',()=>{
    const p=S.getPlan('plan-case1');
    assert.equal(S.apply(p.id,'removeHeadcountsByIds',{headcountIds:['C1-H10']}).ok,true);
    assert.equal(S.apply(p.id,'stopOrg',{orgId:'G04',mode:'transfer',targetOrgId:'G05'}).ok,true);
    const old=S.workbenchGroups(p,'G04',false).headcounts.find(g=>g.position.id==='C1-P01');
    const current=S.workbenchGroups(p,'G05',false).headcounts.find(g=>g.position.id==='C1-P01');
    assert.equal(old.removedHcs[0].id,'C1-H10');assert.equal(old.totalCount,0);assert.equal(current.removedHcs.length,0);
    S.load();assert.equal(S.workbenchGroups(S.getPlan(p.id),'G04',false).headcounts[0].removedHcs.length,1);
    S.apply(p.id,'restoreHeadcounts',{headcountIds:['C1-H10']});
    assert.equal(S.G.hc(S.getPlanData(p.id).cur,'C1-H10').removedOrgId,undefined);
  });
  test('匹配候选变化：旧预览不能意外应用另一套配对',()=>{
    const p=S.getPlan('plan-case1');S.apply(p.id,'releaseHeadcounts',{personIds:['C1-E01']});
    const pv=S.apply(p.id,'matchPreview',{orgId:'G04'});
    S.apply(p.id,'removeHeadcountsByIds',{headcountIds:[pv.pairs[0].hcId]});
    const before=JSON.stringify(S.getPlanData(p.id));
    const r=S.apply(p.id,'applyAutoMatch',{orgId:'G04',expectedPairs:pv.pairs});
    assert.equal(r.ok,false);assert.match(r.error,/重新预览/);assert.equal(JSON.stringify(S.getPlanData(p.id)),before);
  });
  test('带编职级校验：按实际编制职级验证，整批失败无写入',()=>{
    const p=S.getPlan('plan-case1'),g=S.getPlanData(p.id).cur;
    S.G.hc(g,'C1-H01').level='P6-1'; // 人员 P5-1，实际编制 P6-1
    const before=JSON.stringify(S.getPlanData(p.id));
    const r=S.apply(p.id,'transferPersons',{rows:[{personId:'C1-E01',targetPositionId:'C1-P07',managerId:'M04',bringHeadcount:true}]});
    assert.equal(r.ok,false);assert.ok(r.rowErrors.some(e=>e && /P6-1/.test(e.message)));assert.equal(JSON.stringify(S.getPlanData(p.id)),before);
  });
  test('对比投影：空职位隐藏但完整职位差异保留',()=>{
    const p=S.getPlan('plan-case1');const pos=S.apply(p.id,'addPosition',{orgId:'G04',name:'未来准备',levelMin:'P3-1',levelMax:'P5-4'});
    const all=nodes=>nodes.flatMap(n=>[...n.positions,...all(n.children)]);
    assert.equal(all(S.chartTree(p.id,'R')).some(p=>p.id===pos.id),false);
    assert.equal(S.diffPlan(p).positions.some(p=>p.id===pos.id),true);
    S.apply(p.id,'addHeadcounts',{positionId:pos.id,level:'P4-2',count:1});
    assert.equal(all(S.chartTree(p.id,'L')).some(p=>p.id===pos.id),false);assert.equal(all(S.chartTree(p.id,'R')).some(p=>p.id===pos.id),true);
  });
  return results;
};
