# TECH 技术方案

版本：V0.28｜日期：2026-11-13｜依据：PRD.md V0.28、DISSCUSION.md 六十一—一百一十三节
最近变更：组织树和前后对比架构图改用基于真实 DOM 坐标的 SVG 连接层，补充权限根移动后的重绘、排序槽位、停用过滤、子组织间距和混合分支共享分叉点；方案状态、范围校验、Undo／Redo 与工作台卡片规则沿用前文。
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
| 架构双图 | HTML/CSS 树 + 独立 SVG 连接层 + transform 缩放/平移 | 不引入图表库；缩放 25%—200%、步长 10%（CMP-05） |
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
tests/selftest-runner.js      50 项数据断言（Node 与 06 页共用）
tools/run-tests.js            Node 断言入口（退出码 0 = 全绿，每轮提交前质量门）
tools/workbench-regression.js 5 项工作台结构与显示回归（由 run-tests.js 调用）
README.md                     交付说明 + 追溯矩阵（需求 → 实现 → AT）
人工验收记录文件尚未建立；自动断言与静态检查结果不代替 AT-01—92 人工验收结论
```

## 4. 数据模型（稳定 ID）

所有实体用稳定 ID 关联，操作只改引用关系，身份永不重建（BR-01—08）。方案创建时对整图做克隆存为 `base`（方案原始基准），差异永远对 `base` 计算（APR-03）。

| 实体 | 关键字段 |
| --- | --- |
| org | id、name、code、parentId、status（有效/停用/新增）、setupDate、effectiveFrom?、effectiveTo?、leaderId、hrbpId |
| position | id、name、code、orgId、levelMin、levelMax、setupDate、order、status |
| headcount | id、code、positionId、level、state（可用/占编/需求预留/Offer占用/待调入预留）、personId?、demandId? |
| person | id、name、positionId、level、headcountId?、managerId、status |
| futureItem | id、type（Offer/待入职/待调入）、personId、targetPositionId、headcountId?、date、refs[] |
| demand | id、name、headcountIds[] |
| concurrentPost | id、personId、mainPositionId、concurrentPositionId、status |
| headcountWorkflow | id、orgId、name、status（审批中/处理中/已完成/已取消） |
| plan | id、name、effDate、adjustLevel、adjustReason、scopeOrgIds[]、targetOrgIds[]、desc（详细原因）、status（草稿/审批中/待生效/数据更新中/已生效/待手动处理/已作废）、base、versions[]（快照+审批记录） |

调整字段取值：`adjustLevel ∈ {BU/条线级, BU下设一级, BU下设二级, 其他}`；`adjustReason ∈ {外部原因, 内部原因}`；二者由 `createPlan` 校验非空，无默认值，创建后只读。localStorage 键：`oa.schema`（结构版本）、`oa.plans`（索引）、`oa.plan.<id>`（整图含 base、cur、versions、history、revision 和方案元数据）、`oa.ui.<planId>`（页面定位状态，LIST-02 恢复用）、`oa.ui.listColWidths`（列表列宽，LIST-05 记忆）、`oa.demo`（演示控制标志）。旧方案载入时若缺少 history 自动补空，不因 Undo／Redo 新增字段重置整库。重置 = 从 seed-data.js 重建该方案键；列宽记忆不随方案重置清空。

## 5. 关键机制

### 5.1 store 单一入口

所有操作经 `OA.store.apply(op)`：变更内存 → `assertInvariants()`（INV-01—05，开发态自检）→ 记差异 → 写 localStorage。UI 只调操作，不直接改数据——PRD 12.3 交互边界的守恒规则落在数据层一处。

**Vue 响应式接入（ensureReactive）**：store 数据是普通对象，Vue 无法感知其变更（曾导致更名后树不刷新、卡片计数不更新、复选框状态不回显——同一根因）。浏览器环境下 store.load/resetAll 后将整库包装为 `Vue.reactive`：页面读代理、store 写代理，每次 apply 后界面自动刷新；Node 自测环境无 Vue，自动跳过，框架无关性保留。

操作清单：更名/编辑组织、移动组织（携子树）、停用/启用组织、新建/复制组织（可选复制下级组织和职位）、新增/编辑/复制/停用职位、职位整体移动（单项/批量）、同级排序（不记差异）、调岗（带编/不带编/批量/下属自动更新）、解除编制、增编、减编、空编按编码多选/单步变更、自动匹配、取消兼职（操作保留，Demo 不暴露入口）、调整范围补充、按业务动作 Undo／Redo（50 步）、提交（快照）、演示流转（审批/退回/生效）。

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

不建独立面板，收敛为两处：① 方案列表页底部橙色「演示控制」条：一键重置全部演示数据（恢复两个预置方案种子）；② 方案详情页「演示操作」小节承载流程推进（审批通过/退回回草稿/模拟到期成功/模拟待手动处理），按钮按状态机启停（仅审批中可审、仅待生效可执行），不可用置灰+悬停原因。暂存失败注入开关保留在 06-演示自测页（AT-61）。数据更新中与待手动处理的执行顺序及人工处理机制留到后续执行编排讨论。

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

### 5.10 组织卡片操作与结构复制（已实现）

- 工作台组织卡片按 PRD ORG-05 使用“操作”下拉菜单（两行布局见 5.17）；新建复用 F-02，默认上级依当前组织有效性确定，允许手动更改。复制表单局部状态增加“复制全部下级组织”“复制职位”两个布尔选项，默认均为 false。
- 复用 `copyOrg` 单一业务入口；确认前按当前图计算可复制范围和数量，确认时重新校验。只读取有效下级分支和有效职位，跳过停用下级组织及整支，不消费 UI 可见列表。批量副本通过旧组织 ID → 新组织 ID 映射保持层级，职位指向对应的新组织；新 ID／编码沿用现有生成机制。
- 不复制人员、编制、需求、未来关联和角色任命。顶层应用表单的名称、上级、负责人、HRBP；下级角色清空；组织／职位设立日期统一为方案生效日。副本均加入方案，差异引擎按新 ID 自然生成新增记录，无需复制基准或提交版本。
- 一次 `apply` 完成整批复制；结构校验失败时不得留下部分副本，回滚范围覆盖本次组织／职位、序号与方案范围变更。沿用现有暂存失败机制，不将内存已确认但暂存失败的结果伪装为持久化成功。
- 复用 F-02 的必填定义，避免表单和待处理各自维护不同口径。复制表单本次录入的顶层名称／上级先校验；批量生成组织的非结构性缺失允许保留草稿，`computePending(plan)` 返回对应组织、缺失字段和说明。当前名称及非根级上级必填，负责人和 HRBP 可选；悬空／循环等结构错误不能以待处理绕过。
- 待处理为派生数据，不新增持久化状态，不因本次设计清空本地演示数据。沿用组织待处理胶囊，点击展开路径、选中组织并打开编辑表单显示缺失字段；补齐后立即重算，刷新可恢复，`submit` 继续消费同一待处理结果阻断提交。
- 验证覆盖 PRD AT-81—92 与 UNDO-01—06：组织按钮和上级默认、复制四种组合、有效分支和计数、身份／编制守恒、停用整体转移／手动停用、范围时间轴和在途编制流程校验、权限森林和八级层级、两行节点汇总与操作菜单、组织主标签和待处理规则、批量失败无部分副本、必填缺失定位／刷新／补齐／提交、Undo／Redo 联动恢复和 50 步边界。现有 55 项自动断言已通过；工作台关键交互已做浏览器复核，完整 AT 记录仍待补齐。

### 5.11 停用组织处理（PRD ORG-08/09，已实现）

- 停用表单有 `mode=transfer|manual` 两种互斥模式。transfer 选择有效且在调整范围内的新上级，禁止当前组织及其下级；下级组织根节点整体换父级并保留内部层级，当前组织直属职位迁移到目标组织，当前组织停用，人员／编制／未来事项通过职位引用自然跟随。
- manual 模式始终停用当前组织；`stopDescendantOrgs` 控制是否递归停用下级组织，`stopSubtreePositions` 控制是否停用当前组织及下级组织的有效职位。人员、编制、未来事项不自动改动；待处理由 `computePending` 重新计算，空职位／空编制不单独形成组织待处理。
- `previewStopOrg` 只读计算组织、职位、员工、编制和未来事项数量；`stopOrg` 在 `apply` 单一入口内整批校验和变更，失败时恢复图、方案元数据和序号。负责人、HRBP、直属上级不批量转移。

### 5.12 Undo／Redo 历史（PRD UNDO-01—06，已实现）

- `apply(planId, type, payload)` 以一次成功的业务操作为事务边界。历史快照包含 `cur` 与可编辑方案字段（含源／目标范围）；排除状态、时间、审批版本、原始基准、编号序列与历史本身。失败、预览和无变化不写历史，也不清空 redo。
- 两个栈合计最多保存最近 50 个动作。每条存动作标识、类型、摘要、时间及一个恢复目标 `state`；撤销时把当前状态作为重做目标，重做时反向交换，因此每步只保存一份图而不重复存相邻 before/after。原始基准与版本不嵌套进历史。
- `undo`／`redo` 通过同一 apply 入口恢复状态并移动历史条目；不重新执行原业务逻辑。重新校验不变量、暂存、刷新 Vue 派生结果。编号序列保持高水位，重做使用已保存的稳定 ID／编码；失败回滚仍恢复本次失败前序号。
- `submit` 确认暂存成功后结束本轮历史，`demoReturn` 从当前结果开始新一轮。流程状态、历史快照与审批记录不进入可撤销数据；提交失败恢复历史和版本。正式系统的审计留痕仍属正式接入。
- 不升级会清空数据的 schema；旧方案载入时补空 history。单方案持久化将图、history、元数据与 revision 写在同一个方案键中，索引只用于列表；载入时以方案键内元数据为准。每次变更前比较持久化 revision，发现其他窗口更新则返回刷新提示；保存仅写受影响方案，避免旧内存覆盖其他方案。暂存失败保留本窗口内存和历史，重试后可继续提交。
- 所有批量入口必须调用单个 store 操作（不能在页面 `forEach` 多次调用 `apply`），否则一个用户动作会被错误拆成多步。

### 5.13 方案状态与展示（PRD 3.2，DISSCUSION 九十一）

- `STATUS` 作为唯一状态枚举：草稿、审批中、待生效、数据更新中、已生效、待手动处理、已作废；`EDITABLE_STATUS` 仅包含草稿。`demoReturn` 回到草稿，同时保留意见、提交快照及原有清空历史的行为。
- 不提升 schema、不重建演示数据。加载时先采用方案键内元数据，再将旧“退回修改”映射为草稿、旧“生效异常”映射为待手动处理；下一次保存写入新状态，旧审批记录不改写。
- `theme.css` 集中定义七种状态的圆点和胶囊，颜色以 PRD ST-08 和 Skill design-spec 4.4／基线语义色为准；列表状态列默认 110px、最小 110px，旧列宽加载时按新下限归一，完整显示五字状态。
- 详情的审批进度、退回草稿入口和生效提示同步新状态。保留现有演示成功／待手动处理动作，仅模拟结果；数据更新中只提供枚举、筛选、只读展示，不实现新的执行流程、重试或人工完成动作。

### 5.14 新增方案范围检查反馈（PRD NEW-08，DISSCUSION 九十二—九十三）

- 列表页新增方案主弹框在组织选择确认后进入 `scopeChecking` 状态；Demo 用短暂 `setTimeout` 模拟检查耗时，让用户能观察“检查中…”状态。
- 检查期间通过 Modal 的确认按钮禁用／加载能力和动态 `ok-text` 展示“检查中…”，不增加额外 loading 卡片或页面遮罩；检查完成后恢复“开始调整”。
- 生效日期或已确认范围发生变化时清理旧计时器并重新开始检查；关闭弹框时清理计时器，避免关闭后异步回调修改页面状态。

### 5.15 组织范围校验（PRD NEW-09，DISSCUSION 九十五—九十六）

- `validateScope(universe, rootIds, effDate)` 是新建方案和工作台补充范围共用的只读校验器。它按显式根组织展开完整子树，按方案日期排除已停用、未来生效和未来停用组织，并返回 `warnings`、`blocking`、`eligibleOrgIds` 和 `excludedOrgIds`。
- 组织的 `effectiveFrom` 晚于方案日期，或 `effectiveTo` 晚于方案日期，均作为未来时间提醒；`effectiveTo` 小于等于方案日期的组织不显示。没有可纳入组织时阻断。
- `headcountWorkflows` 中状态为“审批中”或“处理中”的流程，按组织命中实际纳入范围即形成阻断；已完成、已取消不阻断。
- `scopeOrgIds(plan)` 使用同一时间规则过滤实际范围；上下文树只展示实际范围及必要祖先。工作台补充范围通过同一校验后一次性写入，失败不产生部分结果。
- 选择树由 UI 按同一时间规则呈现：未来生效、未来停用组织保留节点但禁用勾选；完整子树派生集合只包含当前有效组织，因此这些未来节点不显示“随上级纳入”。
- Demo 使用独立的 `scopeDemo` 宇宙演示范围校验，包含创新业务中心、区域服务中心、未来生效、计划停用、方案日已停用和在途编制流程示例；案例一、案例二及华东自测数据不被改变。旧方案加载不切换宇宙、不清空方案或修改提交版本。

### 5.16 权限森林与组织层级（PRD BR-14，DISSCUSION 九十七）

- `PERMISSION_ROOTS` 定义 Demo 用户可见的多个组织根节点；`permissionForest` 从这些根节点构建并列树，不从集团根节点向下渲染无权限祖先。正式系统必须由后端返回权限范围，不能把全量组织树下发到前端后再隐藏。
- `G.orgLevel(graph, orgId)` 沿全局 `parentId` 链计算组织层级；`MAX_ORG_LEVEL=8`。工作台和前后架构图显示只读层级文案，权限根节点仍显示真实的二级／三级等全局层级。
- 新增组织校验上级层级小于 8；移动组织计算整棵子树移动后的最深层级，超过 8 级阻断。目标组织必须在当前用户可操作的权限森林内。
- 权限森林不改变范围完整子树规则；用户选择权限根节点时，完整纳入其可见有效下级，隐藏上级不进入范围。
- 工作台展开判断只检查当前权限森林中可见的祖先行（`flatten` 返回的 `path`），不能检查全局父链中的隐藏上级是否展开。全局父链仅用于真实层级计算。`tools/workbench-regression.js` 直接执行工作台页面的计算属性和生命周期，覆盖两案例显示、折叠、多根互不影响和刷新恢复。

### 5.17 组织节点两行展示（PRD ORG-01，DISSCUSION 九十八）

- 仅调整工作台组织节点和对应样式，保留三栏布局。第一行名称、标签及常显操作下拉，第二行层级、负责人、员工和总编；节点固定两行，左侧树连线落点对应整张组织卡片的垂直中点（见 5.18）。职位卡片不包含组织层级连线。
- 复用 `CNT.orgSummary(cur, orgId)` 计算本组织和全部下级汇总；`orgSummaryText` 输出“三级｜张经理｜员工 4｜总编 6”，计数格式与职位卡片一致，不新增计数字段或改动统计口径。
- 菜单使用 Skill 的 `a-dropdown`（click）＋`a-menu`／`a-menu-item`，危险项标红，复用现有编辑、复制、新增、停用／启用入口。名称快捷编辑先调用 `selectOrg` 再打开既有编辑框，独立阻止冒泡；停用、只读节点不提供快捷编辑。

### 5.19 工作台组织与职位排序（PRD ORG-14/POS-13，DISSCUSION 一百零九）

- 数据兼容：加载图数据时将旧 \`order\` 映射为组织 \`sortCode\`、职位 \`sequenceNo\`；排序读取、写入和排序比较统一使用新字段，兼容期保留 \`order\` 同步值以支持旧快照。
- 表单：组织编辑／新建／复制表单直接展示排序码，职位编辑／新建／复制表单直接展示顺序号；排序号允许重复保存，不提供独立排序操作菜单。新增和复制默认追加到同级末尾。
- 拖拽：组织和职位列表均渲染顶部、卡片间隙、底部排序槽位。进入槽位显示横线和动作 tooltip；组织卡片主体继续表示换父级，职位跨组织继续通过左侧组织树整体移动。搜索有关键词时禁用排序拖拽；职位多选排序保持原相对顺序。
- 落库：拖拽释放后按当前可见同级列表的真实顺序重写受影响范围内全部对象的连续 \`sortCode\`／\`sequenceNo\`，再通过 \`apply\` 实时暂存并进入 Undo／Redo。无实际顺序变化不写历史。
- 差异：排序字段不加入 \`diffPlan\` 的业务字段规格，因此不生成变更胶囊、不进入前后对比清单；\`hasChange\` 仍比较排序字段以允许纯排序提交。

### 5.18 工作台卡片与左侧连线（PRD ORG-01a／POS-05，DISSCUSION 九十九、一百零八）

- `.tree-node` 保留现有扁平可见行和组织卡片 DOM，卡片、把手、展开按钮及拖拽交互不改。连线不再使用 `withGuides`、`tree-elbow` 或 `tree-card::before` 拼接，改由组织滚动内容层内的 `.tree-connectors` SVG 独立绘制。
- `graphPermissionRoots(g, universe)` 在当前图上归一化权限根：沿 `parentId` 向上检查候选根，已挂到另一候选根子树下的根从渲染入口移除。这样权限根移动后不会同时从根入口和父节点子树重复渲染。
- `.tree-card`／`.pos-card` 保持现有两行卡片结构；`.org-drag-handle`／`.pos-drag-handle` 位于卡片最左侧并跨两行垂直居中。职位不包含任何组织层级连线。
- 普通边框 1px `var(--border)`；选中时只换主色，清除叠加的内描边，保持尺寸不变。状态底色沿用原规则。
- 展开／收缩按钮仍通过 `--tree-depth` 定位在 `.tree-node` 左侧、卡片外且垂直居中。Vue 更新完成后，`refreshOrgConnectors()` 读取每个可见节点的卡片和按钮真实矩形，以组织滚动内容层为坐标系绘制路径；每个可见根独立计算，收缩一个根不会影响其他根。SVG 位于卡片下方、`pointer-events:none`，不影响卡片样式、按钮点击或把手拖拽。
- 职位名称通过 `editPositionFromName` 校验有效性及范围后 `selectPosition` → `openPosForm('edit')`，不另建编辑流程。
- `updated`、`ResizeObserver` 和初始化不直接测量；统一进入连续两帧 `requestAnimationFrame` 的 `queueOrgConnectorRefresh()`。实际刷新时按当前 DOM 的 `data-org-id` 重建节点索引，防止移动、撤销和重做后第一次布局仍使用旧 ref 或旧坐标。

### 5.19 组织主状态标签（PRD ORG-03a／ORG-03b，DISSCUSION 一百零一—一百零二）

- `orgChangeTags` 输出最多一个主标签，优先级为停用 > 新增 > 变更；待处理数量由独立派生结果叠加。基准停用组织不进入可编辑范围，不输出启用主标签。
- 变更判断同时考虑直接字段和派生的完整路径／全局层级；新增后停用且整棵子树为空时，差异引擎应将其视为净变化并过滤，避免工作台、对比和提交材料出现空对象。
- 新增后停用仍有关联对象时保留停用对象，并由待处理计算器阻断提交。详情字段呈现尚未定稿，暂不在公共件中固化具体文案。

### 5.20 组织待处理标签（PRD ORG-03c，DISSCUSION 一百零三）

- 组织节点只消费一个布尔结果 `hasOrgPending`，模板在主状态标签之后渲染静态“待处理”胶囊，不显示数量、不展开详情、不做祖先汇总。
- `hasOrgPending` 只覆盖组织必填字段缺失、停用处理范围内仍有关联人员／停用关系等组织级问题；空职位、空编制、编制职级匹配和八级层级不进入该标签。
- 停用关系采用“向上递归检测、最近有效节点归属”：对每个有效组织向上检查停用祖先；只在停用链之后的最近有效组织生成一个待处理结果，不向更深后代重复传播。中间组织停用时，责任节点自然下移。
- 数据层仍保留完整 `computePending()` 作为提交阻断依据；本胶囊只负责简化组织节点视觉提示，不改变提交校验粒度。

### 5.21 职位待处理归属（PRD POS-03a，DISSCUSION 一百零五）

- `computePending()` 对所属组织已停用且职位仍有效的职位生成 `kind='position'` 待处理；职位卡片显示无数量“待处理”胶囊，组织卡片不重复显示该关系。
- 职位停用后的在职人员、未来引用仍由职位待处理；空编、可用编制和无关联空职位不单独触发职位待处理。

### 5.22 职位卡片拖拽（PRD POS-05a，DISSCUSION 一百零六）

- `.tree-node` 与 `.pos-card` 均设置 `draggable=false`，父节点不绑定拖拽起始事件；`.org-drag-handle` 与 `.pos-drag-handle` 是唯一拖拽源，均跨两行、固定在卡片内部左端，并用 `dataTransfer.setDragImage()` 传递卡片克隆，避免整列面板、连线和展开按钮成为拖拽快照。把手的绝对定位参照必须是卡片本身，不能让行容器建立新的定位上下文。
- 卡片主体统一 `padding-left`，第一行职位名称和第二行统计从同一起点渲染；把手绝对定位在卡片左端并跨越两行。停用卡片保留占位但不设置 draggable。
- `.pos-card` 必须 `position:relative`，使把手的 `top:0; bottom:0` 参照卡片本身，而不是中栏或页面。

组织节点遵循相同的拖拽约束：组织卡片只允许把手拖拽，展开按钮、连线和名称区域均不触发拖拽；组织横线以卡片左边界垂直中点为落点，卡片背景覆盖进入卡片区域的线段。

## 6. 页面与组件映射要点

- 列表/新建/详情按 Skill 模板骨架（`scaffold.py --type list/form/detail`）；工作台、对比页为组合布局，用 shell 骨架改。
- **固定外壳**：`shared/shell.js` 提供 `oa-shell` 全局组件（52px 顶栏 + 页签 + 220px 可折叠左菜单 + 内容区），对齐 Skill shell.html；左菜单按 PRD SHELL-01 组织为组织管理/职位管理/编制管理/组织配置四组，组织管理默认展开，“组织调整方案”为当前项；非组织调整范围的菜单点击给出明确说明（DEM-02）。工作台用 `fill` 模式占满内容区。
- **工作台（03-工作台.html）**：`oa-fill` 下按 `wb-planbar(48px) + workbench(flex:1) + wb-actions(52px)` 纵向布局，页面不滚动；`.workbench` 三栏均 `min-height:0; overflow:hidden`，`.wb-col-head` 固定 76px 等高，采用 `justify-content:center; gap:6px`，标题行与搜索行之间不再用 `margin-top:auto` 撑出空白；`.wb-col-body` 各自 `overflow-y:auto`。三栏等宽 `flex:1 1 0; min-width:0`，`.workbench` 使用 10px `gap`；三栏白卡由内容区底色分隔；顶部 `wb-planbar` 与底部 `wb-actions` 背景透明。对比弹框：`compareOpen/compareMode` 控制单层全屏 `a-modal`，宽度 100vw、顶部 0；`.compare-modal .ant-modal-content` 使用 `height:100vh; display:flex; flex-direction:column`，body `flex:1; min-height:0`，iframe 100% 填充；iframe 指向 `04-前后对比.html?plan=<id>&embed=1&mode=view|submit`。04 页在 embed 模式隐藏外壳并取消 1280px 最大宽度，返回/提交通过 `postMessage`（`oa-compare-close`/`oa-compare-submitted`）通知工作台。工作台细节按 WB-01—12：组织两行、首行名称标签和操作菜单、第二行层级负责人及员工总编汇总；职位两行卡片且名称带职级范围、右栏人员名称带职级、姓名点击仅提示将打开档案、可用空编逐条编码/职级/A-B-C类、需求逐条编码/人数/职级、人员搜索、调岗/解除编制常显（兼职区块关闭时不渲染）、拖拽 tooltip 与浅蓝/浅红落点、`is-new`/`is-stopped` 底色、把手在左复选框在右、右栏 32px 行首占位、空态 flex 居中、三栏 hover/选中一致。职位批量条移入中栏 body 顶部 sticky，避免改变标题区高度；勾选下级时过滤空组织分组并增大组间距。多选职位（≥2）时右栏用统一提示替代当前职位详情，避免误以为是批量对象详情。
- **变化胶囊与右栏对齐**：`orgChangeTags/positionChangeTags` 对已有对象的任何字段变化统一返回 `['变更']`，新增/停用优先；节点名称改为 `flex:0 1 auto`，胶囊 `flex:0 1 auto`，操作区 `margin-left:auto`，保证胶囊紧跟名称。右栏 `.rp-row-lead` 固定 32px（拖拽 12px + 间距 6px + 复选框 13px），无把手/复选框的行也插入空占位；`.rp-person/.rp-kv` 共用 hover 底色，人员复选框选中时给整行 `is-active` 主色内描边。
- **对比页细节**：04 页 `.cl-preview` 改为 `flex:1 1 auto; max-width:none`，模板渲染 `row.fields` 全部字段并以“；”分隔，超宽才 ellipsis + title；`.cmp-chart:fullscreen` 采用 flex 纵向布局，`.cmp-panels`、`.cmp-side`、`.cmp-viewport` 逐级 `flex:1; min-height:0`，并用 `fullscreenchange` 同步按钮状态、重新 `fitCanvas()`。
- **职级/编制类别数据**：`LEVELS` 展开为 `P1-1…P6-4` 的有序子档；`seed-data.js` 在 `UNIVERSES` 出口统一执行 `normalizeGraphLevels`，职位上下限、人员、编制、需求均输出 `P2-1/P3-4/M2-1` 格式。管理人员使用 M 档（如 `M2-1`、`M3-2`），旧裸职级仅在 Store 输入层做兼容映射。编制 `category` 固定为 A/B/C，Demo 默认 C；新增编制也写 C。
- **人员调岗单一弹框**：`tf` 只保留共享的 `header`（目标组织/职位/直接上级）、`lockOrg/lockPos`、`bring` 和人员事实行；`tfPayloadRows` 用同一 header 生成每行 payload，不再保存逐行目标。`openTransfer(ids, {orgId,posId,lockOrg,lockPos})` 统一四个入口：拖组织锁定 org、拖职位锁定 org+pos、行内按钮/批量按钮不预填；勾选多人拖拽整批进入同一弹框。多人不显示目标逐人控件、不显示“应用到所有人”，header 即整批目标。弹框不再显示下属同步控件；`transferPersons` 始终为被调人的直属下属更新经理，默认取下属当前组织负责人，缺失时回退到被调人原/新上级。人员拖组织不再走 `pick` 弹框；空编使用独立 `hcTf` 单步弹框，按 `headcountIds` 调用 `moveHeadcountsByIds`，不再按职级数量隐式选择。
- **方案列表（index.html）**：查询卡三项条件（方案名称、状态多选、生效日期起止）+ 查询/重置真实生效，其余查询方案控件为占位；`a-table` 用 `fixed:'left'`/`fixed:'right'` 冻结方案名称+状态与操作列，`scroll.x` 驱动中间列横向滚动；左侧不使用 Ant 默认向外扩散的 `::after` 阴影，改为最后一个 fixed-left 单元格内侧 1px 分隔线，避免覆盖生效日期列。表头自绘 `col-resizer`，拖拽改宽并写 `oa.ui.listColWidths`，最小/最大宽度按 PRD LIST-05；客户端筛选与 10 条/页分页；表头 36px、行高 54px、12px 字号、#fafafa 表头。新增方案为列表页内弹框（NEW-01/06/07/08/09）：主弹框字段沿用 F-01，调整范围仅保留“选择组织”按钮，未选择时同行显示完整子树提示，选择后同行显示已选部门并单行省略；范围用二级弹框按完整子树勾选，方案日已停用组织不显示，未来时间组织和在途编制流程由统一校验器检查；检查期间按钮显示“检查中…”并禁用；创建成功关闭弹框并进入工作台，取消/关闭不创建空白方案。
- **组织树**：未用 a-tree，采用自定义平面节点渲染 + 独立 SVG 连接层。节点仍按当前可见组织行渲染，连接关系直接读取当前图的 `parentId`；每个可见根独立绘制，根节点之间不连线。SVG 按实际卡片左边界中心和展开按钮中心绘制直角路径，使用 `pointer-events:none`，不影响卡片、按钮和拖拽。组织卡片拖拽按卡片纵向区域区分：上 30%／下 30% 为同级排序，中间 40% 为放入下级组织。
- **工作台拖拽提示（WB-05）**：`.drag-ghost` 通过 Vue `<teleport to="body">` 挂到 body 顶层，避免被滚动容器裁剪。拖拽起始只记录 `dragState`；进入目标后显示动作提示。组织和职位把手使用卡片克隆作为 `setDragImage`，人员和空编使用原生快照；提示按快照位置避让，空间不足时翻到上方。职位每个组织分组末尾额外渲染独立末尾排序槽位，避免最后一张卡片之后没有可投放区域。
- 选人：`<proto-employee-select>`，经 `data-request` 注入本地在职人员（字段 personId/name/positionName），不接真实接口；选职位：Skill 的 `proto-select-table-modal`（左树+中表+右已选三栏）在 M3 简化为**下拉单选列表**（目标职位数量少，单选已覆盖演示语义），作为 Demo 简化记录进 README 假设区，正式接入时还原三栏弹窗；调岗目标职位下拉用 antd select 联动。
- 人员调岗（WF-10）：单一弹框内局部状态，确认才 apply（UI-01）；`tf.header` 是整批唯一目标，拖拽入口锁定 org/pos，行内/批量入口允许选择；无逐行目标、无“应用到所选”；带编职级校验按 PRD 预设等级顺序比较（PER-08），校验失败整批不落库（PER-10）；下属经理由 `transferPersons` 自动更新，无 UI 开关。
- 双图（WF-14）：左右两个 CSS 树容器共享缩放状态，按对象 ID 双侧定位（CMP-06），新增只在右图、停用只在左图（CMP-07）。
- **含人架构图（CMP-26—CMP-33）**：树数据由 `store.chartTree(planId, side)` 组装：组织节点带 `children`（下级组织）、`positions`（直接归属职位）、`orgLevel` 与 `isNew/tags`；职位节点带 `people`、`hcTotal/hcVacant` 与状态分解，不再返回编制数组，页面只渲染。多个权限根节点保持为独立树区，按 `orgLevel` 映射到全局水平基线，同级根节点对齐、不同级根节点错开；根节点之间不画线。组织同时有 `children` 和 `positions` 时，渲染层使用两个独立分支锚点，组织分支偏左，岗位分支偏右。
- **两套线型与双分支**：组织→下级组织是“平级线”（单独的组织分支；只有组织下级时从中心出线，同时有岗位时从偏左锚点出线）；组织→职位、职位→人员/编制是“归属线”（单独的岗位分支；同时有组织下级时从中右锚点出线）。两类分支不共用中心主干，不穿过对方内容。组织层级横梁和岗位归属线仍按实际分支内容绘制，根节点之间不画线。归属线不再使用容器 `border-left`，改为按行间分段：`.oc-detail:not(:last-child)::after` 从当前职位行中心画到下一职位行中心，`.oc-people > li:not(:last-child)::after` 从当前人编行中心画到下一行中心；首个职位的短竖线由 `.oc-people::before` 接到第一行中心。末行无 `::after`，因此竖线精确止于末行中心，不会因职位人员展开而向下超出。职位组与展开行不设置背景色。
- **组织卡片**：前后对比页组织卡片为三行结构：名称／变化标签、`层级｜负责人`、`总编 N｜员工 N｜岗位 N`。计数直接使用当前侧 `CNT.orgSummary`，含本组织及全部下级；工作台组织卡片仍沿用既有两行结构。新增组织使用工作台同款浅绿色底色 `#f0faf3`，停用组织使用浅红色底色 `#fff2f1`；底色只挂在组织卡片，不传播到明细行。组织层级基线使用统一 `levelStep`，以全局 `orgLevel` 计算根节点纵向偏移；外层画布尺寸需包含所有根节点偏移和子树高度。
- **组织卡片**：前后对比页组织卡片为三行结构：名称／变化标签、`层级｜负责人`、`总编 N｜员工 N｜岗位 N`。计数直接使用当前侧 `CNT.orgSummary`，含本组织及全部下级；工作台组织卡片仍沿用既有两行结构。卡片内容区居中，展开箭头绝对定位在左侧，不占用文字居中宽度。新增组织使用工作台同款浅绿色底色 `#f0faf3`，停用组织使用浅红色底色 `#fff2f1`；底色只挂在组织卡片，不传播到明细行。组织层级基线使用统一 `levelStep`，以全局 `orgLevel` 计算根节点纵向偏移；外层画布尺寸需包含所有根节点偏移和子树高度。
- **前后对比停用过滤**：`chartTree(planId, 'R')` 遇到最终状态为停用的组织直接返回空节点，不创建占位卡片；左侧基准图仍保留该组织，供用户理解停用来源。停用组织下的有效关联问题继续由差异清单和待处理校验承载。
- **前后对比连接层**：04 页在每个侧图的 `.cmp-tree` 下放置独立 SVG。每次 Vue 更新、显示开关、展开收缩、缩放或尺寸变化后，读取组织卡片、直接子组织卡片和首个岗位行的实际矩形，按侧图未缩放坐标绘制父卡片到子组织横梁／岗位首行的直角路径。组织分支在存在岗位时使用父卡片偏左锚点，岗位分支使用中右锚点；CSS 伪元素只保留岗位内部和人员／编制明细线，不再承担父级混合分支连接。
- **前后对比连接层**：04 页在每个侧图的 `.cmp-tree` 下放置独立 SVG。每次 Vue 更新、显示开关、展开收缩、缩放或尺寸变化后，读取组织卡片、直接子组织卡片和首个岗位行的实际矩形，按侧图未缩放坐标绘制父卡片到子组织横梁／岗位轨道的直角路径。组织分支在存在岗位时使用父卡片偏左锚点，岗位分支使用中右锚点；只有岗位没有下属组织时，父卡片底部中心直接连接岗位轨道，不插入额外标题层。CSS 伪元素只保留岗位内部和人员／编制明细线，不再承担父级混合分支连接。
- **前后对比连接层**：04 页在每个侧图的 `.cmp-tree` 下放置独立 SVG。每次 Vue 更新、显示开关、展开收缩、缩放或尺寸变化后，读取组织卡片、直接子组织卡片和首个岗位行的实际矩形，按侧图未缩放坐标绘制父卡片到子组织横梁／岗位轨道的直角路径。组织同时有下属组织和岗位时，父卡片底部只画一条中心主干到共享分叉点，再分别落到左右目标；只有岗位没有下属组织时，父卡片底部中心直接连接岗位轨道，不插入额外标题层。子组织列表在上级卡片下方增加 20px 分支间距，横梁使用子卡片顶部减去落点高度计算，确保横梁不贴合上级卡片下沿。CSS 伪元素只保留岗位内部和人员／编制明细线，不再承担父级混合分支连接。
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

### 7.1 Git 提交与 GitHub Pages 发布

本节为本仓库交付规范。用户要求“commit”时提交本次已完成的改动；明确要求“发布／更新 GitHub Pages”时，再执行静态站点发布。提交、推送 main、Pages 构建完成分别验证，不能相互替代。

#### 提交前检查与范围

在仓库根目录执行；涉及业务代码时运行数据层测试、Skill 静态检查及相关浏览器交互验证。仅修改文档时检查差异、引用及命令，不声称已完成人工验收。

```bash
node tools/run-tests.js
# 将 <skill-root> 替换为本机 hrone-html-prototype 技能目录
python3 "<skill-root>/scripts/check.py" "原型/组织调整"
git diff --check
git status --short --branch
git remote -v
```

按当前版本要求全部数据断言通过、静态检查 0 error / 0 warning；每次只暂存本次修改的明确文件，并检查暂存差异。下列文件清单为示例，应按实际改动调整，不使用全仓库 `git add .`。未跟踪的 `参考原型/` 不纳入，除非用户明确要求。

```bash
git add -- DISSCUSION.md PRD.md TECH.md TODO.md \
  原型/组织调整/03-工作台.html 原型/组织调整/README.md \
  原型/组织调整/shared/store.js 原型/组织调整/tests/selftest-runner.js
git diff --cached --stat
git diff --cached --check
git commit -m "增加业务动作撤销与重做"
git push origin main
git log -1 --oneline
git status --short --branch
```

提交信息使用中文“动作 + 功能”；发布提交需带源 commit。推送前检查远程地址，远端变化时先核对并整合，禁止为发布强制覆盖分支。如果沙箱禁止写 `.git/index.lock`，申请执行所需 Git 操作的权限，不删除锁文件或改写目录权限。认证失败时保留本地提交，说明失败步骤，不能把本地提交称为已上线。

#### 当前仓库与发布配置

| 项 | 配置 |
| --- | --- |
| origin | `https://github.com/johnnyhcm/org-adjustment-demo.git` |
| 源码分支 | `main`：文档、原型、共享数据层与测试 |
| Pages 模式 | 分支发布，API `build_type=legacy`；不新增自定义 Actions 工作流 |
| 发布分支／目录 | `gh-pages` 的根目录 `/` |
| 发布内容 | 源 commit 下的 `原型/组织调整/` 内容平铺至根目录，保留本地 vendor 和 `.nojekyll` |
| 排除内容 | `.git`、`.DS_Store`、`README.md`、根目录产品／技术文档及 `参考原型/` |
| 站点 | `https://johnnyhcm.github.io/org-adjustment-demo/` |

发布前用 `gh api repos/johnnyhcm/org-adjustment-demo/pages` 核对实际分支和目录。以下命令在仓库根目录用 Bash 执行，只从已提交且已推送的 main 生成站点；工作区未提交内容不进入发布。使用新临时目录，不删除或清空现存发布工作区。

```bash
set -e
PAGES_SOURCE_COMMIT="$(git rev-parse main)"
PAGES_TASK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/org-adjustment-pages.XXXXXX")"
mkdir "$PAGES_TASK_DIR/site"
git archive --format=tar --output="$PAGES_TASK_DIR/source.tar" \
  "$PAGES_SOURCE_COMMIT:原型/组织调整"
tar -xf "$PAGES_TASK_DIR/source.tar" -C "$PAGES_TASK_DIR/site"
git clone --single-branch --branch gh-pages \
  https://github.com/johnnyhcm/org-adjustment-demo.git "$PAGES_TASK_DIR/publish"
rsync -a --delete --exclude='.git/' --exclude='.DS_Store' \
  --exclude='README.md' --exclude='.nojekyll' \
  "$PAGES_TASK_DIR/site/" "$PAGES_TASK_DIR/publish/"
touch "$PAGES_TASK_DIR/publish/.nojekyll"
git -C "$PAGES_TASK_DIR/publish" diff --check
git -C "$PAGES_TASK_DIR/publish" diff --stat
git -C "$PAGES_TASK_DIR/publish" add -A
if git -C "$PAGES_TASK_DIR/publish" diff --cached --quiet; then
  echo "静态页面没有变化，无需生成发布提交"
else
  git -C "$PAGES_TASK_DIR/publish" commit \
    -m "deploy: 更新组织调整原型（source $PAGES_SOURCE_COMMIT）"
  git -C "$PAGES_TASK_DIR/publish" push origin gh-pages
fi
PAGES_RELEASE_COMMIT="$(git -C "$PAGES_TASK_DIR/publish" rev-parse HEAD)"
```

`rsync --delete` 仅用于新克隆的发布目录，不能指向源码目录或其他工作区。`gh-pages` 保留已有发布历史，正常推送，不使用强推；遇到远端更新重新核对并基于最新发布分支同步。

#### 发布验证与回退

```bash
gh api repos/johnnyhcm/org-adjustment-demo/pages
gh api repos/johnnyhcm/org-adjustment-demo/pages/builds/latest \
  --jq '{status, commit, error, updated_at}'
curl -I -L --max-time 20 https://johnnyhcm.github.io/org-adjustment-demo/
```

最新构建的 `commit` 必须等于 `PAGES_RELEASE_COMMIT`，并且 `status=built`、无构建错误。构建进行中继续等待；失败时报告错误，不能将上一版的 built 状态作为本次成功证明。

首页 200 只证明可访问。还需检查本次变更涉及的线上文件，例如工作台及 `shared/store.js`，与发布目录中的文件一致；可在 URL 加发布 commit 查询参数避开旧缓存，再用 `cmp` 或内容摘要核对。涉及交互变化时补线上主流程验证。

交付回复包含 main commit、gh-pages commit、站点地址、构建及线上内容验证结果，以及未纳入本次提交的已知改动。

回退采用上一个已验证的源 commit 重新生成站点，在最新 gh-pages 上创建新的发布提交，提交信息注明回退目标；不重写 main 或 gh-pages 历史。临时目录在发布验证完成且不再需要后再清理，不使用固定路径的无条件递归删除。

## 8. 执行计划（M0—M6）

| 里程碑 | 状态 | 交付 | 覆盖验收 | 预估 |
| --- | --- | --- | --- | --- |
| M0 文档同步 | ✅ 完成 | PRD/TECH/DISSCUSION 初始同步（后续版本见文档头） | — | 完成 |
| M1 骨架 + 数据层 | ✅ 完成 | store/seed/自测页、方案列表、新建方案、HRONE 外壳 | AT-01—04、09、10 | 1 轮 |
| M2 工作台：组织与职位 | ✅ 完成 | 三栏布局、组织/职位全操作、组织与职位拖拽、调整范围补充 | AT-05—08、11—23 | 2–3 轮 |
| M3 工作台：人员/编制 | ✅ 完成 | 右侧两区块（兼职关闭）、人员调岗单一步骤弹框、空编逐条多选/变更/按编码减编、自动匹配、待处理 | AT-24—44（AT-33/41 暂停） | 2–3 轮 |
| M4 前后对比 + 提交 | ✅ 完成 | 04-前后对比页（双图/缩放/搜索/全屏、六类清单、双入口、快照提交）、无差异拦截与纯排序放行（12.3） | AT-45—52 | 1–2 轮 |
| M5 详情 + 演示控制 + 生效 | ✅ 完成 | 审批进度时间线、退回意见与继续调整（APR-02）、演示操作小节（六十九）、列表页演示重置、暂存失败提示条与 retryPersist（AT-61）、CMP-02 | AT-55—62 | 1 轮 |
| M6 两案例 + 全量验收 | 待人工验收 | AT-01—92 执行记录；自动回归已完成 | AT-63—69、AT-81—92 + 全量回归 | 待安排 |

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
