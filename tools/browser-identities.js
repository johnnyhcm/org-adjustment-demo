/* 临时身份的真实页面展示与旧草稿刷新；使用独立上下文。 */
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base=(process.env.BASE_URL || 'http://127.0.0.1:8117').replace(/\/$/,'');
(async()=>{
  const browser=await chromium.launch({headless:true,channel:'chrome'}),context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];
  page.setDefaultTimeout(10000);
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  const bind=()=>page.evaluate(()=>{window.vm=document.querySelector('#app').__vue_app__._container._vnode.component.proxy;});
  const modal=()=>page.locator('.ant-modal:visible');
  const cancel=async()=>{await modal().getByRole('button',{name:'取 消',exact:true}).click();await page.waitForFunction(()=>![...document.querySelectorAll('.ant-modal')].some(el=>el.getClientRects().length));};
  try{
    await page.goto(base+'/03-工作台.html?plan=plan-case1');await page.waitForSelector('.wb-data-panels');await bind();
    const t=await page.evaluate(()=>{
      const run=(type,payload)=>{const r=OA.store.apply(vm.plan.id,type,payload);if(!r.ok)throw new Error(r.error);return r;};
      const org=run('addOrg',{parentId:'G04',name:'临时身份部门',leaderId:'M03'}),pos=run('addPosition',{orgId:org.id,name:'临时身份职位',levelMin:'P3-1',levelMax:'P5-4'}),hcs=run('addHeadcounts',{positionId:pos.id,level:'P4-2',count:3});
      run('removeHeadcountsByIds',{headcountIds:[hcs.ids[0]]});vm.selectOrg(org.id);return {org:org.id,pos:pos.id,ids:hcs.ids.slice(1)};
    });
    const codes=()=>page.locator('.wb-mid .hc-code').allTextContents();
    assert.deepEqual(await codes(),['新增编制 002','新增编制 003']);
    await page.locator('.wb-mid .hc-code').first().click();await modal().waitFor();
    assert.match(await modal().textContent(),/新增编制 002/);assert.match(await modal().textContent(),/正式编码：生效时生成/);
    await modal().locator('.ant-btn-primary').click();await page.waitForFunction(()=>![...document.querySelectorAll('.ant-modal')].some(el=>el.getClientRects().length));
    await page.evaluate(t=>vm.openOrgForm('edit',t.org),t);await modal().waitFor();
    assert.equal(await modal().locator('input[disabled]').first().inputValue(),'生效时生成');await cancel();
    await page.evaluate(()=>vm.openOrgForm('edit','G04'));await modal().waitFor();
    assert.equal(await modal().locator('input[disabled]').first().inputValue(),await page.evaluate(()=>OA.store.G.org(vm.g,'G04').code));await cancel();
    await page.getByPlaceholder('搜索组织名称 / 编码 / 路径').fill('新增组织 001');
    await page.locator('[data-org-id="'+t.org+'"] .tree-card').waitFor();await page.getByPlaceholder('搜索组织名称 / 编码 / 路径').fill('');
    await page.getByPlaceholder('搜索编制 / 占用人 / 招聘需求').fill('新增编制 003');await page.waitForFunction(()=>document.querySelectorAll('.wb-mid .hc-code').length===1);
    assert.deepEqual(await codes(),['新增编制 003']);await page.getByPlaceholder('搜索编制 / 占用人 / 招聘需求').fill('');
    await page.waitForFunction(()=>document.querySelectorAll('.wb-mid .hc-code').length===2);
    await page.locator('.wb-mid input[type="checkbox"]').first().check();
    await page.locator('.rp-hc-batch').getByRole('button',{name:'变更',exact:true}).click();await modal().waitFor();
    await modal().getByText('已选 2 个可用空编',{exact:true}).click();await page.locator('.hc-selection-list:visible').waitFor();
    assert.match(await page.locator('.hc-selection-list:visible').textContent(),/新增编制 002/);assert.match(await page.locator('.hc-selection-list:visible').textContent(),/新增编制 003/);
    await modal().locator('.ant-modal-title').click({position:{x:20,y:10}});await cancel();
    await page.locator('.rp-hc-batch').getByRole('button',{name:'减编',exact:true}).click();await modal().waitFor();
    assert.deepEqual(await modal().locator('.rd-hc').allTextContents(),['新增编制 002（P4-2，C类）','新增编制 003（P4-2，C类）']);await cancel();
    await page.reload();await page.waitForSelector('.wb-data-panels');await bind();await page.evaluate(t=>vm.selectOrg(t.org),t);
    assert.deepEqual(await codes(),['新增编制 002','新增编制 003']);
    console.log('PASS 新对象编码留空、正式编码字段、详情、搜索、批量明细、减编确认及刷新');
    await page.goto(base+'/04-前后对比.html?plan=plan-case1');await page.waitForSelector('.cmp-chart');await bind();
    for(const [tab,label] of [['组织','新增组织 001'],['职位','新增职位 001'],['编制','新增编制 003']]){
      await page.evaluate(tab=>{vm.tab=tab;},tab);await page.getByPlaceholder('搜索名称 / 编码',{exact:true}).fill(label);
      await page.waitForFunction(()=>document.querySelectorAll('.cl-table-row').length===1);
      assert.match(await page.locator('.cl-table-row').textContent(),new RegExp(label));
    }
    await page.evaluate(()=>{vm.showDetails=true;vm.kw='新增职位 001';vm.refreshSearch();});
    assert.equal(await page.evaluate(t=>vm.hitSet.has('R'+t.pos),t),true);
    await page.evaluate(()=>{vm.kw='新增组织 001';vm.refreshSearch();});assert.equal(await page.evaluate(t=>vm.hitSet.has('R'+t.org),t),true);
    // 注入旧版模拟编码，只迁移新对象，不重置现有数据或快照。
    await page.evaluate(()=>{
      const S=OA.store,key=S.STORAGE_PREFIX+'plan.'+vm.plan.id,pd=JSON.parse(localStorage.getItem(key));
      const lists=['orgs','positions','headcounts'];for(const list of lists)for(const o of pd.cur[list])if(!pd.base[list].some(b=>b.id===o.id))o.code='OLD-'+o.id;
      pd.versions=[{v:1,submittedAt:'2026-11-18 12:00',approvals:[],snapshot:JSON.parse(JSON.stringify(pd.cur))}];
      window.originalSnapshot=JSON.stringify(pd.versions[0].snapshot);localStorage.setItem('identity.snapshot',window.originalSnapshot);
      localStorage.setItem(key,JSON.stringify(pd));localStorage.setItem(S.STORAGE_PREFIX+'schema','11');
    });
    await page.reload();await page.waitForSelector('.cmp-chart');await bind();
    assert.equal(await page.evaluate(()=>JSON.stringify(OA.store.getPlanData(vm.plan.id).versions[0].snapshot)===localStorage.getItem('identity.snapshot')),true);
    assert.equal(await page.evaluate(t=>OA.store.displayCode(vm.plan,'headcount',t.ids[0],OA.store.getPlanData(vm.plan.id).versions[0].snapshot),t),'新增编制 002');
    assert.equal(await page.evaluate(t=>OA.store.G.hc(vm.g,t.ids[0]).code,t),'');
    assert.deepEqual(errors,[]);console.log('PASS 对比清单、图搜索及旧草稿迁移，旧版本原文保留并统一占位投影');
  }finally{await context.close();await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
