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
    const issues = await page.evaluate(() => {
      const issues = [];
      for (const tree of [vm.$refs.leftTree, vm.$refs.rightTree]) {
        const tr = tree.getBoundingClientRect(), z = vm.zoom;
        const rect = el => {
          const r = el.getBoundingClientRect();
          return { left: (r.left - tr.left) / z, right: (r.right - tr.left) / z,
            top: (r.top - tr.top) / z, bottom: (r.bottom - tr.top) / z };
        };
        tree.querySelectorAll('.oc-node').forEach(node => {
          const bounds = rect(node);
          for (const el of node.querySelectorAll('.oc-box,.oc-pos,.oc-person,.oc-hcsum')) {
            const r = rect(el);
            if (r.left < bounds.left - 0.1 || r.right > bounds.right + 0.1) {
              issues.push(node.dataset.ocId + ' 明细超出子树占位'); break;
            }
          }
        });
        tree.querySelectorAll('.oc-top,.oc-children').forEach(list => {
          const nodes = [...list.children].filter(el => el.classList.contains('oc-node'));
          nodes.slice(1).forEach((node, i) => {
            if (rect(node).left - rect(nodes[i]).right < 23.9) issues.push(node.dataset.ocId + ' 兄弟子树间距不足');
          });
        });
        const horizontal = [];
        tree.querySelectorAll('.oc-connectors path').forEach(path => {
          const parts = path.getAttribute('d').split(/\s+/); let x = 0, y = 0;
          for (let i = 0; i < parts.length;) {
            const command = parts[i++];
            if (command === 'M') { x = Number(parts[i++]); y = Number(parts[i++]); }
            else if (command === 'V') y = Number(parts[i++]);
            else if (command === 'H') { const end = Number(parts[i++]); horizontal.push({ y, left: Math.min(x, end), right: Math.max(x, end) }); x = end; }
          }
        });
        tree.querySelectorAll('.oc-tail.has-orgs.has-details').forEach(tail => {
          const head = rect(tail.parentElement.querySelector(':scope > .oc-head > .oc-box'));
          const bounds = rect(tail.parentElement), pos = rect(tail.querySelector(':scope > .oc-details .oc-pos'));
          const children = [...tail.querySelector(':scope > .oc-children').children].map(n => rect(n.querySelector(':scope > .oc-head > .oc-box')));
          const bottom = Math.min((pos.top + pos.bottom) / 2, ...children.map(r => r.top));
          const rows = new Set(horizontal.filter(line => line.y > head.bottom + 0.1 && line.y < bottom - 0.1 &&
            line.left >= bounds.left - 0.1 && line.right <= bounds.right + 0.1).map(line => Math.round(line.y * 10)));
          if (rows.size !== 1) issues.push(tail.parentElement.dataset.ocId + ' 混合分支应只有一条共享横梁');
        });
      }
      return issues;
    });
    assert.deepEqual(issues, [], label + '：完整子树占位与共享横梁');
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
      const position = OA.store.apply(r.planId, 'addPosition', {
        orgId: 'G04', name: '仅编制回归职位', levelMin: 'P3-1', levelMax: 'P5-4'
      });
      if (!position.ok) throw new Error(position.error);
      const hc = OA.store.apply(r.planId, 'addHeadcounts', { positionId: position.id, level: 'P4-2', count: 1 });
      if (!hc.ok) throw new Error(hc.error);
      const rootPosition = OA.store.apply(r.planId, 'addPosition', { orgId: 'G03', name: '技术部主管', levelMin: 'P3-1', levelMax: 'P5-4' });
      if (!rootPosition.ok) throw new Error(rootPosition.error);
      const rootHc = OA.store.apply(r.planId, 'addHeadcounts', { positionId: rootPosition.id, level: 'P4-2', count: 1 });
      if (!rootHc.ok) throw new Error(rootHc.error);
      const child = OA.store.apply(r.planId, 'addOrg', { parentId: 'G04', name: '项目部回归' });
      if (!child.ok) throw new Error(child.error);
      const copy = OA.store.apply(r.planId, 'copyOrg', { id: 'G04', parentId: 'G03', name: '产品部副本', copyMode: 'subtree' });
      if (!copy.ok) throw new Error(copy.error);
      return r.planId;
    });
    await page.goto(baseUrl + '/04-前后对比.html?plan=' + planId + '&embed=1');
    await page.waitForSelector('.cmp-toolbar');
    await page.evaluate(() => { window.vm = document.querySelector('#app').__vue_app__._container._vnode.component.proxy; });
    await settle();
    await page.getByRole('checkbox', { name: '只看变化', exact: true }).uncheck();
    await settle();
    for (const details of [false, true]) {
      await page.evaluate(details => { vm.showDetails = details; }, details);
      await settle();
      assert.equal(await page.locator('.cmp-toolbar input[type="checkbox"]').count(), 3, '变化过滤、人编与同步移动三个开关');
      if (details) {
        assert.equal(await page.evaluate(() => vm.allPositionKeys.every(k => vm.expanded.has(k))), true, '首次开启人编展开全部职位明细');
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
          const emptyPosition = page.locator('.oc-detail').filter({ has: page.locator('.oc-pos-name', { hasText: '仅编制回归职位' }) });
          assert.equal(await emptyPosition.locator('.oc-empty-row').textContent(), '暂无人员');
          const lineEnds = await page.locator('.oc-people > li:not(:last-child)').evaluateAll(rows => rows.map(row => {
            const line = getComputedStyle(row, '::after');
            let anchor = row;
            while (getComputedStyle(anchor).position === 'static') anchor = anchor.parentElement;
            const origin = anchor.getBoundingClientRect(), next = row.nextElementSibling.getBoundingClientRect();
            const endY = origin.top + (parseFloat(line.top) + parseFloat(line.height)) * vm.zoom;
            const lineX = origin.left + parseFloat(line.left) * vm.zoom;
            return [Math.abs(endY - (next.top + next.height / 2)), Math.abs(lineX - row.parentElement.getBoundingClientRect().left)];
          }));
          assert.ok(lineEnds.length > 0 && lineEnds.every(([y, x]) => y < 0.1 && x < 0.1), '各人编行间线止于下一行中心，空人员行不偏移或超出末行');
          assert.deepEqual(await emptyPosition.locator('.oc-pos .oc-tag').allTextContents(), ['新增'], '新增职位只显示一个新增标签');
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
    const retainedKey = await page.locator('.oc-pos').first().evaluate(el => {
      const node = el.closest('.oc-node'), side = node.closest('.cmp-side') === document.querySelector('.cmp-side') ? 'L' : 'R';
      return side + vm.sideGraph(side).positions.find(p => p.name === el.querySelector('.oc-pos-name').textContent && p.orgId === node.dataset.ocId).id;
    });
    await page.locator('.oc-pos').first().click();
    await settle();
    assert.equal(await page.evaluate(key => vm.expanded.has(key), retainedKey), false, '手动收起职位');
    await page.getByText('人员和编制', { exact: true }).click();
    await page.getByText('人员和编制', { exact: true }).click();
    await settle();
    assert.equal(await page.evaluate(key => vm.expanded.has(key), retainedKey), false, '再次开启人编保留手动收起状态');
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
      await page.evaluate(() => {
        const p = vm.g.positions.find(p => p.name === '仅编制回归职位');
        vm.expanded = new Set([...vm.expanded, 'R' + p.id]);
      });
      await settle();
      await page.locator('.oc-detail').filter({ has: page.locator('.oc-pos-name', { hasText: '仅编制回归职位' }) })
        .screenshot({ path: path.join(process.env.QA_OUTPUT_DIR, 'compare-empty-position.png') });
      await page.setViewportSize({ width: 3600, height: 1400 });
      await page.evaluate(() => { vm.allPositionKeys.forEach(k => vm.expanded.add(k)); vm.expanded = new Set(vm.expanded); });
      await settle();
      await checkCurrentLayout('完整混合子树截图');
      await page.locator('.cmp-side').nth(1).locator('[data-oc-id="G03"]')
        .screenshot({ path: path.join(process.env.QA_OUTPUT_DIR, 'compare-mixed-subtree.png') });
    }
    assert.deepEqual(errors, [], '页面异常');
    console.log('PASS 混合分支共享横梁、复制子树占位、多根折叠、三档缩放、空人员末行与展开状态');
  } finally { await context.close(); await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
