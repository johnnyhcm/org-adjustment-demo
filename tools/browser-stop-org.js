/* 组织先停用浏览器闭环；独立上下文，不修改用户浏览器数据。 */
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base=(process.env.BASE_URL || 'http://127.0.0.1:8117').replace(/\/$/,'');
(async()=>{
  const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{channel:'chrome'})});
  try {
    for(const plan of ['plan-case1','plan-case2']){
      const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];
      page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
      try {
        const bind=()=>page.evaluate(()=>{window.vm=document.querySelector('#app').__vue_app__._container._vnode.component.proxy;vm.selectOrg('G05');});
        const modal=()=>page.locator('.ant-modal:visible');
        const openStop=async()=>{
          await page.locator('[data-org-id="G05"] .tree-action-trigger').click();
          await page.getByRole('menuitem',{name:'停用',exact:true}).click();await modal().waitFor();
        };
        await page.goto(base+'/03-工作台.html?plan='+plan);await page.waitForSelector('.wb-data-panels');await bind();
        const original=await page.evaluate(()=>JSON.stringify(vm.g));
        await openStop();
        if(plan==='plan-case2'){
          assert.equal(await modal().getByRole('button',{name:'停用组织',exact:true}).isDisabled(),true);
          assert.match(await modal().locator('.form-error').textContent(),/未来人员/);
          await modal().getByRole('button',{name:'取 消',exact:true}).click();
          assert.equal(await page.evaluate(()=>JSON.stringify(vm.g)),original);
          console.log('PASS 案例二未来人员仍阻止停用，取消无写入');
        } else {
          assert.equal(await modal().getByRole('button',{name:'停用组织',exact:true}).isEnabled(),true);
          assert.match(await modal().textContent(),/9 名在职员工/);
          await modal().getByRole('button',{name:'取 消',exact:true}).click();
          assert.equal(await page.evaluate(()=>JSON.stringify(vm.g)),original);
          await openStop();await modal().getByRole('button',{name:'停用组织',exact:true}).click();
          await page.waitForFunction(()=>!vm.stopForm.open);
          assert.equal(await page.locator('.wb-right .rp-person[data-person-id]').count(),9);
          assert.equal(await page.locator('.wb-right .rp-person button[title="所属组织已停用，请调出"]').count(),9);
          assert.equal(await page.locator('[data-org-id="G05"]').getByText('待处理',{exact:true}).count(),1);
          assert.equal(await page.locator('.wb-mid .wb-group-head button:not(:disabled)').filter({hasText:'增编'}).count(),0);
          await page.locator('.wb-right .rp-person button[title="所属组织已停用，请调出"]').first().click();
          assert.match(await modal().textContent(),/所属组织已停用，请调出/);
          await modal().getByRole('button',{name:/^知\s*道\s*了$|^确\s*定$/}).click();
          await page.locator('.wb-mid .rp-hc.is-occupied').first().getByRole('button',{name:'操作⌄',exact:true}).click();
          for(const name of ['调编','复制']) {const item=page.getByRole('menuitem',{name,exact:true});await item.waitFor();assert.equal(await item.getAttribute('aria-disabled'),'true');}
          assert.equal(await page.getByRole('menuitem',{name:'解除绑定',exact:true}).getAttribute('aria-disabled'),'false');
          await page.keyboard.press('Escape');await page.locator('.wb-col-title').first().click();
          const stopped=await page.evaluate(()=>JSON.stringify(vm.g));
          await page.getByRole('button',{name:/^撤\s*销$/}).click();assert.equal(await page.evaluate(()=>JSON.stringify(vm.g)),original);
          await page.getByRole('button',{name:/^重\s*做$/}).click();assert.equal(await page.evaluate(()=>JSON.stringify(vm.g)),stopped);
          await page.reload();await page.waitForSelector('.wb-data-panels');await bind();assert.equal(await page.evaluate(()=>JSON.stringify(vm.g)),stopped);
          for(const width of [1060,1440]){
            await page.setViewportSize({width,height:1000});
            assert.deepEqual(await page.evaluate(()=>{
              const fail=[];for(const row of document.querySelectorAll('.wb-right .rp-person')){
                const tags=[...row.querySelectorAll('.wb-person-tags > *')].map(e=>e.getBoundingClientRect());
                if(tags.some(r=>Math.abs(r.top-tags[0].top)>1))fail.push('人员胶囊换行');
              }
              if(document.documentElement.scrollWidth>innerWidth)fail.push('页面横向溢出');return fail;
            }),[]);
          }
          // 源组织停用时打开原行内表单，应等待选择有效目标，不再默认停用组织。
          const person=page.locator('.wb-right .rp-person[data-person-id="C1-E03"]');
          await person.getByRole('button',{name:'调岗',exact:true}).click();
          assert.deepEqual(await page.evaluate(()=>[vm.tf.header.orgId,vm.tf.header.posId]),[null,null]);
          await modal().getByRole('button',{name:'取 消',exact:true}).click();await page.waitForFunction(()=>!vm.tf.open);
          const target=await page.evaluate(()=>{
            const S=OA.store,p=S.apply('plan-case1','addPosition',{orgId:'G04',name:'接收项目团队',levelMin:'P1-1',levelMax:'P6-4'});
            if(!p.ok)throw new Error(p.error);
            const h=S.apply('plan-case1','addHeadcounts',{positionId:p.id,level:'P4-2',count:9});if(!h.ok)throw new Error(h.error);
            return p.id;
          });
          const oldHc=await page.evaluate(()=>OA.store.G.person(vm.g,'C1-E03').headcountId);
          await person.dragTo(page.locator('[data-org-id="G04"] .tree-card'));await modal().waitFor();
          assert.deepEqual(await page.evaluate(()=>[vm.tf.header.orgId,vm.tf.lockOrg]),['G04',true]);
          await modal().locator('.tf-position-field .ant-select-selector').click();
          await page.locator('.ant-select-dropdown:visible').getByText(/接收项目团队/).click();
          await modal().locator('.tf-bring input').uncheck();
          await page.evaluate(()=>vm.tf.header.mgrId='M02');
          await modal().getByRole('button',{name:'确认调岗',exact:true}).click();await page.waitForFunction(()=>!vm.tf.open);
          assert.deepEqual(await page.evaluate(({target,oldHc})=>[OA.store.G.person(vm.g,'C1-E03').positionId===target,!!OA.store.G.hc(vm.g,oldHc)],{target,oldHc}),[true,false]);
          await page.evaluate(()=>vm.selectOrg('G05'));
          await page.locator('.wb-right .wb-toolbar input[type="checkbox"]').check();
          assert.equal(await page.evaluate(()=>vm.selectedPersonIds.length),8);
          await page.locator('.wb-right .rp-batch-bar').getByRole('button',{name:'调岗',exact:true}).click();
          await page.evaluate(target=>{vm.tf.header.orgId='G04';vm.tf.header.posId=target;vm.tf.header.mgrId='M02';vm.tf.bring=false;},target);
          await page.waitForFunction(()=>vm.tfAllocation.boundCount===8);
          await modal().getByRole('button',{name:'确认调岗',exact:true}).click();await page.waitForFunction(()=>!vm.tf.open);
          assert.equal(await page.evaluate(()=>OA.store.computePending(vm.plan).length),0);
          assert.equal(await page.evaluate(()=>vm.g.headcounts.filter(h=>OA.store.G.position(vm.g,h.positionId).orgId==='G05').length),0);
          assert.equal(await page.evaluate(()=>OA.store.apply('plan-case1','submit',{}).ok),true);
          console.log('PASS 九人在职先停用：待处理、刷新、撤销重做、窄屏、行内入口、拖拽与批量调出、提交');
        }
        assert.deepEqual(errors,[]);
      } finally {await context.close();}
    }
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
