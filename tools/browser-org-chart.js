/* 组件重构验证：独立 Chrome 上下文、临时方案，不修改用户浏览器数据。 */
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const baseUrl = (process.env.BASE_URL || 'http://127.0.0.1:8130').replace(/\/$/, '');

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' }) });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage(), errors = [];
  await require('./browser-overview-stub.js')(context);
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const settle = async () => page.evaluate(async () => {
    window.vm = document.querySelector('#app').__vue_app__._container._vnode.component.proxy;
    await vm.$nextTick();
    for (let i = 0; i < 8; i++) await new Promise(requestAnimationFrame);
    for (let i = 0; i < 90 && (vm._chartRenderer.animating || vm._chartRenderer.before || vm._chartDirty); i++) await new Promise(requestAnimationFrame);
  });
  const open = async id => {
    await page.goto(baseUrl + '/04-前后对比.html?plan=' + id);
    await page.waitForSelector('.cmp-toolbar'); await settle();
  };
  const checkGeometry = async label => {
    const issues = await page.evaluate(() => {
      const issues = [], layouts = vm._chartRenderer.layouts;
      for (const side of ['L', 'R']) {
        if (!vm.visibleSides.includes(side)) continue;
        const host = vm.$refs[side === 'L' ? 'leftTree' : 'rightTree'];
        const nodes = layouts[side];
        for (let i = 0; i < nodes.length; i++) {
          const a = nodes[i];
          for (const b of nodes.slice(i + 1)) {
            const x = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
            const y = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
            if (x > 0.1 && y > 0.1) issues.push(side + ' 节点重叠 ' + a.id + '/' + b.id);
          }
          const group = [...host.querySelectorAll('[data-layout-id]')].find(el => el.dataset.layoutId === a.id);
          const foreign = group.getBoundingClientRect();
          const boxes = [...group.querySelectorAll('.oc-box,.oc-pos,.oc-person,.oc-hcsum')].map(el => el.getBoundingClientRect());
          if (boxes.some(r => r.left < foreign.left - 0.2 || r.right > foreign.right + 0.2 || r.top < foreign.top - 0.2 || r.bottom > foreign.bottom + 0.2)) {
            issues.push(side + ' 内容超出布局占位 ' + a.id + ' ' + JSON.stringify({ allocated: { w: foreign.width / vm.zoom, h: foreign.height / vm.zoom },
              actual: boxes.map(r => ({ x: (r.left - foreign.left) / vm.zoom, y: (r.top - foreign.top) / vm.zoom, w: r.width / vm.zoom, h: r.height / vm.zoom })) }));
          }
          const parent = nodes.find(n => n.id === a.parentId);
          if (a.id.startsWith('org:')) {
            const card = group.querySelector('.oc-box'), button = group.querySelector('.oc-org-toggle');
            if (Math.abs(a.w - 220) > 0.1) issues.push('组织卡未统一 220px ' + a.id);
            if (card.hasAttribute('data-toggle-key') || card.getAttribute('role') === 'button') issues.push('仍可整卡折叠');
            if (button) {
              const r = button.getBoundingClientRect(), b = card.getBoundingClientRect();
              const hit = getComputedStyle(button), circle = getComputedStyle(button, '::before'), icon = getComputedStyle(button.querySelector('svg'));
              if (parseFloat(hit.width) !== 32 || parseFloat(hit.height) !== 32 || parseFloat(circle.width) !== 20 || parseFloat(circle.height) !== 20 || parseFloat(icon.width) !== 12) issues.push('按钮尺寸不符 ' + a.id);
              if (Math.abs((r.left + r.right - b.left - b.right) / 2) > 0.2 || Math.abs((r.top + r.bottom) / 2 - b.bottom) > 0.2) issues.push('底部按钮未居中 ' + a.id);
            }
          }
          if (a.id.startsWith('detail:')) {
            const siblings = nodes.filter(n => n.parentId === a.parentId && n.id.startsWith('org:'));
            if (siblings.some(n => n.x + n.w > a.x)) issues.push('直属职位没有位于子组织右侧 ' + a.id);
          }
          const link = [...host.querySelectorAll('path[data-link-to]')].find(p => p.getAttribute('data-link-to') === a.id);
          if (!parent) {
            if (link && link.getAttribute('display') !== 'none') issues.push('虚拟根连线可见');
            continue;
          }
          if (!link || link.getAttribute('display') === 'none') { issues.push('真实归属缺线 ' + a.id); continue; }
          const numbers = link.getAttribute('d').match(/-?\d+(?:\.\d+)?/g).map(Number);
          const position = group.querySelector('.oc-pos')?.getBoundingClientRect();
          const expectedX = position ? a.x + ((position.left + position.right) / 2 - foreign.left) / vm.zoom : a.x + a.w / 2;
          const expectedY = position ? a.y + (position.top - foreign.top) / vm.zoom : a.y;
          const aligned = Math.abs(expectedX - parent.x - parent.w / 2) <= 0.1;
          if (position && group.querySelectorAll('.oc-pos').length === 1 && nodes.filter(n => n.parentId === a.parentId).length === 1 && !aligned) {
            issues.push('单职位叶组织未中心竖直对齐 ' + a.id);
          }
          if (!aligned && !link.getAttribute('d').includes(' Q ')) issues.push('分支未使用圆角连线 ' + a.id);
          if (aligned && numbers.filter((_, index) => index % 2 === 0).some(x => Math.abs(x - expectedX) > 0.1)) issues.push('对齐节点仍有横向拐弯 ' + a.id);
          if (position) {
            const internal = [...host.querySelectorAll('.oc-detail-connectors')].find(g => g.getAttribute('data-detail-for') === a.id);
            if (!internal) { issues.push('缺少统一 SVG 明细连接层 ' + a.id); continue; }
            const points = key => internal.querySelector('[data-connector="' + key + '"]')?.getAttribute('d').match(/-?\d+(?:\.\d+)?/g).map(Number);
            const localRect = el => {
              const r = el.getBoundingClientRect();
              return { x: (r.left - foreign.left) / vm.zoom, y: (r.top - foreign.top) / vm.zoom, w: r.width / vm.zoom, h: r.height / vm.zoom };
            };
            const near = (x, y) => Math.abs(x - y) <= 0.2;
            const positionTrunk = internal.querySelector('[data-connector="positions"]');
            if (positionTrunk && !positionTrunk.getAttribute('d').includes(' Q ')) issues.push('职位轨道末端未使用圆角 ' + a.id);
            group.querySelectorAll('.oc-detail').forEach((item, index) => {
              const heading = item.querySelector('.oc-pos'), card = localRect(heading), toggle = item.querySelector('.oc-pos-toggle');
              for (const pseudo of ['::before', '::after']) {
                if (getComputedStyle(item, pseudo).display !== 'none') issues.push('仍存在 CSS 职位补线 ' + a.id);
              }
              if (toggle) {
                const r = localRect(toggle);
                if (!near(r.x + r.w / 2, card.x + 12) || !near(r.y + r.h / 2, card.y + card.h + 4)) issues.push('职位展开按钮偏离人编轨道 ' + a.id);
              }
              if (index > 0) {
                const last = index === group.querySelectorAll('.oc-detail').length - 1;
                const path = points(last ? 'positions' : 'position-' + index), trunkX = localRect(group.querySelector('.oc-details')).x;
                if (!path || (!last && !near(path[0], trunkX)) || !near(path.at(-2), card.x) || !near(path.at(-1), card.y + card.h / 2)) issues.push('后续职位未接入左端中点 ' + a.id);
              } else if (points('position-0')) issues.push('首职位不应横向接入 ' + a.id);
              const list = item.querySelector('.oc-people'), people = points('people-' + index);
              if (!list) {
                if (people) issues.push('收起后残留人编连线 ' + a.id);
              } else {
                if (!internal.querySelector('[data-connector="people-' + index + '"]').getAttribute('d').includes(' Q ')) issues.push('人编末端未使用圆角 ' + a.id);
                const button = localRect(toggle), last = localRect(list.lastElementChild);
                if (!people || !near(people[0], button.x + button.w / 2) || !near(people[1], button.y + button.h / 2) || !near(people.at(-1), last.y + last.h / 2)) issues.push('人编主线没有连接按钮或止于末行 ' + a.id);
                [...list.children].forEach((row, i) => {
                  const r = localRect(row), path = i === list.children.length - 1 ? people : points('person-' + index + '-' + i);
                  if (!path || !near(path[0], people[0]) || !near(path.at(-2), r.x) || !near(path.at(-1), r.y + r.h / 2)) issues.push('人编行未连到真实中点 ' + a.id);
                });
              }
            });
          }
          if (Math.abs(numbers[0] - parent.x - parent.w / 2) > 0.1 || Math.abs(numbers[1] - parent.y - parent.h) > 0.1 ||
              Math.abs(numbers.at(-2) - expectedX) > 0.1 || Math.abs(numbers.at(-1) - expectedY) > 0.1) issues.push('连接落点错误 ' + a.id);
          // 每个父组织的所有分支，包括人编，必须只有一个共同横梁高度。
          const siblingLinks = [...host.querySelectorAll('path[data-link-from]')].filter(p => p.getAttribute('data-link-from') === a.parentId && p.getAttribute('display') !== 'none');
          const levels = new Set(siblingLinks.filter(p => p.getAttribute('d').includes(' Q ')).map(p => p.getAttribute('d').match(/-?\d+(?:\.\d+)?/g)[5]));
          if (levels.size > 1) issues.push('混合分支横梁不一致 ' + a.parentId);
        }
        // 内部人员归属线最后一行不向下延伸。
        host.querySelectorAll('.oc-people').forEach(list => {
          const last = list.lastElementChild;
          if (last && getComputedStyle(last, '::after').content !== 'none') issues.push('末行尾线未截断');
        });
      }
      const all = Object.values(layouts).flat().filter(n => n.id.startsWith('org:'));
      for (const level of new Set(all.map(n => n.level))) {
        if (vm.chartMode === 'compare' && new Set(all.filter(n => n.level === level).map(n => n.y)).size !== 1) issues.push('前后共同层级未对齐 ' + level);
      }
      return issues;
    });
    assert.deepEqual(issues, [], label);
  };
  const screenshot = async name => {
    if (!process.env.QA_OUTPUT_DIR) return;
    fs.mkdirSync(process.env.QA_OUTPUT_DIR, { recursive: true });
    await page.screenshot({ path: path.join(process.env.QA_OUTPUT_DIR, name + '.png') });
  };
  try {
    await open('plan-case2');
    const sample = await page.evaluate(() => {
      const S = OA.store;
      const r = S.apply(null, 'createPlan', { name: '组件验证：混合分支与迁移', universe: 'scopeDemo', effDate: '2026-12-01',
        adjustLevel: 'BU下设一级', adjustReason: '内部原因', scopeOrgIds: ['G03', 'S00'], scopeWarningsAcknowledged: true });
      if (!r.ok) throw new Error(r.error);
      const apply = (type, payload) => { const result = S.apply(r.planId, type, payload); if (!result.ok) throw new Error(result.error); return result; };
      const position = apply('addPosition', { orgId: 'G03', name: '直属主管验证', levelMin: 'P3-1', levelMax: 'P5-4' });
      apply('addHeadcounts', { positionId: position.id, count: 2, level: 'P4-2' });
      const child = apply('addOrg', { parentId: 'G04', name: '验证项目组' });
      const childPosition = apply('addPosition', { orgId: child.id, name: 'AI架构师验证', levelMin: 'P4-1', levelMax: 'P6-4' });
      apply('addHeadcounts', { positionId: childPosition.id, count: 1, level: 'P4-2' });
      apply('addOrg', { parentId: child.id, name: '验证末级' });
      apply('copyOrg', { id: 'G04', parentId: 'G03', name: '产品部副本', copyMode: 'subtree' });
      apply('moveOrg', { id: 'G06', newParentId: 'G04' });
      const leaf = apply('addOrg', { parentId: 'G03', name: '单职位验证' });
      const leafPosition = apply('addPosition', { orgId: leaf.id, name: '产品经理', levelMin: 'P3-1', levelMax: 'P5-4' });
      apply('addHeadcounts', { positionId: leafPosition.id, count: 7, level: 'P4-2' });
      return { id: r.planId, child: child.id, leaf: leaf.id, leafPosition: leafPosition.id };
    });
    await open(sample.id);
    await page.getByRole('checkbox', { name: '只看变化', exact: true }).uncheck(); await settle();
    const original = await page.evaluate(() => JSON.stringify(OA.store.getPlanData(vm.plan.id)));
    await checkGeometry('多根、复制、真实迁移、前后不等高与混合分支');
    const leafToggle = page.locator('.cmp-side').nth(1).locator('[data-owner-org="' + sample.leaf + '"] .oc-pos-toggle');
    await leafToggle.click(); await settle(); await checkGeometry('单职位收起人编仍中心直连');
    await leafToggle.click(); await settle(); await checkGeometry('单职位展开较宽编制汇总仍中心直连');
    await screenshot('single-position-straight');
    for (const name of ['调整前', '调整后', '前后对比']) {
      await page.locator('.cmp-toolbar .ant-radio-button-wrapper').getByText(name, { exact: true }).click(); await settle();
      await checkGeometry('单职位直连三视图 ' + name);
    }
    await page.getByRole('checkbox', { name: '只看变化', exact: true }).check(); await settle();
    await checkGeometry('变化过滤下单职位中心直连');
    await page.getByRole('checkbox', { name: '只看变化', exact: true }).uncheck(); await settle();
    for (const size of [{ width: 1024, height: 600 }, { width: 1440, height: 1000 }]) {
      await page.setViewportSize(size); await page.getByRole('button', { name: '适应画布', exact: true }).click(); await settle();
      await checkGeometry('单职位不同窗口 ' + size.width);
    }
    const detailGap = () => page.evaluate(id => {
      const nodes = vm._chartRenderer.layouts.R;
      const org = nodes.find(n => n.id === 'org:' + id), detail = nodes.find(n => n.id === 'detail:' + id);
      return detail.y - org.y - org.h;
    }, sample.child);
    const compareGap = await detailGap();
    await page.locator('.cmp-toolbar .ant-radio-button-wrapper').getByText('调整后', { exact: true }).click(); await settle();
    const singleGap = await detailGap();
    assert.ok(Math.abs(compareGap - singleGap) < 1, '双图直属岗位不被其他组织的长明细撑开');
    await checkGeometry('新增下层组织及直属岗位：单图无重叠');
    await page.locator('.cmp-toolbar .ant-radio-button-wrapper').getByText('前后对比', { exact: true }).click(); await settle();
    await checkGeometry('新增下层组织及直属岗位：双图层级对齐且无重叠');
    console.log('PASS 下层组织直属岗位间距 compare=' + compareGap + 'px / after=' + singleGap + 'px');
    await page.getByText('收起全部明细', { exact: true }).click(); await settle();
    assert.equal(await page.locator('.cmp-side .oc-people').count(), 0, '批量收起全部人编');
    await page.getByRole('checkbox', { name: '人员和编制', exact: true }).uncheck(); await settle();
    assert.equal(await page.locator('.cmp-side .oc-pos').count(), 0, '关闭人编后职位和明细全部移除');
    assert.equal(await page.locator('.oc-bulk').evaluate(el => el.classList.contains('is-disabled')), true, '关闭人编时批量按钮禁用');
    await page.getByRole('checkbox', { name: '人员和编制', exact: true }).check(); await settle();
    assert.equal(await page.locator('.cmp-side .oc-people').count(), 0, '重新开启保留折叠状态');
    await page.getByText('展开全部明细', { exact: true }).click(); await settle();
    assert.ok(await page.locator('.cmp-side .oc-people').count(), '批量展开全部人编');
    await checkGeometry('批量收起、开关人编及恢复展开');
    await page.getByRole('button', { name: '适应画布', exact: true }).click(); await settle();
    const fit = await page.evaluate(() => ({ actual: vm.zoom, expected: vm.clampZoom(Math.min(1, ...vm.visibleSides.map(side => {
      const view = vm.$refs[side === 'L' ? 'leftView' : 'rightView'];
      return Math.min(view.clientWidth / vm.treeW, view.clientHeight / vm.treeH);
    }))) }));
    assert.ok(Math.abs(fit.actual - fit.expected) <= 0.001, '重新排布后的适配比例与实际内容边界一致');
    await screenshot('org-chart-mixed-fit');
    // 单图按局部高度排布；切回双图恢复同层对齐与共同缩放。
    const compareGeometry = await page.evaluate(() => ({ ...vm.treeSizes.R }));
    await page.locator('.cmp-toolbar .ant-radio-button-wrapper').getByText('调整后', { exact: true }).click(); await settle();
    await checkGeometry('单图紧凑与左组织右职位');
    const singleGeometry = await page.evaluate(() => ({ ...vm.treeSizes.R }));
    assert.ok(singleGeometry.h <= compareGeometry.h + 0.1, '单图局部排布不增加高度；双图不再人为保留长明细空白');
    console.log('COMPACT', JSON.stringify({ compare: compareGeometry, single: singleGeometry }));
    await page.locator('.cmp-toolbar .ant-radio-button-wrapper').getByText('前后对比', { exact: true }).click(); await settle();
    await checkGeometry('恢复双图对齐');
    const expandedBeforeCard = await page.evaluate(() => [...vm.expanded]);
    await page.locator('.cmp-side').first().locator('[data-oc-id="G03"] .oc-box').click(); await settle();
    assert.deepEqual(await page.evaluate(() => [...vm.expanded]), expandedBeforeCard, '点击组织卡不折叠');
    const motion = await page.evaluate(async () => {
      const zoom = vm.zoom;
      vm.toggle('LG03'); await vm.$nextTick();
      for (let i = 0; i < 4; i++) await new Promise(requestAnimationFrame);
      return { animating: vm._chartRenderer.animating, ghosts: document.querySelectorAll('.oc-exiting').length,
        inert: [...document.querySelectorAll('.oc-exiting')].every(el => el.getAttribute('aria-hidden') === 'true' && getComputedStyle(el).pointerEvents === 'none'), zoomUnchanged: zoom === vm.zoom };
    });
    assert.equal(motion.animating, true, '展开折叠存在实际过渡');
    assert.ok(motion.ghosts && motion.inert, '退出节点短暂显示但不接受交互');
    assert.equal(motion.zoomUnchanged, true, '折叠不自动缩放');
    await page.evaluate(() => vm.toggle('LG03')); await settle();
    assert.equal(await page.evaluate(() => vm.expanded.has('LG03')), true, '连续操作以最新状态为准');
    assert.equal(await page.locator('.oc-exiting').count(), 0, '旧动画和临时节点全部清理');
    await checkGeometry('快速中断后最终几何');
    await page.evaluate(() => { vm.zoom = 1.5; }); await settle();
    await page.getByRole('button', { name: '适应画布', exact: true }).click();
    await page.waitForFunction(() => vm._chartRenderer.animating);
    assert.equal(await page.evaluate(() => Math.abs(new DOMMatrixReadOnly(getComputedStyle(vm.$refs.leftTree).transform).a - vm.zoom) > 0.001), true, '适配包含真实缩放过渡');
    await settle();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.evaluate(() => vm.toggle('LG03')); await settle();
    assert.equal(await page.evaluate(() => vm._chartRenderer.animating), false, '减少动态效果时直接完成');
    await page.evaluate(() => vm.toggle('LG03')); await settle();
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    if (process.env.BASELINE_URL) {
      const baselineUrl = process.env.BASELINE_URL.replace(/\/$/, '');
      const { execFileSync } = require('node:child_process');
      const expectedPage = execFileSync('git', ['show', '14ebc29:原型/组织调整/04-前后对比.html'], { cwd: path.resolve(__dirname, '..') });
      const response = await page.request.get(baselineUrl + '/04-前后对比.html');
      assert.ok((await response.body()).equals(expectedPage), '旧端口必须精确对应已提交基线，避免比较错工作树');
      const storage = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)));
      const baselineContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      const baselinePage = await baselineContext.newPage();
      await baselinePage.goto(baselineUrl + '/index.html');
      await baselinePage.evaluate(entries => { localStorage.clear(); Object.entries(entries).forEach(([k, v]) => localStorage.setItem(k, v)); }, storage);
      await baselinePage.goto(baselineUrl + '/04-前后对比.html?plan=' + sample.id);
      await baselinePage.waitForSelector('.cmp-toolbar');
      await baselinePage.getByRole('checkbox', { name: '只看变化', exact: true }).uncheck();
      await baselinePage.evaluate(async () => {
        window.vm = document.querySelector('#app').__vue_app__._container._vnode.component.proxy;
        await vm.$nextTick(); for (let i = 0; i < 8; i++) await new Promise(requestAnimationFrame);
    for (let i = 0; i < 90 && (vm._chartRenderer.animating || vm._chartRenderer.before || vm._chartDirty); i++) await new Promise(requestAnimationFrame);
      });
      assert.equal(await baselinePage.evaluate(() => JSON.stringify(OA.store.getPlanData(vm.plan.id))), original, '新旧对照必须使用完全相同的数据与历史');
      const geometry = target => target.evaluate(() => ({ zoom: vm.zoom,
        sides: ['L', 'R'].map(side => ({ side, width: vm.treeSizes[side].w, height: vm.treeSizes[side].h })),
        organizations: document.querySelectorAll('.cmp-side .oc-box').length,
        positions: document.querySelectorAll('.cmp-side .oc-pos').length,
        people: document.querySelectorAll('.cmp-side .oc-person').length }));
      const comparison = { baseline: await geometry(baselinePage), candidate: await geometry(page) };
      for (const key of ['organizations', 'positions', 'people']) assert.equal(comparison.baseline[key], comparison.candidate[key], '新旧展示集合一致：' + key);
      console.log('COMPARE', JSON.stringify(comparison));
      if (process.env.QA_OUTPUT_DIR) {
        fs.mkdirSync(process.env.QA_OUTPUT_DIR, { recursive: true });
        await baselinePage.screenshot({ path: path.join(process.env.QA_OUTPUT_DIR, 'baseline-mixed-fit.png') });
        fs.writeFileSync(path.join(process.env.QA_OUTPUT_DIR, 'comparison.json'), JSON.stringify(comparison, null, 2));
      }
      await baselineContext.close();
    }
    for (const zoom of [0.25, 0.75, 1, 1.5, 2]) {
      await page.evaluate(z => { vm.zoom = z; }, zoom); await settle();
      await checkGeometry('缩放 ' + zoom);
    }
    const count = await page.evaluate(() => vm._chartRenderer.renderCount);
    await page.evaluate(() => { vm.zoom = 1.2; vm.setSplitRatio(70); }); await settle();
    assert.equal(await page.evaluate(() => vm._chartRenderer.renderCount), count, '缩放和分隔调整不重新布局');
    const rightExpanded = await page.evaluate(() => [...vm.expanded].filter(k => k.startsWith('R')));
    for (const id of ['G04', 'G03', 'S00']) {
      await page.locator('.cmp-side').first().locator('[data-oc-id="' + id + '"] .oc-org-toggle').click(); await settle();
      await checkGeometry('折叠 ' + id);
    }
    assert.deepEqual(await page.evaluate(() => [...vm.expanded].filter(k => k.startsWith('R'))), rightExpanded, '左右展开状态独立');
    assert.equal(await page.locator('.cmp-side').first().locator('path[data-link-to]:not([display="none"])').count(), 0, '所有根折叠后没有残留向下空线');
    // 原生键盘可展开组织；Vue 是唯一展开状态来源。
    await page.locator('.cmp-side').first().locator('[data-oc-id="G03"] .oc-org-toggle').press('Enter'); await settle();
    assert.equal(await page.evaluate(() => vm.expanded.has('LG03')), true);
    assert.equal(await page.evaluate(() => document.activeElement.dataset.toggleKey), 'LG03', '重绘后键盘焦点保留在操作按钮');
    await checkGeometry('键盘展开');
    await page.locator('.cmp-toolbar input[type="text"]').fill('产品'); await settle();
    assert.ok(await page.locator('.cmp-side .oc-hit').count(), '组织搜索高亮并展开路径');
    await page.locator('.cmp-toolbar input[type="text"]').fill('直属主管验证'); await settle();
    const hits = await page.locator('.cmp-side .oc-pos.oc-hit-soft').evaluateAll(els => els.map(el => {
      const r = el.getBoundingClientRect(), v = el.closest('.cmp-viewport').getBoundingClientRect();
      return r.left >= v.left - 1 && r.right <= v.right + 1 && r.top >= v.top - 1 && r.bottom <= v.bottom + 1;
    }));
    assert.ok(hits.length && hits.every(Boolean), '搜索实际定位到视口，双图不互相覆盖位置');
    await page.locator('.cmp-toolbar input[type="text"]').fill(''); await settle();
    await page.getByRole('button', { name: '适应画布', exact: true }).click(); await settle();
    await page.getByRole('button', { name: /^全\s*屏$/ }).click(); await settle();
    await page.locator('.cmp-toolbar .ant-radio-button-wrapper').getByText('调整后', { exact: true }).click(); await settle();
    await checkGeometry('全屏单职位直连及混合分支');
    await screenshot('org-chart-mixed-fullscreen');
    await page.getByRole('button', { name: '退出全屏', exact: true }).click(); await settle();
    assert.equal(await page.evaluate(() => JSON.stringify(OA.store.getPlanData(vm.plan.id))), original, '展示操作不改业务、历史和快照');
    console.log('PASS 新组件：混合分支／多根／复制迁移、共同层级、无重叠、连线落点、折叠、键盘、搜索定位及只读性');

    // 合成规模只用于布局压力检查，不作为真实业务样例或生产容量承诺。
    const stressId = await page.evaluate(() => {
      const S = OA.store, r = S.apply(null, 'createPlan', { name: '布局规模验证', universe: 'case2', effDate: '2026-12-01',
        adjustLevel: 'BU下设一级', adjustReason: '内部原因', scopeOrgIds: ['G03'], scopeWarningsAcknowledged: true });
      if (!r.ok) throw new Error(r.error);
      const pd = S.getPlanData(r.planId), template = S.G.org(pd.cur, 'G04');
      for (let i = 0; i < 120; i++) pd.cur.orgs.push(Object.assign({}, template, { id: 'scale-' + i, parentId: 'G03', name: '规模部门 ' + i, code: 'SCALE' + i, order: 100 + i }));
      pd.base = JSON.parse(JSON.stringify(pd.cur)); S.retryPersist(r.planId); return r.planId;
    });
    await open(stressId); await page.getByRole('checkbox', { name: '只看变化', exact: true }).uncheck(); await settle();
    await checkGeometry('120 个合成部门');
    console.log('MEASURE', JSON.stringify(await page.evaluate(() => ({ orgsPerSide: vm._chartRenderer.layouts.L.filter(n => n.id.startsWith('org:')).length,
      layoutNodes: vm._chartRenderer.layouts.L.length + vm._chartRenderer.layouts.R.length, renderMs: vm._chartRenderer.lastRenderMs, zoom: vm.zoom }))));
    await page.evaluate(() => { vm.zoom = 1; }); await settle();
    await page.locator('.cmp-toolbar input[type="text"]').fill('规模部门 119'); await settle();
    assert.equal(await page.locator('.cmp-side .oc-hit').count(), 2, '超大图两侧均搜索到末端部门');
    assert.equal(await page.locator('.cmp-side .oc-hit').evaluateAll(els => els.every(el => {
      const r = el.getBoundingClientRect(), v = el.closest('.cmp-viewport').getBoundingClientRect();
      return r.left >= v.left - 1 && r.right <= v.right + 1 && r.top >= v.top - 1 && r.bottom <= v.bottom + 1;
    })), true, '超大图最远端节点可滚动定位');
    // 合成层级样例只放在独立上下文的临时方案内，覆盖真实层级 1／2／3 及升降级后的统一宽度。
    const tieredId = await page.evaluate(() => {
      const S = OA.store, r = S.apply(null, 'createPlan', { name: '层级尺寸验证', universe: 'case2', effDate: '2026-12-01',
        adjustLevel: 'BU下设一级', adjustReason: '内部原因', scopeOrgIds: ['G03'], scopeWarningsAcknowledged: true });
      if (!r.ok) throw new Error(r.error);
      const pd = S.getPlanData(r.planId);
      [pd.base, pd.cur].forEach(g => { S.G.org(g, 'G03').parentId = null; });
      S.G.org(pd.cur, 'G04').parentId = 'G05';
      S.retryPersist(r.planId); return r.planId;
    });
    await open(tieredId); await page.getByRole('checkbox', { name: '只看变化', exact: true }).uncheck(); await settle();
    await checkGeometry('一级二级三级及双图层级变化同宽');
    const widthOf = side => page.locator('.cmp-side').nth(side === 'L' ? 0 : 1).locator('[data-oc-id="G04"] .oc-box').evaluate(el => parseFloat(getComputedStyle(el).width));
    assert.equal(await widthOf('L'), 220); assert.equal(await widthOf('R'), 220);
    await page.locator('.cmp-toolbar .ant-radio-button-wrapper').getByText('调整后', { exact: true }).click(); await settle();
    await checkGeometry('单图不同层级仍统一尺寸'); assert.equal(await widthOf('R'), 220);
    await page.getByRole('checkbox', { name: '人员和编制', exact: true }).uncheck(); await settle();
    const leafToggles = await page.evaluate(() => {
      const nodes = vm._chartRenderer.layouts.R;
      return nodes.filter(n => !nodes.some(child => child.parentId === n.id)).map(n => {
        const group = [...vm.$refs.rightTree.querySelectorAll('[data-layout-id]')].find(el => el.dataset.layoutId === n.id);
        return !!group.querySelector('.oc-org-toggle');
      });
    });
    assert.ok(leafToggles.length && leafToggles.every(v => !v), '当前展示没有下属的叶组织不显示折叠按钮');
    console.log('PASS CMP-54—59a：统一尺寸、小按钮、首职位顶部接线、后续职位左侧公共竖线、职位人编按钮、底部按钮及焦点、圆角、左右顺序、单图紧凑、缩放过渡、快速中断与减少动态效果');
    assert.deepEqual(errors, [], '浏览器无异常');
  } finally { await context.close(); await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
