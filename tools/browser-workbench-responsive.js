/* 窄屏工作台布局回归；使用隔离浏览器上下文，不修改用户已有方案。 */
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const baseUrl = (process.env.BASE_URL || 'http://127.0.0.1:8117').replace(/\/$/, '');

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' }) });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  try {
    await page.goto(baseUrl + '/03-工作台.html?plan=plan-case2');
    await page.waitForSelector('.wb-data-panels');
    await page.evaluate(() => {
      window.vm = document.querySelector('#app').__vue_app__._container._vnode.component.proxy;
      OA.store.apply('plan-case2', 'editPosition', { id: 'C2-P01', name: '高级产品规划与用户体验设计专家' });
    });
    for (const width of [1024, 1060, 1180, 1279, 1280, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const orgId of ['G04', 'G05']) {
        await page.evaluate(id => vm.selectOrg(id), orgId);
        await page.waitForFunction(() => {
          const tops = ['.wb-left', '.wb-mid', '.wb-right'].map(s => document.querySelector(s + ' .wb-toolbar').getBoundingClientRect().top);
          return tops.every(y => Math.abs(y - tops[0]) < 1);
        });
        const failures = await page.evaluate(narrow => {
          const failures = [], rect = el => el.getBoundingClientRect();
          const inside = (child, parent, label) => {
            const c = rect(child), p = rect(parent);
            if (c.left < p.left - 1 || c.right > p.right + 1) failures.push(label + ' 越界');
          };
          const panel = document.querySelector('.wb-mid');
          for (const row of panel.querySelectorAll('.rp-hc:not(.rp-hc-removed)')) {
            const code = row.querySelector('.hc-code'), info = row.querySelector('.wb-hc-info'), action = row.querySelector('.rp-hc-actions');
            for (const child of row.children) inside(child, row, code.textContent + ' ' + child.className);
            const tags = [...row.querySelector('.wb-row-tags').children];
            for (const tag of tags) inside(tag, row, code.textContent + ' 胶囊');
            if (tags.some(tag => Math.abs(rect(tag).top - rect(tags[0]).top) > 1)) failures.push('胶囊换行');
            if (narrow ? rect(info).top < rect(code).bottom : rect(info).top >= rect(code).bottom) failures.push('编制信息排布不符');
            if (action) {
              if (rect(info).right > rect(action).left + 1) failures.push('信息与操作重叠');
              if (Math.abs(rect(action).right - rect(row).right + 6) > 1) failures.push('操作未右对齐');
              if (narrow && rect(action).top < rect(code).bottom) failures.push('操作未到第二行');
            }
          }
          for (const head of panel.querySelectorAll('.wb-group-head')) {
            const title = head.querySelector('.wb-group-toggle'), stats = head.querySelector('.wb-title-extra');
            if (rect(title).width < 20) failures.push('职位名被挤掉');
            for (const child of head.querySelectorAll('.wb-group-toggle,.wb-title-extra,.wb-check,.wb-inline-action')) inside(child, head, '职位头 ' + child.textContent);
            const a = rect(title), b = rect(stats);
            if (a.right > b.left + 1 && a.left < b.right - 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1) failures.push('职位名与统计重叠');
          }
          const groups = side => [...document.querySelectorAll(side + ' [data-align-key]')];
          const hc = groups('.wb-mid'), people = groups('.wb-right');
          hc.forEach((row, i) => {
            if (row.dataset.alignKey !== people[i].dataset.alignKey || Math.abs(rect(row).top - rect(people[i]).top) > 1 || Math.abs(rect(row).height - rect(people[i]).height) > 1) failures.push('共享职位轨道不对齐');
          });
          if (document.documentElement.scrollWidth > innerWidth) failures.push('页面横向溢出');
          return failures;
        }, width < 1280);
        assert.deepEqual(failures, [], width + ' ' + orgId);
        if (process.env.QA_OUTPUT_DIR && width === 1060 && orgId === 'G04') {
          const fs = require('node:fs'), path = require('node:path');
          fs.mkdirSync(process.env.QA_OUTPUT_DIR, { recursive: true });
          await page.screenshot({ path: path.join(process.env.QA_OUTPUT_DIR, 'workbench-1060-complex.png') });
        }
      }
      console.log('PASS 工作台响应式 ' + width);
      if (process.env.QA_OUTPUT_DIR && [1060, 1280].includes(width)) {
        const fs = require('node:fs'), path = require('node:path');
        fs.mkdirSync(process.env.QA_OUTPUT_DIR, { recursive: true });
        await page.screenshot({ path: path.join(process.env.QA_OUTPUT_DIR, 'workbench-' + width + '.png') });
      }
    }
    // 窄屏下真实点击菜单和职位增编，避免仅检查按钮存在。
    await page.setViewportSize({ width: 1060, height: 900 });
    await page.evaluate(() => vm.selectOrg('G05'));
    const available = page.locator('.wb-mid .rp-hc:not(.is-occupied)').first();
    await available.getByRole('button', { name: '操作⌄', exact: true }).click();
    assert.equal(await page.getByRole('menuitem').count(), 5);
    await page.getByRole('menuitem', { name: '复制', exact: true }).click();
    await page.waitForSelector('.ant-modal:visible');
    assert.equal(await page.locator('.ant-modal:visible').getByText('复制编制', { exact: true }).count(), 1);
    await page.locator('.ant-modal:visible .ant-modal-close').click();
    await page.waitForSelector('.ant-modal:visible', { state: 'hidden' });
    await page.locator('.wb-mid .wb-group-head').first().getByRole('button', { name: /增编/ }).click();
    await page.waitForSelector('.ant-modal:visible');
    assert.equal(await page.evaluate(() => vm.addHcForm.lockPos), true);
    assert.deepEqual(errors, [], '页面异常');
    console.log('PASS 窄屏菜单、复制与职位增编入口');
  } finally { await context.close(); await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
