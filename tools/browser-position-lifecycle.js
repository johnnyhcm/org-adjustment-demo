/* 独立上下文验证职位保留、编辑转移、未来引用和提交／退回。 */
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base=(process.env.BASE_URL || 'http://127.0.0.1:8117').replace(/\/$/,'');
(async()=>{
  const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{channel:'chrome'})});
  try {
    for(const plan of ['plan-case1','plan-case2']) {
      const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];
      page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
      const modal=()=>page.locator('.ant-modal:visible').last();
      const bind=()=>page.evaluate(()=>{window.vm=document.querySelector('#app').__vue_app__._container._vnode.component.proxy;});
      const openManager=async org=>{
        await page.evaluate(id=>vm.selectOrg(id),org);
        await page.locator('[data-org-id="'+org+'"] .tree-action-trigger').click();
        await page.getByRole('menuitem',{name:'管理职位',exact:true}).click();
        await modal().waitFor();
      };
      const stop=async org=>{
        await page.locator('[data-org-id="'+org+'"] .tree-action-trigger').click();
        await page.getByRole('menuitem',{name:'停用',exact:true}).click();
        await modal().getByRole('button',{name:'停用组织',exact:true}).click();
        await page.waitForFunction(()=>!vm.stopForm.open);
      };
      const chooseOrg=async name=>{
        await modal().locator('.ant-select').first().click();
        await page.locator('.ant-select-dropdown:visible .ant-select-tree-title').getByText(name,{exact:true}).click();
      };
      try {
        await page.goto(base+'/03-工作台.html?plan='+plan);await page.waitForSelector('.wb-data-panels');await bind();
        if(plan==='plan-case1') {
          await page.evaluate(()=>vm.selectOrg('G05'));const before=await page.evaluate(()=>JSON.stringify(vm.g));
          await stop('G05');
          assert.equal(await page.evaluate(()=>OA.store.G.position(vm.g,'C1-P03').status),'有效');
          await page.locator('[data-org-id="G05"] .tree-action-trigger').click();await page.getByRole('menuitem',{name:'启用',exact:true}).click();
          await page.getByRole('button',{name:'确认启用',exact:true}).click();
          await page.waitForFunction(()=>OA.store.G.org(vm.g,'G05').status==='有效');
          assert.equal(await page.evaluate(()=>JSON.stringify(vm.g)),before);
          assert.equal(await page.locator('[data-org-id="G05"]').getByText('待处理',{exact:true}).count(),0);
          await stop('G05');await openManager('G05');
          await page.locator('[data-row-key="C1-P03"]').getByRole('button',{name:'操作 ▾',exact:true}).click();await page.getByRole('menuitem',{name:'编辑',exact:true}).click();
          assert.equal(await modal().locator('.ant-select').first().getAttribute('class').then(c=>c.includes('ant-select-disabled')),false);
          await chooseOrg('产品部');assert.match(await modal().textContent(),/转移整个职位/);
          await modal().getByRole('button',{name:/^确\s*认$/}).click();await page.waitForFunction(()=>!vm.posForm.open);
          assert.deepEqual(await page.evaluate(()=>[vm.pm.orgId,vm.currentOrgId,OA.store.G.position(vm.g,'C1-P03').orgId]),['G04','G04','G04']);
          await modal().getByRole('button',{name:/^关\s*闭$/}).click();
          // 设置无人组织夹具，实际点击提交确认、取消预览、提交及审批退回。
          const fixture=await page.evaluate(()=>{
            const S=OA.store,run=(op,payload)=>{const r=S.apply(vm.plan.id,op,payload);if(!r.ok)throw Error(r.error);return r;};
            // 前面的停用草稿仍有其他职位人员，先恢复组织消除这些阻断。
            run('toggleOrg',{id:'G05',action:'启用'});
            const org=run('addOrg',{parentId:'G04',name:'提交收尾验证部'}).id;
            const pos=run('addPosition',{orgId:org,name:'提交收尾职位',levelMin:'P3-1',levelMax:'P5-4'}).id;
            run('addHeadcounts',{positionId:pos,level:'P4-2',count:2});run('stopOrg',{orgId:org,mode:'manual'});
            return {org,pos,before:JSON.stringify(S.getPlanData(vm.plan.id).cur)};
          });
          await page.evaluate(id=>vm.selectOrg(id),fixture.org);
          for(const width of [1060,1440]) {
            await page.setViewportSize({width,height:1000});
            await page.locator('.wb-mid .hc-meta').first().filter({hasText:'提交时自动关闭'}).waitFor();
            assert.equal(await page.locator('.wb-mid .wb-group-head').getByText(/提交时取消新增/).count(),1);
            assert.deepEqual(await page.evaluate(()=>{
              const failures=[];
              for(const row of document.querySelectorAll('.wb-mid .rp-hc')) {
                const bounds=row.getBoundingClientRect(),button=row.querySelector('.rp-hc-actions')?.getBoundingClientRect();
                if(!button)failures.push('空编操作缺失');
                else if(button.right>bounds.right+1 || button.left<bounds.left-1)failures.push('空编操作越界');
              }
              if(document.documentElement.scrollWidth>innerWidth)failures.push('页面横向溢出');
              return failures;
            }),[]);
          }
          await page.goto(base+'/04-前后对比.html?plan='+plan+'&mode=submit');await page.getByRole('button',{name:'确认并提交审批',exact:true}).waitFor();await bind();
          assert.match(await page.locator('.cmp-footer').textContent(),/自动停用 0 个职位、关闭 2 个空编/);
          assert.match(await page.locator('.cmp-footer').textContent(),/取消新增收尾：移除 1 个组织、1 个新增空职位/);
          assert.equal(await page.evaluate(()=>JSON.stringify(OA.store.getPlanData(vm.plan.id).cur)),fixture.before);
          assert.equal(await page.evaluate(id=>!!OA.store.G.position(vm.g,id),fixture.pos),false);
          await page.getByRole('button',{name:'返回调整',exact:true}).click();await page.waitForSelector('.wb-data-panels');await bind();
          assert.equal(await page.evaluate(()=>JSON.stringify(vm.g)),fixture.before);
          await page.goto(base+'/04-前后对比.html?plan='+plan+'&mode=submit');await page.getByRole('button',{name:'确认并提交审批',exact:true}).click();
          await page.waitForURL(url=>decodeURIComponent(url.pathname).includes('05-方案详情'));await bind();
          assert.equal(await page.evaluate(id=>!!OA.store.G.position(OA.store.getPlanData(vm.plan.id).cur,id),fixture.pos),false);
          await page.getByRole('button',{name:'退回…',exact:true}).click();await modal().getByPlaceholder('请填写退回意见').fill('继续调整');
          await modal().getByRole('button',{name:'确认退回',exact:true}).click();
          await page.getByRole('button',{name:'继续调整',exact:true}).click();await page.waitForSelector('.wb-data-panels');await bind();
          assert.equal(await page.evaluate(()=>JSON.stringify(vm.g)),fixture.before);
          console.log('PASS 停用／启用恢复、停用来源编辑转出、只读收尾预览、取消、提交及退回');
        } else {
          const associations=await page.evaluate(()=>JSON.stringify([vm.g.persons,vm.g.headcounts,vm.g.posts,vm.g.demands,vm.g.futureEvents]));
          await openManager('G04');await page.locator('[data-row-key="C2-P01"]').getByRole('button',{name:'操作 ▾',exact:true}).click();await page.getByRole('menuitem',{name:'编辑',exact:true}).click();
          await chooseOrg('数据部');await modal().getByRole('button',{name:/^确\s*认$/}).click();await page.waitForFunction(()=>!vm.posForm.open);
          assert.equal(await page.evaluate(()=>vm.pm.orgId),'G06');
          assert.equal(await page.evaluate(()=>JSON.stringify([vm.g.persons,vm.g.headcounts,vm.g.posts,vm.g.demands,vm.g.futureEvents])),associations);
          await modal().getByRole('button',{name:/^关\s*闭$/}).click();await openManager('G05');
          await modal().getByText('全选有效职位',{exact:true}).click();await modal().getByText('转移',{exact:true}).click();
          await chooseOrg('数据部');await modal().getByRole('button',{name:/^确\s*认$/}).click();await page.waitForFunction(()=>!vm.pmBatch.open);
          await modal().getByRole('button',{name:/^关\s*闭$/}).click();await page.evaluate(()=>vm.selectOrg('G05'));await stop('G05');
          assert.equal(await page.evaluate(()=>OA.store.previewStopOrg(vm.plan,'G05').blockingReason),'');
          assert.equal(await page.evaluate(()=>JSON.stringify([vm.g.persons,vm.g.headcounts,vm.g.posts,vm.g.demands,vm.g.futureEvents])),associations);
          await page.reload();await page.waitForSelector('.wb-data-panels');await bind();
          assert.equal(await page.evaluate(()=>OA.store.G.position(vm.g,'C2-P01').orgId),'G06');
          console.log('PASS 案例二复杂职位编辑转移、未来／预留随行、批量转移后停用及刷新');
        }
        assert.deepEqual(errors,[]);
      } finally {await context.close();}
    }
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
