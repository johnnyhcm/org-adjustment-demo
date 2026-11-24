/* 本地文件全屏回归：真实 file:// 入口与真实 Permissions Policy，不修改浏览器配置。 */
const assert = require('node:assert/strict');
const { resolve } = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = resolve(__dirname, '../原型/组织调整');
const url = name => pathToFileURL(resolve(root, name)).href + '?plan=plan-case2';
(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' }) });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage(), errors = [];
  page.setDefaultTimeout(10000);
  page.on('pageerror', e => errors.push(e.message));
  const checkModes = async target => {
    assert.equal(await target.evaluate(() => document.fullscreenEnabled), true, '入口必须授权原生全屏');
    for (const mode of ['前后对比', '调整前', '调整后']) {
      await target.locator('.cmp-toolbar .ant-radio-button-wrapper').getByText(mode, { exact: true }).click();
      await target.getByRole('button', { name: /^全\s*屏$/ }).click();
      await target.waitForFunction(() => document.fullscreenElement === document.querySelector('.cmp-chart'));
      await target.getByRole('button', { name: '退出全屏', exact: true }).waitFor({ state: 'visible' });
      const fills = await target.evaluate(() => {
        const r = document.fullscreenElement.getBoundingClientRect();
        return Math.abs(r.width - innerWidth) < 1 && Math.abs(r.height - innerHeight) < 1;
      });
      assert.equal(fills, true, '原生全屏填满屏幕');
      await target.getByRole('button', { name: '退出全屏', exact: true }).click();
      await target.waitForFunction(() => !document.fullscreenElement);
    }
  };
  try {
    await page.goto(url('03-工作台.html'));
    await page.waitForSelector('.wb-data-panels');
    const before = await page.evaluate(() => JSON.stringify(OA.store.getPlanData('plan-case2')));
    for (const label of ['前后对比', '提交']) {
      await page.getByRole('button', { name: label === '提交' ? /^提\s*交$/ : label, exact: true }).click();
      const frame = await (await page.waitForSelector('.compare-iframe')).contentFrame();
      await frame.waitForSelector('.cmp-toolbar');
      await checkModes(frame);
      await page.getByRole('button', { name: 'Close', exact: true }).click();
      await page.waitForSelector('.compare-iframe', { state: 'detached' });
      assert.equal(await page.locator('.wb-data-panels').isVisible(), true);
    }
    assert.equal(await page.evaluate(() => JSON.stringify(OA.store.getPlanData('plan-case2'))), before, '进入／退出和返回不改业务数据／历史');
    console.log('PASS file:// 工作台两个入口、三模式原生全屏／退出及返回，只读数据保持');

    // 复现实际权限禁止，确认不会再误报为浏览器不支持。
    await page.getByRole('button', { name: '前后对比', exact: true }).click();
    const iframe = await page.waitForSelector('.compare-iframe');
    await iframe.evaluate(el => { el.allow = "fullscreen 'none'"; el.src = el.src; });
    const restricted = await iframe.contentFrame();
    await restricted.waitForSelector('.cmp-toolbar');
    assert.equal(await restricted.evaluate(() => document.fullscreenEnabled), false);
    await restricted.getByRole('button', { name: /^全\s*屏$/ }).click();
    await restricted.getByText('当前页面的全屏权限被限制', { exact: true }).waitFor();
    assert.equal(await restricted.getByText('当前环境不支持全屏', { exact: true }).count(), 0);
    assert.equal(await restricted.evaluate(() => !!document.fullscreenElement), false);
    console.log('PASS 真实权限拒绝显示具体原因，不误报为不支持');

    await page.goto(url('04-前后对比.html'));
    await page.waitForSelector('.cmp-toolbar');
    await checkModes(page);
    await page.getByRole('button', { name: '返回工作台', exact: true }).click();
    await page.waitForURL(u => decodeURIComponent(u.pathname).endsWith('/03-工作台.html'));
    assert.deepEqual(errors, []);
    console.log('PASS file:// 独立对比三模式原生全屏／退出及返回工作台，无页面异常');
  } finally { await context.close(); await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
