(() => {
  console.info("[UJSC] content_script loaded");
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const storageGet = (keys) =>
    new Promise((resolve) => chrome.storage.local.get(keys, resolve));
  const storageSet = (obj) =>
    new Promise((resolve) => chrome.storage.local.set(obj, resolve));
  const storageClear = () =>
    new Promise((resolve) => chrome.storage.local.clear(resolve));
  const sendMessage = (msg) =>
    new Promise((resolve) => chrome.runtime.sendMessage(msg, resolve));

  const isSupported = location.pathname.startsWith("/nx/find-work/best-matches");

  const state = {
    status: "IDLE",
    phase: "-",
    max_items: 30,
    counts: { list_found: 0, detail_ok: 0, detail_failed: 0, paused_count: 0 },
    last_error: "",
    run_id: null,
    stopRequested: false,
  };

  let overlayApi = null;
  let jobsByKey = {};
  let jobsOrder = [];
  let errors = [];
  let storageKeysRef = null;

  async function init() {
    let overlayModule;
    try {
      overlayModule = await import(chrome.runtime.getURL("overlay/overlay.js"));
    } catch (err) {
      console.error("[UJSC] overlay import failed", err);
      throw err;
    }
    const [{ createOverlay }, parser, selectors, storageKeys] = await Promise.all([
      Promise.resolve(overlayModule),
      import(chrome.runtime.getURL("src/core/parser.js")),
      import(chrome.runtime.getURL("src/core/selectors.js")),
      import(chrome.runtime.getURL("src/core/storage.js")),
    ]);

    injectCss();

    storageKeysRef = storageKeys;
    overlayApi = createOverlay({
      onStart: (maxItems) => startRun(maxItems, parser, selectors, storageKeys),
      onStop: () => requestStop(),
      onExportCsv: () => exportType("csv"),
      onExportMd: () => exportType("md"),
      onDownloadLog: () => exportType("log"),
      onClearHistory: clearHistory,
      isSupported,
    });

    overlayApi.updateView(state);
  }

  function injectCss() {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = chrome.runtime.getURL("overlay/overlay.css");
    document.head.append(link);
  }

  function updateView() {
    overlayApi?.updateView(state);
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function generateRunId() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `run_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(
      d.getHours()
    )}${pad(d.getMinutes())}_best_matches`;
  }

  async function initRunMeta(storageKeys, maxItems) {
    const runId = generateRunId();
    const meta = {
      run_id: runId,
      run_started_at: state.run_started_at,
      run_finished_at: null,
      source_page: "best_matches",
      max_items: maxItems,
      status: "RUNNING_LIST",
      post_export_status: null,
      stopped_by_user: false,
      stop_reason: null,
      counts: { ...state.counts },
    };
    await storageSet({
      [storageKeys.runMetaKey(runId)]: meta,
      [storageKeys.runJobsKey(runId)]: {},
      [storageKeys.runErrorsKey(runId)]: [],
    });
    await updateRunsIndex(storageKeys, runId);
    return meta;
  }

  async function updateRunsIndex(storageKeys, runId) {
    const { RUNS_INDEX_KEY } = storageKeys;
    const data = await storageGet([RUNS_INDEX_KEY]);
    const current = data[RUNS_INDEX_KEY] || [];
    const next = [runId, ...current.filter((id) => id !== runId)].slice(0, 20);
    await storageSet({ [RUNS_INDEX_KEY]: next });
  }

  async function startRun(maxItems, parser, selectors, storageKeys) {
    if (!isSupported) return;
    if (state.status === "RUNNING_LIST" || state.status === "RUNNING_DETAIL") return;

    state.max_items = maxItems || 30;
    state.stopRequested = false;
    state.counts = { list_found: 0, detail_ok: 0, detail_failed: 0, paused_count: 0 };
    state.last_error = "";
    state.status = "RUNNING_LIST";
    state.phase = "List growth";
    state.run_started_at = nowIso();
    state.stopped_by_user = false;
    state.stop_reason = null;

    const meta = await initRunMeta(storageKeys, state.max_items);
    state.run_id = meta.run_id;
    jobsByKey = {};
    jobsOrder = [];
    errors = [];
    updateView();

    const listResult = await runListPhase(parser, selectors, storageKeys);
    if (listResult === "STOPPED") return;
    if (listResult === "ERROR") return;
    if (listResult === "PAUSED_AUTH") return;

    state.status = "RUNNING_DETAIL";
    state.phase = "Detail scraping";
    await updateMeta(storageKeys);
    updateView();

    const detailResult = await runDetailPhase(parser, selectors, storageKeys);
    if (detailResult === "STOPPED") return;
    if (detailResult === "ERROR") return;
    if (detailResult === "PAUSED_AUTH") return;

    await finishRun("DONE", storageKeys);
  }

  async function runListPhase(parser, selectors, storageKeys) {
    while (true) {
      if (state.stopRequested) return finishRun("STOPPED", storageKeys);

      const auth = selectors.detectAuthChallenge(document, location.href);
      if (auth.detected) {
        await pauseForAuth(storageKeys, auth);
        return "PAUSED_AUTH";
      }

      const items = parser.extractListItemsFromDocument(document);
      for (const item of items) {
        if (!jobsByKey[item.job_key]) {
          jobsByKey[item.job_key] = {
            ...item,
            detail_status: "not_started",
            detail_error_code: null,
            detail_error_message_en: null,
            detail_error_message_zh: null,
            first_seen_at: nowIso(),
            last_updated_at: nowIso(),
          };
          jobsOrder.push(item.job_key);
        }
      }
      state.counts.list_found = Object.keys(jobsByKey).length;
      await persistJobs(storageKeys);
      updateView();

      if (state.counts.list_found >= state.max_items) {
        return "LIST_DONE";
      }

      const { button } = selectors.findLoadMoreButton(document);
      if (!button) {
        if (state.counts.list_found > 0) {
          return "LIST_DONE";
        }
        const ready = await waitForInitialListOrButton(parser, selectors, 12000);
        if (ready) {
          continue;
        }
        await recordError(storageKeys, {
          error_code: "LIST_NO_ITEMS_FOUND",
          error_message_en: "No list items found and Load more button missing",
          error_message_zh: "未找到列表项且缺少 Load more 按钮",
          step: "LOAD_MORE",
          url: location.href,
          selector_hint: JSON.stringify({ strategy: "B1/B2", field: "load_more" }),
        });
        return finishError(storageKeys);
      }

      button.click();
      const before = state.counts.list_found;
      const success = await waitForListGrowth(parser, before, 10000);
      if (!success) {
        await recordError(storageKeys, {
          error_code: "LIST_LOAD_MORE_TIMEOUT_10S",
          error_message_en: "Load more jobs timed out",
          error_message_zh: "Load more 超时",
          step: "LOAD_MORE",
          url: location.href,
          selector_hint: JSON.stringify({ strategy: "B1/B2", field: "load_more" }),
        });
        return finishRun("STOPPED", storageKeys, "LIST_LOAD_MORE_TIMEOUT_10S");
      }
    }
  }

  async function waitForInitialListOrButton(parser, selectors, timeoutMs) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (state.stopRequested) return false;
      const auth = selectors.detectAuthChallenge(document, location.href);
      if (auth.detected) return false;
      const items = parser.extractListItemsFromDocument(document);
      if (items.length > 0) return true;
      const { button } = selectors.findLoadMoreButton(document);
      if (button) return true;
      await sleep(500);
    }
    return false;
  }

  async function waitForListGrowth(parser, beforeCount, timeoutMs) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const items = parser.extractListItemsFromDocument(document);
      const keys = new Set(items.map((i) => i.job_key));
      if (keys.size > beforeCount) {
        return true;
      }
      await sleep(500);
    }
    return false;
  }

  async function runDetailPhase(parser, selectors, storageKeys) {
    for (const jobKey of jobsOrder) {
      if (state.stopRequested) return finishRun("STOPPED", storageKeys);
      const auth = selectors.detectAuthChallenge(document, location.href);
      if (auth.detected) {
        await pauseForAuth(storageKeys, auth);
        return "PAUSED_AUTH";
      }
      const record = jobsByKey[jobKey];
      if (!record) continue;

      const link = findLinkByUrl(record.job_url);
      if (link) {
        link.click();
      } else {
        const clicked = clickCardByTitle(record.title);
        if (!clicked) {
          await recordDetailFailure(storageKeys, record, "DETAIL_SLIDER_OPEN_FAILED");
          continue;
        }
      }

      const slider = await waitForSlider(selectors, 10000);
      if (!slider) {
        await recordError(storageKeys, {
          error_code: "DETAIL_READY_TIMEOUT_10S",
          error_message_en: "Detail slider not ready",
          error_message_zh: "详情面板未就绪",
          step: "DETAIL_READY",
          url: record.job_url,
          selector_hint: JSON.stringify({ strategy: "S1/S2", field: "slider" }),
          job_key: record.job_key,
        });
        return finishRun("STOPPED", storageKeys, "DETAIL_READY_TIMEOUT_10S");
      }

      const detail = parser.extractDetailFromSlider(slider);
      if (!detail || !detail.description_full || !(record.title || detail.title)) {
        await recordError(storageKeys, {
          error_code: "DETAIL_PARSE_DESCRIPTION_MISSING",
          error_message_en: "Description missing",
          error_message_zh: "详情描述缺失",
          step: "DETAIL_PARSE",
          url: record.job_url,
          selector_hint: JSON.stringify({ strategy: "S1/S2", field: "description_full" }),
          job_key: record.job_key,
        });
        return finishRun("STOPPED", storageKeys, "DETAIL_READY_TIMEOUT_10S");
      }

      Object.assign(record, detail, {
        detail_status: "ok",
        last_updated_at: nowIso(),
      });
      if (!record.job_url && location.href.includes("/details/")) {
        record.job_url = location.href;
      }
      if (!record.job_id && record.job_url) {
        record.job_id = parser.parseJobIdFromUrl(record.job_url);
      }
      state.counts.detail_ok += 1;
      await persistJobs(storageKeys);
      await updateMeta(storageKeys);
      updateView();

      const closeBtn = selectors.findCloseButton(slider);
      if (closeBtn) closeBtn.click();
      else document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      await sleep(300);
    }
    return "DETAIL_DONE";
  }

  function findLinkByUrl(url) {
    if (!url) return null;
    const anchors = Array.from(document.querySelectorAll("a"));
    return anchors.find((a) => {
      const href = a.getAttribute("href");
      if (!href) return false;
      return url.includes(href) || href.includes(url);
    });
  }

  function clickCardByTitle(title) {
    const target = normalizeText(title).toLowerCase();
    if (!target) return false;
    const candidates = Array.from(
      document.querySelectorAll(
        '[data-test*="job"], [class*="job-tile"], article, li[data-test*="job"], div[data-ev-label*="job"]'
      )
    );
    for (const el of candidates) {
      const text = normalizeText(
        el.querySelector("h1, h2, h3, h4, a")?.textContent || ""
      ).toLowerCase();
      if (!text) continue;
      if (text.includes(target) || target.includes(text)) {
        el.click();
        return true;
      }
    }
    return false;
  }

  function normalizeText(text) {
    return (text || "").replace(/\s+/g, " ").trim();
  }

  async function waitForSlider(selectors, timeoutMs) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const { container } = selectors.findSliderContainer(document);
      if (container) {
        return container;
      }
      await sleep(300);
    }
    return null;
  }

  async function recordDetailFailure(storageKeys, record, errorCode) {
    record.detail_status = "failed";
    record.detail_error_code = errorCode;
    record.last_updated_at = nowIso();
    state.counts.detail_failed += 1;
    await persistJobs(storageKeys);
    await recordError(storageKeys, {
      error_code: errorCode,
      error_message_en: errorCode,
      error_message_zh: "详情抓取失败",
      step: "DETAIL_OPEN",
      url: record.job_url,
      selector_hint: JSON.stringify({ field: "detail", strategy: "link" }),
      job_key: record.job_key,
    });
  }

  async function recordError(storageKeys, error) {
    const err = {
      ...error,
      ts: nowIso(),
      selector_hint: error.selector_hint || "",
    };
    errors.push(err);
    await storageSet({ [storageKeys.runErrorsKey(state.run_id)]: errors });
    state.last_error = `${err.error_code}: ${err.error_message_zh || ""}`;
  }

  async function persistJobs(storageKeys) {
    await storageSet({ [storageKeys.runJobsKey(state.run_id)]: jobsByKey });
    await updateMeta(storageKeys);
  }

  async function updateMeta(storageKeys) {
    const meta = {
      run_id: state.run_id,
      run_started_at: state.run_started_at,
      run_finished_at: state.run_finished_at || null,
      source_page: "best_matches",
      max_items: state.max_items,
      status: state.status,
      post_export_status: state.post_export_status || null,
      stopped_by_user: state.stopped_by_user || false,
      stop_reason: state.stop_reason || null,
      counts: { ...state.counts },
    };
    await storageSet({ [storageKeys.runMetaKey(state.run_id)]: meta });
  }

  async function pauseForAuth(storageKeys, auth) {
    state.status = "PAUSED_AUTH";
    state.phase = "-";
    state.counts.paused_count += 1;
    await recordError(storageKeys, {
      error_code: auth.reason,
      error_message_en: "Auth challenge detected",
      error_message_zh: "检测到登录/验证挑战",
      step: "AUTH_DETECT",
      url: location.href,
      selector_hint: JSON.stringify({ strategy: auth.strategy, field: "auth" }),
    });
    await updateMeta(storageKeys);
    updateView();
  }

  async function finishRun(finalStatus, storageKeys, stopReason = null) {
    state.status = "EXPORTING";
    state.post_export_status = finalStatus;
    state.stop_reason = stopReason;
    state.run_finished_at = nowIso();
    await updateMeta(storageKeys);
    updateView();
    await sendMessage({ type: "EXPORT_ALL", run_id: state.run_id });
    state.status = finalStatus;
    updateView();
    return finalStatus;
  }

  async function finishError(storageKeys) {
    state.status = "ERROR";
    state.phase = "-";
    await updateMeta(storageKeys);
    updateView();
    return "ERROR";
  }

  function requestStop() {
    if (state.status === "RUNNING_LIST" || state.status === "RUNNING_DETAIL") {
      state.stopRequested = true;
      state.status = "STOPPING";
      state.stopped_by_user = true;
      if (storageKeysRef) {
        updateMeta(storageKeysRef).catch(() => {});
      }
      updateView();
    }
  }

  async function exportType(kind) {
    if (!state.run_id) return;
    const typeMap = { csv: "EXPORT_CSV", md: "EXPORT_MD", log: "EXPORT_LOG" };
    const result = await sendMessage({ type: typeMap[kind], run_id: state.run_id });
    if (result && result.ok === false) {
      state.last_error = result.error || "导出失败";
      updateView();
    } else if (kind === "log") {
      state.last_error = `日志已触发下载：下载目录/UpworkJobScout/${state.run_id}.log.json`;
      updateView();
    }
  }

  async function clearHistory() {
    await storageClear();
    state.run_id = null;
    state.status = "IDLE";
    state.counts = { list_found: 0, detail_ok: 0, detail_failed: 0, paused_count: 0 };
    updateView();
  }

  init().catch((err) => {
    console.error("[UJSC] init failed", err);
  });
})();
