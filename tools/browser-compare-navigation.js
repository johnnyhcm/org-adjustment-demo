/* 对比返回回归：顶层误带 embed 参数与工作台真实 iframe 必须区分。 */
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const baseUrl = (process.env.BASE_URL || 'http://127.0.0.1:8120').replace(/\/$/, '');
(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' }) });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage(), errors = [];
  page.setDefaultTimeout(10000); page.on('pageerror', e => errors.push(e.message));
  const settle = async target => target.evaluate(async () => {
    window.vm = document.querySelector('#app').__vue_app__._container._vnode.component.proxy;
    await vm.$nextTick(); for (let i = 0; i < 5; i++) await new Promise(requestAnimationFrame);
  });
  try {
    for (const query of ['&embed=1', '', '&embed=1&mode=submit', '&mode=submit']) {
      await page.goto(baseUrl + '/04-前后对比.html?plan=plan-case2' + query);
      await page.waitForSelector('.cmp-toolbar'); await settle(page);
      assert.equal(await page.evaluate(() => vm.embed), false, '顶层即使误带 embed=1 也不能隐藏返回入口');
      assert.equal(await page.locator('html').evaluate(el => el.classList.contains('cmp-embed')), false);
      const before = await page.evaluate(() => JSON.stringify(OA.store.getPlanData('plan-case2').cur));
      const returnName = query.includes('submit') ? '返回调整' : '返回工作台';
      await page.getByRole('button', { name: returnName, exact: true }).click();
      await page.waitForURL(url => decodeURIComponent(url.pathname).endsWith('/03-工作台.html'));
      await page.waitForSelector('.wb-data-panels');
      assert.equal(new URL(page.url()).searchParams.get('plan'), 'plan-case2');
      assert.equal(await page.evaluate(() => JSON.stringify(OA.store.getPlanData('plan-case2').cur)), before, '返回不修改业务数据');
    }
    console.log('PASS 顶层四种地址：日常／提交、带／不带 embed 参数均可返回同方案工作台');
    await settle(page);
    await page.evaluate(() => { vm.currentOrgId = 'G04'; vm.rpKeyword = '王'; }); await settle(page);
    const state = await page.evaluate(() => ({ org: vm.currentOrgId, keyword: vm.rpKeyword }));
    for (const label of ['前后对比', '提交']) {
      await page.getByRole('button', { name: label === '提交' ? /^提\s*交$/ : label, exact: true }).click();
      const frame = await (await page.waitForSelector('.compare-iframe')).contentFrame();
      await frame.waitForSelector('.cmp-toolbar'); await settle(frame);
      assert.equal(await frame.evaluate(() => vm.embed && window.self !== window.top), true, '工作台内继续使用真实嵌入模式');
      assert.equal(await frame.getByRole('button', { name: /返回工作台|返回调整/ }).count(), 0, '嵌入页通过父弹框关闭返回');
      await frame.getByRole('button', { name: /^全\s*屏$/ }).click(); await settle(frame);
      await frame.getByRole('button', { name: '退出全屏', exact: true }).click(); await settle(frame);
      await page.getByRole('button', { name: 'Close', exact: true }).click();
      await page.waitForSelector('.compare-iframe', { state: 'detached' });
      assert.equal(await page.locator('.wb-data-panels').isVisible(), true);
      assert.deepEqual(await page.evaluate(() => ({ org: vm.currentOrgId, keyword: vm.rpKeyword })), state, '关闭弹框保留原工作台组织及搜索上下文');
    }
    assert.deepEqual(errors, []);
    console.log('PASS 工作台两个入口：全屏退出后关闭弹框、返回工作台、保留组织与搜索上下文');
  } finally { await context.close(); await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
