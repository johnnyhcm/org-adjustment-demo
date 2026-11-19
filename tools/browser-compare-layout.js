/* 架构图展示回归：独立 Chrome 上下文，不修改用户既有方案。 */
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const baseUrl = (process.env.BASE_URL || 'http://127.0.0.1:8120').replace(/\/$/, '');

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' }) });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage(), errors = [];
  page.setDefaultTimeout(10000);
  page.on('pageerror', e => errors.push(e.message));
  const settle = async (target = page) => {
    await target.evaluate(async () => {
      window.vm = document.querySelector('#app').__vue_app__._container._vnode.component.proxy;
      await vm.$nextTick();
      for (let i = 0; i < 8; i++) await new Promise(requestAnimationFrame);
    });
  };
  const mode = async (name, target = page) => {
    await target.locator('.cmp-toolbar .ant-radio-button-wrapper').getByText(name, { exact: true }).click();
    await settle(target);
  };
  const zoom = () => page.evaluate(() => vm.zoom);
  const screenshot = async name => {
    if (!process.env.QA_OUTPUT_DIR) return;
    const fs = require('node:fs'), path = require('node:path');
    fs.mkdirSync(process.env.QA_OUTPUT_DIR, { recursive: true });
    await page.screenshot({ path: path.join(process.env.QA_OUTPUT_DIR, name + '.png') });
  };
  const positions = () => page.evaluate(() => ['leftView', 'rightView'].map(ref => ({
    x: vm.$refs[ref].scrollLeft, y: vm.$refs[ref].scrollTop
  })));
  const assertSplit = async expected => {
    const widths = await page.locator('.cmp-side').evaluateAll(els => els.map(el => el.clientWidth));
    assert.ok(Math.abs(widths[0] / (widths[0] + widths[1]) * 100 - expected) < 0.2, '双图宽度比例 ' + expected);
  };
  const dragSplit = async ratio => {
    const handle = page.getByRole('separator'), h = await handle.boundingBox();
    const panels = await page.locator('.cmp-panels').boundingBox();
    await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
    await page.mouse.down();
    await page.mouse.move(panels.x + h.width / 2 + (panels.width - h.width) * ratio / 100, h.y + h.height / 2, { steps: 8 });
    await page.mouse.up();
    await settle();
  };
  const assertFittedAndCentered = async (target = page) => {
    const metrics = await target.locator('.cmp-viewport:visible').evaluateAll(views => views.map(view => {
      const viewport = view.getBoundingClientRect();
      const boxes = [...view.querySelectorAll('.oc-box,.oc-pos,.oc-person,.oc-empty-row,.oc-hcsum')]
        .filter(el => el.getClientRects().length).map(el => el.getBoundingClientRect());
      const left = Math.min(...boxes.map(r => r.left)), right = Math.max(...boxes.map(r => r.right));
      return { spareW: view.clientWidth - (right - left),
        centerX: (left + right) / 2 - viewport.left - view.clientWidth / 2,
        top: Math.min(...boxes.map(r => r.top)) - viewport.top,
        bottom: Math.max(...boxes.map(r => r.bottom)) - viewport.top, height: view.clientHeight,
        x: view.scrollLeft, y: view.scrollTop, scale: getComputedStyle(view.querySelector('.cmp-tree')).transform };
    }));
    const z = await target.evaluate(() => vm.zoom);
    const top = Math.min(...metrics.map(m => m.top)), bottom = Math.max(...metrics.map(m => m.bottom));
    if (z > 0.25) {
      assert.ok(metrics.every(m => m.spareW >= -1) && top >= -1 && bottom <= metrics[0].height + 1, '适应后图形完整可见');
      assert.ok(metrics.every(m => Math.abs(m.centerX) < 1.5), '各侧实际图形水平居中');
      assert.ok(Math.abs((top + bottom) / 2 - metrics[0].height / 2) < 1.5, '共享层级范围垂直居中');
    }
    if (z < 1 && z > 0.25) assert.ok(metrics.some(m => m.spareW < 32 * z + 3) || metrics[0].height - (bottom - top) < 32 * z + 3, '适应后充分利用宽度或高度');
    assert.ok(metrics.every(m => m.x === 0 && m.y === 0), '自动适配不保留上次滚动位置');
    assert.ok(metrics.every(m => m.scale === metrics[0].scale), '双图采用相同缩放');
  };
  const checkFit = async () => {
    await page.getByRole('button', { name: '适应画布', exact: true }).click();
    await settle();
    await assertFittedAndCentered();
  };
  const checkFullscreenBounds = async (target = page) => {
    const bounds = await target.evaluate(() => {
      const chart = document.querySelector('.cmp-chart').getBoundingClientRect();
      const views = [...document.querySelectorAll('.cmp-viewport')].filter(el => el.offsetWidth).map(el => el.getBoundingClientRect());
      return { width: chart.width, height: chart.height, viewportWidth: innerWidth, viewportHeight: innerHeight,
        fills: views.every(r => r.height > 0 && Math.abs(r.bottom - innerHeight) < 2),
        hasInfo: !!document.querySelector('.cmp-full-info'), full: document.fullscreenElement === vm.$refs.chartSec };
    });
    assert.equal(bounds.full, true, '真实架构图区全屏');
    assert.equal(bounds.hasInfo, true, '全屏显示简洁方案信息');
    assert.equal(bounds.width, bounds.viewportWidth);
    assert.equal(bounds.height, bounds.viewportHeight);
    assert.equal(bounds.fills, true, '可见图区填满全屏剩余高度');
  };
  try {
    await page.goto(baseUrl + '/04-前后对比.html?plan=plan-case2&embed=1');
    await page.waitForSelector('.cmp-toolbar');
    await settle();
    const originalData = await page.evaluate(() => JSON.stringify(OA.store.getPlanData('plan-case2')));
    await assertSplit(50);
    await assertFittedAndCentered();
    await screenshot('compare-normal');
    await page.getByText('人员和编制', { exact: true }).click();
    await settle();
    await page.getByText('同步移动', { exact: true }).click();
    await page.evaluate(() => { vm.zoom = 2; });
    await settle();
    await page.evaluate(() => {
      vm.$refs.leftView.scrollTo(140, 160);
      vm.$refs.rightView.scrollTo(340, 220);
    });
    await settle();
    const before = await positions(), expanded = await page.evaluate(() => [...vm.expanded]);
    await dragSplit(65);
    await assertSplit(65);
    assert.equal(await zoom(), 2, '拖动分隔不缩放');
    assert.deepEqual(await positions(), before, '拖动分隔不改变查看位置');
    await dragSplit(95);
    await assertSplit(80);
    await dragSplit(5);
    await assertSplit(20);
    await page.getByRole('separator').dblclick();
    await settle();
    await assertSplit(50);
    await page.getByRole('separator').press('ArrowRight');
    await settle();
    await assertSplit(55);
    await page.getByRole('separator').press('End');
    await settle();
    await assertSplit(80);
    await page.getByRole('separator').press('Home');
    await settle();
    await assertSplit(20);
    await page.getByRole('separator').press('Enter');
    await settle();
    await assertSplit(50);
    await mode('调整前');
    assert.equal(await page.locator('.cmp-side:visible').count(), 1);
    assert.equal(await page.getByRole('separator').count(), 0);
    assert.equal(await page.getByText('同步移动', { exact: true }).count(), 0);
    await assertFittedAndCentered();
    await page.evaluate(() => { vm.zoom = 2; });
    await settle();
    await page.evaluate(() => vm.$refs.leftView.scrollTo(100, 80));
    await settle();
    await mode('前后对比');
    await assertFittedAndCentered();
    await assertSplit(50);
    await mode('调整前');
    await assertFittedAndCentered();
    assert.deepEqual(await page.evaluate(() => [...vm.expanded]), expanded, '切换模式保留节点展开');
    await mode('调整后');
    await assertFittedAndCentered();
    assert.equal(await page.locator('.cmp-side:visible .cmp-side-title').innerText(), '调整后 （1 个根节点）');
    await checkFit();
    await mode('前后对比');
    await dragSplit(70);
    await checkFit();
    console.log('PASS 普通模式：三种展示、真实拖动、20—80 边界、双击／键盘复位、初次与切换自动适配居中');

    for (const name of ['调整前', '调整后', '前后对比']) {
      await mode(name);
      const z = await zoom();
      await page.getByRole('button', { name: /^全\s*屏$/ }).click();
      await page.waitForFunction(() => !!document.fullscreenElement);
      await settle();
      await checkFullscreenBounds();
      await screenshot('fullscreen-' + name);
      assert.equal(await zoom(), z, name + '进入全屏不缩放');
      await page.getByRole('button', { name: '退出全屏', exact: true }).click();
      await page.waitForFunction(() => !document.fullscreenElement);
      await settle();
      assert.equal(await zoom(), z, name + '退出全屏不缩放');
    }
    await page.getByRole('button', { name: /^全\s*屏$/ }).click();
    await settle();
    await dragSplit(60);
    await assertSplit(60);
    for (const name of ['调整前', '调整后', '前后对比']) {
      await mode(name);
      await checkFullscreenBounds();
      await assertFittedAndCentered();
    }
    await assertSplit(60);
    await page.keyboard.press('Escape');
    // Headless Chrome 不模拟浏览器层 Esc 退出，原生退出事件另行验证。
    if (await page.evaluate(() => !!document.fullscreenElement)) {
      console.log('INFO 无头 Chrome 的 Esc 未触发浏览器退出，改用原生 exitFullscreen 复核退出事件');
      await page.evaluate(() => document.exitFullscreen());
    }
    await settle();
    assert.equal(await page.evaluate(() => vm.full), false, '浏览器原生退出事件同步状态');
    await assertSplit(60);
    for (const size of [{ width: 1280, height: 720 }, { width: 1024, height: 600 }]) {
      await page.setViewportSize(size);
      await page.getByRole('button', { name: /^全\s*屏$/ }).click();
      await settle();
      await checkFullscreenBounds();
      await mode('调整前');
      await mode('前后对比');
      await assertFittedAndCentered();
      await page.getByRole('button', { name: '退出全屏', exact: true }).click();
      await settle();
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await mode('前后对比');
    await page.getByText('同步移动', { exact: true }).click();
    await page.evaluate(() => { vm.zoom = 2; });
    await settle();
    await page.evaluate(() => vm.$refs.leftView.scrollTo(180, 120));
    await settle();
    assert.deepEqual((await positions())[0], (await positions())[1], '双图恢复同步移动');
    await mode('调整前');
    await mode('前后对比');
    await assertFittedAndCentered();
    await page.evaluate(() => { vm.zoom = 2; });
    await settle();
    await page.evaluate(() => vm.$refs.leftView.scrollTo(180, 120));
    await settle();
    const syncedPosition = await positions();
    await page.getByRole('button', { name: /^全\s*屏$/ }).click();
    await settle();
    assert.deepEqual(await positions(), syncedPosition, '进入全屏保留非零查看位置');
    await page.getByRole('button', { name: '退出全屏', exact: true }).click();
    await settle();
    assert.deepEqual(await positions(), syncedPosition, '退出全屏保留非零查看位置');
    await page.evaluate(() => vm.$refs.leftView.scrollTo(10000, 120));
    await settle();
    const edgePosition = await positions();
    await dragSplit(80);
    const clampedPosition = await page.locator('.cmp-viewport').evaluateAll((views, before) => views.map((view, i) => ({
      x: Math.min(before[i].x, view.scrollWidth - view.clientWidth), y: Math.min(before[i].y, view.scrollHeight - view.clientHeight)
    })), edgePosition);
    assert.deepEqual(await positions(), clampedPosition, '分隔变化仅按各侧边界截取，不被同步移动覆盖');
    await page.evaluate(() => { vm.zoom = 1.5; });
    await settle();
    await page.evaluate(() => vm.$refs.leftView.scrollTo(100, 100));
    await settle();
    const anchor = await page.locator('.cmp-side').first().locator('.oc-box,.oc-pos,.oc-person').evaluateAll(nodes => {
      const view = nodes[0].closest('.cmp-viewport').getBoundingClientRect();
      const index = nodes.findIndex(el => {
        const r = el.getBoundingClientRect(), x = (r.left + r.right) / 2, y = (r.top + r.bottom) / 2;
        return x > view.left + 12 && x < view.right - 12 && y > view.top + 12 && y < view.bottom - 12;
      });
      const r = nodes[index].getBoundingClientRect();
      return { index, x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 };
    });
    await page.mouse.move(anchor.x, anchor.y);
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -20);
    await page.keyboard.up('Control');
    await settle();
    const anchored = await page.locator('.cmp-side').first().locator('.oc-box,.oc-pos,.oc-person').nth(anchor.index).boundingBox();
    assert.ok(await zoom() > 1.5, '触控板缩放仍然生效');
    assert.ok(Math.abs(anchored.x + anchored.width / 2 - anchor.x) < 1.5 && Math.abs(anchored.y + anchored.height / 2 - anchor.y) < 1.5, '缩放补偿居中偏移，光标下节点保持原位');
    await page.locator('.cmp-toolbar input[type="text"]').fill('产品部');
    await settle();
    assert.ok(await page.locator('.oc-hit').count(), '模式切换后仍可搜索高亮');
    assert.equal(await page.evaluate(() => JSON.stringify(OA.store.getPlanData('plan-case2'))), originalData, '展示操作不改业务数据');
    console.log('PASS 全屏：三模式入口、全屏内切换、分隔拖动、退出事件、窄屏高度、搜索及同步移动');

    const planId = await page.evaluate(() => {
      const result = OA.store.apply(null, 'createPlan', { name: '居中回归', universe: 'scopeDemo', effDate: '2026-12-01',
        adjustLevel: 'BU下设一级', adjustReason: '内部原因', scopeOrgIds: ['G03', 'S00'], scopeWarningsAcknowledged: true });
      if (!result.ok) throw new Error(result.error);
      const child = OA.store.apply(result.planId, 'addOrg', { parentId: 'G04', name: '居中回归下级' });
      if (!child.ok) throw new Error(child.error);
      const grandchild = OA.store.apply(result.planId, 'addOrg', { parentId: child.id, name: '居中回归末级' });
      if (!grandchild.ok) throw new Error(grandchild.error);
      return result.planId;
    });
    await page.goto(baseUrl + '/04-前后对比.html?plan=' + planId + '&embed=1');
    await page.waitForSelector('.cmp-toolbar');
    await settle();
    await assertFittedAndCentered();
    const rootYs = await page.locator('.oc-top > [data-oc-id="G03"] > .oc-head > .oc-box').evaluateAll(nodes => nodes.map(el => el.getBoundingClientRect().top));
    assert.equal(rootYs.length, 2);
    assert.ok(Math.abs(rootYs[0] - rootYs[1]) < 1, '不等高双图中相同层级仍纵向对齐');
    for (const name of ['调整前', '调整后', '前后对比']) {
      await mode(name);
      await assertFittedAndCentered();
    }
    console.log('PASS 多根及不等高图：自动适配居中、三模式切换与共同层级对齐');

    await page.goto(baseUrl + '/03-工作台.html?plan=plan-case1');
    await page.waitForSelector('.wb-data-panels');
    for (const name of ['前后对比', '提交']) {
      await page.getByRole('button', { name: name === '提交' ? /^提\s*交$/ : name, exact: true }).click();
      const frame = await (await page.waitForSelector('.compare-iframe')).contentFrame();
      await frame.waitForSelector('.cmp-toolbar');
      await settle(frame);
      await assertFittedAndCentered(frame);
      await mode('调整后', frame);
      await assertFittedAndCentered(frame);
      await frame.getByRole('button', { name: /^全\s*屏$/ }).click();
      await settle(frame);
      await checkFullscreenBounds(frame);
      await frame.getByRole('button', { name: '退出全屏', exact: true }).click();
      await settle(frame);
      assert.equal(await page.locator('.compare-iframe').count(), 1, '退出全屏保留对比弹框');
      if (name === '提交') assert.equal(await frame.getByRole('button', { name: '确认并提交审批', exact: true }).count(), 1);
      await page.getByRole('button', { name: 'Close', exact: true }).click();
      await page.waitForSelector('.compare-iframe', { state: 'detached' });
    }
    console.log('PASS 工作台入口：日常对比／提交确认 iframe 内全屏及返回');
    assert.deepEqual(errors, [], '页面异常');
  } finally { await context.close(); await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
