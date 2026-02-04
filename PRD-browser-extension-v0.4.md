# PRD：Upwork Job Scout（Chrome 浏览器扩展，Best Matches 采集）v0.4

版本：v0.4

面向读者：开发团队（可直接据此实现）

## 0. 一句话概述

在用户已登录 Upwork 的前提下，Chrome 扩展在 `Best matches` 页面自动点击 `Load more jobs` 拉取最多 N 条列表项，并通过右侧 slider 打开详情抓取字段，结果持久化到 `chrome.storage.local`，并支持自动导出 CSV + Markdown 与下载详细运行日志。

合规边界：不做验证码/风控绕过、不伪造指纹/代理池；遇 `Sign in`、`Verify you are human`、或跳转登录页则自动暂停，提示用户手动处理；仅在用户手动打开的 Upwork 页面上运行。

## 1. 目标 / 非目标

### 1.1 目标（Goals）

- G1：在 `https://www.upwork.com/nx/find-work/best-matches` 一键采集 list + detail，导出 CSV + Markdown。
- G2：高自动化：允许自动连续点击 `Load more jobs` 直到达到 `max_items`（默认 30，可配置）或无更多。
- G3：可定位问题：失败/异常必须写入结构化日志（英文原文 + 中文解释 + 步骤 + URL + 选择器提示）。
- G4：可控与安全：支持立即停止（保留已采集结果）与清空所有历史（需二次确认）。

### 1.2 非目标（Non-Goals）

- NG1：不自动投标、不自动发送 proposal、不操作站内私信。
- NG2：不“隐蔽自动化”、不做验证码/风控绕过。
- NG3：不做全站抓取；仅支持 Best matches（更稳更快）。
- NG4：不引入本地服务（Local API/SQLite/UI）；所有数据本地在扩展侧存储与导出。

## 2. 运行范围与关键假设

- 仅支持 Best matches 页面（更稳更快）。
- 支持页面 URL 规则（v0.4）：路径前缀为 `/nx/find-work/best-matches`，允许携带任意 query 参数；其它 Upwork 页面不得自动执行点击/抓取，仅允许展示“本页不支持”的提示。
- 导航限制（v0.4）：扩展不得自动打开新 tab、不得自动跳转到非当前页面 URL；所有抓取操作仅在用户当前激活 tab 内完成。
- 列表为无限加载：初始约 10 条，通过点击 `Load more jobs` 每次追加约 10 条。
- 详情展示方式为右侧 slider（遮罩暗化列表页）；本产品不退化为“新开 tab 抓取”。
- 最大并发：后续可扩展到最多 10 个，但 v0.4 默认按“单任务串行”实现，优先保证 1 个能稳定抓取完整信息。

## 3. 用户界面与交互（UX）

### 3.1 主入口

- 页面内可移动悬浮窗（overlay），在 Upwork 页面注入。

v0.4 UI 形态（必须执行）：
- 默认以“可拖拽胶囊按钮”常驻页面右下角（不得遮挡列表/slider 关键内容）。
- 胶囊态展示（v0.4）：仅显示状态灯（Idle/Running/Paused/Stopping/Stopped/Done/Error），不显示数字进度。
- 点击胶囊按钮展开面板；再次点击或按 `Esc` 收起。
- 拖拽仅作用于胶囊态；展开面板相对胶囊位置显示（实现可简化为固定位置展开，但需保证不遮挡右侧 slider 的主要内容区域）。

### 3.2 基本控件

- 模式固定为：`best_matches`（本版本不暴露其它模式）。
- 配置项：
  - `max_items`（默认 30，用户可设置）
- 操作按钮：
  - `Start`：开始一次 run
  - `Stop`：立即停止并保留已采集结果（可导出）；Stop 后不得继续发起新的点击/等待
  - `Export CSV` / `Export MD`：手动导出
  - `Download Log`：下载结构化日志文件
  - `Clear History`：清空全部历史（弹二次确认）
- 状态展示（最少）：
  - 当前状态：Idle / Running / Paused / Stopping / Stopped / Done / Error
  - 进度：`counts.list_found / max_items`，`counts.detail_ok/counts.detail_failed`
  - 最近一次错误摘要（可选）

v0.4 面板信息架构（建议但强烈推荐）：
- Header：`Upwork Job Scout` + 本页是否支持（Supported / Not supported）
- Config：`max_items`
- Status：状态（Idle/Running/Paused/Stopping/Stopped/Done/Error）+ 子阶段（List growth / Detail scraping）+ elapsed + counts
- Actions：Start / Stop / Export CSV / Export MD / Download Log / Clear History
- Error Snippet（可选）：仅显示最近 1 条错误摘要，不在面板内展示全量日志

v0.4 按钮可用性（必须执行）：
- Not supported：禁用 `Start` 且不得触发任何抓取；允许 `Export/Download Log/Clear History` 仅作用于历史数据
- Running/Stopping：禁用 `Start`、`Clear History`
- Paused：`Start` 文案显示为 `Start (New Run)`

### 3.3 自动暂停的提示

当检测到登录/挑战：
- 悬浮窗状态变为 `Paused`，显示原因原文（en）与简短中文解释（zh）。
- 同时在扩展图标 badge 显示 `PAUSE`（或 `!`）。
- 用户处理完成后，产品要求是：点击 `Start` 重新开始本次 run（不做“继续/断点续跑”）。
- v0.4 语义补充：`Start` 一律创建新 run（新的 `run_id`），并从 0 开始重新采集；若此前存在 `PAUSED_AUTH` 的 run，则该 run 保持为暂停态历史记录，用户可选择手动导出或清空历史。

## 4. 端到端流程（E2E Flow）

### 4.1 状态机（建议）

- `IDLE`
- `RUNNING_LIST`：扫描/增长列表
- `RUNNING_DETAIL`：逐条打开 slider 并抓详情
- `PAUSED_AUTH`：发现登录/挑战，暂停
- `STOPPING`：用户请求停止，尽快收尾
- `STOPPED`：已停止（可导出）
- `EXPORTING`：导出中
- `DONE`：完成
- `ERROR`：不可恢复错误（不自动导出，但必须允许手动导出已采集结果，并允许下载 log.json）

v0.4 状态归类（必须执行）：
- 进入 `STOPPED`：
  - 用户点击 `Stop`（`stopped_by_user=true`）
  - 系统触发“受控停止”条件（`stopped_by_user=false` 且必须写 `stop_reason`），包括但不限于：`LIST_LOAD_MORE_CLICK_FAILED`、`LIST_LOAD_MORE_TIMEOUT_10S`、`DETAIL_READY_TIMEOUT_10S`
- 进入 `ERROR`：
  - `STORAGE_WRITE_FAILED`、`EXPORT_DOWNLOAD_FAILED`、`UNHANDLED_EXCEPTION` 等导致无法继续运行或无法可靠交付结果的内部错误

v0.4 状态转移表（必须执行）

| Event | From | To | Side Effects |
|---|---|---|---|
| `UI_START_CLICK` | `IDLE/STOPPED/DONE/ERROR/PAUSED_AUTH` | `RUNNING_LIST` | 新建 `run_id`；清空本 run 缓冲；写 `runs:${run_id}:meta` 初值；清空/初始化 counts；badge 清空或显示运行态 |
| `UI_STOP_CLICK` | `RUNNING_LIST/RUNNING_DETAIL` | `STOPPING` | 立即停止发起新的点击/等待；尽快结束当前等待；写 `stopped_by_user=true` |
| `STOPPING_DRAINED` | `STOPPING` | `EXPORTING` | 写 `post_export_status=STOPPED`；触发自动导出（CSV+MD+log.json）并触发 downloads；更新 `run_finished_at` 与最终 counts |
| `AUTH_CHALLENGE_DETECTED` | `RUNNING_LIST/RUNNING_DETAIL` | `PAUSED_AUTH` | 记录 `AUTH_*` 错误；展示 en+zh；badge 设为 `PAUSE`；不自动导出 |
| `LIST_LOAD_MORE_TIMEOUT_10S` / `LIST_LOAD_MORE_CLICK_FAILED` | `RUNNING_LIST` | `EXPORTING` | 写 `stop_reason`；写 `post_export_status=STOPPED`；记录错误日志；自动导出 CSV+MD+log.json |
| `LIST_DONE` | `RUNNING_LIST` | `RUNNING_DETAIL` | 固化 list_found（以 `job_key` 去重后）并开始逐条详情抓取 |
| `DETAIL_READY_TIMEOUT_10S` | `RUNNING_DETAIL` | `EXPORTING` | 写 `stop_reason`；写 `post_export_status=STOPPED`；记录错误日志；自动导出 CSV+MD+log.json |
| `DETAIL_ALL_DONE` | `RUNNING_DETAIL` | `EXPORTING` | 写 `post_export_status=DONE`；触发自动导出（CSV+MD+log.json）并触发 downloads；更新 `run_finished_at` 与最终 counts |
| `EXPORT_ALL_DONE` | `EXPORTING` | `DONE/STOPPED` | 导出全部成功后将 status 置为 `post_export_status`（并清空 post_export_status） |
| `EXPORT_DOWNLOAD_FAILED` | `EXPORTING` | `ERROR` | 记录错误；保留当前已采集数据；允许手动导出与下载 log.json |

补充规则（v0.4，必须执行）：
- 当处于 `STOPPING` 时，即使检测到登录/挑战（`AUTH_*`），也不得改变终态；仅记录对应 `AUTH_*` 错误并继续完成 `STOPPING_DRAINED -> STOPPED`（保证可导出已采集结果）。

### 4.2 采集算法（建议）

1) 初始化 run：生成 `run_id`、清空本次 run 的临时缓冲区，进入 `RUNNING_LIST`。
2) List 增长：
   - 解析当前已加载列表项，提取 list 字段（L1-L9）。
   - 若不足 `max_items` 且存在 `Load more jobs` 按钮：点击一次，等待新增条目出现（超时 10s），重复。
   - “新增条目出现”判定（v0.4）：以 `job_key`（优先 job_id，否则 job_url）集合在点击后 10s 内新增 >= 1 为成功；不得依赖“每次固定增加 10 条”的假设。
   - 若按钮不存在/不可点：
     - 若当前已收集到 >= 1 条列表项：视为“无更多”，停止增长并进入详情抓取（不记为错误）。
     - 若当前列表项为 0：记录 `LIST_NO_ITEMS_FOUND` 并进入 `ERROR`（说明页面结构变化、权限异常或未处于可采集状态）。
   - 若按钮点击失败或等待新增条目超时 10s：记录错误日志并直接停止本次 run（保留已采集结果，可导出）。
3) Detail 抓取（串行）：
   - 按列表顺序逐条点击，确保右侧 slider 打开。
   - 等待 title 非空 + description_full 抽取结果非空，即视为“详情页已就绪”。
   - 抓取 detail 字段（D1-D7）。
   - 关闭 slider（或返回列表状态），进入下一条。
   - 若详情就绪等待超时 10s：记录错误日志并直接停止本次 run（保留已采集结果，可导出）。
4) 结束（完成或停止）：
   - 自动生成 CSV + Markdown 并触发自动下载（实现上应尽量设置 `saveAs=false`；是否弹出保存对话框不作为失败标准）。
   - run 状态先置为 `EXPORTING`，导出全部成功后置为 `DONE`（完成）或 `STOPPED`（停止）。

## 5. 字段定义（本版本已裁剪为“可直接开发”的最小+必需集合）

### 5.1 List 必做字段（L1-L9）

- L1 `job_url`
- L2 `job_id`：从详情 URL 的 `details/~02...` 片段提取；提取失败记录错误但不阻断。
- L3 `title`
- L4 `job_type`（hourly/fixed/unknown）
- L5 `budget_or_hourly_range_raw`（原始文案）
- L6 `posted_time_raw`（原始文案）
- L7 `description_snippet`
- L8 `skills_tags_raw`（保留原始顺序）
- L9 `proposal_count_raw`

v0.4 缺失处理（必须执行）：
- 若无法解析到 `job_url` 或 `title`：必须记录 `LIST_PARSE_ITEM_FAILED`，并跳过该列表项（不得中止整个 run）。
- 其它 list 字段缺失：字段输出为 `null`/空字符串（由实现统一），并记录对应错误日志（error_code 可复用 `LIST_PARSE_ITEM_FAILED` 并在 selector_hint 标注缺失字段）。

### 5.2 Detail 必做字段（D1-D7）

- D1 `job_url`
- D2 `job_id`
- D3 `description_full`（保留换行）
- D4 `deliverables_raw`
- D5 `attachments_present`（true/false/unknown）
- D6 `required_skills_detail_raw`
- D7 `client_history_detail_raw`

v0.4 成功/失败口径（必须执行）：
- `detail_ok`：至少满足 `title` 非空且 `description_full` 非空（title 可来自 list 或 detail）。
- `detail_failed`：详情抓取尝试后仍无法得到 `title` 或 `description_full`（或触发 `DETAIL_READY_TIMEOUT_10S`）。
- D4-D7 允许为空/unknown：缺失时必须记录对应错误日志，但不影响 `detail_ok` 的判定（M1 以 `title+description_full` 为核心成功条件）。

### 5.3 Run 元数据必做（R1-R5）

- R1 `run_id`：建议 `run_YYYYMMDD_HHMM_best_matches`
- R2 `run_started_at` / `run_finished_at`（ISO 字符串）
- R3 `source_page`：固定 `best_matches`
- R4 `max_items`（本次实际配置）
- R5 `counts`：`list_found`, `detail_ok`, `detail_failed`, `paused_count`, `stopped_by_user` 等

## 6. 数据持久化与历史（chrome.storage.local）

### 6.1 为什么需要

- 防刷新/崩溃丢失（保存已采集结果与 run 上下文）
- 支持停止后导出、失败排查、下载日志
- 支持“清空所有历史”

### 6.2 存储建议结构（示例）

- `runs/<run_id>`：run 元信息 + counts + 状态
- `runs/<run_id>/jobs`：job 列表（list + detail 合并对象），以 `job_id` 或 `job_url` 为 key
- `runs/<run_id>/errors`：错误记录数组（见第 8 节）
- `runs_index`：最近 N 个 run 的索引（防止无限增长）

v0.4 落地键规范（必须执行）：
- `runs_index`：`string[]`（run_id 列表，按 run_started_at 倒序）
- `runs:${run_id}:meta`：run 元信息（R1-R5 + status + stop_reason 等）
- `runs:${run_id}:jobs_by_key`：`Record<job_key, JobRecord>`
- `runs:${run_id}:errors`：`ErrorRecord[]`

历史上限（v0.4 默认值）：
- N = 20（保留最近 20 个 run）；超过上限时按最旧的 run 级联删除 `runs:${run_id}:*`。

约束：
- 去重范围：仅同一 run 内按 `job_key` 合并；跨 run 不覆盖历史数据（每个 run 为独立快照）。
- 不支持“断点继续”；但历史 run 保留供回溯。

### 6.3 清空历史

- `Clear History` 需要二次确认
- 仅清空扩展内历史数据；不删除已下载文件

## 7. 导出（自动 + 手动）

### 7.1 自动导出

- run 进入 `DONE` 或 `STOPPED` 后（包含用户 Stop 与系统受控停止）：
  - 自动导出 CSV
  - 自动导出 Markdown
  - 自动导出 log.json（并保留 `Download Log` 按钮用于重复下载）
- `PAUSED_AUTH` / `ERROR` 状态不自动导出（但用户可手动点击 `Export CSV/MD` 导出当下已采集结果）。
- 文件命名：
  - CSV：`run_YYYYMMDD_HHMM_best_matches.csv`
  - MD：`run_YYYYMMDD_HHMM_best_matches.md`

v0.4 导出状态（必须执行）：
- 自动导出期间，run 状态应置为 `EXPORTING`；导出全部成功后恢复为 `DONE` 或 `STOPPED`（导出失败则进入 `ERROR`）。

### 7.2 CSV 内容建议

每行一个 job，字段包含：
- Run 字段：`run_id`, `run_started_at`
- List 字段：L1-L9
- Detail 字段：D3-D7（D1/D2 与 L1/L2 可去重）

v0.4 CSV 规范（必须执行）：
- 编码：UTF-8（带 BOM，提升 Windows/Excel 兼容性）
- 分隔符：`,`（逗号）
- 转义：字段包含逗号、双引号或换行时，必须使用双引号包裹；双引号以 `""` 表示（RFC4180 风格）
- 换行：`\r\n`

### 7.3 Markdown 内容建议

优先可读性（按 job 分段）：
- 标题：`title`
- 链接：`job_url`
- 列表字段摘要：预算/时间/提案数/skills
- 详情：`description_full`（保留换行）
- 客户历史摘要：`client_history_detail_raw`

v0.4 Markdown 规范（建议）：
- 对 `description_full` 保留换行；若内容包含三反引号（```），应做最小处理以避免破坏 Markdown 结构（例如替换为缩进代码块或插入零宽分隔符，具体实现由开发决定但需记录在日志中）。

## 8. 登录/挑战检测与错误日志

### 8.1 自动暂停条件（满足任一即暂停）

- URL 跳转到登录相关路径（或页面出现登录表单）
- 页面出现文案：
  - `Sign in`
  - `Verify you are human`
- 其它挑战/拦截提示：按页面原始提示文本作为 `error_message_en` 记录

v0.4 判定优先级（必须执行，避免误判）：
- 强条件优先：URL 命中登录/挑战相关路由或检测到登录表单关键元素存在时，立即进入 `PAUSED_AUTH`。
- 弱条件兜底：仅文本命中不得直接暂停，必须同时满足“命中位置位于顶层 banner/modal/全屏提示”等页面结构特征（由实现定义并写入 selector_hint）。

### 8.2 日志下载

- 悬浮窗提供 `Download Log` 按钮
- 日志文件命名：`run_YYYYMMDD_HHMM_best_matches.log.json`
- 不要求在扩展内查看日志，仅下载

### 8.3 错误记录结构（必做）

每条错误记录：
- `error_code`（枚举）
- `error_message_en`（原始提示/异常原文）
- `error_message_zh`（中文解释）
- `step`（阶段/步骤，枚举，见下方）
- `url`
- `selector_hint`（字符串；推荐为 JSON 字符串，便于机器解析）
- `ts`

v0.4 `step` 枚举（必须执行）：
- `RUN_INIT`
- `LIST_SCAN`
- `LOAD_MORE`
- `DETAIL_OPEN`
- `DETAIL_READY`
- `DETAIL_PARSE`
- `DETAIL_CLOSE`
- `AUTH_DETECT`
- `STORAGE_WRITE`
- `EXPORT`

v0.4 `selector_hint` 推荐结构（建议）：

```json
{
  "field": "detail.description_full",
  "strategy": "S1",
  "selector": "[role=dialog] ...",
  "notes": "picked top-most dialog by z-index",
  "job_key": "~02..."
}
```

### 8.4 建议 error_code 枚举（可在实现中补充）

- `AUTH_SIGNIN_DETECTED`
- `AUTH_VERIFY_HUMAN_DETECTED`
- `AUTH_REDIRECT_LOGIN_DETECTED`
- `LIST_PARSE_ITEM_FAILED`
- `LIST_NO_ITEMS_FOUND`
- `LIST_LOAD_MORE_CLICK_FAILED`
- `LIST_LOAD_MORE_TIMEOUT_10S`
- `DETAIL_SLIDER_OPEN_FAILED`
- `DETAIL_SLIDER_CLOSE_FAILED`
- `DETAIL_READY_TIMEOUT_10S`
- `DETAIL_PARSE_TITLE_MISSING`
- `DETAIL_PARSE_DESCRIPTION_MISSING`
- `DETAIL_PARSE_DELIVERABLES_MISSING`
- `DETAIL_PARSE_ATTACHMENTS_UNKNOWN`
- `DETAIL_PARSE_REQUIRED_SKILLS_MISSING`
- `DETAIL_PARSE_CLIENT_HISTORY_MISSING`
- `STORAGE_WRITE_FAILED`
- `EXPORT_DOWNLOAD_FAILED`
- `UNHANDLED_EXCEPTION`

## 9. 技术方案（MV3 架构与权限）

### 9.1 Manifest V3

- `service_worker`：run 状态管理、持久化、导出/下载、日志汇总
- `content_script`：DOM 解析、点击 `Load more jobs`、打开 slider、抓取字段
- `overlay UI`：注入到页面，发起 Start/Stop/Export/DownloadLog/ClearHistory

### 9.2 权限（已确认 OK）

- `permissions`: `storage`, `downloads`, `activeTab`, `scripting`
- `host_permissions`: `https://www.upwork.com/*`

## 10. 验收标准（MVP，已确定）

本项目 M1 采用 **方案 A** 作为通过标准；方案 B/C 作为后续增强参考。

### M1 = 方案 A（最小可用，偏稳）

- 在 Best matches 页面，设置 `max_items=30`
- 自动点击 `Load more jobs`，list 抓到 >= 20 条（若页面本身不足则抓到全部）
- run 在不触发 `PAUSED_AUTH` 的情况下，应能达到 `DONE`
- 对已抓到的每条 job，至少成功抓到 `title + description_full` 的比例 >= 70%（成功率口径：`detail_ok / (detail_ok + detail_failed)`，分母为“已发起详情抓取的条目数”）
- 导出 CSV + MD + log.json 均自动下载创建成功（以 downloads API 返回 downloadId 为准；是否弹出保存对话框不作为失败标准）

### 方案 B（后续增强：偏完整，偏自动化）

- list 抓到 min(30, 页面可加载总量)
- detail 成功率 >= 85%
- 任何失败均有 `error_code + en + zh + step + url`，且可下载 log.json

### 方案 C（后续增强：偏排错）

- 不强制成功率阈值
- 但要求：每一次失败都能在日志中定位到“失败步骤 + 可能原因 + 关键 selector_hint”

## 11. 风险与维护策略

- 页面结构变化：采用“快速修补选择器”的维护策略；日志与 selector_hint 用于加速定位。
- 动态加载/延迟：超时策略统一为 10s（list 增长、detail ready）；其中 list 增长阶段若 `Load more jobs` 点击失败或 10s 超时，将记录日志并停止本次 run（保留已采集结果）。
- 数据量与 `chrome.storage` 限制：历史 run 需上限（runs_index 保留最近 N 个）。

## 12. DOM 选择器与判定策略（v0.4，必须执行）

本节目标：在无法“写死 Upwork 具体选择器”的前提下，定义一套可维护的选择器策略（多候选 + 记录命中），确保页面结构变化时可通过日志快速修补。

### 12.1 通用原则

- 所有 DOM 选择均以“优先语义、其次结构”为原则：优先 `role/aria-*`、可见文本（如 `Load more jobs`），最后才用深层级 CSS。
- 对每个关键步骤，必须记录 `selector_hint`，说明使用了哪套候选 selector 与命中情况（例如 `{"field":"list.job_url","strategy":"A1","selector":"a[href*=\"/details/~\"]"}`）。
- 所有文本匹配必须基于可见文本（visible text），避免隐藏文本导致误判。

### 12.2 job_id / job_key 解析（必须执行）

- `job_id` 解析：从 `job_url` 中提取 `details/~...` 片段内的 `~...` 作为 job_id（例如 `.../details/~022018...` -> `~022018...`）。
- `job_key` 规则：优先使用 `job_id`，否则使用 `job_url`（两者都缺失则该条目视为无法解析，记录错误并跳过）。

### 12.3 列表项（List Item）定位与抽取（必须执行）

建议策略（按优先级从高到低尝试）：
- A1：在页面内查找所有 `a` 元素，筛选 `href` 包含 `/nx/find-work/best-matches/details/~` 的链接作为列表详情入口。
- A2（兜底）：查找 `a` 的 `href` 包含 `/details/~` 的链接（仅在 v0.4 支持页范围已确保为 best-matches 时可用）。

列表项“卡片容器”判定：
- 以链接元素向上寻找最近的“可点击卡片容器”（例如 `closest('article, section, li, div')` 逐级尝试），并将该容器作为 list 字段抽取范围。

List 字段抽取要求：
- L1 `job_url`：取链接的绝对 URL（必要时补全 origin）。
- L3 `title`：优先取链接的可见文本；若为空，改从容器内寻找最显著的标题文本（实现可用“最大字号/最短路径/首个 heading”启发式，命中策略写入 selector_hint）。
- L4-L9：通过“多候选 selector 列表”尽力抽取；抽取不到填 `null` 并记录缺失日志（不阻断 run）。

v0.4 建议候选（用于快速落地，命中与否必须写 selector_hint）：
- `job_type`：在卡片容器内匹配 `Hourly` / `Fixed-price` 文案；否则输出 `unknown`
- `budget_or_hourly_range_raw`：匹配包含 `$` 的金额/范围文案（仅记录原始可见文本，不拆分）
- `posted_time_raw`：匹配相对时间文案（例如 `hours ago`、`yesterday`），仅记录原始可见文本
- `proposal_count_raw`：匹配包含 `Proposals` 的行（例如 `Proposals: Less than 5`），原样记录整段可见文本
- `skills_tags_raw`：若存在 tag/chip 列表，按 DOM 顺序收集可见文本数组；否则输出 `null`

### 12.4 `Load more jobs` 按钮定位与点击（必须执行）

按钮定位（顺序尝试）：
- B1：查找所有 `button`，匹配其可见文本精确等于 `Load more jobs`（忽略大小写与两端空白）。
- B2：查找包含 `Load more jobs` 的按钮（用于出现额外空格/换行）。

点击与判定：
- 点击前记录当前 `job_key` 集合大小为 `before_count`。
- 点击后等待最多 10s，循环检测 `job_key` 集合大小 `after_count`。
- 若 `after_count - before_count >= 1`：判定成功，继续下一轮增长。
- 若 10s 内无新增：记录 `LIST_LOAD_MORE_TIMEOUT_10S`，并进入 `STOPPED`（自动导出）。
- 若按钮不存在且 list 已有条目：视为“无更多”，触发 `LIST_DONE` 进入详情抓取（不记为错误）。
- 若按钮不存在且 list 为空：记录 `LIST_NO_ITEMS_FOUND` 并进入 `ERROR`（说明页面结构或权限异常）。

### 12.5 右侧 slider（详情面板）定位、就绪与关闭（必须执行）

打开方式：
- 对每个列表项，点击其详情链接/卡片触发右侧 slider 打开（不新开 tab）。

slider 容器定位（顺序尝试）：
- S1：查找页面内“最上层可见对话容器”：`[role=\"dialog\"]` 或 `[aria-modal=\"true\"]`（实现可通过比较 `z-index` 或 DOM 顺序选择最可能的那个）。
- S2（兜底）：查找包含“Job Details”语义的容器（例如 aria-label/title），具体命中策略必须写入 selector_hint。

就绪条件（v0.4）：
- 当 `description_full` 非空且 `title` 非空（`title` 可来自 list 或 slider），判定为就绪。
- 10s 内未满足：记录 `DETAIL_READY_TIMEOUT_10S`，进入 `STOPPED`（自动导出）。

关闭方式（顺序尝试）：
- C1：在 slider 内查找 close button：`button[aria-label*=\"Close\"]`（大小写不敏感）。
- C2：发送 `Escape` 键事件作为兜底。
- 关闭失败：记录 `DETAIL_SLIDER_CLOSE_FAILED`（v0.4 允许继续下一条，但必须在 selector_hint 标注可能导致后续点击失效）。

v0.4 Detail 字段抽取建议（命中策略写 selector_hint；抽取不到允许为空但要写缺失日志）：
- `description_full`：优先抽取 slider 内“最大文本块”（排除导航/按钮/标签等），保留换行
- `deliverables_raw`：优先在包含 `Deliverables` 标题的区块内抽取可见文本
- `attachments_present`：若存在 `Attachment`/`Attachments` 区块或附件图标则 `true`；若明确无附件提示则 `false`；否则 `unknown`
- `required_skills_detail_raw`：优先在 `Skills` 区块收集 tag/文本
- `client_history_detail_raw`：优先在 `About the client`/`Client` 区块抽取可见文本（原样）

### 12.6 登录/挑战检测（必须执行）

强条件（任一命中即暂停）：
- URL path 命中登录/挑战相关路由（实现以包含 `/login`、`/ab/account-security/` 等关键词为候选，命中规则写入 selector_hint）。
- 页面出现登录表单关键元素组合（email/password 输入 + 提交按钮）。

弱条件（仅作为兜底）：
- 出现 `Sign in` / `Verify you are human` 文案，且该文案位于顶层 banner/modal/全屏提示等结构区域（实现自定义“顶层提示容器”选择器，并写入 selector_hint）。

## 13. 数据模型与持久化（v0.4，必须执行）

### 13.1 数据结构（示例，建议按 TypeScript 实现）

`RunMeta`（存储于 `runs:${run_id}:meta`）：
- `run_id`, `run_started_at`, `run_finished_at`, `source_page`, `max_items`
- `status`: `IDLE|RUNNING_LIST|RUNNING_DETAIL|PAUSED_AUTH|STOPPING|STOPPED|EXPORTING|DONE|ERROR`
- `post_export_status`: `DONE|STOPPED`（仅当 `status=EXPORTING` 时必填，用于导出完成后恢复终态）
- `stopped_by_user`: boolean
- `stop_reason`: `error_code` 或 `null`
- `counts`: `list_found`, `detail_ok`, `detail_failed`, `paused_count`

`JobRecord`（存储于 `runs:${run_id}:jobs_by_key[job_key]`）：
- `job_key`, `job_id`, `job_url`
- List：L3-L9（其中 `skills_tags_raw` 必须为 `string[] | null`，按 DOM 顺序）
- Detail：D3-D7（其中 `attachments_present` 必须为 `true|false|unknown` 三态）
- `detail_status`: `not_started|ok|failed`
- `detail_error_code`: string|null
- `detail_error_message_en`: string|null
- `detail_error_message_zh`: string|null
- `first_seen_at`, `last_updated_at`

`ErrorRecord`（存储于 `runs:${run_id}:errors[]`）：
- `error_code`, `error_message_en`, `error_message_zh`, `step`, `url`, `selector_hint`, `ts`
- 可选：`job_key`（若与某条 job 关联）

### 13.2 写入粒度（必须执行）

- 每完成 1 个列表项解析（成功/失败）后，应增量更新 `jobs_by_key` 与 `counts.list_found`（去重后）。
- 每完成 1 条详情抓取（ok/failed）后，必须写入：
  - 该 `JobRecord` 的 detail 字段与 `detail_status`
  - `counts.detail_ok/detail_failed`
  - 相关错误（如有）写入 `errors[]`
- STOPPED/DONE/ERROR 状态变更必须立即写入 `runs:${run_id}:meta`，并写 `run_finished_at`（若可确定）。

## 14. 导出字段表（v0.4，必须执行）

### 14.1 CSV 列名与映射（必须执行）

CSV header（列顺序固定如下，便于稳定 diff 与下游处理）：
- `run_id`
- `run_started_at`
- `job_key`
- `job_id`
- `job_url`
- `title`
- `job_type`
- `budget_or_hourly_range_raw`
- `posted_time_raw`
- `description_snippet`
- `skills_tags_raw`
- `proposal_count_raw`
- `description_full`
- `deliverables_raw`
- `attachments_present`
- `required_skills_detail_raw`
- `client_history_detail_raw`
- `detail_status`
- `detail_error_code`

字段格式要求：
- `skills_tags_raw`：用 ` | ` 连接为单一字符串（空数组输出空字符串；null 输出空字符串）。
- `attachments_present`：输出 `true`/`false`/`unknown`（不得用空字符串表示 unknown）。
- `detail_error_code`：仅当 `detail_status=failed` 时输出。

### 14.2 Markdown 模板（建议）

每条 job 输出一个分段：
- `## {title}`
- `URL: {job_url}`
- `Budget/Rate: {budget_or_hourly_range_raw}`；`Posted: {posted_time_raw}`；`Proposals: {proposal_count_raw}`
- `Skills: {skills_tags_raw}`
- `### Description`（原样保留换行）
- `### Deliverables`
- `### Client History`
- 若 `detail_status=failed`：追加 `### Detail Error`（含 error_code + zh 简述）

## 15. 日志（log.json）格式与事件（v0.4，必须执行）

### 15.1 log.json 顶层结构（必须执行）

`log.json` 顶层对象建议：
- `run_meta`: `RunMeta`
- `errors`: `ErrorRecord[]`
- `events`: `EventRecord[]`（可选但强烈推荐）
- `summary`: { `download_ids`: { `csv`: number|null, `md`: number|null, `log`: number|null } }

`EventRecord`（建议）：
- `event_code`（枚举）
- `step`（阶段/步骤）
- `ts`
- 可选：`job_key`、`url`、`details`（小对象，避免过大）

### 15.2 建议 event_code（可选）

- `RUN_STARTED`
- `LIST_SCAN_STARTED` / `LIST_SCAN_FINISHED`
- `LOAD_MORE_CLICKED` / `LOAD_MORE_SUCCESS` / `LOAD_MORE_NO_DELTA`
- `DETAIL_OPEN_REQUESTED` / `DETAIL_READY` / `DETAIL_CLOSED`
- `EXPORT_STARTED` / `EXPORT_CSV_DONE` / `EXPORT_MD_DONE` / `EXPORT_LOG_DONE`
- `RUN_STOPPED` / `RUN_DONE` / `RUN_ERROR`
