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
    data() { return { collapsed: false, zhCN, theme: THEME, modules: MODULES, searchValue: null }; },
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
      '  <div :class="{ \'oa-fill\': fill }" style="height:100%;display:flex;flex-direction:column">',
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
      '                    :title="i.label" @click="onMenu(i.key)">{{ collapsed ? i.label.slice(0, 1) : i.label }}</button>',
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
