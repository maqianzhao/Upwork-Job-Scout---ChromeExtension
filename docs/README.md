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
- 增强详情面板识别：支持 dialog/class/panel 多策略识别与 `/details/` 路由下的内容容器兜底。
- `Download Log` 改为手动选择保存路径（saveAs）。
- 修复 Service Worker 下载兼容：移除 `URL.createObjectURL`，改为 `data:` URL 方案，避免 `URL.createObjectURL is not a function`。
- 增强详情打开策略：URL/job_id/标题/索引四级兜底，降低 `DETAIL_READY_TIMEOUT_10S` 误报。
- 增加 run 事件持久化（`runs:${run_id}:events`），导出 log.json 时输出 `events` 便于定位问题。
- 列表提取过滤详情面板节点，避免误提取导致“秒完成但无真实列表数据”。
- 详情就绪判定增强：标题+Summary+About the client+时薪/固定价都就绪才继续，最长等待 30 秒；等待期间自动重试点击详情。
- 运行中拦截 `/jobs` 链接并转换为 `/details` 打开，避免连续跳转。
- 基于真实探针结果适配 Upwork 新链路：支持从 `/jobs/..._~jobId` 提取 `job_id`。
- 增强详情面板关闭策略（Close/Back/Escape/history.back），降低“只采到首条后卡住”的失败率。
- 过滤非职位链接（如 `/nx/search/jobs/saved/`），避免 Start 后误跳转收藏页。
- 详情面板识别增强：支持 `air3-slider-job-details` / `data-test="air3-slider"`。
- 详情解析优先读取 `job-details-content` / `air3-slider-content`，减少空描述。
- 详情补全 list 字段：在 list 缺失时，从详情文本回填 `Budget/Rate`、`Proposals`、`job_type`、`posted_time`。
- “About the client” 支持非标题元素文本识别。
- 详情打开策略只点击 `/details/` 链接，避免跳转 `/jobs/` 独立详情页。
- 当列表仅解析出 `job_id` 时，直接构造 `/details/` URL 打开滑窗，避免跳出 Best matches。
- 若检测到跳转 `/jobs/`，将停止本次 run 并记录 `DETAIL_NAVIGATED_AWAY`，提示返回 Best matches 再重试。
- 支持动态判断当前页面是否为 Best matches，离开页面将显示 Not supported。
- 列表解析优先使用 `/details/` 链接，避免 `job_url` 退化为 `/jobs`。
