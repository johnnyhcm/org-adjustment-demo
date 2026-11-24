# 组织调整 Demo 交付说明

当前分支 `codex/weak-position-version`，工作树 `/Users/zt30043/.codex/worktrees/1168/Demo`，已合并 codex/new-compare。现行规格为 [PRD](../../PRD.md) V0.52，技术设计见 [TECH](../../TECH.md)，待办见 [TODO](../../TODO.md)，历史结论见 [DISSCUSION](../../DISSCUSION.md)。2026-11-24 合并两分支：原有组织／职位操作规则与新对比、AI 功能共同保留。

## 运行与配置

Vue 3、Ant Design Vue 4、dayjs、D3 及 Quill 使用本地固定版本 vendor；页面无需构建。真实 AI 使用本机 Python 服务，Node 用于测试。在仓库根目录运行：

```bash
python3 tools/overview-server.py --port <本工作树端口> --env-file /Users/zt30043/Documents/.env
```

将 `<本工作树端口>` 替换为该工作树现有端口，再打开 `http://127.0.0.1:<本工作树端口>/index.html`。该服务同时提供页面与真实 AI 接口，并禁用缓存。更新后强制刷新整个工作台（macOS：⌘⇧R）再打开对比。使用该工作树现有端口并保持地址和端口，避免切换来源后使用另一份 localStorage；不同工作树用不同端口。

配置模板为根目录 `.env.example`，支持 `OVERVIEW_API_BASE_URL`、`OVERVIEW_API_KEY`、`OVERVIEW_MODEL`、`OVERVIEW_TIMEOUT_SECONDS`、`OVERVIEW_RESPONSE_FORMAT`。进程环境变量优先；文件每次请求重读。`--env-file` 可指向项目外文件，不传时读取已被 Git 忽略的根目录 `.env`。密钥不得放入原型静态目录或提交。低推理适配仅对 api.deepseek.com 的 deepseek-flash 生效；模板中的其他模型保持通用参数。

配置入口 `/ai-settings` 不回显已保存 Key，只有主动保存才写配置文件，保存不调用模型。纯静态／file 入口可以浏览和手工编辑概览；真实 AI 需要上述 HTTP 服务。GitHub Pages 不承载密钥或 AI 代理。当前分支沿用 weak-position 历史发布目录；本次只合并，不发布。提交与发布规则见 TECH §7.1。

## 页面与操作

| 页面 | 作用 |
| --- | --- |
| index.html | 方案列表、筛选、新建方案弹框、演示数据重置 |
| 02-新建方案.html | 新建方案直达兼容页，正常入口为列表弹框 |
| 03-工作台.html | 组织／编制／人员三栏，范围、职位管理、批量操作、拖拽及 Undo／Redo；打开对比和提交 |
| 04-前后对比.html | 对比／提交确认、AI 概览与富文本编辑；保留直达兼容入口 |
| 05-方案详情.html | 审批、版本冻结概览、生效结果与演示状态流转 |
| ai-settings.html | 本机模型配置 |
| 06-演示自测.html | 内部数据层自测和故障注入 |

独立对比使用 `04-前后对比.html?plan=plan-case2`；仅工作台内部 iframe 启用 embed 模式。关闭对比返回原工作台。

首次打开有实际调整、从未保存过概览的可编辑方案时自动生成。已有文稿（含已保存空稿）保留，方案变化才提醒重新生成或编辑。主动“✦ AI 生成”成功后直接替换保存；生成中仅显示旋转提示，失败恢复旧文稿。支持加粗、五种颜色和 12／14／16／18px 字号；提交冻结概览。完整规则见 PRD §10.5，真实调用与性能边界见 AI 概览验收记录。

架构图支持双图／单图、全屏、分隔及变化过滤。组织卡统一 220px，组织按钮在底部居中；职位保持纵向排列，首职位顶部中心接线，后续职位从左侧公共竖线接入。无子组织且只有一个可见职位时中心直连；职位按钮在卡片左下侧人编轨道起点。节点为 HTML、全部连线为 SVG。进入／退出全屏自动适配居中，普通缩放及超大图保留滚动。人员调动在前图标“调出”、后图标“调入”；清单仍用“调岗”。详见 PRD CMP-44—59b。

停用组织在草稿保留职位和人编，提交才收尾，退回恢复；对比及 AI 数量统一读取提交结果投影。新增组织／职位按取消新增处理，复制职位可换目标组织，批量复制岗位也记录来源。组织／编制／职位单项入口统一“操作 ▾”，兼职行不显示调岗。

工作台及表单规则集中见 PRD §0.6—0.8、第 9 章和 PER-05—10a，本文不重复维护字段和交互规格。

## 演示数据与兼容

- 案例一 `plan-case1`：范围内 9 职位、24 在职员工、28 编制、4 可用空编。
- 案例二 `plan-case2`：范围内 8 职位、23 当前主职、8 未来人员、35 编制、4 可用空编、4 条兼职。产品部／产品经理含浮动、不占编、待绑定、职级异常及未来事件，完整数据见 PRD 第 17 章。
- 案例二初始待绑定孙七与异常陈明阻止提交：可先自动匹配孙七；解除陈明绑定，将可用编制 202611080129 的职级改为 P4-2，再自动匹配。Undo 可逐步恢复。
- `scopeDemo` 为独立范围／时间轴／在途流程校验数据；华东数据仅用于第 13 章自测，均不进入预置列表。
- schema v12 兼容 v7—v11，保留既有方案和修改，补齐缺失字段。新种子不覆盖现有暂存；演示重置会清除此地址全部方案和修改，不作为升级步骤。
- 字典使用稳定 ID，默认占位人员不占职位或编制；新增对象使用稳定临时标识，正式编码留待生效分配，职级为 P/M 序列。

## 验证与追溯

在仓库根目录执行基础检查：

```bash
node tools/run-tests.js
python3 tools/overview-server-test.py
python3 <skill-root>/scripts/check.py "原型/组织调整"
git diff --check -- . ':(exclude)原型/组织调整/shared/vendor/**'
```

`<skill-root>` 为本机 hrone-html-prototype 技能目录。第三方 vendor 保留上游原样及许可证；其原有行尾空白不作为自有源码改动。

页面回归需启动本工作树服务并提供 Playwright 和 Chrome；用 `PLAYWRIGHT_MODULE` 指定模块绝对路径：

```bash
BASE_URL=http://127.0.0.1:<本工作树端口> PLAYWRIGHT_MODULE=<模块路径> node tools/browser-overview.js
BASE_URL=http://127.0.0.1:<本工作树端口> PLAYWRIGHT_MODULE=<模块路径> node tools/browser-org-chart.js
BASE_URL=http://127.0.0.1:<本工作树端口> PLAYWRIGHT_MODULE=<模块路径> node tools/browser-compare-layout.js
BASE_URL=http://127.0.0.1:<本工作树端口> PLAYWRIGHT_MODULE=<模块路径> node tools/browser-compare-changes.js
BASE_URL=http://127.0.0.1:<本工作树端口> PLAYWRIGHT_MODULE=<模块路径> node tools/browser-compare-navigation.js
PLAYWRIGHT_MODULE=<模块路径> node tools/browser-compare-fullscreen-file.js
```

概览浏览器默认用替身上游验证交互；加 `REAL_MODEL=1` 会真实调用已配置模型两次，使用隔离种子方案，验证首次生成及最新组合调整。接口测试使用临时配置，不写用户凭证；浏览器回归不重置用户已有方案。

| 记录 | 适用范围 |
| --- | --- |
| [分支合并验收](验收记录-合并.md) | 两分支集成、交叉回归及实际执行范围 |
| [AI 概览验收](验收记录-AI概览.md) | 事实、文稿、模型协议、真实调用及性能；现行规则见讨论二百零五追加验收 |
| [架构图验收](验收记录-org-chart.md) | D3 基线及后续连线、按钮、全屏、调入调出和单职位直连 |
| [new-compare 验收](验收记录-new-compare.md) | 早期对比功能基线 |
| [弱化职位验收](验收记录-弱化职位.md) | 原工作台及业务回归历史 |
| [问题记录](../../ISSUE_LOG.md) | 重复问题的根因、方案及后续修正 |

记录按实际执行日期保留，不把历史通过结果当成本次重跑。完整人工 AT 尚待补齐；正式字典／编码、任职回写、审批后执行、外部详情、PDF 等接入边界见 PRD 第 16 章。
