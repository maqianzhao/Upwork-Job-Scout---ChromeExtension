# PRD：Upwork Job Scout（浏览器扩展辅助采集）

## 0. 一句话概述（One-liner）

在用户已登录 Upwork 的前提下，通过 Chrome 浏览器扩展在“当前页面”内执行列表遍历与详情采集（list+detail），将结构化结果写入本地存储与导出表格，避免无头浏览器与隐蔽自动化。

> 合规边界：不做验证码/风控绕过、不伪造指纹/代理池、不隐藏自动化痕迹；遇登录失效或挑战必须人工处理；仅个人使用，限制访问范围与频率。

## 1. 背景与问题（Problem Statement）

在 Upwork 上筛选任务的主要成本来自重复劳动：

- 在列表页筛选、滚动、翻页
- 逐条打开详情页判断需求与预算匹配度
- 记录关键信息并做对比与排序

现有自动化方案多基于无头浏览器或受控浏览器实例，易触发风控且稳定性差。目标是改为**“人类浏览器 + 扩展辅助采集”**的方式，降低风险并保持可用性。

## 2. 目标与成功标准（Goals & Success Criteria）

### 2.1 目标（Goals）

- G1：在浏览器内一键采集“当前列表页 + 逐条详情页”，输出候选表格。
- G2：采集结果可追溯可去重：每条 job 有稳定标识（URL/job_id）、采集时间、run_id。
- G3：默认 list+detail 模式，列表字段与详情字段均覆盖。
- G4：可控上限（页数/条数/时间），避免过量访问。

### 2.2 成功指标（Metrics）

- M1：单次 run 成功采集条数（list）/补齐详情条数（detail）
- M2：单次 run 总耗时
- M3：失败率（登录失效/挑战/页面结构变化）
- M4：人工认为“值得继续看”的命中率

## 3. 非目标（Non-Goals）

- NG1：不自动投标、不自动发送 proposal。
- NG2：不做验证码/风控绕过、不使用指纹伪装/代理池/隐蔽自动化。
- NG3：不做全站抓取；仅针对用户当前页面或明确指定范围。
- NG4：不把数据上传第三方；所有数据本地保存。

## 4. 用户画像与使用场景（Users & Use Cases）

### 4.1 用户画像

- 个人开发者/自由职业者
- 目标：在大量任务中快速筛出“可交付”的候选任务

### 4.2 关键场景（Use Cases）

- UC1：我登录 Upwork，打开筛选后的列表页，点击扩展“开始采集”，生成 CSV/Markdown。
- UC2：采集过程中遇登录失效或挑战，采集暂停并提示我处理；处理后继续。
- UC3：限定只采集当前页或前 N 页/条，避免过量访问。

## 5. 方案概述（Proposed Solution）

### 5.1 产品形态（Product Surfaces）

- **Chrome 扩展**：运行在用户当前页面内，负责 DOM 采集、翻页与详情遍历。
- **本地服务（Local API）**：负责持久化（SQLite）与导出（CSV/Markdown/JSON）。
- **本地 UI**：查看 run 列表、结果、导出路径与状态。

### 5.2 采集工作流（高层）

1) 用户在 Chrome 登录并完成筛选  
2) 点击扩展按钮启动采集  
3) 扩展在当前页面读取列表卡片并收集 job URL  
4) 逐条打开详情页（新标签页或同页导航）抓取详情字段  
5) 将结构化结果发送到本地 API 存储  
6) UI 显示结果并支持导出

### 5.3 采集模式（Scope Modes）

- Mode A：`current_page`
  - 只采集当前列表页可见结果（最低风险）。
- Mode B：`paged_list`
  - 扩展点击“下一页”并重复采集（上限控制）。
- Mode C：`job_url_list`
  - 用户粘贴/导入一组 job URL，仅采详情。

## 6. 功能需求（Functional Requirements）

### 6.1 扩展交互

- FR-001：扩展提供“开始/暂停/继续/停止”。
- FR-002：扩展展示当前进度（已采集条数/页码/耗时）。
- FR-003：扩展支持选择采集模式（current_page/paged_list/job_url_list）。
- FR-004：扩展可配置上限（max_pages/max_items/max_minutes）。

### 6.2 列表页采集字段（Required/Optional）

**必填（list）**
- `job_url`
- `title`
- `job_type`（hourly/fixed）
- `budget_or_hourly_range`（缺失时记录 error_code）
- `posted_time`（缺失时记录 error_code）

**可选（list）**
- `description_snippet`
- `skills/tags`
- `proposal_count`
- `client_payment_verified`
- `client_location`
- `client_rating/spend`

### 6.3 详情页采集字段（Required/Optional）

**必填（detail）**
- `job_url`
- `description_full`（缺失时记录 error_code）

**可选（detail）**
- `deliverables`
- `attachments_present`
- `required_skills_detail`
- `client_history_detail`
- `client_verification_detail`
- `activity`
- `questions`

### 6.4 登录与挑战处理

- FR-010：检测登录/挑战后立即暂停采集。
- FR-011：提示用户“请手动完成验证/登录后继续”。
- FR-012：不保存明文密码，不采集站内私信。

### 6.5 去重、存储与导出

- FR-020：按 `job_id` 或 `job_url` 去重；重复出现更新 `last_seen_at`。
- FR-021：本地存储 SQLite（runs/jobs/errors/exports）。
- FR-022：导出 CSV/Markdown/JSON（至少 CSV+MD）。
- FR-023：导出目录可在 UI 中配置；默认 `./output/<run_id>/`。

## 7. 非功能需求（Non-Functional Requirements）

- NFR-001：运行环境为 Windows 10/11 + 可见 UI 的 Chrome。
- NFR-002：默认上限 10 页 / 50 条 / 10 分钟。
- NFR-003：采集失败不影响全局 run（记录 error_code）。
- NFR-004：输出文件人类可读友好。

## 8. 数据存储（Data & Persistence）

- SQLite：保存 runs、jobs、errors、exports。
- 输出文件：CSV / Markdown / JSON（路径可配置）。

## 9. 风险与开放问题（Risks & Open Questions）

- 页面结构变化可能导致选择器失效，需要快速修复机制。
- 浏览器扩展对某些动态加载区域可能需要额外等待/滚动策略。
- 用户行为必须保持在“手动触发”的合规边界内。

## 10. 里程碑（Milestones）

- M0：扩展骨架 + 本地 API 通道打通
- M1：current_page 模式可用（list+detail）
- M2：paged_list 模式可用（上限控制）
- M3：导出 + 初筛评分
- M4：稳定性/错误恢复优化

## 11. Launch Plan（本地使用）

- 仅本地运行，不对外发布；默认只个人使用。
- 先在小范围（少量页数/条数）验证稳定性，再逐步提升限制。
