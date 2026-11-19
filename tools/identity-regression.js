/* 新增对象临时身份、正式编码延迟分配及旧草稿兼容。 */
const assert=require('node:assert/strict');
module.exports=function(){
  const S=OA.store,pid='plan-case1',results=[];
  const plan=()=>S.getPlan(pid),pd=()=>S.getPlanData(pid),g=()=>pd().cur;
  const apply=(type,payload={})=>{const result=S.apply(pid,type,payload);assert.equal(result.ok,true,result.error);return result;};
  const test=(name,fn)=>{try{S.resetAll();fn();results.push({name,pass:true});}catch(e){results.push({name,pass:false,error:e.stack});}};
  const setup=()=>{
    const org=apply('addOrg',{parentId:'G04',name:'临时部门',leaderId:'M03',code:'N1001'});
    const pos=apply('addPosition',{orgId:org.id,name:'临时职位',levelMin:'P3-1',levelMax:'P5-4',code:'GW9001'});
    const hcs=apply('addHeadcounts',{positionId:pos.id,level:'P4-2',count:3,code:'202612010001'});
    return {org:org.id,pos:pos.id,ids:hcs.ids};
  };
  const kinds={org:'orgs',position:'positions',headcount:'headcounts'};
  const checkCodes=graph=>Object.entries(kinds).forEach(([kind,list])=>{
    const labels=new Set();graph[list].forEach(item=>{
      const original=pd().base[list].find(b=>b.id===item.id);
      assert.equal(item.code,original?original.code:'');
      if(!original){const label=S.displayCode(plan(),kind,item.id,graph);assert.match(label,/^新增(组织|职位|编制) \d{3,}$/);assert.ok(!labels.has(label));labels.add(label);}
    });
  });
  test('临时身份：所有新增和复制入口不分配正式编码，层级与引用独立',()=>{
    // 模拟生效数据已占用旧生成器会给出的编码。
    for(const [list,id,code] of [['orgs','G04','N1001'],['positions','C1-P01','GW9001'],['headcounts','C1-H01','202612010001']]){
      pd().base[list].find(x=>x.id===id).code=code;g()[list].find(x=>x.id===id).code=code;
    }
    const t=setup();
    assert.equal(S.G.position(g(),t.pos).orgId,t.org);t.ids.forEach(id=>assert.equal(S.G.hc(g(),id).positionId,t.pos));
    const copied=apply('copyOrg',{id:'G03',parentId:'G04',name:'完整复制',copyMode:'subtreePositions',leaderId:'M03'});
    assert.ok(copied.orgIds.length>1);assert.ok(copied.positionIds.length>1);
    copied.positionIds.forEach(id=>assert.ok(copied.orgIds.includes(S.G.position(g(),id).orgId)));
    apply('copyPosition',{id:t.pos,name:'复制临时职位',orgId:t.org});
    checkCodes(g());assert.equal(new Set(g().orgs.map(x=>x.id)).size,g().orgs.length);
    S._internals.assertGraph(g());
  });
  test('占位序号：删除前项、排序、撤销重做、刷新及另建均保持稳定且不复用',()=>{
    const t=setup(),last=S.displayCode(plan(),'headcount',t.ids[2]);
    apply('removeHeadcountsByIds',{headcountIds:[t.ids[0]]});
    assert.equal(S.displayCode(plan(),'headcount',t.ids[2]),last);
    assert.equal(S.undo(pid).ok,true);assert.equal(S.redo(pid).ok,true);
    S.load();assert.equal(S.displayCode(plan(),'headcount',t.ids[2]),last);
    const added=apply('addHeadcounts',{positionId:t.pos,level:'P4-2',count:1});
    assert.equal(S.displayCode(plan(),'headcount',added.ids[0]),'新增编制 004');
    assert.equal(S.undo(pid).ok,true);const next=apply('addHeadcounts',{positionId:t.pos,level:'P4-2',count:1});
    assert.equal(S.displayCode(plan(),'headcount',next.ids[0]),'新增编制 005');
    assert.equal(S.displayCode(plan(),'headcount',t.ids[2]),last);checkCodes(g());
  });
  test('临时身份：人员绑定、兼职绑定及调岗继续引用临时编制，整步撤销恢复',()=>{
    const t=setup();
    apply('transferPersons',{rows:[{personId:'C1-E01',targetPositionId:t.pos,managerId:'M03',bringHeadcount:false}]});
    assert.equal(S.G.person(g(),'C1-E01').headcountId,t.ids[0]);
    apply('bindHeadcount',{headcountId:t.ids[1],personId:'C1-E02',assignmentType:'post',term:'长期'});
    const post=g().posts.find(x=>x.headcountId===t.ids[1]);assert.equal(post.concurrentPositionId,t.pos);
    assert.equal(S.G.hc(g(),t.ids[1]).postId,post.id);checkCodes(g());
    const before=JSON.stringify(g());assert.equal(S.undo(pid).ok,true);assert.equal(S.redo(pid).ok,true);
    S.load();assert.equal(JSON.stringify(g()),before);S._internals.assertGraph(g());
  });
  test('自动占编：已有编码优先，新空编按数字序号分配，预览显示占位标识',()=>{
    const t=setup();apply('addHeadcounts',{positionId:t.pos,level:'P4-2',count:9});
    apply('removeHeadcountsByIds',{headcountIds:[t.ids[0]]});
    apply('moveHeadcountsByIds',{headcountIds:['C1-H10'],targetPositionId:t.pos});
    g().headcounts.reverse();
    const rows=['C1-E01','C1-E02','C1-E03','C1-E04'].map(personId=>({personId,targetPositionId:t.pos,managerId:'M03',bringHeadcount:false}));
    const preview=apply('previewTransfer',{rows});
    assert.deepEqual(preview.assignments.map(a=>a.headcountId),['C1-H10','NH2','NH3','NH4']);
    assert.equal(preview.assignments[1].code,'新增编制 002');
    const applied=apply('transferPersons',{rows});assert.deepEqual(applied.assignments,preview.assignments);checkCodes(g());
  });
  test('旧草稿兼容：v7—v11 保留身份、绑定、撤销和原始审批快照，仅清模拟编码',()=>{
    for(const schema of ['7','8','9','10','11']){
      S.resetAll();const t=setup();
      apply('transferPersons',{rows:[{personId:'C1-E01',targetPositionId:t.pos,managerId:'M03',bringHeadcount:false}]});
      apply('editOrg',{id:t.org,name:'迁移后保留部门'});assert.equal(S.undo(pid).ok,true);
      const key=S.STORAGE_PREFIX+'plan.'+pid,data=JSON.parse(localStorage.getItem(key));
      const legacyCode=graph=>Object.values(kinds).forEach(list=>graph[list].forEach(item=>{if(!data.base[list].some(b=>b.id===item.id))item.code='OLD-'+item.id;}));
      legacyCode(data.cur);[...data.history.undo,...data.history.redo].forEach(f=>legacyCode(f.state.cur));
      data.versions=[{v:1,submittedAt:'2026-11-18 12:00',approvals:[],snapshot:JSON.parse(JSON.stringify(data.cur))}];
      const snapshot=JSON.stringify(data.versions[0].snapshot),base=JSON.stringify(data.base),ids=JSON.stringify(data.cur.persons);
      localStorage.setItem(key,JSON.stringify(data));localStorage.setItem(S.STORAGE_PREFIX+'schema',schema);S.load();
      assert.equal(JSON.stringify(pd().base),base);assert.equal(JSON.stringify(g().persons),ids);checkCodes(g());
      assert.equal(JSON.stringify(pd().versions[0].snapshot),snapshot);
      assert.equal(S.displayCode(plan(),'headcount',t.ids[0],pd().versions[0].snapshot),'新增编制 001');
      assert.equal(S.redo(pid).ok,true);assert.equal(S.G.org(g(),t.org).name,'迁移后保留部门');checkCodes(g());
      assert.equal(S.undo(pid).ok,true);checkCodes(g());S.load();checkCodes(g());
      assert.equal(S.G.person(g(),'C1-E01').headcountId,t.ids[0]);
      assert.equal(localStorage.getItem(S.STORAGE_PREFIX+'schema'),'12');
    }
  });
  test('审批与模拟生效：新快照不预占正式编码，退回重提不改变旧版本或临时引用',()=>{
    const t=setup();apply('submit');
    const first=JSON.stringify(pd().versions[0].snapshot);checkCodes(pd().versions[0].snapshot);
    apply('demoReturn',{comment:'补充说明'});apply('editOrg',{id:t.org,name:'审批后修订'});apply('submit');
    assert.equal(JSON.stringify(pd().versions[0].snapshot),first);checkCodes(pd().versions[1].snapshot);
    apply('demoApprove');apply('demoExecuteSuccess');S.load();assert.equal(plan().status,'已生效');checkCodes(g());
    assert.equal(S.displayCode(plan(),'headcount',t.ids[0]),'新增编制 001');
    assert.equal(S.G.position(g(),t.pos).orgId,t.org);t.ids.forEach(id=>assert.equal(S.G.hc(g(),id).positionId,t.pos));
  });
  test('错误提示与匹配预览：新增编制使用同一占位标识，不泄露临时 ID',()=>{
    const added=apply('addHeadcounts',{positionId:'C1-P01',level:'P4-2',count:1});
    const result=S.apply(pid,'moveHeadcountsByIds',{headcountIds:added.ids,targetPositionId:'C1-P01',level:'P7-1'});
    assert.equal(result.ok,false);assert.match(result.error,/新增编制 001/);assert.doesNotMatch(result.error,/NH1/);
    const h=S.G.hc(g(),added.ids[0]);h.personId='C1-E01';
    assert.throws(()=>S._internals.assertGraph(g()),/新增编制 001/);h.personId=null;
    apply('releaseHeadcount',{personId:'C1-E01'});
    // 保留新增名额作为唯一空编候选，预览不生成正式编码。
    apply('removeHeadcountsByIds',{headcountIds:g().headcounts.filter(x=>x.positionId==='C1-P01' && x.state==='可用' && x.id!==h.id).map(x=>x.id)});
    const preview=apply('matchPreview',{positionId:'C1-P01'});assert.equal(preview.pairs[0].hcCode,'新增编制 001');
    assert.equal(S.G.hc(g(),h.id).code,'');
  });
  return results;
};
