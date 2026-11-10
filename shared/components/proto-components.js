/**
 * HRONE 原型模板组件（CDN / Vue 3 + Ant Design Vue 4）
 * ---------------------------------------------------------------------------
 * 这是「可直接放进生成页面」的业务组件，不是生产 .vue 源码的替代品：
 *   1. 生产 EmployeeSelect / SelectTableModal 的 props、事件、class 保持一致；
 *   2. 数据通过 data-request 注入，原型里传 mock 函数即可；
 *   3. 组件自带样式，页面无需再抄一遍；
 *   4. 页面只需在 antd 之后引入本文件，并调用 ProtoComponents.install(app)。
 *
 * 用法：
 *   <script src="components/proto-components.js"></script>
 *   const app = createApp({ ... });
 *   ProtoComponents.install(app);
 *   app.use(antd).mount('#app');
 *
 * 组件：
 *   <proto-employee-select>      对应 src/components/employee-select/main.vue
 *   <proto-select-table-modal>   对应 src/components/select-table-modal/main.vue
 *
 * 源码对齐（2026-11）：字段名、searchWays 值、最多 200 条粘贴、选项格式
 * `name (jobNumber, positionName)`、弹窗三栏结构与事件均照生产组件实现。
 */
(function (global) {
  'use strict';

  const Vue = global.Vue;
  if (!Vue) {
    console.error('[proto-components] 需要先加载 Vue 3 全局构建（vue.global.prod.js）');
    return;
  }

  const { ref, computed, watch, nextTick, onMounted } = Vue;

  /* ========================================================================
   * 组件样式（只注入一次；class 名与生产组件/系统基线一致）
   * ===================================================================== */
  const STYLE_ID = 'proto-components-style';
  const COMPONENT_CSS = `
  /* EmployeeSelect：外层必须是 a-input-group compact，让相邻控件边框贴合、圆角合并 */
  .staff-select-group { width: 100%; }
  .staff-select-group .staff-select { width: 100%; }
  .staff-select-group.is-multiple-exact-search { display: flex; }
  .staff-select-group.is-multiple-exact-search .staff-select { width: 0; flex: 1; }

  /* SelectTableModal：1000px 三栏弹窗（左组织树 / 中表格 / 右已选） */
  .stm-title { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-right: 40px; }
  .stm-title__text { font-size: 14px; font-weight: 500; line-height: 30px; white-space: nowrap; }
  .stm-body { display: flex; min-height: 420px; }
  .stm-org { display: flex; flex-direction: column; width: 200px; flex-shrink: 0; }
  .stm-org__head { display: flex; align-items: center; justify-content: space-between; line-height: 30px; }
  .stm-org__head .ant-btn { height: auto; padding: 0; }
  .stm-org__tree { flex: 1; overflow: auto; padding-top: 4px; }
  .stm-org__tree .ant-tree { background: transparent; font-size: 12px; }
  .stm-org__sub { padding-top: 8px; border-top: 1px solid var(--border, #eee); }
  .dividing-line-left, .dividing-line-right { width: 1px; flex-shrink: 0; background: var(--border, #eee); }
  .dividing-line-left { margin-left: 10px; }
  .dividing-line-right { margin-right: 10px; }
  .stm-table { width: 0; flex: 1; min-width: 0; padding: 0 10px; }
  .selected-right { width: 180px; flex-shrink: 0; }
  .selected-right .tip { display: flex; align-items: center; justify-content: space-between; }
  .selected-right .tip > span { line-height: 30px; color: var(--text-3, #888); }
  .selected-right .tip .ant-btn { height: auto; padding: 0; }
  .selected-items { max-height: 400px; overflow: auto; }
  .selected-items .ant-tag {
    display: block; margin: 0 0 5px; max-width: 100%;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  `;

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = COMPONENT_CSS;
    document.head.appendChild(style);
  }

  /* ========================================================================
   * EmployeeSelect（对应 src/components/employee-select/main.vue）
   * ===================================================================== */
  const SEARCH_WAYS = [
    { label: '空格隔开', value: 'space' },
    { label: '逗号隔开', value: 'comma' },
    { label: '分号隔开', value: 'semiColon' },
    { label: '顿号隔开', value: 'period' }
  ];

  const SEPARATORS = {
    space: [' ', '\u3000'],
    comma: [',', '\uFF0C'],
    semiColon: [';', '\uFF1B'],
    period: ['\u3001']
  };

  const EMPLOYEE_TEMPLATE = `
<a-input-group compact class="staff-select-group" :class="{ 'is-multiple-exact-search': isMultipleExactSearch }">
  <a-select
    class="staff-select"
    :value="selectValue"
    :search-value="searchValue"
    :allow-clear="allowClear"
    :show-search="showSearch"
    :disabled="disabled"
    :label-in-value="labelInValue"
    :mode="multiple ? 'multiple' : undefined"
    :placeholder="placeholder || '请通过工号/姓名搜索'"
    :default-active-first-option="false"
    :filter-option="false"
    :options="selectOptions"
    @change="handleSelect"
    @blur="clearSearchValue"
    @paste="handlePaste"
    @search="handleSearch"
  >
    <template #notFoundContent>
      <span v-if="loading">数据加载中...</span>
      <span v-else>暂无数据</span>
    </template>
  </a-select>
  <a-select
    v-if="isMultipleExactSearch"
    :disabled="disabled"
    style="width: 100px;"
    v-model:value="searchWay"
    :options="searchWayData"
  />
</a-input-group>
`;

  const EmployeeSelect = {
    name: 'ProtoEmployeeSelect',
    template: EMPLOYEE_TEMPLATE,
    props: {
      value: { type: [String, Number, Object, Array], default: '' },
      multiple: { type: Boolean, default: false },
      fieldValue: { type: String, default: 'personId' },
      ids: { type: [Array, String], default: () => [] },
      allowClear: { type: Boolean, default: true },
      showSearch: { type: Boolean, default: true },
      labelInValue: { type: Boolean, default: false },
      dataUrl: { type: String, default: 'staffListSearchApi' },
      dataRequest: { type: Function, default: null },
      params: { type: Object, default: () => ({}) },
      staffStatus: { type: Array, default: () => [] },
      paramRequired: { type: Boolean, default: true },
      isMultipleExactSearch: { type: Boolean, default: false },
      insertNull: { type: Boolean, default: false },
      placeholder: { type: String, default: '' },
      disabled: { type: Boolean, default: false }
    },
    emits: ['update:value', 'update:selectedKey', 'change'],
    setup(props, { emit }) {
      const selectValue = ref();
      const queryData = ref([]);
      const loading = ref(false);
      const searchValue = ref('');
      const searchWay = ref('comma');
      const optionCache = ref({});
      let debounceTimer = null;
      let requestSeq = 0;
      let pastePending = false;

      const keyOf = item => (item ? item[props.fieldValue] : undefined);
      const valueOfSelect = item => (item && item.constructor === Object ? item.key : item);

      const normalizeList = result => {
        if (!result) return [];
        if (Array.isArray(result)) return result;
        if (Array.isArray(result.data)) return result.data;
        if (result.data && Array.isArray(result.data.records)) return result.data.records;
        return [];
      };

      const cacheItems = items => {
        const next = Object.assign({}, optionCache.value);
        items.forEach(item => {
          const key = keyOf(item);
          if (key !== undefined && key !== null) next[key] = item;
        });
        optionCache.value = next;
      };

      const selectOptions = computed(() => {
        const merged = [];
        const seen = {};
        const push = item => {
          if (!item) return;
          const key = keyOf(item);
          if (key === undefined || key === null || seen[key]) return;
          seen[key] = true;
          merged.push({
            value: key,
            label: item.name + ' (' + [item.jobNumber, item.positionName].filter(Boolean).join(', ') + ')',
            desc: item
          });
        };

        if (props.insertNull && queryData.value.length) {
          merged.push({ value: 'null_00000', label: '空(未填写)', desc: { name: '空(未填写)' } });
          seen['null_00000'] = true;
        }
        queryData.value.forEach(push);

        const selected = props.multiple
          ? (Array.isArray(selectValue.value) ? selectValue.value : [])
          : (selectValue.value === undefined || selectValue.value === null || selectValue.value === '' ? [] : [selectValue.value]);
        selected.forEach(item => {
          const key = valueOfSelect(item);
          if (optionCache.value[key]) push(optionCache.value[key]);
        });

        return merged;
      });

      watch(
        () => props.value,
        val => {
          if (props.multiple) {
            selectValue.value = Array.isArray(val) ? val.slice() : (val === undefined || val === null || val === '' ? [] : [val]);
          } else {
            selectValue.value = val === undefined || val === null || val === '' ? undefined : val;
          }
        },
        { immediate: true, deep: true }
      );

      const toComma = text => {
        const separators = SEPARATORS[searchWay.value] || [];
        if (!separators.length) return String(text || '').trim();
        const pattern = separators
          .map(ch => ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
          .join('|');
        return String(text || '').trim().replace(new RegExp(pattern, 'g'), ',');
      };

      const fetchEmployees = async keywords => {
        if (!props.dataRequest) return [];
        if (!keywords && props.paramRequired) return [];
        const current = ++requestSeq;
        loading.value = true;
        try {
          const result = await props.dataRequest(keywords, Object.assign({
            staffStatus: props.staffStatus,
            fieldValue: props.fieldValue
          }, props.params));
          if (current !== requestSeq) return [];
          const list = normalizeList(result);
          queryData.value = list;
          cacheItems(list);
          return list;
        } finally {
          if (current === requestSeq) loading.value = false;
        }
      };

      const scheduleSearch = keywords => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => { fetchEmployees(keywords); }, 300);
      };

      const handleSearch = str => {
        if (pastePending && !str) return;
        searchValue.value = str;
        if (!str) {
          queryData.value = [];
          return;
        }
        scheduleSearch(str);
      };

      const clearSearchValue = () => { searchValue.value = ''; };

      const emitSelection = (value, items, names) => {
        const first = Array.isArray(value) ? value[0] : value;
        emit('update:value', value);
        emit('update:selectedKey', Array.isArray(value) ? value.map(valueOfSelect) : valueOfSelect(first));
        emit('change', value, items, names);
      };

      const handleSelect = (value, option) => {
        searchValue.value = '';
        selectValue.value = value;
        const items = props.multiple ? (Array.isArray(option) ? option : []) : option;
        const names = props.multiple
          ? items.map(item => (item && item.desc ? item.desc.name : '')).filter(Boolean)
          : (option && option.desc ? option.desc.name : '');
        emitSelection(value, items, names);
      };

      const handlePaste = async event => {
        if (!props.isMultipleExactSearch) return;
        event.preventDefault();
        pastePending = true;

        const clipboard = event.clipboardData || global.clipboardData;
        const text = clipboard ? clipboard.getData('text/plain') : '';
        const hasNewline = /\r?\n/.test(text);
        let rows = hasNewline
          ? text.split(/\r?\n/).filter(row => row.trim() !== '')
          : toComma(text).split(',');

        rows = rows.map(row => row.trim()).filter(Boolean);
        if (rows.length > 200) {
          if (global.antd && global.antd.message) {
            global.antd.message.warning('您粘贴内容超过200条，仅解析前200条的内容');
          }
          rows = rows.slice(0, 200);
        }

        searchValue.value = text;
        if (hasNewline) searchWay.value = 'comma';

        const keywords = rows.join(',');
        if (!keywords) {
          pastePending = false;
          return;
        }

        clearTimeout(debounceTimer);
        const list = await fetchEmployees(keywords);
        pastePending = false;

        if (!list.length) {
          const keepText = searchValue.value;
          nextTick(() => { searchValue.value = keepText; });
          return;
        }

        const items = list.map(item => ({
          value: keyOf(item),
          label: item.name + ' (' + [item.jobNumber, item.positionName].filter(Boolean).join(', ') + ')',
          desc: item
        }));
        const value = props.multiple
          ? (props.labelInValue ? items.map(item => ({ key: item.value, label: item.label })) : items.map(item => item.value))
          : (props.labelInValue ? { key: items[0].value, label: items[0].label } : items[0].value);
        const names = props.multiple ? items.map(item => item.desc.name) : items[0].desc.name;

        selectValue.value = value;
        searchValue.value = '';
        queryData.value = [];
        emitSelection(value, props.multiple ? items : items[0], names);
      };

      const loadInitialOptions = async () => {
        if (!props.dataRequest) return;
        const values = props.multiple
          ? (Array.isArray(props.value) ? props.value : [])
          : (props.value === undefined || props.value === null || props.value === '' ? [] : [props.value]);
        const keys = values.map(valueOfSelect).filter(key => key !== undefined && key !== null && key !== '');
        const idList = Array.isArray(props.ids) ? props.ids : (props.ids ? String(props.ids).split(',').filter(Boolean) : []);
        const target = idList.length ? idList : keys;
        if (!target.length) return;
        const result = await props.dataRequest('', Object.assign({ ids: target }, props.params));
        cacheItems(normalizeList(result));
      };

      onMounted(loadInitialOptions);
      watch(() => props.ids, loadInitialOptions, { deep: true });

      return {
        selectValue, queryData, loading, searchValue, searchWay,
        searchWayData: SEARCH_WAYS, selectOptions,
        handleSelect, handleSearch, handlePaste, clearSearchValue
      };
    }
  };

  /* ========================================================================
   * SelectTableModal（对应 src/components/select-table-modal/main.vue）
   * ===================================================================== */
  const SEARCH_ICON = '<svg viewBox="64 64 896 896" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M909.6 854.5L649.9 594.8C690.2 542.7 712 479 712 412c0-80.2-31.3-155.4-88.1-212.1C567.1 143 491.7 112 411.6 112c-80.1 0-155.5 31-212.2 87.9C142.6 256.6 112 331.8 112 412c0 80.1 30.6 155.3 87.4 212.1 56.7 56.8 132.1 87.9 212.2 87.9 66.7 0 130.4-21.8 182.5-62.1l259.6 259.6c7.7 7.7 20.3 7.7 28 0l28-28c7.8-7.7 7.8-20.3.1-28zM411.6 663.6c-138.8 0-251.6-112.8-251.6-251.6S272.8 160.4 411.6 160.4 663.2 273.2 663.2 412 550.4 663.6 411.6 663.6z"/></svg>';

  const SELECT_TABLE_TEMPLATE = `
<div class="proto-select-table">
  <a-input
    v-if="showInput"
    :value="selectStr"
    readonly
    :disabled="disabled"
    :placeholder="placeholder || '请选择'"
    :style="disabled ? '' : 'cursor: pointer;'"
    @click.stop="open"
  >
    <template #suffix>
      <span style="display: inline-flex; align-items: center; color: #888;" @click.stop="open" v-html="searchIcon"></span>
    </template>
  </a-input>

  <a-modal
    v-model:open="visible"
    wrap-class-name="custom-modal select-table-modal"
    :width="1000"
    @cancel="modalCancel"
  >
    <template #title>
      <div class="stm-title">
        <div class="stm-title__text">{{ title || '请选择' }}</div>
        <a-input-search
          v-model:value="searchParams.keywords"
          :placeholder="searchTextHolder || '请输入内容搜索'"
          style="width: 200px;"
          @search="handleSearch"
          @press-enter="handleSearch"
        />
      </div>
    </template>

    <div class="stm-body">
      <template v-if="showPanels.includes('orgTree')">
        <div class="stm-org">
          <div class="stm-org__head">
            <span>组织架构</span>
            <a-button type="link" @click="selectAllOrg">全部</a-button>
          </div>
          <a-input v-model:value="orgKeyword" placeholder="输入关键词查找部门" allow-clear size="small" />
          <div class="stm-org__tree">
            <a-tree
              :tree-data="treeData"
              :field-names="{ children: 'children', title: 'name', key: 'oId' }"
              :selected-keys="treeSelectedKeys"
              :block-node="true"
              @select="handleTreeSelect"
            />
          </div>
          <div class="stm-org__sub">
            <a-checkbox v-model:checked="includeSub" @change="handleIncludeSubChange">包含下级</a-checkbox>
          </div>
        </div>
        <div class="dividing-line-left"></div>
      </template>

      <div class="stm-table">
        <a-table
          size="small"
          :columns="columns"
          :data-source="tableRows"
          :row-key="fieldValue"
          :row-selection="rowSelection"
          :pagination="paginationConfig"
          :loading="loading"
          :scroll="{ y: 360 }"
          :locale="{ emptyText: '暂无数据' }"
          @change="handleTableChange"
        />
      </div>

      <template v-if="showPanels.includes('selecteds')">
        <div class="dividing-line-right"></div>
        <div class="selected-right">
          <div class="tip">
            <span>已选({{ activeNodes.length }})</span>
            <a-button type="link" @click="handleRemoveAll">清空</a-button>
          </div>
          <div class="selected-items">
            <a-tag
              v-for="(item, index) in activeNodes"
              :key="index"
              closable
              @close="handleRemove(item)"
            >{{ item[fieldLabel] }}</a-tag>
          </div>
        </div>
      </template>
    </div>

    <template #footer>
      <a-button @click="modalCancel">取消</a-button>
      <a-button type="primary" @click="handleConfirm">确认</a-button>
    </template>
  </a-modal>
</div>
`;

  function parseCode(code) {
    if (Array.isArray(code)) return code.slice();
    if (code === undefined || code === null || code === '') return [];
    return String(code)
      .split(',')
      .filter(item => item !== '')
      .map(item => (/^\d+$/.test(item) ? Number(item) : item));
  }

  const SelectTableModal = {
    name: 'ProtoSelectTableModal',
    template: SELECT_TABLE_TEMPLATE,
    props: {
      oId: { type: [Number, String], default: null },
      text: { type: String, default: '' },
      code: { type: [String, Array, Number], default: '' },
      disabled: { type: Boolean, default: false },
      disabledSelectOids: { type: Array, default: () => [] },
      selectionType: { type: String, default: 'checkbox' },
      title: { type: String, default: '' },
      columns: { type: Array, default: () => [] },
      dataRequest: { type: Function, default: null },
      showPanels: { type: Array, default: () => ['orgTree', 'selecteds'] },
      showInput: { type: Boolean, default: false },
      placeholder: { type: String, default: '' },
      searchTextHolder: { type: String, default: '' },
      tableParams: { type: Object, default: () => ({}) },
      fieldValue: { type: String, default: 'id' },
      fieldLabel: { type: String, default: 'name' },
      selectedRows: { type: Array, default: () => [] },
      orgTree: { type: Array, default: () => [] }
    },
    emits: ['change', 'update:selectedRows', 'update:code', 'update:text'],
    setup(props, { emit, expose }) {
      const visible = ref(false);
      const selectStr = ref(props.text || '');
      const activeRowKeys = ref([]);
      const activeNodes = ref([]);
      const committedNodes = ref([]);
      const committedText = ref(props.text || '');
      const committedCode = ref(props.code);
      const tableRows = ref([]);
      const total = ref(0);
      const loading = ref(false);
      const pageNo = ref(1);
      const pageSize = ref(10);
      const orgKeyword = ref('');
      const treeSelectedKeys = ref([]);
      const includeSub = ref(true);
      const searchParams = ref({ oId: '', includeSub: '1', keywords: '' });
      const toTreeKey = value => (/^\d+$/.test(String(value)) ? Number(value) : value);
      let loadSeq = 0;

      const initializedCode = parseCode(props.code);
      if (initializedCode.length) committedCode.value = initializedCode;
      if (props.selectedRows && props.selectedRows.length) {
        committedNodes.value = props.selectedRows.slice();
        activeNodes.value = props.selectedRows.slice();
      }

      watch(() => props.text, value => {
        if (value) {
          selectStr.value = value;
          committedText.value = value;
        }
      });

      // 外部清空 code（如列表页「重置」）时，触发框与内部已选也要一起清空
      watch(() => props.code, value => {
        if (!parseCode(value).length) {
          committedCode.value = [];
          committedNodes.value = [];
          committedText.value = '';
          selectStr.value = '';
          activeRowKeys.value = [];
          activeNodes.value = [];
        }
      }, { deep: true });

      const normalizeResult = result => {
        if (!result) return { rows: [], total: 0 };
        if (Array.isArray(result)) return { rows: result, total: result.length };
        const data = result.data;
        if (Array.isArray(data)) {
          return { rows: data, total: result.total === undefined ? data.length : result.total };
        }
        if (data && Array.isArray(data.records)) {
          return { rows: data.records, total: data.total === undefined ? data.records.length : data.total };
        }
        return { rows: [], total: 0 };
      };

      const syncNodesFromRows = () => {
        const nodeMap = {};
        activeNodes.value.forEach(node => { nodeMap[String(node[props.fieldValue])] = node; });
        tableRows.value.forEach(row => {
          const key = String(row[props.fieldValue]);
          if (activeRowKeys.value.some(item => String(item) === key) && !nodeMap[key]) nodeMap[key] = row;
        });
        activeNodes.value = activeRowKeys.value
          .map(key => nodeMap[String(key)])
          .filter(Boolean);
      };

      const load = async () => {
        if (!props.dataRequest) {
          tableRows.value = [];
          total.value = 0;
          return;
        }
        const current = ++loadSeq;
        loading.value = true;
        try {
          const params = Object.assign({}, props.tableParams, searchParams.value, {
            pageNo: pageNo.value,
            pageSize: pageSize.value
          });
          const result = await props.dataRequest(params);
          if (current !== loadSeq) return;
          const normalized = normalizeResult(result);
          tableRows.value = normalized.rows;
          total.value = normalized.total;
          syncNodesFromRows();
        } finally {
          if (current === loadSeq) loading.value = false;
        }
      };

      const changeRowSelection = (selectedKeys, selectedRows) => {
        activeRowKeys.value = selectedKeys.slice();
        const nodeMap = {};
        activeNodes.value.concat(selectedRows.filter(Boolean)).forEach(row => {
          const key = String(row[props.fieldValue]);
          if (selectedKeys.some(item => String(item) === key) && !nodeMap[key]) nodeMap[key] = row;
        });
        activeNodes.value = selectedKeys
          .map(key => nodeMap[String(key)])
          .filter(Boolean);
      };

      const rowSelection = computed(() => ({
        type: props.selectionType,
        preserveSelectedRowKeys: true,
        selectedRowKeys: activeRowKeys.value,
        onChange: changeRowSelection,
        getCheckboxProps: record => ({
          disabled: props.disabledSelectOids.some(key => String(key) === String(record[props.fieldValue]))
        })
      }));

      const paginationConfig = computed(() => ({
        current: pageNo.value,
        pageSize: pageSize.value,
        total: total.value,
        size: 'small',
        showSizeChanger: true,
        pageSizeOptions: ['10', '20', '50'],
        showTotal: value => '共 ' + value + ' 条'
      }));

      const handleTableChange = pagination => {
        pageNo.value = pagination.current;
        pageSize.value = pagination.pageSize;
        load();
      };

      const filterTree = (nodes, keyword) => nodes
        .map(node => {
          const children = node.children ? filterTree(node.children, keyword) : undefined;
          const selfHit = !keyword || String(node.name).includes(keyword);
          if (selfHit) return Object.assign({}, node, { children: node.children });
          if (children && children.length) return Object.assign({}, node, { children });
          return null;
        })
        .filter(Boolean);

      const treeData = computed(() => filterTree(props.orgTree, orgKeyword.value.trim()));

      const handleTreeSelect = keys => {
        if (!keys.length) return;
        treeSelectedKeys.value = [keys[0]];
        searchParams.value.oId = String(keys[0]);
        searchParams.value.includeSub = includeSub.value ? '1' : '0';
        pageNo.value = 1;
        load();
      };

      const selectAllOrg = () => {
        treeSelectedKeys.value = [];
        searchParams.value.oId = '';
        pageNo.value = 1;
        load();
      };

      const handleIncludeSubChange = () => {
        searchParams.value.includeSub = includeSub.value ? '1' : '0';
        pageNo.value = 1;
        load();
      };

      const handleSearch = value => {
        if (typeof value === 'string') searchParams.value.keywords = value;
        pageNo.value = 1;
        load();
      };

      const handleRemove = item => {
        const key = String(item[props.fieldValue]);
        activeRowKeys.value = activeRowKeys.value.filter(itemKey => String(itemKey) !== key);
        activeNodes.value = activeNodes.value.filter(node => String(node[props.fieldValue]) !== key);
      };

      const handleRemoveAll = () => {
        activeRowKeys.value = [];
        activeNodes.value = [];
      };

      const restoreSelection = () => {
        const nextCode = parseCode(props.code);
        const keys = nextCode;
        activeRowKeys.value = keys.slice();

        const source = (props.selectedRows && props.selectedRows.length)
          ? props.selectedRows
          : (keys.length ? committedNodes.value : []);
        const nodeMap = {};
        source.forEach(node => {
          const key = String(node[props.fieldValue]);
          if (!keys.length || keys.some(item => String(item) === key)) nodeMap[key] = node;
        });
        activeNodes.value = keys.map(key => nodeMap[String(key)]).filter(Boolean);
        selectStr.value = props.text || (keys.length ? committedText.value : '') || '';
      };

      const open = () => {
        if (props.disabled) return;
        restoreSelection();

        searchParams.value = { oId: '', includeSub: '1', keywords: '' };
        if (props.oId !== null && props.oId !== undefined && props.oId !== '') {
          searchParams.value.oId = String(props.oId);
        }
        Object.assign(searchParams.value, props.tableParams || {});
        treeSelectedKeys.value = searchParams.value.oId ? [toTreeKey(searchParams.value.oId)] : [];
        includeSub.value = String(searchParams.value.includeSub) !== '0';
        pageNo.value = 1;
        visible.value = true;
        load();
      };

      const modalCancel = () => {
        activeRowKeys.value = parseCode(committedCode.value);
        activeNodes.value = committedNodes.value.slice();
        selectStr.value = committedText.value || props.text || '';
        visible.value = false;
      };

      const handleConfirm = () => {
        const dataCode = props.selectionType === 'radio'
          ? activeRowKeys.value.join(',')
          : activeRowKeys.value.slice();
        const text = activeNodes.value.map(node => node[props.fieldLabel]).join(',');

        committedCode.value = dataCode;
        committedNodes.value = activeNodes.value.slice();
        committedText.value = text;
        selectStr.value = text;

        emit('update:code', dataCode);
        emit('update:text', text);
        emit('update:selectedRows', activeNodes.value.slice());
        emit('change', dataCode, activeNodes.value.slice(), text);
        visible.value = false;
      };

      expose({ visible, open, close: modalCancel });

      return {
        visible, selectStr, activeRowKeys, activeNodes, tableRows, loading,
        searchParams, orgKeyword, treeSelectedKeys, includeSub,
        treeData, rowSelection, paginationConfig, searchIcon: SEARCH_ICON,
        open, modalCancel, handleConfirm, handleTableChange, handleTreeSelect,
        selectAllOrg, handleIncludeSubChange, handleSearch, handleRemove, handleRemoveAll
      };
    }
  };

  /* ========================================================================
   * 注册
   * ===================================================================== */
  ensureStyle();

  global.ProtoComponents = global.ProtoComponents || {};
  global.ProtoComponents.EmployeeSelect = EmployeeSelect;
  global.ProtoComponents.SelectTableModal = SelectTableModal;
  global.ProtoComponents.install = function (app) {
    app.component('proto-employee-select', EmployeeSelect);
    app.component('proto-select-table-modal', SelectTableModal);
    // 兼容生产标签写法：<employee-select> / <select-table-modal>
    app.component('employee-select', EmployeeSelect);
    app.component('select-table-modal', SelectTableModal);
  };
})(window);
