/* 折叠后连接线回归：独立临时 Chrome 上下文，不修改用户现有方案。 */
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const baseUrl = (process.env.BASE_URL || 'http://127.0.0.1:8116').replace(/\/$/, '');

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' }) });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const settle = () => page.evaluate(async () => {
    await vm.$nextTick();
    for (let i = 0; i < 4; i++) await new Promise(requestAnimationFrame);
  });
  const paths = side => page.evaluate(side => [...vm.$refs[side + 'Tree'].querySelectorAll('.oc-connectors path')].map(p =>
    p.getAttribute('d').replace(/-?\d+(?:\.\d+)?/g, n => String(Math.round(Number(n) * 10) / 10))), side);
  async function checkCurrentLayout(label) {
    const before = await Promise.all(['left', 'right'].map(paths));
    await page.evaluate(() => vm.refreshChartConnectors());
    const current = await Promise.all(['left', 'right'].map(paths));
    assert.deepEqual(before, current, label + '：自动连线须匹配当前卡片布局');
  }
  try {
    await page.goto(baseUrl + '/04-前后对比.html?plan=plan-case1&embed=1');
    await page.waitForSelector('.cmp-toolbar');
    const planId = await page.evaluate(() => {
      const r = OA.store.apply(null, 'createPlan', {
        name: '折叠连线回归', universe: 'scopeDemo', effDate: '2026-12-01',
        adjustLevel: 'BU下设一级', adjustReason: '内部原因',
        scopeOrgIds: ['G03', 'S00'], scopeWarningsAcknowledged: true
      });
      if (!r.ok) throw new Error(r.error);
      return r.planId;
    });
    await page.goto(baseUrl + '/04-前后对比.html?plan=' + planId + '&embed=1');
    await page.waitForSelector('.cmp-toolbar');
    await page.evaluate(() => { window.vm = document.querySelector('#app').__vue_app__._container._vnode.component.proxy; });
    await settle();
    for (const details of [false, true]) {
      await page.evaluate(details => { vm.showDetails = details; }, details);
      await settle();
      assert.equal(await page.locator('.cmp-toolbar input[type="checkbox"]').count(), 2, '仅保留人编与同步移动两个开关');
      if (details) {
        const style = await page.locator('.oc-pos').first().evaluate(el => {
          const s = getComputedStyle(el), list = getComputedStyle(el.closest('.oc-details'));
          return [s.borderLeftWidth, s.borderLeftColor, s.backgroundColor, s.cursor, list.borderTopWidth, list.backgroundColor];
        });
        assert.deepEqual(style, ['2px', 'rgb(114, 46, 209)', 'rgb(255, 255, 255)', 'pointer', '0px', 'rgba(0, 0, 0, 0)']);
        assert.ok(await page.locator('.oc-person-icon').count(), '人员头像图标可见');
        assert.ok(await page.locator('.oc-hcsum').count(), '编制汇总可见');
        for (const selector of ['.oc-detail', '.oc-people', '.oc-person', '.oc-hcsum']) {
          assert.notEqual(await page.locator(selector).first().evaluate(el => getComputedStyle(el, '::before').display), 'none', selector + ' 归属短线恢复');
        }
        assert.equal(await page.locator('.oc-detail').last().evaluate(el => getComputedStyle(el, '::after').content), 'none', '最后职位没有向下尾线');
        assert.equal(await page.locator('.oc-people').first().locator('li').last().evaluate(el => getComputedStyle(el, '::after').content), 'none', '最后人编行没有向下尾线');
      } else {
        assert.equal(await page.locator('.oc-details').count(), 0, '关闭人编后隐藏全部职位及明细');
      }
      for (const zoom of [0.75, 1, 1.5]) {
        await page.evaluate(zoom => { vm.zoom = zoom; }, zoom);
        await settle();
        await checkCurrentLayout('初始展开');
        if (details) {
          assert.equal(await page.evaluate(() => ['leftTree', 'rightTree'].every(refName => {
            const tree = vm.$refs[refName], tr = tree.getBoundingClientRect();
            const ends = [...tree.querySelectorAll('.oc-connectors path')].map(p => {
              const parts = p.getAttribute('d').split(/\s+/);
              let x = 0, y = 0;
              for (let i = 0; i < parts.length;) {
                const command = parts[i++];
                if (command === 'M') { x = Number(parts[i++]); y = Number(parts[i++]); }
                else if (command === 'H') x = Number(parts[i++]);
                else if (command === 'V') y = Number(parts[i++]);
              }
              return [x, y];
            });
            return [...tree.querySelectorAll('.oc-details')].every(list => {
              const r = list.querySelector('.oc-pos').getBoundingClientRect();
              const x = (r.left - tr.left) / vm.zoom - 8, y = (r.top + r.height / 2 - tr.top) / vm.zoom;
              return ends.some(([ex, ey]) => Math.abs(ex - x) < 0.1 && Math.abs(ey - y) < 0.1);
            });
          })), true, '组织连线接到首个职位的左侧轨道与行中心');
        }
        for (const side of ['right', 'left']) {
          const other = side === 'right' ? 'left' : 'right', otherBefore = await paths(other);
          const panel = page.locator('.cmp-side').nth(side === 'left' ? 0 : 1);
          for (const id of ['G04', 'G03', 'S00']) {
            await panel.locator('[data-oc-id="' + id + '"] > .oc-head > .oc-box').click();
            await settle();
            await checkCurrentLayout('收起 ' + id + '，人编=' + details + '，缩放=' + zoom);
          }
          assert.deepEqual(await paths(side), [], '全部根节点收起后不应残留向下空线或横梁');
          assert.deepEqual(await paths(other), otherBefore, '当前图折叠不改变另一侧连线');
          for (const id of ['G03', 'S00', 'G04']) {
            await panel.locator('[data-oc-id="' + id + '"] > .oc-head > .oc-box').click();
            await settle();
            await checkCurrentLayout('展开 ' + id);
          }
          if (details) {
            await panel.locator('.oc-pos').first().click();
            await settle();
            await checkCurrentLayout('收起人编分组');
            await panel.locator('.oc-pos').first().click();
            await settle();
            await checkCurrentLayout('展开人编分组');
          }
        }
      }
    }
    await page.getByText('收起全部明细', { exact: true }).click();
    await settle();
    assert.equal(await page.locator('.oc-people').count(), 0);
    await page.getByText('展开全部明细', { exact: true }).click();
    await settle();
    assert.ok(await page.locator('.oc-person').count());
    await page.locator('.cmp-toolbar input[type="text"]').fill('项目经理');
    await settle();
    assert.ok(await page.locator('.oc-pos.oc-hit-soft').count(), '职位搜索高亮');
    await page.locator('.cmp-toolbar input[type="text"]').fill('王五');
    await settle();
    assert.ok(await page.locator('.oc-person.oc-hit-soft').count(), '人员搜索高亮并展开');
    await page.getByText('人员和编制', { exact: true }).click();
    await settle();
    assert.equal(await page.locator('.oc-details').count(), 0);
    assert.equal(await page.locator('.oc-hit-soft').count(), 0, '关闭人编后隐藏对象不参与搜索');
    await page.locator('.cmp-toolbar input[type="text"]').fill('');
    await page.getByText('人员和编制', { exact: true }).click();
    await settle();
    if (process.env.QA_OUTPUT_DIR) {
      const fs = require('node:fs'), path = require('node:path');
      fs.mkdirSync(process.env.QA_OUTPUT_DIR, { recursive: true });
      await page.evaluate(() => {
        vm.zoom = 1;
        vm.allPositionKeys.forEach(k => vm.expanded.delete(k));
        vm.expanded.add('R' + vm.rightTree[0].children.find(o => o.id === 'G05').positions[0].id);
        vm.expanded = new Set(vm.expanded);
      });
      await settle();
      await page.locator('.cmp-chart').screenshot({ path: path.join(process.env.QA_OUTPUT_DIR, 'compare-position-tree.png') });
    }
    assert.deepEqual(errors, [], '页面异常');
    console.log('PASS 多根、下级组织、人编分组展开收起及 75%/100%/150% 缩放连线');
  } finally { await context.close(); await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
