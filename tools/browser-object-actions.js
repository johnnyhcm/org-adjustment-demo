/* 隔离浏览器验证职位按状态多选、取消新增及失效位置操作。 */
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base=(process.env.BASE_URL || 'http://127.0.0.1:9127').replace(/\/$/,'');
(async()=>{
  const browser=await chromium.launch({headless:true,channel:'chrome'});
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  const modal=()=>page.locator('.ant-modal:visible').last();
  const bind=()=>page.evaluate(()=>{window.vm=document.querySelector('#app').__vue_app__._container._vnode.component.proxy;});
  const actionStyle=locator=>locator.evaluate(el=>{
    const s=getComputedStyle(el);
    return Object.fromEntries(['fontSize','fontWeight','lineHeight','height','padding','borderRadius','color','backgroundColor'].map(k=>[k,s[k]]));
  });
  const openManager=async org=>{
    await page.evaluate(id=>vm.selectOrg(id),org);
    await page.locator('[data-org-id="'+org+'"] .tree-action-trigger').click();
    await page.getByRole('menuitem',{name:'管理职位',exact:true}).click();
    await page.locator('.pm-position-table').waitFor();
    await page.getByRole('menuitem',{name:'管理职位',exact:true}).waitFor({state:'hidden'});
  };
  const closeManager=async()=>{await modal().getByRole('button',{name:/^关\s*闭$/}).click();await page.waitForFunction(()=>!vm.pm.open);};
  const chooseOrg=async name=>{
    await modal().locator('.ant-select').first().click();
    await page.locator('.ant-select-dropdown:visible').getByText(name,{exact:true}).click();
  };
  try {
    await page.goto(base+'/03-工作台.html?plan=plan-case1');await page.waitForSelector('.wb-data-panels');await bind();
    const fixture=await page.evaluate(()=>{
      const S=OA.store,ids=['批量有效甲','批量有效乙','取消新增验证'].map(name=>S.apply(vm.plan.id,'addPosition',{orgId:'G04',name,levelMin:'P1-1',levelMax:'P6-4'}).id);
      ids.slice(0,2).forEach(id=>S.getPlanData(vm.plan.id).base.positions.push({...S.G.position(vm.g,id)}));
      S.retryPersist(vm.plan.id);return ids;
    });
    await openManager('G04');
    // 弹框挂载到 body，仍须和工作台内入口保持相同外观及键盘行为。
    const positionAction=page.locator('[data-row-key="'+fixture[0]+'"] .object-action-trigger');
    const orgAction=page.locator('[data-org-id="G04"] .object-action-trigger');
    const hcAction=page.locator('.wb-mid .rp-hc .object-action-trigger').first();
    for(const width of [1060,1280,1440]){
      await page.setViewportSize({width,height:1000});
      await page.mouse.move(0,0);
      assert.deepEqual(await actionStyle(positionAction),await actionStyle(orgAction));
      assert.deepEqual(await actionStyle(hcAction),await actionStyle(orgAction));
      assert.equal(await positionAction.textContent(),'操作 ▾');
      await positionAction.focus();await page.keyboard.press('Enter');
      await page.getByRole('menuitem',{name:'编辑',exact:true}).waitFor();
      assert.deepEqual(await page.locator('.ant-dropdown:visible').getByRole('menuitem').allTextContents(),['编辑','复制','停用']);
      await page.locator('.pm-footer .muted').click();await positionAction.blur();
      await page.getByRole('menuitem',{name:'编辑',exact:true}).waitFor({state:'hidden'});
    }
    console.log('PASS 三类操作入口样式一致、1060／1280／1440 及键盘展开职位菜单');
    for(const id of fixture.slice(0,2))await page.locator('[data-row-key="'+id+'"] input.pm-check').check();
    assert.deepEqual(await page.locator('.pm-selection-bar a').allTextContents(),['转移','复制','停用','取消选择']);
    await page.locator('.pm-selection-bar').getByText('停用',{exact:true}).click();
    await modal().getByRole('button',{name:'确认停用',exact:true}).click();await page.waitForFunction(()=>!vm.selectedPositionIds.length);
    await page.locator('[data-row-key="'+fixture[0]+'"] input.pm-check').check();
    assert.deepEqual(await page.locator('.pm-selection-bar a').allTextContents(),['启用','取消选择']);
    await page.getByText('全选已停用职位',{exact:true}).click();assert.equal(await page.evaluate(()=>vm.selectedPositionIds.length),2);
    await page.locator('.pm-selection-bar').getByText('启用',{exact:true}).click();
    await modal().getByRole('button',{name:'确认启用',exact:true}).click();await page.waitForFunction(()=>!vm.selectedPositionIds.length);
    assert.deepEqual(await page.evaluate(ids=>ids.map(id=>OA.store.G.position(vm.g,id).status),fixture.slice(0,2)),['有效','有效']);
    // 新增职位实际通过行菜单取消，而非靠数据层夹具删除。
    await page.locator('[data-row-key="'+fixture[2]+'"]').getByText('操作 ▾',{exact:true}).click();
    await page.getByRole('menuitem',{name:'取消新增',exact:true}).click();await modal().getByRole('button',{name:'取消新增',exact:true}).click();
    await page.waitForFunction(id=>!OA.store.G.position(vm.g,id),fixture[2]);await closeManager();
    await page.getByRole('button',{name:/^撤\s*销$/}).click();await page.waitForFunction(id=>!!OA.store.G.position(vm.g,id),fixture[2]);
    await page.getByRole('button',{name:/^重\s*做$/}).click();await page.reload();await page.waitForSelector('.wb-data-panels');await bind();
    assert.equal(await page.evaluate(id=>!!OA.store.G.position(vm.g,id),fixture[2]),false);
    console.log('PASS 职位有效／停用多选菜单、全选、批量启停及新增取消／撤销／重做／刷新');
    const vacancy=await page.evaluate(()=>{
      const S=OA.store,r=S.apply(vm.plan.id,'addHeadcounts',{positionId:'C1-P03',count:1,level:'P4-2'});if(!r.ok)throw Error(r.error);
      const stop=S.apply(vm.plan.id,'stopOrg',{orgId:'G05',mode:'manual'});if(!stop.ok)throw Error(stop.error);return r.ids[0];
    });
    await openManager('G05');await page.locator('[data-row-key="C1-P03"]').getByRole('button',{name:'操作 ▾',exact:true}).click();await page.getByRole('menuitem',{name:'复制',exact:true}).click();
    assert.equal(await page.evaluate(()=>vm.posForm.orgId),null);await chooseOrg('产品部');
    await modal().getByRole('button',{name:/^确\s*认$/}).click();await page.waitForFunction(()=>!vm.posForm.open);await closeManager();
    await page.evaluate(()=>vm.selectOrg('G05'));
    await page.locator('[data-hc-id="'+vacancy+'"]').getByRole('button',{name:'操作 ▾',exact:true}).click();
    for(const label of ['绑定员工','绑定兼职','复制']){
      const item=page.getByRole('menuitem',{name:label,exact:true});await item.waitFor();assert.match(await item.getAttribute('class'),/disabled/);assert.match(await item.getAttribute('title'),/已停用/);
    }
    for(const label of ['调编','减编'])assert.doesNotMatch(await page.getByRole('menuitem',{name:label,exact:true}).getAttribute('class'),/disabled/);
    await page.keyboard.press('Escape');
    console.log('PASS 停用来源职位单项复制到有效组织、空编绑定／复制提前禁用且调编／减编保留');
    await page.goto(base+'/03-工作台.html?plan=plan-case2');await page.waitForSelector('.wb-data-panels');await bind();await page.evaluate(()=>vm.selectOrg('G04'));
    await page.locator('.rp-post').first().waitFor();assert.equal(await page.locator('.rp-post').getByRole('button',{name:'调岗',exact:true}).count(),0);
    const person=await page.evaluate(()=>vm.peopleSelectableItems.find(p=>p.headcountId)?.id);assert.ok(person);
    await page.locator('.wb-right [data-person-id="'+person+'"] input.pos-check').check();
    await page.locator('.rp-batch-bar').getByRole('button',{name:'解除绑定',exact:true}).click();
    assert.match(await modal().textContent(),/仅解除主职编制，不停止兼职/);await modal().getByRole('button',{name:/^取\s*消$/}).click();
    assert.equal(await page.getByText('新增组织',{exact:true}).count()>0,true);
    assert.deepEqual(errors,[]);console.log('PASS 兼职行无调岗、批量解除绑定说明及统一新增文案，无页面／控制台错误');
  } finally {await context.close();await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
