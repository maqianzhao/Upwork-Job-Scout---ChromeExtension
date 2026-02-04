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
