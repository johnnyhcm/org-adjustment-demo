/* 已绑定编制的单条调编及复制；真实菜单／表单操作，独立浏览器上下文。 */
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base=(process.env.BASE_URL || 'http://127.0.0.1:8117').replace(/\/$/,'');
(async()=>{
  const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{channel:'chrome'})});
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  try {
    const bind=()=>page.evaluate(()=>{window.vm=document.querySelector('#app').__vue_app__._container._vnode.component.proxy;vm.selectOrg('G04');});
    const modal=()=>page.locator('.ant-modal:visible');
    const closed=()=>page.waitForFunction(()=>![...document.querySelectorAll('.ant-modal')].some(el=>el.getClientRects().length));
    async function menu(id,name){
      await page.locator('.wb-mid [data-hc-id="'+id+'"]').getByRole('button',{name:'操作⌄',exact:true}).click();
      const item=page.getByRole('menuitem',{name,exact:true});await item.waitFor();await item.click();await modal().waitFor();
    }
    async function compareRelations(snapshot){
      assert.equal(await page.evaluate(()=>JSON.stringify([vm.g.persons,vm.g.posts,vm.g.futureEvents])),snapshot);
    }
    await page.goto(base+'/03-工作台.html?plan=plan-case2');await page.waitForSelector('.wb-data-panels');await bind();
    for(const id of ['C2-H01','C2-H30','C2-H31','C2-H32']){
      const relations=await page.evaluate(()=>JSON.stringify([vm.g.persons,vm.g.posts,vm.g.futureEvents]));
      const source=await page.evaluate(id=>JSON.parse(JSON.stringify(OA.store.G.hc(vm.g,id))),id);
      const before=await page.evaluate(()=>JSON.stringify(vm.g));
      await menu(id,'调编');
      assert.equal(await modal().locator('.hc-department-field .ant-select-disabled').count(),1);
      assert.equal(await modal().locator('.hc-position-field .ant-select-disabled').count(),1);
      assert.equal(await modal().getByText('新建职位',{exact:true}).count(),0);
      assert.equal(await modal().getByText('管理职位',{exact:true}).count(),0);
      assert.match(await modal().locator('.ant-modal-title').textContent(),/已选 1 个编制/);
      await modal().getByPlaceholder('请输入工作地点',{exact:true}).fill('取消的编制地点');
      await modal().getByRole('button',{name:'取 消',exact:true}).click();await closed();
      assert.equal(await page.evaluate(()=>JSON.stringify(vm.g)),before);
      await menu(id,'调编');
      await modal().getByPlaceholder('请输入工作地点',{exact:true}).fill('上海编制地点');
      await modal().getByRole('button',{name:'确认变更',exact:true}).click();await closed();
      assert.equal(await page.evaluate(id=>OA.store.G.hc(vm.g,id).workLocation,id),'上海编制地点');
      const current=await page.evaluate(id=>JSON.parse(JSON.stringify(OA.store.G.hc(vm.g,id))),id);
      for(const key of ['id','code','positionId','state','personId','postId','demandId','floatingUntil'])assert.deepEqual(current[key],source[key]);
      await compareRelations(relations);
      const changed=await page.evaluate(()=>JSON.stringify(vm.g));
      await page.getByRole('button',{name:/^撤\s*销$/}).click();assert.equal(await page.evaluate(()=>JSON.stringify(vm.g)),before);
      await page.getByRole('button',{name:/^重\s*做$/}).click();assert.equal(await page.evaluate(()=>JSON.stringify(vm.g)),changed);
      await page.reload();await page.waitForSelector('.wb-data-panels');await bind();assert.equal(await page.evaluate(()=>JSON.stringify(vm.g)),changed);
      const ids=await page.evaluate(()=>vm.g.headcounts.map(h=>h.id));
      await menu(id,'复制');
      assert.equal(await modal().locator('.ant-modal-title').textContent(),'复制编制');
      await modal().locator('.ant-input-number-input').fill('2');
      await modal().getByRole('button',{name:'确 认',exact:true}).click();await closed();
      const copies=await page.evaluate(ids=>vm.g.headcounts.filter(h=>!ids.includes(h.id)),ids);
      assert.equal(copies.length,2);assert.equal(new Set(copies.map(h=>h.id)).size,2);assert.ok(copies.every(h=>h.code===''));
      assert.equal(await page.evaluate(ids=>new Set(ids.map(id=>OA.store.displayCode(vm.plan,'headcount',id))).size,copies.map(h=>h.id)),2);
      for(const h of copies){assert.equal(h.state,'可用');assert.equal(h.level,current.level);assert.equal(h.category,current.category);assert.equal(h.workLocation,current.workLocation);assert.ok(!h.personId && !h.postId && !h.demandId && !h.floatingUntil);}
      await compareRelations(relations);
      assert.deepEqual(await page.evaluate(id=>JSON.parse(JSON.stringify(OA.store.G.hc(vm.g,id))),id),current);
      await page.getByRole('button',{name:/^撤\s*销$/}).click();assert.equal(await page.evaluate(()=>JSON.stringify(vm.g)),changed);
      console.log('PASS '+id+' 菜单、调编锁定、取消、占用保留、复制两份、撤销重做及刷新');
    }
    // 保留原占用处理，确认危险项仍能操作，撤销后继续其他类型。
    for(const [id,label] of [['C2-H01','解除绑定'],['C2-H30','停止兼职'],['C2-H31','停止兼职'],['C2-H32','取消浮动']]){
      const before=await page.evaluate(()=>JSON.stringify(vm.g));await menu(id,label);
      await modal().locator('.ant-btn-primary').click();await closed();
      assert.equal(await page.evaluate(id=>OA.store.G.hc(vm.g,id).state,id),'可用');
      await page.getByRole('button',{name:/^撤\s*销$/}).click();assert.equal(await page.evaluate(()=>JSON.stringify(vm.g)),before);
    }
    assert.equal(await page.locator('.wb-mid [data-hc-id="C2-H33"] button:has-text("操作")').count(),0,'预留保持只读');
    for(const width of [1060,1440]){
      await page.setViewportSize({width,height:1000});
      await page.locator('.wb-mid [data-hc-id="C2-H32"]').getByRole('button',{name:'操作⌄',exact:true}).scrollIntoViewIfNeeded();
      assert.deepEqual(await page.evaluate(()=>{
        const fails=[];for(const row of document.querySelectorAll('.wb-mid .rp-hc:not(.rp-hc-removed)')){
          const r=row.getBoundingClientRect(),a=row.querySelector('.rp-hc-actions')?.getBoundingClientRect(),info=row.querySelector('.wb-hc-info')?.getBoundingClientRect();
          if(a && (a.right>r.right+1 || info.right>a.left+1))fails.push('操作越界或重叠');
          const tags=[...row.querySelectorAll('.wb-row-tags > *')].map(t=>t.getBoundingClientRect());if(tags.some(t=>Math.abs(t.top-tags[0].top)>1))fails.push('胶囊换行');
        }if(document.documentElement.scrollWidth>innerWidth)fails.push('页面溢出');return fails;
      }),[]);
    }
    assert.deepEqual(errors,[]);console.log('PASS 原占用处理菜单、预留只读及 1060／1440 布局');
  } finally {await context.close();await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
