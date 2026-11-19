# 架构图展示改造验收记录

日期：2026-11-19。分支：`codex/new-compare`。规格：PRD V0.32 CMP-44—47、讨论一百七十五／一百七十六。独立工作树及端口 8120；浏览器验证使用临时上下文，没有重置用户演示数据。

## 实际结果

- `node tools/run-tests.js`：130 项通过，0 失败。
- Skill 静态检查：6 页通过，0 error／0 warn；`git diff --check` 通过。
- `tools/browser-compare-layout.js`：普通模式三种展示、真实鼠标拖动、20%—80% 边界、双击恢复 50%／50%、键盘调整与复位通过。按讨论一百七十六更新断言：初次进入、切换单图／双图及主动“适应画布”自动适配并居中，不恢复上次滚动和缩放；展开状态与分隔比例保留。根据实际可见卡片和人编行边界验证水平居中、共享纵向范围居中、图形完整可见及双图缩放一致。
- 三模式分别进入／退出真实 Fullscreen API、全屏内切换三模式、全屏拖动、原生退出事件及退出后分隔比例保留通过。1440×1000、1280×720、1024×600 可见图区均填满全屏剩余高度。无头 Chrome 的 Esc 不模拟浏览器层退出，使用原生 `document.exitFullscreen()` 复核退出事件；实体键盘 Esc 留待人工复核，不记作通过。
- 工作台日常“前后对比”和“提交确认”两个 iframe 入口实际进入单图全屏并退出，退出后弹框仍存在，提交确认按钮保留；未实际提交审批。图表操作前后业务数据一致，搜索和同步移动通过，无页面异常。
- `tools/browser-compare-connectors.js`：混合分支共享横梁、复制子树占位、多根折叠、三档缩放、仅编制职位末行、人编显示／搜索及展开状态回归通过。
- 追加多根及调整后新增两级组织的临时方案：前后图高度不同时，共同层级仍纵向对齐，三模式切换后均适配居中；Ctrl＋滚轮实际缩放后，光标下节点位置偏移小于 1.5px，居中偏移未破坏缩放锚点。
- 复核更新后的初次双图截图，图形位于各侧画布中央，不包含层级起点前的无内容空白；单图全屏及不等宽双图全屏的模式和工具栏可见、分隔把手明确、图区填满。临时截图目录由 `QA_OUTPUT_DIR` 指定，不写入业务目录。

## 复跑

先用 Skill 的 `scripts/serve.py` 为本工作树启动独立 HTTP 服务，然后执行：

```bash
node tools/run-tests.js
python3 <skill-root>/scripts/check.py 原型/组织调整
BASE_URL=http://127.0.0.1:8120 node tools/browser-compare-layout.js
BASE_URL=http://127.0.0.1:8120 node tools/browser-compare-connectors.js
git diff --check
```

浏览器脚本通过 `PLAYWRIGHT_MODULE` 或 `NODE_PATH` 指定已有 Playwright，`CHROME_PATH` 可指定 Chrome；不安装项目依赖。设置 `QA_OUTPUT_DIR` 可保存验收图。

本次未执行：实体键盘 Esc、触屏设备拖动、其他浏览器、完整人工 AT。此前弱化职位版本的验证结果保留在原验收记录，不代表本次重新执行全部历史用例。
