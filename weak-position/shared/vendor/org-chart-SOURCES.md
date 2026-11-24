# 组织图验证依赖

均固定版本并本地加载，业务页面不请求外部 CDN。文件保留上游原始内容。

| 文件 | 来源 | 许可证 |
| --- | --- | --- |
| d3-org-chart-3.1.1.js | https://cdn.jsdelivr.net/npm/d3-org-chart@3.1.1/build/d3-org-chart.js | MIT，见 d3-org-chart-LICENSE.txt |
| d3-7.9.0.min.js | https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js | ISC，见 d3-LICENSE.txt |
| d3-flextree-2.1.2.js | https://cdn.jsdelivr.net/npm/d3-flextree@2.1.2/build/d3-flextree.js | WTFPL v2，见 d3-flextree-LICENSE.txt |

org-chart 组件源码与 npm 发布包 3.1.1 中的 build/d3-org-chart.js 完全一致；MIT 许可证取自该发布包 misc/LICENSE.md。D3 与 flextree 许可证取自相同固定版本发布包。原型验证不代表生产选型审批。
