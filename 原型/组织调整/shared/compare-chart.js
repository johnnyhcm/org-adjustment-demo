/* CMP-53：只读布局适配。业务字段由 Vue 模板转义，布局 DTO 不引用可写业务对象。 */
(function () {
  const refs = { L: 'leftTree', R: 'rightTree' };
  const box = el => {
    const rect = el.getBoundingClientRect();
    return { w: Math.ceil(rect.width), h: Math.ceil(rect.height) };
  };

  class CompareChart {
    constructor(vm) {
      this.vm = vm;
      this.charts = {};
      this.nodeLayers = {};
      this.listeners = {};
      this.layouts = {};
      this.renderCount = 0;
      this.ready = false;
      this.before = null;
      this.motionId = 0;
      this.cameras = [];
      ['L', 'R'].forEach(side => {
        const host = vm.$refs[refs[side]];
        this.listeners[side] = event => {
          const target = event.target.closest('[data-toggle-key]');
          if (target && host.contains(target)) vm.toggle(target.dataset.toggleKey);
        };
        host.addEventListener('click', this.listeners[side]);
        host.addEventListener('keydown', this.listeners[side + 'Key'] = event => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          if (event.target.tagName === 'BUTTON') return;
          if (!event.target.matches('[data-toggle-key]')) return;
          event.preventDefault(); this.listeners[side](event);
        });
      });
    }

    beginMotion() {
      if (!this.ready || this.before) return;
      this.before = {};
      ['L', 'R'].forEach(side => {
        const host = this.vm.$refs[refs[side]];
        if (!host.getClientRects().length) return;
        const r = host.getBoundingClientRect(), svg = host.querySelector('svg');
        const nodes = new Map(), links = new Map();
        host.querySelectorAll('.node[data-layout-id]').forEach(el => {
          const rect = el.getBoundingClientRect();
          nodes.set(el.dataset.layoutId, { x: rect.left, y: rect.top, w: el.__data__.width, h: el.__data__.height,
            parentId: el.__data__.data.parentId, clone: el.cloneNode(true) });
        });
        host.querySelectorAll('path[data-link-to]').forEach(el => {
          if (el.getAttribute('display') !== 'none') links.set(el.getAttribute('data-link-to'), el.cloneNode(true));
        });
        this.before[side] = { x: r.left, y: r.top, scale: new DOMMatrixReadOnly(getComputedStyle(host).transform).a,
          minX: svg ? svg.viewBox.baseVal.x : 0, nodes, links };
      });
      this.cancelMotion();
    }

    cancelMotion() {
      this.motionId++;
      this.cameras.forEach(a => a.cancel()); this.cameras = [];
      ['L', 'R'].forEach(side => {
        const host = this.vm.$refs[refs[side]];
        d3.select(host).selectAll('*').interrupt('compare-motion');
        d3.select(host).selectAll('.node').style('opacity', 1)
          .style('transform', d => translate({ x: d.x - d.width / 2, y: d.y }));
        d3.select(host).selectAll('path[data-link-to]').attr('opacity', 1).attr('d', d => branchPath(d));
        d3.select(host).selectAll('.oc-detail-connectors').attr('transform', d => 'translate(' + (d.x - d.width / 2) + ',' + d.y + ')');
        host.querySelectorAll('.oc-exiting').forEach(el => el.remove());
        host.classList.remove('is-animating');
      });
      this.animating = false;
    }

    play(onComplete) {
      const before = this.before; this.before = null;
      const token = this.motionId, promises = [];
      const duration = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 240;
      if (!before || !duration) { onComplete(); return; }
      ['L', 'R'].forEach(side => {
        const host = this.vm.$refs[refs[side]], old = before[side], chart = this.charts[side];
        if (!chart || !host.getClientRects().length) return;
        const state = chart.getChartState(), r = host.getBoundingClientRect();
        const scale = new DOMMatrixReadOnly(getComputedStyle(host).transform).a;
        const minX = state.svg.node().viewBox.baseVal.x;
        const current = new Map(this.layouts[side].map(n => [n.id, n]));
        const survivingParent = prior => {
          let id = prior && prior.parentId;
          while (id && !current.has(id)) id = old.nodes.get(id)?.parentId;
          return current.get(id);
        };
        const local = p => ({ x: minX + (p.x - old.x) / old.scale, y: (p.y - old.y) / old.scale });
        const tween = selection => selection.transition('compare-motion').duration(duration).ease(d3.easeCubicOut);
        host.classList.add('is-animating');
        if (old) {
          const camera = host.animate([
            { transform: 'translate(' + (old.x - r.left) + 'px,' + (old.y - r.top) + 'px) scale(' + old.scale + ')' },
            { transform: 'translate(0px,0px) scale(' + scale + ')' }
          ], { duration, easing: 'cubic-bezier(0.215, 0.61, 0.355, 1)' });
          this.cameras.push(camera); promises.push(camera.finished);
        }
        this.nodeLayers[side].selectAll('.node').each(function (d) {
          const end = { x: d.x - d.width / 2, y: d.y }, prior = old && old.nodes.get(d.data.id);
          const parent = old && old.nodes.get(d.data.parentId);
          const start = prior ? local(prior) : parent ? local({ x: parent.x + parent.w * old.scale / 2 - d.width * old.scale / 2,
            y: parent.y + parent.h * old.scale }) : end;
          const sel = d3.select(this).style('transform', translate(start)).style('opacity', prior ? 1 : 0);
          promises.push(tween(sel).style('transform', translate(end)).style('opacity', 1).end());
        });
        state.centerG.selectAll('.oc-detail-connectors').each(function (d) {
          const prior = old && old.nodes.get(d.data.id);
          const end = { x: d.x - d.width / 2, y: d.y }, start = prior ? local(prior) : end;
          const svgTranslate = p => 'translate(' + p.x + ',' + p.y + ')';
          const sel = d3.select(this).attr('transform', svgTranslate(start));
          promises.push(tween(sel).attr('transform', svgTranslate(end)).end());
        });
        state.linksWrapper.selectAll('path[data-link-to]').filter(d => !d.data.virtual && !d.parent.data.virtual).each(function (d) {
          const prior = old && old.links.get(d.data.id), sel = d3.select(this), end = branchPath(d);
          if (prior) sel.attr('d', shiftPath(prior.getAttribute('d'), minX - old.minX));
          else sel.attr('opacity', 0);
          promises.push(tween(sel).attr('d', end).attr('opacity', 1).end());
        });
        if (old) old.nodes.forEach((prior, id) => {
          if (current.has(id)) return;
          const ghost = prior.clone;
          ghost.setAttribute('class', 'oc-exiting'); ghost.setAttribute('aria-hidden', 'true');
          ghost.removeAttribute('data-layout-id'); ghost.removeAttribute('id');
          ghost.querySelectorAll('[id],[data-toggle-key],[data-oc-id],[tabindex]').forEach(el => {
            ['id', 'data-toggle-key', 'data-oc-id'].forEach(a => el.removeAttribute(a));
            el.setAttribute('tabindex', '-1');
          });
          ghost.querySelectorAll('button').forEach(el => { el.disabled = true; });
          this.nodeLayers[side].node().appendChild(ghost);
          const start = local(prior), parent = survivingParent(prior);
          const end = parent ? { x: parent.x + parent.w / 2 - prior.w / 2, y: parent.y + parent.h } : start;
          const sel = d3.select(ghost).style('transform', translate(start));
          promises.push(tween(sel).style('transform', translate(end)).style('opacity', 0).remove().end());
        });
        if (old) old.links.forEach((ghost, id) => {
          if (current.has(id)) return;
          ghost.setAttribute('class', 'oc-exiting'); ghost.setAttribute('aria-hidden', 'true');
          ghost.removeAttribute('data-link-to'); ghost.removeAttribute('data-link-from');
          ghost.setAttribute('d', shiftPath(ghost.getAttribute('d'), minX - old.minX));
          state.linksWrapper.node().appendChild(ghost);
          const parent = survivingParent(old.nodes.get(id));
          const exit = tween(d3.select(ghost)).attr('opacity', 0);
          if (parent) {
            const x = parent.x + parent.w / 2, y = parent.y + parent.h;
            exit.attr('d', 'M ' + x + ' ' + y + ' L ' + x + ' ' + y + ' Q ' + x + ' ' + y + ' ' + x + ' ' + y +
              ' L ' + x + ' ' + y + ' Q ' + x + ' ' + y + ' ' + x + ' ' + y + ' L ' + x + ' ' + y);
          }
          promises.push(exit.remove().end());
        });
      });
      this.animating = promises.length > 0;
      Promise.allSettled(promises).then(() => {
        if (token !== this.motionId) return;
        this.cancelMotion(); onComplete();
      });
    }

    render() {
      this.beginMotion();
      const start = performance.now(), rows = { 0: 0 }, data = {};
      ['L', 'R'].forEach(side => {
        const nodes = [{ id: '__root', parentId: null, level: 0, virtual: true, w: 0, h: 0, html: '' }];
        const sources = new Map([...this.vm.$refs.measure.querySelectorAll('[data-measure-side="' + side + '"] > .oc-node')]
          .map(el => [el.dataset.ocId, el]));
        const walk = (tree, parentId) => tree.forEach(org => {
          const source = sources.get(org.id), level = Number(org.orgLevel) || 1;
          const head = source.querySelector('.oc-head');
          const size = box(head), id = 'org:' + org.id;
          // 多根可能起于不同真实层级；不可见占位补齐，不生成假组织或连线。
          let parent = parentId;
          if (!parent) {
            parent = '__root';
            for (let rank = 1; rank < level; rank++) {
              const spacer = '__spacer:' + org.id + ':' + rank;
              nodes.push({ id: spacer, parentId: parent, level: rank, virtual: true, w: 0, h: 0, html: '' });
              parent = spacer;
            }
          }
          const wrapper = document.createElement('div');
          wrapper.className = 'oc-node'; wrapper.dataset.ocId = org.id;
          wrapper.dataset.parentOrg = parentId ? parentId.slice(4) : '';
          wrapper.appendChild(head.cloneNode(true));
          nodes.push({ id, parentId: parent, level, ...size, html: wrapper.outerHTML, orgId: org.id });
          rows[level] = Math.max(rows[level] || 72, size.h);
          if (!this.vm.expanded.has(side + org.id)) return;
          // 子组织保持业务顺序在左，直属人编整体在右。
          walk(org.children, id);
          // 直属人编整体作为轻量分支，保持职位内部细线和紧凑人员行。
          const detail = source.querySelector('.oc-tail');
          if (detail) {
            const detailSize = box(detail), branch = document.createElement('div');
            const cards = [...detail.querySelectorAll('.oc-pos')];
            const detailClone = detail.cloneNode(true);
            if (cards.length === 1 && !org.children.length) {
              // 以职位中心对齐父组织，并为向右展开的人编内容保留完整避让占位。
              const card = cards[0].getBoundingClientRect(), bounds = detail.getBoundingClientRect();
              const entryX = card.left + card.width / 2 - bounds.left;
              const halfWidth = Math.max(entryX, detailSize.w - entryX);
              detailClone.style.width = detailSize.w + 'px';
              detailClone.style.marginLeft = (halfWidth - entryX) + 'px';
              detailSize.w = halfWidth * 2;
            }
            branch.className = 'oc-detail-branch'; branch.dataset.ownerOrg = org.id;
            branch.dataset.positionCount = String(cards.length);
            branch.appendChild(detailClone);
            nodes.push({ id: 'detail:' + org.id, parentId: id, level: level + 1,
              ...detailSize, html: branch.outerHTML, detail: true, orgId: org.id,
              detailEntry: cards.length > 1 ? 'first-position-top' : 'single-position' });
          }
        });
        walk(side === 'L' ? this.vm.leftTree : this.vm.rightTree, null);
        data[side] = nodes;
      });

      ['L', 'R'].forEach(side => {
        const host = this.vm.$refs[refs[side]], nodes = data[side];
        let chart = this.charts[side];
        if (!chart) {
          chart = this.charts[side] = new d3.OrgChart().container(host)
            .defaultFont(getComputedStyle(this.vm.$refs.measure).fontFamily)
            .duration(0).compact(false).layout('top').rootMargin(0).linkYOffset(0)
            .nodeWidth(d => d.data.w).nodeHeight(d => d.data.h)
            .siblingsMargin(() => 20).neighbourMargin(() => 24)
            .nodeContent(() => '').buttonContent(() => '')
            .nodeButtonWidth(() => 0).nodeButtonHeight(() => 0)
            .setActiveNodeCentered(false)
            .linkUpdate(function (d) {
              d3.select(this).attr('stroke', '#c9d2e6').attr('stroke-width', 1)
                .attr('data-link-to', d.data.id).attr('data-link-from', d.parent.data.id)
                .attr('display', d.data.virtual || d.parent.data.virtual ? 'none' : null);
            });
        }
        chart.childrenMargin(d => d.data.level === 0 ? 0 : this.vm.chartMode === 'compare' ? (rows[d.data.level] || 72) + 32 - d.height : 32)
          .data(nodes.map(node => Object.assign({ _expanded: true }, node))).render();
        d3.timerFlush();
        // 外层视口统一管理缩放、平移和尺寸，避免组件与页面双重控制。
        const state = chart.getChartState();
        state.svg.on('.zoom', null).attr('cursor', null).attr('aria-hidden', null);
        d3.select(window).on('resize.' + state.id, null);
        state.chart.attr('transform', null); state.centerG.attr('transform', null);
        // WebKit 的 foreignObject 对相对定位内容会产生绘制偏移；布局与连线仍用组件，内容放同坐标 HTML 层。
        state.nodesWrapper.selectAll('.node').interrupt().remove();
        state.linksWrapper.classed('oc-connectors', true);
        const real = state.root.descendants().filter(n => !n.data.virtual);
        const minX = real.length ? Math.min(...real.map(n => n.x - n.width / 2)) - 2 : 0;
        // Y 保留真实层级起点；页面适配会排除它之前的空白。
        const maxX = real.length ? Math.max(...real.map(n => n.x + n.width / 2)) + 2 : 1;
        const maxY = real.length ? Math.max(...real.map(n => n.y + n.height)) + 2 : 1;
        const width = Math.max(1, maxX - minX), height = Math.max(1, maxY);
        state.svg.attr('width', width).attr('height', height).attr('viewBox', [minX, 0, width, height].join(' '));
        host.style.width = width + 'px'; host.style.height = height + 'px';
        const layer = this.nodeLayers[side] = d3.select(host).selectAll('.oc-html-nodes').data([null]).join('div')
          .attr('class', 'oc-html-nodes').style('transform', 'translateX(' + (-minX) + 'px)');
        layer.selectAll('.node').data(real, d => d.data.id).join('div')
          .attr('class', 'node').attr('data-layout-id', d => d.data.id).attr('data-layout-level', d => d.data.level)
          .style('width', d => d.width + 'px').style('height', d => d.height + 'px')
          .style('transform', d => translate({ x: d.x - d.width / 2, y: d.y }))
          .style('opacity', 1).html(d => d.data.html);
        // 离屏只确定占位；可见卡片填满占位后重新测量锚点，避免两层宽度不同造成断线。
        const scale = new DOMMatrixReadOnly(getComputedStyle(host).transform).a || 1;
        layer.selectAll('.node').filter(d => d.data.detail).each(function (d) {
          const origin = this.getBoundingClientRect();
          const rect = el => {
            const r = el.getBoundingClientRect();
            return { x: (r.left - origin.left) / scale, y: (r.top - origin.top) / scale,
              w: r.width / scale, h: r.height / scale };
          };
          const cards = [...this.querySelectorAll('.oc-pos')].map(rect), first = cards[0];
          d.data.entryX = first.x + first.w / 2; d.data.entryY = first.y;
          const paths = [];
          const add = (id, points, color) => paths.push({ id, color,
            path: roundedPath(points) });
          if (cards.length > 1) {
            const trunkX = rect(this.querySelector('.oc-details')).x;
            const last = cards.at(-1), lastY = last.y + last.h / 2;
            // 入口和末端在连续路径上转弯，中间职位保持 T 形接入。
            const busX = d.parent.children.length === 1 ? d.data.entryX : d.parent.x - (d.x - d.width / 2);
            add('positions', [[busX, -16], [trunkX, -16], [trunkX, lastY], [last.x, lastY]], '#dbe4f7');
            cards.slice(1, -1).forEach((card, i) => add('position-' + (i + 1),
              [[trunkX, card.y + card.h / 2], [card.x, card.y + card.h / 2]], '#dbe4f7'));
          }
          this.querySelectorAll('.oc-detail').forEach((item, index) => {
            const list = item.querySelector('.oc-people'), button = item.querySelector('.oc-pos-toggle');
            if (!list || !button || !list.children.length) return;
            const toggle = rect(button), x = toggle.x + toggle.w / 2;
            const rows = [...list.children].map(rect), last = rows.at(-1);
            add('people-' + index, [[x, toggle.y + toggle.h / 2], [x, last.y + last.h / 2], [last.x, last.y + last.h / 2]], '#e9eef9');
            rows.slice(0, -1).forEach((row, i) => add('person-' + index + '-' + i,
              [[x, row.y + row.h / 2], [row.x, row.y + row.h / 2]], '#e9eef9'));
          });
          d.data.connectors = paths;
        });
        state.linksWrapper.selectAll('path[data-link-to]').interrupt().attr('d', d => branchPath(d));
        const connectors = state.centerG.selectAll('g.oc-detail-connectors-layer').data([null]).join('g')
          .attr('class', 'oc-detail-connectors-layer').attr('pointer-events', 'none').attr('fill', 'none').attr('stroke-width', 1);
        connectors.selectAll('g.oc-detail-connectors').data(real.filter(n => n.data.detail), d => d.data.id).join('g')
          .attr('class', 'oc-detail-connectors').attr('data-detail-for', d => d.data.id)
          .attr('transform', d => 'translate(' + (d.x - d.width / 2) + ',' + d.y + ')')
          .each(function (d) {
            d3.select(this).selectAll('path').data(d.data.connectors, p => p.id).join('path')
              .attr('data-connector', p => p.id).attr('d', p => p.path).attr('stroke', p => p.color);
          });
        this.layouts[side] = real.map(n => ({ id: n.data.id, parentId: n.data.parentId, level: n.data.level,
          x: n.x - n.width / 2, y: n.y, w: n.width, h: n.height }));
      });
      this.renderCount++;
      this.lastRenderMs = Math.round((performance.now() - start) * 10) / 10;
    }

    destroy() {
      this.cancelMotion();
      ['L', 'R'].forEach(side => {
        const host = this.vm.$refs[refs[side]];
        host.removeEventListener('click', this.listeners[side]);
        host.removeEventListener('keydown', this.listeners[side + 'Key']);
        const chart = this.charts[side];
        if (chart) d3.select(window).on('resize.' + chart.getChartState().id, null);
      });
    }
  }

  function branchPath(node) {
    // 多职位接首个职位顶部中心；后续职位由职位组左侧公共竖线平级承接。
    const x = node.data.detail ? node.x - node.width / 2 + node.data.entryX : node.x;
    const y = node.data.detail ? node.y + node.data.entryY : node.y;
    const parent = node.parent, startY = parent.y + parent.height, busY = node.y - 16;
    if (Math.abs(x - parent.x) < 0.01) return 'M ' + x + ' ' + startY + ' L ' + x + ' ' + y;
    const direction = Math.sign(x - parent.x);
    const radius = Math.min(8, Math.abs(x - parent.x) / 2, Math.max(0, (busY - startY) / 2), Math.max(0, (y - busY) / 2));
    return 'M ' + parent.x + ' ' + startY + ' L ' + parent.x + ' ' + (busY - radius) +
      ' Q ' + parent.x + ' ' + busY + ' ' + (parent.x + direction * radius) + ' ' + busY +
      ' L ' + (x - direction * radius) + ' ' + busY + ' Q ' + x + ' ' + busY + ' ' + x + ' ' + (busY + radius) + ' L ' + x + ' ' + y;
  }

  function roundedPath(points) {
    let path = 'M ' + points[0].join(' ');
    for (let i = 1; i < points.length - 1; i++) {
      const [x, y] = points[i], before = points[i - 1], after = points[i + 1];
      const incoming = Math.hypot(before[0] - x, before[1] - y), outgoing = Math.hypot(after[0] - x, after[1] - y);
      const radius = Math.min(8, incoming / 2, outgoing / 2);
      if (radius < 0.01) { path += ' L ' + x + ' ' + y; continue; }
      path += ' L ' + (x + (before[0] - x) * radius / incoming) + ' ' + (y + (before[1] - y) * radius / incoming) +
        ' Q ' + x + ' ' + y + ' ' + (x + (after[0] - x) * radius / outgoing) + ' ' + (y + (after[1] - y) * radius / outgoing);
    }
    return path + ' L ' + points.at(-1).join(' ');
  }

  const translate = p => 'translate(' + p.x + 'px,' + p.y + 'px)';
  function shiftPath(path, delta) {
    let index = 0;
    return path.replace(/-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/gi, value => String(Number(value) + (index++ % 2 === 0 ? delta : 0)));
  }

  window.OA.CompareChart = CompareChart;
})();
