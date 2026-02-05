# Upwork Job Scout - Chrome Extension

基于 PRD v0.4 的 Upwork Best Matches 采集扩展（MV3）。  
功能：在 Best matches 页面自动点击 `Load more jobs`，逐条打开右侧 slider 抓取详情，结果持久化到 `chrome.storage.local`，并自动导出 CSV/Markdown/log.json。

## 目录结构

```
extension/         # Chrome 扩展源码（MV3）
  manifest.json
  service_worker.js
  content_script.js
  overlay/
  src/core/
tests/             # vitest + jsdom 单元测试
docs/              # PRD 与文档
```

## 本地开发

1. 安装依赖
```
npm install
```

2. 运行测试
```
npm test
```

## 加载扩展

1. Chrome 打开 `chrome://extensions`
2. 开启“开发者模式”
3. 点击“加载已解压的扩展程序”
4. 选择本项目下的 `extension/` 目录

如更新了代码但未生效，请在 `chrome://extensions` 中点击“重新加载”扩展。

## 说明

- 仅支持 `https://www.upwork.com/nx/find-work/best-matches*`
- 不做验证码/风控绕过；检测到登录/挑战会自动暂停
- 自动导出：DONE/STOPPED 时导出 CSV/MD/log.json（下载 ID 作为成功标准）
- 已增强首屏容错：页面初始无列表项时会短暂等待异步加载，避免误报 `LIST_NO_ITEMS_FOUND`
- 下载目录默认在浏览器下载目录下的 `UpworkJobScout/` 子目录（例如 `Downloads/UpworkJobScout/`）
- 点击 `Download Log` 时会弹出浏览器“另存为”对话框，可手动选择日志保存路径
- 已修复 Service Worker 下载兼容问题（不再依赖 `URL.createObjectURL`）
- `log.json` 现包含事件流（`events`），用于定位每轮 run 的步骤轨迹（开始/Load More/详情打开/结束）
- 列表提取会跳过已打开详情面板内的链接，避免误把详情链接当作列表项
- 详情就绪判定增加 URL + 描述长度校验，并在等待期内自动重试点击，减少“1 秒完成但无有效数据”的误判
- 新增对 Upwork `/jobs/..._~jobId` 链接解析，列表项 `job_id` 提取更稳定
- 详情关闭链路增强：Close/Back/Escape/history.back 多级兜底，避免卡在首条详情导致后续无法点击
- 列表链接过滤：忽略 `/nx/search/jobs/saved/` 等非职位链接，避免误跳转到收藏页

详细规范请查看：`PRD-browser-extension-v0.4.md`
