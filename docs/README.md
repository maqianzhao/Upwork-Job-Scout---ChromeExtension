# 文档索引

本目录用于保存项目文档、规划与实现细节。

## 主要文档

- `PRD-browser-extension-v0.4.md`：当前实现基准（需求、状态机、选择器策略、存储与导出规范）。
- `docs/plans/2026-02-04-upwork-extension-implementation-plan.md`：实施计划（已按 v0.4 执行第一版落地）。

## 维护说明

- 文档应与代码实现保持一致；当核心行为或数据结构变更时，优先更新 PRD。
- 计划文档作为历史记录，不强制与代码同步，但若已明显偏离，请在文件顶部补充“状态说明”。

## 近期变更

- 增加 `web_accessible_resources` 以确保 overlay 与模块可在内容脚本中正确加载。
- 修复 Best matches 首屏延迟加载导致的误判：列表阶段在无数据时先等待 12 秒，再决定是否报 `LIST_NO_ITEMS_FOUND`。
- 修复详情链接识别：支持 `/details/` 路径与 `%7E` 编码 job_id 解析。
- 增强列表与按钮兜底策略：支持 card fallback 提取、`role=button` 的 Load More 检测。
- 日志/导出文件统一输出到浏览器下载目录下 `UpworkJobScout/` 子目录，并在下载失败时返回可见错误。
