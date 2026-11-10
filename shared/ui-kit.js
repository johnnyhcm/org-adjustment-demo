/* 公共件：页面挂载、确认弹框（UI-01/UI-03）、提示、跳转、高亮 */
(function (root) {
  function mount(options) {
    function run() {
      if (typeof antd === 'undefined') {
        const el = document.getElementById('app');
        if (el) el.innerHTML = '<p style="color:#CF1322;padding:20px">组件库脚本未加载，请用 serve.py 通过 HTTP 预览。</p>';
        return;
      }
      const app = Vue.createApp(options).use(antd);
      if (root.OA && root.OA.Shell) app.component('oa-shell', root.OA.Shell); // 固定外壳
      if (root.ProtoComponents) ProtoComponents.install(app); // Skill 原型组件（EmployeeSelect 等）
      app.mount('#app');
    }
    if (typeof antd !== 'undefined') { run(); return; }
    // 防御：万一 vendor 加载顺序异常，兜底再取一次
    const s = document.createElement('script');
    s.src = 'shared/vendor/antd.min.js';
    s.onload = run;
    document.head.appendChild(s);
  }

  const ui = {
    mount,
    toast(msg, type) { antd.message[(type || 'success')](msg); },
    /* UI-01：取消/关闭/Esc 均无变化；UI-03：确认中防重复 */
    confirm(opt) {
      antd.Modal.confirm({
        title: opt.title || '确认操作',
        content: opt.content || '',
        okText: opt.okText || '确认',
        cancelText: opt.cancelText || '取消',
        okButtonProps: opt.danger ? { danger: true } : {},
        onOk: opt.onOk
      });
    },
    info(opt) {
      antd.Modal.info(Object.assign({ okText: '知道了' }, opt));
    },
    go(url) { window.location.href = url; },
    qs(name) { return new URLSearchParams(window.location.search).get(name); },
    /* ORG-13/POS-10/PER-14：2 秒高亮 */
    flash(el, ms) {
      if (!el) return;
      el.classList.remove('oa-flash');
      void el.offsetWidth; // 重启动画
      el.classList.add('oa-flash');
      setTimeout(() => el.classList.remove('oa-flash'), ms || 2000);
    }
  };

  root.OA = root.OA || {};
  root.OA.ui = ui;
})(window);
