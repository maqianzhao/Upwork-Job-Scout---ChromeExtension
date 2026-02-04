# Upwork Job Scout v0.4 实施计划

基于 `PRD-browser-extension-v0.4.md`，目标是交付一个可直接加载到 Chrome 的 MV3 扩展（Best matches 页面采集），并配套可运行的单元测试（TDD）。

## 目标与范围

- 交付 MV3 扩展：`manifest.json` + `service_worker` + `content_script` + `overlay`。
- 完成核心流程：UI（胶囊 + 面板）、状态机、列表增长、详情抓取、存储、导出与日志。
- 提供单元测试覆盖核心逻辑（解析/导出/状态转移/日志结构）。

## 目录结构（拟）

```
extension/
  manifest.json
  service_worker.js
  content_script.js
  overlay/
    overlay.js
    overlay.css
  assets/
    icon16.png
    icon32.png
    icon48.png
    icon128.png
src/
  core/
    state.js
    selectors.js
    parser.js
    exporter.js
    storage.js
    log.js
tests/
  state.test.js
  parser.test.js
  exporter.test.js
  selectors.test.js
package.json
```

## 实施步骤（TDD）

1) **初始化项目与测试框架**
   - 新建 `package.json`，引入 `vitest`、`jsdom`。
   - 搭建 `tests/` 与 `src/core/` 基础骨架。

2) **核心工具模块（先写测试）**
   - `parser.js`：`parseJobIdFromUrl`、`buildJobKey`、列表字段抽取（基于 JSDOM mock）。
   - `exporter.js`：CSV/Markdown 生成与 RFC4180 转义（测试用例覆盖换行/引号/逗号）。
   - `state.js`：状态转移与 event 处理（按 PRD 表驱动）。
   - `log.js`：ErrorRecord/EventRecord/selector_hint 结构化输出。

3) **选择器与判定策略模块**
   - `selectors.js`：Load more/slider/close/ready/auth 检测的“多候选策略”与判定函数。
   - 配套 JSDOM 测试用例。

4) **扩展运行时实现**
   - `service_worker.js`：run 状态管理、storage 写入、导出下载、log.json 汇总。
   - `content_script.js`：DOM 扫描、点击、等待、详情抓取、与 SW 消息协议。
   - `overlay/overlay.js`：胶囊 + 面板 + 状态展示 + 按钮交互；与 SW 通信。

5) **集成与自检**
   - 手动加载扩展进行烟测（手动步骤记录在 README）。
   - 确认下载/日志与存储数据结构一致。

## 测试策略

- 单元测试：`vitest` + `jsdom`（覆盖 parser/exporter/state/selectors）。
- 目标覆盖：核心模块 80%+。
- 不做真实 E2E（依赖 Upwork 登录环境）。

## 交付物

- 可加载的 Chrome MV3 扩展目录 `extension/`
- 可运行的测试套件
- PRD v0.4 作为实现基准
