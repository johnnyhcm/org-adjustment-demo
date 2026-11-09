# TECH 技术方案

版本：V0.2｜日期：2026-11-09｜依据：PRD.md V0.2、DISSCUSION.md 六十一—六十七节
V0.2 变更：补充 Vue 响应式接入（5.1）、自测运行方式（5.7）、组织树自定义渲染与连线规则（6）、员工选择器数据注入（6）、localStorage 键补全（4）、文件结构补 tests/tools（3）、里程碑状态（8）
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
├── 03-工作台.html             三栏工作台（WF-04—12，最重页面）
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
    ├── demo-control.js        演示控制面板（EFF-04 四组）
    └── theme.css              主色变量与公共布局（三栏、卡片、胶囊）
README.md                     交付说明 + 追溯矩阵（需求 → 实现 → AT）
验收记录.md                   按 PRD 14.5 格式逐条记录
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
| plan | id、name、effDate、scopeOrgIds[]、targetOrgIds[]、desc、status（ST-01—07）、base、versions[]（快照+审批记录） |

localStorage 键：`oa.schema`（结构版本）、`oa.plans`（索引）、`oa.plan.<id>`（整图含 base 与 versions）、`oa.ui.<planId>`（页面定位状态，LIST-02 恢复用）、`oa.demo`（演示控制标志）。重置 = 从 seed-data.js 重建该方案键。

## 5. 关键机制

### 5.1 store 单一入口

所有操作经 `OA.store.apply(op)`：变更内存 → `assertInvariants()`（INV-01—05，开发态自检）→ 记差异 → 写 localStorage。UI 只调操作，不直接改数据——PRD 12.3 交互边界的守恒规则落在数据层一处。

**Vue 响应式接入（ensureReactive）**：store 数据是普通对象，Vue 无法感知其变更（曾导致更名后树不刷新、卡片计数不更新、复选框状态不回显——同一根因）。浏览器环境下 store.load/resetAll 后将整库包装为 `Vue.reactive`：页面读代理、store 写代理，每次 apply 后界面自动刷新；Node 自测环境无 Vue，自动跳过，框架无关性保留。

操作清单：更名/编辑组织、移动组织（携子树）、停用/启用组织、新增/复制组织、新增/编辑/复制/停用职位、职位整体移动（单项/批量）、同级排序（不记差异）、调岗（带编/不带编/批量/下属同步）、解除编制、增编、减编、空编移动、自动匹配、取消兼职、调整范围补充、提交（快照）、演示流转（审批/退回/生效）。

### 5.2 差异引擎

`diff(base, current)` 产出六类（组织/职位/人员/编制/兼职/未来事项）各对象**一条最终差异**（CMP-13、CMP-18：改回基准即移出）。字段级"旧值 → 新值"供删除线渲染；"随职位整体迁移"等变化原因由操作传入。工作台待处理、对比清单、详情页消费同一份差异结果。

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

### 5.6 演示控制面板（demo-control.js）

EFF-04 四组：流程推进（审批通过/退回可填意见/到期执行成功/生效异常）、按方案重置、模拟暂存失败、状态透出。角落可折叠标签 + 橙色边框卡片，操作只作用于当前方案。

### 5.7 自测页（06-演示自测.html）

- NUM-01—08：按 PRD 13.4 表格数字逐条断言（测试即验收映射）。
- INV-01—05 不变量断言；DUP 去重、PTKEEP 兼职保留场景断言。
- 快照不可变：提交后修改草稿，断言 V1 快照与差异不变。
- 全部从种子重建开始，不污染演示数据。

断言逻辑在 `tests/selftest-runner.js`（纯 JS，页面与 Node 共用）；命令行运行：`node tools/run-tests.js`（退出码 0 = 全绿），是每轮提交前的质量门。

## 6. 页面与组件映射要点

- 列表/新建/详情按 Skill 模板骨架（`scaffold.py --type list/form/detail`）；工作台、对比页为组合布局，用 shell 骨架改。
- **固定外壳**：`shared/shell.js` 提供 `oa-shell` 全局组件（52px 顶栏 + 页签 + 220px 可折叠左菜单 + 内容区），对齐 Skill shell.html；非组织调整范围的菜单点击给出明确说明（DEM-02）。工作台用 `fill` 模式占满内容区。
- **组织树**：未用 a-tree，采用自定义平面渲染 + 绝对定位连线（思维导图式直角连线）：每行画所有“未结束祖先”的竖线（延伸到最后一个孩子的拐角即收，独生子链条不拉到底），拐角连到本级 16px ＋/－ 开关（按 antd 树开关尺度）；两行节点结构按 WF-05。
- 选人：`<proto-employee-select>`，经 `data-request` 注入本地在职人员（字段 personId/name/positionName），不接真实接口；选职位用 `<proto-select-table-modal>`（M3+ 落地）；调岗目标职位下拉用 antd select 联动。
- 调岗表（WF-10）：弹框内局部状态，确认才 apply（UI-01）；批量顶栏“应用到所选” + 逐行例外；带编职级校验按 PRD 预设等级顺序比较（PER-08），校验失败整批不落库（PER-10）。
- 双图（WF-14）：左右两个 CSS 树容器共享缩放状态，按对象 ID 双侧定位（CMP-06），新增只在右图、停用只在左图（CMP-07）。

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
| M0 文档同步 | ✅ 完成 | PRD V0.2、DISSCUSION、TECH | — | 完成 |
| M1 骨架 + 数据层 | ✅ 完成 | store/seed/自测页、方案列表、新建方案、HRONE 外壳 | AT-01—04、09、10 | 1 轮 |
| M2 工作台：组织与职位 | ✅ 完成 | 三栏布局、组织/职位全操作、组织与职位拖拽、调整范围补充 | AT-05—08、11—23 | 2–3 轮 |
| M3 工作台：人员/编制/兼职 | 进行中 | 右侧三区块、调岗表、解编、增减编、空编移动、自动匹配、取消兼职、待处理 | AT-24—44 | 2–3 轮 |
| M4 前后对比 + 提交 | 待做 | 双图、六类清单、提交快照 | AT-45—52 | 1–2 轮 |
| M5 详情 + 演示控制 + 生效 | 待做 | 方案详情、面板、状态流转、附件占位 | AT-55—62 | 1 轮 |
| M6 两案例 + 全量验收 | 待做 | CASE-01/02、验收记录、README | AT-63—69 + 全量回归 | 1 轮 |

每个里程碑闭环：实现 → 自测页全绿 + `check.py` 通过 → 执行对应 AT 并记入 `验收记录.md` → 不通过不进下一个。

### 质量机制

1. 数据层纯函数 + 单一入口（5.1）。
2. 自测断言直接取自 PRD 13.4 数字（5.7）。
3. 交互细节公共件化，禁止散落各页（5.5）。
4. 追溯矩阵进 README：需求编号 → 文件/函数 → AT 编号。
5. AT 执行按 14.5 记录格式，逐条留痕。

### 七个交互实现难点（M2/M3 逐个攻）

1. 三栏联动与选择清空（LAY-03—05）。
2. 四类拖拽源 × 落点校验 × 确认框数量预计算（ORG/POS/HC/PER）。
3. 调岗表：批量 + 逐行例外 + 带编校验 + 下属同步（PER-05—14）。
4. 差异回退：字段/对象改回基准即取消高亮/移出清单（UI-04、CMP-18）。
5. 刷新恢复但未确认弹框不算数（UI-01 vs UI-02 边界）。
6. 快照不可变（APR-04、AT-56）。
7. 九种数量口径全局一致（CNT-01—10，靠 5.4"算数只写一处"保证）。
