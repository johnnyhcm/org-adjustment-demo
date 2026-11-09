/* HRONE 固定外壳（对齐 hrone-html-prototype templates/shell.html）：
 * 顶栏 52px（logo/首页/全部菜单/历史页签/搜索菜单/语言/通知/用户）
 * 左菜单 220px（可折叠 80px，分组菜单项）
 * 内容区（页签栏 + 页面内容 slot）
 * 演示范围边界：非「组织调整」的菜单点击给出明确说明（DEM-02：不提供装饰性假入口）
 */
(function (root) {
  const zhCN = {
    locale: 'zh-cn',
    global: { placeholder: '请选择', loading: '加载中', emptyText: '暂无数据' },
    Pagination: { items_per_page: '条/页', jump_to: '跳至', page: '页', prev_page: '上一页', next_page: '下一页', total: '共 {{total}} 条' },
    DatePicker: { placeholder: '请选择日期', today: '今天', now: '此刻', ok: '确定', clear: '清除' },
    Select: { placeholder: '请选择', notFoundContent: '无数据' },
    Table: { emptyText: '暂无数据', filterConfirm: '确定', filterReset: '重置', selectAll: '全选' },
    Modal: { okText: '确定', cancelText: '取消' },
    Empty: { description: '暂无数据' },
    Form: { optional: '（可选）', defaultValidateMessages: { required: '请输入${label}' } }
  };
  const THEME = {
    token: {
      colorPrimary: '#0E66FB', colorPrimaryHover: '#036dde',
      colorLink: '#0E66FB', colorLinkHover: '#036dde',
      colorSuccess: '#00b259', fontSize: 12, borderRadius: 6
    }
  };
  /* 菜单图标（线性 SVG，currentColor 继承菜单颜色；收起态仅显示图标） */
  const ICON = (paths) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
  const ICONS = {
    'org-arch': ICON('<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>'),
    'org-adjust': ICON('<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>'),
    'headcount': ICON('<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>'),
    'emp': ICON('<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>'),
    'process': ICON('<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>'),
    'leave': ICON('<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>'),
    'settings': ICON('<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>')
  };
  const MODULES = [
    { group: '组织与编制', items: [{ key: 'org-arch', label: '组织架构' }, { key: 'org-adjust', label: '组织调整' }, { key: 'headcount', label: '编制管理' }] },
    { group: '人事事务', items: [{ key: 'emp', label: '员工档案' }, { key: 'process', label: '人事流程' }, { key: 'leave', label: '考勤假期' }] },
    { group: '系统', items: [{ key: 'settings', label: '系统设置' }] }
  ];

  root.OA = root.OA || {};
  root.OA.Shell = {
    name: 'OaShell',
    props: {
      title: { type: String, default: '组织调整' },  // 页签 / 历史页签标题
      fill: { type: Boolean, default: false }         // true：内容区占满（工作台用）
    },
    data() { return { collapsed: false, zhCN, theme: THEME, modules: MODULES, icons: ICONS, searchValue: null }; },
    computed: {
      menuOptions() {
        const out = [];
        this.modules.forEach(g => g.items.forEach(i => out.push({ value: i.key, label: i.label })));
        return out;
      }
    },
    methods: {
      /* 演示范围边界：非组织调整入口给出明确说明，不冒充可用功能 */
      outOfScope(label) { antd.message.info('原型演示范围为「组织调整」模块，' + label + '未包含在本轮演示中'); },
      onMenu(key) { if (key !== 'org-adjust') this.outOfScope('「' + this.labelOf(key) + '」'); },
      labelOf(key) { const o = this.menuOptions.find(x => x.value === key); return o ? o.label : key; },
      onSearchMenu(key) { if (key) { this.onMenu(key); this.searchValue = null; } },
      onTabEdit() { antd.message.info('演示中页签不可关闭'); }
    },
    template: [
      '<a-config-provider :locale="zhCN" :theme="theme">',
      '  <div :class="{ \'oa-fill\': fill }" style="height:100vh;overflow:hidden;display:flex;flex-direction:column">',
      '    <header class="layout-header">',
      '      <div class="header-left">',
      '        <div class="layout-logo"><span class="logo-text">HRONE</span></div>',
      '        <button class="header-icon-btn" title="首页" @click="outOfScope(\'人事首页\')">⌂</button>',
      '        <a-dropdown>',
      '          <button class="header-all-menu">全部菜单 ⌄</button>',
      '          <template #overlay>',
      '            <a-menu @click="e => onMenu(e.key)">',
      '              <template v-for="g in modules" :key="g.group">',
      '                <a-menu-item-group :title="g.group">',
      '                  <a-menu-item v-for="i in g.items" :key="i.key">{{ i.label }}</a-menu-item>',
      '                </a-menu-item-group>',
      '              </template>',
      '            </a-menu>',
      '          </template>',
      '        </a-dropdown>',
      '      </div>',
      '      <div class="header-history">',
      '        <span class="history-tag is-active">{{ title }}</span>',
      '      </div>',
      '      <div class="header-right">',
      '        <a-select class="layout-shortcuts-select" v-model:value="searchValue" placeholder="搜索菜单"',
      '                  :options="menuOptions" :show-search="true" :filter-option="true" @change="onSearchMenu"></a-select>',
      '        <button class="header-icon-btn" title="语言" @click="outOfScope(\'多语言切换\')">中</button>',
      '        <a-badge :count="2"><button class="header-icon-btn" title="通知" @click="outOfScope(\'通知中心\')">铃</button></a-badge>',
      '        <div class="header-user" @click="outOfScope(\'个人设置\')"><a-avatar :size="24">张</a-avatar>张伟</div>',
      '      </div>',
      '    </header>',
      '    <div class="layout-content">',
      '      <aside class="layout-left" :class="{ \'is-collapsed\': collapsed }">',
      '        <div class="layout-menu">',
      '          <template v-for="g in modules" :key="g.group">',
      '            <div class="menu-group-title" v-if="!collapsed">{{ g.group }}</div>',
      '            <button v-for="i in g.items" :key="i.key" :class="[\'menu-item\', { \'is-active\': i.key === \'org-adjust\' }]"',
      '                    :title="i.label" @click="onMenu(i.key)"><span class="menu-item-icon" v-html="icons[i.key]"></span><span v-if="!collapsed">{{ i.label }}</span></button>',
      '          </template>',
      '        </div>',
      '        <div class="layout-menu-footer" @click="collapsed = !collapsed">{{ collapsed ? \'»\' : \'«\' }}</div>',
      '      </aside>',
      '      <div class="layout-right">',
      '        <div class="layout-view">',
      '          <a-tabs class="layout-tabs" size="small" type="editable-card" hide-add :active-key="\'current\'" @edit="onTabEdit">',
      '            <a-tab-pane key="current">',
      '              <template #tab>',
      '                <a-tooltip :title="title" placement="top">',
      '                  <span class="layout-tab-title"><span class="layout-tab-title-text">{{ title }}</span></span>',
      '                </a-tooltip>',
      '              </template>',
      '            </a-tab-pane>',
      '          </a-tabs>',
      '        </div>',
      '        <div class="layout-view-main">',
      '          <slot></slot>',
      '        </div>',
      '      </div>',
      '    </div>',
      '  </div>',
      '</a-config-provider>'
    ].join('\n')
  };
})(typeof window !== 'undefined' ? window : globalThis);
