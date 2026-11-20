/* 配合 webkit-compare.swift：实际绘制检查，而非只检查正确但可能未按坐标绘制的 DOM。 */
(async () => {
  const send = data => window.webkit.messageHandlers.qa.postMessage(data);
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const getVM = () => document.querySelector('#app')?.__vue_app__?._container._vnode.component.proxy;
  let origin = { x: 0, y: 0 };
  addEventListener('message', event => { if (event.data?.type === 'webkit-qa-origin') origin = event.data; });
  try {
    if (!/0[34]-/.test(decodeURIComponent(location.pathname))) return;
    for (let i = 0; i < 100 && !getVM(); i++) await pause(50);
    const vm = getVM(); assert(vm, '页面未加载');
    send({type:'log',url:location.href,plan:vm.plan?.id || 'none'});
    if (decodeURIComponent(location.pathname).includes('04-') && !new URLSearchParams(location.search).has('qa')) {
      const S = OA.store, result = S.apply(null, 'createPlan', { name: 'WebKit 绘制验证', universe: 'case2', effDate: '2026-12-01',
        adjustLevel: 'BU下设一级', adjustReason: '内部原因', scopeOrgIds: ['G03'], scopeWarningsAcknowledged: true });
      assert(result.ok, result.error);
      const apply = (type, payload) => { const r = S.apply(result.planId, type, payload); assert(r.ok, r.error); return r; };
      apply('editOrg', { id: 'G04', name: '产品设计部' });
      const org = apply('addOrg', { parentId: 'G04', name: '新增项目组' });
      const pos = apply('addPosition', { orgId: org.id, name: '新增产品岗', levelMin: 'P2-1', levelMax: 'P6-4' });
      apply('addHeadcounts', { positionId: pos.id, count: 2, level: 'P4-2' });
      location.replace(location.pathname + '?plan=' + result.planId + '&qa=1' + (window.self !== window.top ? '&embed=1' : ''));
      return;
    }
    if (decodeURIComponent(location.pathname).includes('03-')) {
      vm.openCompare('view');
      // file:// 子页可能无法读取父 DOM，用测试消息提供整窗截图中的 iframe 偏移。
      setInterval(() => {
        const frame = document.querySelector('.compare-iframe');
        if (!frame) return;
        const r = frame.getBoundingClientRect();
        frame.contentWindow.postMessage({ type: 'webkit-qa-origin', x: r.x, y: r.y }, '*');
      }, 100);
      return;
    }
    const settle = async () => {
      await vm.$nextTick();
      for (let i = 0; i < 100; i++) {
        await new Promise(requestAnimationFrame);
        if (i > 12 && vm._chartRenderer && !vm._chartRenderer.animating && !vm._chartRenderer.before && !vm._chartDirty) return;
      }
      throw new Error('布局未稳定');
    };
    await pause(1000); await settle();
    const original = JSON.stringify(OA.store.getPlanData(vm.plan.id));
    const rect = el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; };
    const check = async label => {
      await settle();
      for (const side of vm.visibleSides) {
        const nodes = vm._chartRenderer.layouts[side], host = vm.$refs[side === 'L' ? 'leftTree' : 'rightTree'];
        for (const a of nodes) {
          for (const b of nodes) {
            if (a === b) continue;
            assert(Math.min(a.x + a.w, b.x + b.w) <= Math.max(a.x, b.x) + 0.1 ||
              Math.min(a.y + a.h, b.y + b.h) <= Math.max(a.y, b.y) + 0.1, label + ' 布局节点重叠');
          }
          const group = [...host.querySelectorAll('[data-layout-id]')].find(el => el.dataset.layoutId === a.id);
          assert(group, label + ' 缺少可见节点');
          const g = rect(group);
          for (const el of group.querySelectorAll('.oc-box,.oc-pos,.oc-person,.oc-hcsum')) {
            const r = rect(el);
            assert(r.x >= g.x - 0.5 && r.y >= g.y - 0.5 && r.x + r.w <= g.x + g.w + 0.5 && r.y + r.h <= g.y + g.h + 0.5,
              label + ' 内容越出占位 ' + a.id);
          }
        }
      }
      const samples = vm.visibleSides.flatMap(side => {
        const view = vm.$refs[side === 'L' ? 'leftView' : 'rightView'], v = rect(view);
        return [...view.querySelectorAll('.oc-name')].filter(el => !el.closest('.oc-exiting')).flatMap(el => {
          const r = rect(el);
          if (r.x < v.x || r.y < v.y || r.x + r.w > v.x + v.w || r.y + r.h > v.y + v.h) return [];
          return [{ ...r, x: r.x + origin.x, y: r.y + origin.y, id: side + ':' + el.textContent.trim() }];
        });
      });
      assert(samples.length > 0, label + ' 没有可检查的组织卡');
      const issues = await new Promise(resolve => { window.__qaResolve = resolve; send({ type: 'snapshot', label, samples }); });
      assert(!issues.length, issues.join('; '));
    };
    await check('initial-changes');
    vm.onlyChanges = false; await settle(); vm.fitCanvas(); await check('compare-full');
    for (const mode of ['before', 'after', 'compare']) { vm.setChartMode(mode); await check(mode); }
    const button = vm.$refs.rightTree.querySelector('.oc-org-toggle');
    button.click(); await check('collapsed');
    vm.$refs.rightTree.querySelector('[data-toggle-key="' + button.dataset.toggleKey + '"]').click(); await check('expanded');
    vm.setChartMode('after'); await settle();
    vm.zoomStep(1); await check('zoomed');
    vm.kw = '新增产品岗'; await check('search');
    vm.kw = ''; vm.onlyChanges = true; await check('changes-restored');
    assert(JSON.stringify(OA.store.getPlanData(vm.plan.id)) === original, '查看架构图修改了业务数据');
    send({ type: 'done', message: '本地／HTTP 当前入口：三视图、变化过滤、缩放、搜索、折叠与绘制；业务数据未变' });
  } catch (error) { send({ type: 'error', message: error.stack || error.message }); }
})();
