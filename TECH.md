# TECH 技术方案

版本：V0.22｜日期：2026-11-11｜依据：PRD.md V0.23、DISSCUSION.md 六十一—八十四节
最近变更：架构图改为“组织横向 + 内容纵向”两套线型；职位行/人员行/编制汇总；点击展开、hover 详情；缩放改为尺寸代理 + pinch 局部拦截。上版方案分类字段见 5.9。
前端规范来源：`gitee.com/cyenweb/hrone-html-prototype`（下称"原型 Skill"）

## 1. 总原则

- PRD 是唯一需求来源；本文只回答"怎么实现"，不改变任何业务规则。
- 无构建、无 Node、无后端：每页一个独立 HTML，静态服务预览，桌面 Chrome/Edge 演示。
- 遵循原型 Skill 硬约束：独立 HTML、真实页面跳转、组件只从 Skill 目录映射、`check.py` 自检、`serve.py` HTTP 预览、主色 `#0E66FB`、mock 空值 `--`。

## 2. 技术选型

| 项 | 选择 | 说明 |
| --- | --- | --- |
| 视图层 | Vue 3 全局构建（`vue.global.prod.js`） | 与 Skill 一致；Options/Composition API 混用无构建限制 |
| 组件库 | Ant Design Vue 4 + dayjs | 中文包；使用 Skill `standalone/vendor/` 本地副本，演示不依赖外网 |
| 持久化 | localStorage（写穿） | UI-02 暂存即架构；页面跳转 = 从 localStorage 恢复 |
| 模块组织 | 普通 `<script>` 固定顺序 + 全局命名空间 `OA` | 与 Skill 现有模式一致；不用 ES modules |
| 拖拽 | 原生 HTML5 Drag & Drop | 四类拖拽源：组织节点、职位卡、人员行、可用空编行 |
| 架构双图 | 纯 CSS 树 + transform 缩放/平移 | 不引入图表库；缩放 25%—200%、步长 10%（CMP-05） |
| PDF | 占位（无依赖） | 见 PRD PDF-01/06 V0.2 |
| 工具链 | Skill `scripts/scaffold.py`、`check.py`、`serve.py` | Python 3 标准库即可 |

## 3. 文件结构

```text
原型/组织调整/
├── index.html                 方案列表（WF-02：案例一、案例二两个方案）
├── 02-新建方案.html           新建方案（WF-03）
├── 03-工作台.html             四区工作台（WF-04—12，最重页面）
├── 04-前后对比.html           日常对比 / 提交前确认双模式（WF-14、15）
├── 05-方案详情.html           审批进度、附件占位、生效结果（WF-16）
├── 06-演示自测.html           内部自测：NUM-01—08 断言 + INV 不变量（演示控制分组下）
└── shared/
    ├── vendor/                ← 复制 Skill standalone/vendor（vue、antd、dayjs、reset.css）
    ├── components/proto-components.js   ← 复制 Skill templates/components
    ├── seed-data.js           三套种子：华东（仅自测）、CASE-01、CASE-02
    ├── store.js               数据模型 + 操作 + 差异引擎 + 快照 + 暂存 + 守恒校验
    ├── shell.js               HRONE 固定外壳（顶栏/页签/左侧菜单，对齐 Skill shell.html）
    ├── ui-kit.js              公共件：确认弹框、拖拽、高亮、待处理胶囊、差异渲染、暂存
    └── theme.css              主色变量与公共布局（三栏、卡片、胶囊、架构图连线）
tests/selftest-runner.js      28 项数据断言（浏览器 06 页与 Node 共用）
tools/run-tests.js            Node 断言入口（退出码 0 = 全绿，每轮提交前质量门）
README.md                     交付说明 + 追溯矩阵（需求 → 实现 → AT）
验收记录.md                   按 PRD 14.5 格式逐条记录（M6 交付）
```

## 4. 数据模型（稳定 ID）

所有实体用稳定 ID 关联，操作只改引用关系，身份永不重建（BR-01—08）。方案创建时对整图做克隆存为 `base`（方案原始基准），差异永远对 `base` 计算（APR-03）。

| 实体 | 关键字段 |
| --- | --- |
| org | id、name、code、parentId、status（有效/停用/新增）、setupDate、leaderId、hrbpId |
| position | id、name、code、orgId、levelMin、levelMax、setupDate、order、status |
| headcount | id、code、positionId、level、state（可用/占编/需求预留/Offer占用/待调入预留）、personId?、demandId? |
| person | id、name、positionId、level、headcountId?、managerId、status |
| futureItem | id、type（Offer/待入职/待调入）、personId、targetPositionId、headcountId?、date、refs[] |
| demand | id、name、headcountIds[] |
| concurrentPost | id、personId、mainPositionId、concurrentPositionId、status |
| plan | id、name、effDate、adjustLevel、adjustReason、scopeOrgIds[]、targetOrgIds[]、desc（详细原因）、status（ST-01—07）、base、versions[]（快照+审批记录） |

调整字段取值：`adjustLevel ∈ {BU/条线级, BU下设一级, BU下设二级, 其他}`；`adjustReason ∈ {外部原因, 内部原因}`；二者由 `createPlan` 校验非空，无默认值，创建后只读。localStorage 键：`oa.schema`（结构版本）、`oa.plans`（索引）、`oa.plan.<id>`（整图含 base 与 versions）、`oa.ui.<planId>`（页面定位状态，LIST-02 恢复用）、`oa.ui.listColWidths`（列表列宽，LIST-05 记忆）、`oa.demo`（演示控制标志）。重置 = 从 seed-data.js 重建该方案键；列宽记忆不随方案重置清空。

## 5. 关键机制

### 5.1 store 单一入口

所有操作经 `OA.store.apply(op)`：变更内存 → `assertInvariants()`（INV-01—05，开发态自检）→ 记差异 → 写 localStorage。UI 只调操作，不直接改数据——PRD 12.3 交互边界的守恒规则落在数据层一处。

**Vue 响应式接入（ensureReactive）**：store 数据是普通对象，Vue 无法感知其变更（曾导致更名后树不刷新、卡片计数不更新、复选框状态不回显——同一根因）。浏览器环境下 store.load/resetAll 后将整库包装为 `Vue.reactive`：页面读代理、store 写代理，每次 apply 后界面自动刷新；Node 自测环境无 Vue，自动跳过，框架无关性保留。

操作清单：更名/编辑组织、移动组织（携子树）、停用/启用组织、新增/复制组织、新增/编辑/复制/停用职位、职位整体移动（单项/批量）、同级排序（不记差异）、调岗（带编/不带编/批量/下属自动更新）、解除编制、增编、减编、空编按编码多选/单步变更、自动匹配、取消兼职（操作保留，Demo 不暴露入口）、调整范围补充、提交（快照）、演示流转（审批/退回/生效）。

### 5.2 差异引擎

`diff(base, current)` 产出六类（组织/职位/人员/编制/兼职/未来事项）各对象**一条最终差异**；展示层在兼职关闭时只呈现五类（5.8）（CMP-13、CMP-18：改回基准即移出）。字段级"旧值 → 新值"供删除线渲染；"随职位整体迁移"等变化原因由操作传入。工作台待处理、对比清单、详情页消费同一份差异结果。

### 5.3 快照与版本

提交时 `structuredClone` 整图存入 `versions[]`（V1、V2…），审批详情、进度、重提对比均只读对应快照；V2 对方案原始 `base` 比较，不对 V1 比较。草稿任何后续修改不影响已提交快照（APR-04、AT-56）。

### 5.4 数量口径

CNT-01—10 全部实现为 `store.js` 中的 selector，页面只调用不自行计算——九种口径全局一致的唯一保证。

### 5.5 公共件（ui-kit.js）

| 公共件 | 统一掉的 PRD 细节 |
| --- | --- |
| confirmModal | UI-01 取消/关闭/Esc 无变化；UI-03 处理中禁重复点击 |
| persist | UI-02 写入/恢复/失败重试/失败禁提交；`oa.demo.persistFail` 注入（AT-61） |
| dragKit | 落点校验（自身/后代/停用/范围外禁放 + 就近解释，ORG-10）；确认前不落库 |
| highlight | 2 秒高亮 + 变更胶囊持续（ORG-13、POS-10、PER-14） |
| pendingBadge | 待处理胶囊点击定位原位置（LAY-07、FUT-03） |
| diffCell | "旧值删除线 → 新值"统一渲染（CMP-12） |

### 5.6 演示控制（EFF-04 / 六十九简化方案）

不建独立面板，收敛为两处：① 方案列表页底部橙色「演示控制」条：一键重置全部演示数据（恢复两个预置方案种子）；② 方案详情页「演示操作」小节承载流程推进（审批通过/退回可填意见/模拟到期成功/生效异常），按钮按状态机启停（仅审批中可审、仅待生效可执行），不可用置灰+悬停原因。暂存失败注入开关保留在 06-演示自测页（AT-61）。

### 5.7 自测页（06-演示自测.html）

- NUM-01—08：按 PRD 13.4 表格数字逐条断言（测试即验收映射）。
- INV-01—05 不变量断言；DUP 去重、PTKEEP 兼职保留场景断言。
- 快照不可变：提交后修改草稿，断言 V1 快照与差异不变。
- 全部从种子重建开始，不污染演示数据。

断言逻辑在 `tests/selftest-runner.js`（纯 JS，页面与 Node 共用）；命令行运行：`node tools/run-tests.js`（退出码 0 = 全绿），是每轮提交前的质量门。

### 5.8 展示开关（Demo 边界，PRD 0.5）

- 单一事实源：`OA.store.FEATURES = { concurrentPost: false }`。页面只读该对象，不得各自定义开关。
- 关闭时隐藏：右栏“兼职”区块、搜索占位与空态说明中的兼职措辞、职位多选提示、移动组织/职位确认框的兼职计数与跟随说明、职位编辑提示、对比页“兼职”页签及计数。
- 不关闭：`posts[]` 数据、`CNT.posts`、`diffPlan().posts`、`cancelPost/addPost` 操作、种子数据与 06 页数据层断言——保证人员调岗、组织/职位移动、编制与提交链路完全不受影响。
- 对比页由 `diffCountsVisible(plan)` 过滤页签；`diffCounts(plan)` 保持六类原值，供数据层与自测使用。
- 恢复 = 开关置 `true`，模板中已用 `v-if="showPosts"` 包裹的区块会整体回来；无需恢复任何数据。

### 5.9 方案分类字段（PRD F-01）

- 数据：plan 元数据新增 `adjustLevel`、`adjustReason`；`desc` 保持字段名不变，仅展示标题改为“详细原因”，避免无意义的数据迁移。
- 校验：`createPlan` 统一校验，错误文案“请选择调整层级”“请选择调整原因”；列表弹框与 02 兼容页共用同一操作，不在页面各写一套。
- 展示：列表新增“调整层级”“调整原因”两列（可拖拽列宽、参与横向滚动）；详情页与前后对比基本信息只读展示；工作台顶栏不展示，避免挤压方案名。
- 提示语：选项与两段说明统一放在 `store.js`（`ADJUST_LEVELS / ADJUST_REASONS / REASON_HINTS`）导出，页面只渲染；选中后在字段下方显示，不写进下拉选项文本。
- 兼容：02-新建方案.html 为直达兼容页，字段与校验必须与列表弹框一致；两处都调用 `OA.store.apply(null, 'createPlan', …)`。

## 6. 页面与组件映射要点

- 列表/新建/详情按 Skill 模板骨架（`scaffold.py --type list/form/detail`）；工作台、对比页为组合布局，用 shell 骨架改。
- **固定外壳**：`shared/shell.js` 提供 `oa-shell` 全局组件（52px 顶栏 + 页签 + 220px 可折叠左菜单 + 内容区），对齐 Skill shell.html；左菜单按 PRD SHELL-01 组织为组织管理/职位管理/编制管理/组织配置四组，组织管理默认展开，“组织调整方案”为当前项；非组织调整范围的菜单点击给出明确说明（DEM-02）。工作台用 `fill` 模式占满内容区。
- **工作台（03-工作台.html）**：`oa-fill` 下按 `wb-planbar(48px) + workbench(flex:1) + wb-actions(52px)` 纵向布局，页面不滚动；`.workbench` 三栏均 `min-height:0; overflow:hidden`，`.wb-col-head` 固定 76px 等高，采用 `justify-content:center; gap:6px`，标题行与搜索行之间不再用 `margin-top:auto` 撑出空白；`.wb-col-body` 各自 `overflow-y:auto`。三栏等宽 `flex:1 1 0; min-width:0`，`.workbench` 使用 10px `gap`；三栏白卡由内容区底色分隔；顶部 `wb-planbar` 与底部 `wb-actions` 背景透明。对比弹框：`compareOpen/compareMode` 控制单层全屏 `a-modal`，宽度 100vw、顶部 0；`.compare-modal .ant-modal-content` 使用 `height:100vh; display:flex; flex-direction:column`，body `flex:1; min-height:0`，iframe 100% 填充；iframe 指向 `04-前后对比.html?plan=<id>&embed=1&mode=view|submit`。04 页在 embed 模式隐藏外壳并取消 1280px 最大宽度，返回/提交通过 `postMessage`（`oa-compare-close`/`oa-compare-submitted`）通知工作台。工作台细节按 WB-01—12：组织单行名称后显示负责人、职位两行卡片且名称带职级范围、右栏人员名称带职级、姓名点击仅提示将打开档案、可用空编逐条编码/职级/A-B-C类、需求逐条编码/人数/职级、人员搜索、调岗/解除编制常显（兼职区块关闭时不渲染）、拖拽 tooltip 与浅蓝/浅红落点、`is-new`/`is-stopped` 底色、把手在左复选框在右、右栏 32px 行首占位、空态 flex 居中、三栏 hover/选中一致。职位批量条移入中栏 body 顶部 sticky，避免改变标题区高度；勾选下级时过滤空组织分组并增大组间距。多选职位（≥2）时右栏用统一提示替代当前职位详情，避免误以为是批量对象详情。
- **变化胶囊与右栏对齐**：`orgChangeTags/positionChangeTags` 对已有对象的任何字段变化统一返回 `['变更']`，新增/停用优先；节点名称改为 `flex:0 1 auto`，胶囊 `flex:0 1 auto`，操作区 `margin-left:auto`，保证胶囊紧跟名称。右栏 `.rp-row-lead` 固定 32px（拖拽 12px + 间距 6px + 复选框 13px），无把手/复选框的行也插入空占位；`.rp-person/.rp-kv` 共用 hover 底色，人员复选框选中时给整行 `is-active` 主色内描边。
- **对比页细节**：04 页 `.cl-preview` 改为 `flex:1 1 auto; max-width:none`，模板渲染 `row.fields` 全部字段并以“；”分隔，超宽才 ellipsis + title；`.cmp-chart:fullscreen` 采用 flex 纵向布局，`.cmp-panels`、`.cmp-side`、`.cmp-viewport` 逐级 `flex:1; min-height:0`，并用 `fullscreenchange` 同步按钮状态、重新 `fitCanvas()`。
- **职级/编制类别数据**：`LEVELS` 展开为 `P1-1…P6-4` 的有序子档；`seed-data.js` 在 `UNIVERSES` 出口统一执行 `normalizeGraphLevels`，职位上下限、人员、编制、需求均输出 `P2-1/P3-4/M2-1` 格式。管理人员使用 M 档（如 `M2-1`、`M3-2`），旧裸职级仅在 Store 输入层做兼容映射。编制 `category` 固定为 A/B/C，Demo 默认 C；新增编制也写 C。
- **人员调岗单一弹框**：`tf` 只保留共享的 `header`（目标组织/职位/直接上级）、`lockOrg/lockPos`、`bring` 和人员事实行；`tfPayloadRows` 用同一 header 生成每行 payload，不再保存逐行目标。`openTransfer(ids, {orgId,posId,lockOrg,lockPos})` 统一四个入口：拖组织锁定 org、拖职位锁定 org+pos、行内按钮/批量按钮不预填；勾选多人拖拽整批进入同一弹框。多人不显示目标逐人控件、不显示“应用到所有人”，header 即整批目标。弹框不再显示下属同步控件；`transferPersons` 始终为被调人的直属下属更新经理，默认取下属当前组织负责人，缺失时回退到被调人原/新上级。人员拖组织不再走 `pick` 弹框；空编使用独立 `hcTf` 单步弹框，按 `headcountIds` 调用 `moveHeadcountsByIds`，不再按职级数量隐式选择。
- **方案列表（index.html）**：查询卡三项条件（方案名称、状态多选、生效日期起止）+ 查询/重置真实生效，其余查询方案控件为占位；`a-table` 用 `fixed:'left'`/`fixed:'right'` 冻结方案名称+状态与操作列，`scroll.x` 驱动中间列横向滚动；左侧不使用 Ant 默认向外扩散的 `::after` 阴影，改为最后一个 fixed-left 单元格内侧 1px 分隔线，避免覆盖生效日期列。表头自绘 `col-resizer`，拖拽改宽并写 `oa.ui.listColWidths`，最小/最大宽度按 PRD LIST-05；客户端筛选与 10 条/页分页；表头 36px、行高 54px、12px 字号、#fafafa 表头。新增方案为列表页内弹框（NEW-01/06/07）：主弹框字段沿用 F-01，调整范围仅保留“选择组织”按钮，未选择时同行显示完整子树提示，选择后同行显示已选部门并单行省略；范围用二级弹框按完整子树勾选，未点确定不改变已确认范围；创建成功关闭弹框并进入工作台，取消/关闭不创建空白方案。
- **组织树**：未用 a-tree，采用自定义平面渲染 + 绝对定位连线（思维导图式直角连线）：每行画所有“未结束祖先”的竖线（延伸到最后一个孩子的拐角即收，独生子链条不拉到底），拐角连到本级 16px ＋/－ 开关（按 antd 树开关尺度）；单行节点结构按 WF-05（名称后接负责人与变化胶囊）。
- **工作台拖拽提示（WB-05）**：`.drag-ghost` 用 Vue `<teleport to="body">` 挂到 body 顶层，`position:fixed` + `z-index:9999`，避免被 `.wb-col` 的 `overflow` 与职位卡片层叠上下文裁剪；结构拆为 `.drag-ghost-title` 与 `.drag-ghost-note` 两行。拖拽起始只记录 `dragState`/隐藏提示，不显示“拖拽中”；`dragover` 命中目标后才写入动作与联动说明。位置按视口夹取，并为两行提示预留底部高度。四类 `dragstart` 用 `dragGeometry()` 记录被拖元素宽高及鼠标在元素内的偏移；保留浏览器原生拖拽快照，不做 `setDragImage` 替换。`setDragTip()` 按快照矩形优先把提示放在其上方，上方空间不足时放到下方，避免提示与拖拽卡片重叠。人员提示的编制联动说明由 `dragState.hasHc` 控制，`onPersonDragStart` 时按所选人员是否存在 `headcountId` 计算，全部未占编则不显示。
- 选人：`<proto-employee-select>`，经 `data-request` 注入本地在职人员（字段 personId/name/positionName），不接真实接口；选职位：Skill 的 `proto-select-table-modal`（左树+中表+右已选三栏）在 M3 简化为**下拉单选列表**（目标职位数量少，单选已覆盖演示语义），作为 Demo 简化记录进 README 假设区，正式接入时还原三栏弹窗；调岗目标职位下拉用 antd select 联动。
- 人员调岗（WF-10）：单一弹框内局部状态，确认才 apply（UI-01）；`tf.header` 是整批唯一目标，拖拽入口锁定 org/pos，行内/批量入口允许选择；无逐行目标、无“应用到所选”；带编职级校验按 PRD 预设等级顺序比较（PER-08），校验失败整批不落库（PER-10）；下属经理由 `transferPersons` 自动更新，无 UI 开关。
- 双图（WF-14）：左右两个 CSS 树容器共享缩放状态，按对象 ID 双侧定位（CMP-06），新增只在右图、停用只在左图（CMP-07）。
- **含人架构图（CMP-26—CMP-31）**：树数据由 `store.chartTree(planId, side)` 组装：组织节点带 `children`（下级组织）、`positions`（直接归属职位）与 `isNew/tags`；职位节点带 `people`、`hcTotal/hcVacant` 与状态分解，不再返回编制数组，页面只渲染。
- **两套线型**：组织→下级组织是“平级线”（`.oc-node` 纵向 flex 居中，卡片居中；`.oc-tail.has-orgs::before` 在 50% 处画主干，`.oc-children` 居中对齐，横梁由每个子节点的左右半段拼成，首尾分别从第一个中心开始、到最后一个中心结束，落点由卡片 `::after` 在 50% 处向下 20px）；组织→职位、职位→人员/编制是“归属线”（竖线 + 8px 短肘，无横梁）。归属线不再使用容器 `border-left`，改为按行间分段：`.oc-detail:not(:last-child)::after` 从当前职位行中心画到下一职位行中心，`.oc-people > li:not(:last-child)::after` 从当前人编行中心画到下一行中心；首个职位的短竖线由 `.oc-people::before` 接到第一行中心。末行无 `::after`，因此竖线精确止于末行中心，不会因职位人员展开而向下超出。职位组顶部由 `.oc-details::before` 从组织卡底部（职位组左边线）接到首个职位行中心；职位组与展开行不设置背景色。组织同时有职位与子组织时，`.oc-tail.has-orgs.has-details::before` 只保留明细块下方 24px 的主干，避免主干穿过职位卡片。横梁位置由 `.oc-tail.has-orgs` 的 `padding-bottom:24px` 决定，任何数量下都不需要测量。
- **横向子组织**：`.oc-children` 为 flex 行，每个子节点在自身顶部画 1px 横线（宽度含 24px 右内边距），最后一个只画 12px 到自己的落点；落点由 `::after` 从横梁向下 20px 接到卡片顶部。
- **节点层级**：组织卡 150—220px（白底 + 阴影 + 计数 + 胶囊）；职位行 24px（仅名称 + 胶囊，左侧 2px 紫色条）；人员行 22px（头像 + 姓名 + 职级）；编制汇总行 22px（`编制 N｜空编 M`，空编 = 可用 + 需求预留）。所有卡片 `max-width` + 省略，hover 用原生 `title` 显示详情，不再弹框。
- **展开与交互**：`expanded` 集合键为 `L/R + id`，组织与职位共用；组织默认展开、职位默认收起；点击卡片/职位行切换，人员与编制不可点；“展开全部明细”只写职位键。
- **缩放与平移**：内层 `.cmp-tree` `transform: scale()` 且 `transform-origin: top left`，外层 `.cmp-canvas` 宽高 = `treeW/treeH × zoom`（`ResizeObserver` 维护自然尺寸），确保放大后四边都能滚动到达。`wheel + ctrlKey`（触控板 pinch）在视口内拦截并围绕光标缩放；普通滚轮不拦截。同步平移仍由 `@scroll` 驱动，`echoSide` 只忽略由我方写入引起的对侧回弹事件（80ms 超时），拖拽平移复用同一路径。
- 展开状态只存 `expanded`（键 `L/R + id`）：组织默认全展开，职位不在初始集合中即默认收起；“展开全部明细”把两侧所有职位 id 写入集合并集，“收起全部明细”删除这些键。

## 7. 环境与运行

```bash
# 预览（HTTP，不双击文件）
python3 <skill>/scripts/serve.py --dir "原型/组织调整" --page "index.html"
# 静态自检（每个页面生成后）
python3 <skill>/scripts/check.py "原型/组织调整"
# 数据层断言（Node，退出码 0 = 全绿）
node tools/run-tests.js
```

浏览器：桌面 Chrome/Edge 最新版。git 仓库在本目录初始化，按里程碑提交。

## 8. 执行计划（M0—M6）

| 里程碑 | 状态 | 交付 | 覆盖验收 | 预估 |
| --- | --- | --- | --- | --- |
| M0 文档同步 | ✅ 完成 | PRD/TECH/DISSCUSION 初始同步（后续版本见文档头） | — | 完成 |
| M1 骨架 + 数据层 | ✅ 完成 | store/seed/自测页、方案列表、新建方案、HRONE 外壳 | AT-01—04、09、10 | 1 轮 |
| M2 工作台：组织与职位 | ✅ 完成 | 三栏布局、组织/职位全操作、组织与职位拖拽、调整范围补充 | AT-05—08、11—23 | 2–3 轮 |
| M3 工作台：人员/编制 | ✅ 完成 | 右侧两区块（兼职关闭）、人员调岗单一步骤弹框、空编逐条多选/变更/按编码减编、自动匹配、待处理 | AT-24—44（AT-33/41 暂停） | 2–3 轮 |
| M4 前后对比 + 提交 | ✅ 完成 | 04-前后对比页（双图/缩放/搜索/全屏、六类清单、双入口、快照提交）、无差异拦截与纯排序放行（12.3） | AT-45—52 | 1–2 轮 |
| M5 详情 + 演示控制 + 生效 | ✅ 完成 | 审批进度时间线、退回意见与继续调整（APR-02）、演示操作小节（六十九）、列表页演示重置、暂存失败提示条与 retryPersist（AT-61）、CMP-02 | AT-55—62 | 1 轮 |
| M6 两案例 + 全量验收 | 进行中 | AT-01—69 执行记录、README 追溯矩阵定稿 | AT-63—69 + 全量回归 | 1 轮 |

每个里程碑闭环：实现 → 自测页全绿 + `check.py` 通过 → 执行对应 AT 并记入 `验收记录.md` → 不通过不进下一个。

### 质量机制

1. 数据层纯函数 + 单一入口（5.1）。
2. 自测断言直接取自 PRD 13.4 数字（5.7）。
3. 交互细节公共件化，禁止散落各页（5.5）。
4. 追溯矩阵进 README：需求编号 → 文件/函数 → AT 编号。
5. AT 执行按 14.5 记录格式，逐条留痕。
6. **真实渲染验证**（白屏教训，8a9bf69）：静态检查通过 ≠ 能跑；每轮交付前用无头 Chrome 加载全部页面验证外壳渲染，并检查页面结尾完整性与 script 标签配对。

### 七个交互实现难点（M2/M3 逐个攻）

1. 三栏联动与选择清空（LAY-03—05）。
2. 四类拖拽源 × 落点校验 × 确认框数量预计算（ORG/POS/HC/PER）。
3. 人员调岗：单一弹框 + 四入口预填 + 整批共同目标 + 带编校验 + 下属自动更新（PER-05—15）。
4. 差异回退：字段/对象改回基准即取消高亮/移出清单（UI-04、CMP-18）。
5. 刷新恢复但未确认弹框不算数（UI-01 vs UI-02 边界）。
6. 快照不可变（APR-04、AT-56）。
7. 九种数量口径全局一致（CNT-01—10，靠 5.4"算数只写一处"保证）。
