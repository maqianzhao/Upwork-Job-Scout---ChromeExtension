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

详细规范请查看：`PRD-browser-extension-v0.4.md`
