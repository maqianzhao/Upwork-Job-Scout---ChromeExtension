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

  const isSupported = () =>
    navRef
      ? navRef.isBestMatchesPath(location.pathname)
      : location.pathname.startsWith("/nx/find-work/best-matches");

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
  let events = [];
  let storageKeysRef = null;
  let logRef = null;
  let parserRef = null;
  let navRef = null;
  let lastDetailMissing = null;

  async function init() {
    let overlayModule;
    try {
      overlayModule = await import(chrome.runtime.getURL("overlay/overlay.js"));
    } catch (err) {
      console.error("[UJSC] overlay import failed", err);
      throw err;
    }
    const [{ createOverlay }, parser, selectors, storageKeys, logUtils, navigation] =
      await Promise.all([
      Promise.resolve(overlayModule),
      import(chrome.runtime.getURL("src/core/parser.js")),
      import(chrome.runtime.getURL("src/core/selectors.js")),
      import(chrome.runtime.getURL("src/core/storage.js")),
      import(chrome.runtime.getURL("src/core/log.js")),
      import(chrome.runtime.getURL("src/core/navigation.js")),
    ]);

    injectCss();

    storageKeysRef = storageKeys;
    logRef = logUtils;
    parserRef = parser;
    navRef = navigation;
    installNavGuard();
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

  function installNavGuard() {
    document.addEventListener(
      "click",
      (event) => {
        if (!parserRef || !navRef) return;
        if (!["RUNNING_LIST", "RUNNING_DETAIL", "STOPPING"].includes(state.status)) return;
        const target = event.target;
        if (!target || typeof target.closest !== "function") return;
        const anchor = target.closest("a");
        if (!anchor) return;
        const href = anchor.getAttribute("href") || "";
        if (!parserRef.isJobsHref(href)) return;
        const abs = safeAbsUrl(href);
        const jobId = parserRef.parseJobIdFromUrl(abs);
        if (!jobId) return;
        const detailsUrl = navRef.buildDetailsUrl("https://www.upwork.com", jobId);
        if (!detailsUrl) return;
        event.preventDefault();
        event.stopPropagation();
        history.pushState({}, "", detailsUrl);
        window.dispatchEvent(new PopStateEvent("popstate"));
      },
      true
    );
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
      [storageKeys.runEventsKey(runId)]: [],
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

  function buildEvent(payload) {
    if (typeof logRef?.createEventRecord === "function") {
      return logRef.createEventRecord(payload);
    }
    const record = {
      event_code: payload.event_code,
      step: payload.step,
      ts: payload.ts,
    };
    if (payload.job_key) record.job_key = payload.job_key;
    if (payload.url) record.url = payload.url;
    if (payload.details) record.details = payload.details;
    return record;
  }

  async function recordEvent(storageKeys, payload) {
    if (!state.run_id) return;
    const event = buildEvent({
      ...payload,
      ts: payload.ts || nowIso(),
    });
    events.push(event);
    await storageSet({ [storageKeys.runEventsKey(state.run_id)]: events });
  }

  async function startRun(maxItems, parser, selectors, storageKeys) {
    if (!isSupported()) return;
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
    events = [];
    await recordEvent(storageKeys, {
      event_code: "RUN_STARTED",
      step: "RUN_INIT",
      url: location.href,
      details: { max_items: state.max_items },
    });
    await recordEvent(storageKeys, {
      event_code: "LIST_SCAN_STARTED",
      step: "LIST_SCAN",
      url: location.href,
    });
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
        await recordEvent(storageKeys, {
          event_code: "LIST_SCAN_FINISHED",
          step: "LIST_SCAN",
          details: { list_found: state.counts.list_found, reason: "MAX_ITEMS_REACHED" },
        });
        return "LIST_DONE";
      }

      const { button } = selectors.findLoadMoreButton(document);
      if (!button) {
        if (state.counts.list_found > 0) {
          await recordEvent(storageKeys, {
            event_code: "LIST_SCAN_FINISHED",
            step: "LIST_SCAN",
            details: { list_found: state.counts.list_found, reason: "NO_LOAD_MORE" },
          });
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
      await recordEvent(storageKeys, {
        event_code: "LOAD_MORE_CLICKED",
        step: "LOAD_MORE",
        details: { before_count: state.counts.list_found },
      });
      const before = state.counts.list_found;
      const success = await waitForListGrowth(parser, before, 10000);
      if (!success) {
        await recordEvent(storageKeys, {
          event_code: "LOAD_MORE_NO_DELTA",
          step: "LOAD_MORE",
          details: { before_count: before },
        });
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
      await recordEvent(storageKeys, {
        event_code: "LOAD_MORE_SUCCESS",
        step: "LOAD_MORE",
        details: { before_count: before },
      });
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
    for (let i = 0; i < jobsOrder.length; i += 1) {
      const jobKey = jobsOrder[i];
      if (state.stopRequested) return finishRun("STOPPED", storageKeys);
      const auth = selectors.detectAuthChallenge(document, location.href);
      if (auth.detected) {
        await pauseForAuth(storageKeys, auth);
        return "PAUSED_AUTH";
      }
      const record = jobsByKey[jobKey];
      if (!record) continue;
      const readyForNext = await ensureDetailClosed(selectors, storageKeys);
      if (!readyForNext) {
        await recordError(storageKeys, {
          error_code: "DETAIL_SLIDER_CLOSE_FAILED",
          error_message_en: "Cannot close previous detail slider",
          error_message_zh: "无法关闭前一个详情面板",
          step: "DETAIL_CLOSE",
          url: location.href,
          selector_hint: JSON.stringify({ strategy: "C1/C2/C3", field: "slider_close" }),
          job_key: record.job_key,
        });
        return finishRun("STOPPED", storageKeys, "DETAIL_SLIDER_CLOSE_FAILED");
      }

      const openMethod = openDetailForRecord(record, i);
      await recordEvent(storageKeys, {
        event_code: "DETAIL_OPEN_REQUESTED",
        step: "DETAIL_OPEN",
        job_key: record.job_key,
        url: record.job_url || location.href,
        details: { strategy: openMethod.strategy, index: i },
      });
      if (!openMethod.ok) {
        await recordDetailFailure(storageKeys, record, "DETAIL_SLIDER_OPEN_FAILED");
        continue;
      }

      const slider = await waitForSlider(
        selectors,
        parser,
        record,
        30000,
        () => openDetailForRecord(record, i)
      );
      if (!slider) {
        if (!isSupported() && location.pathname.includes("/jobs/")) {
          state.last_error = "已跳转到 /jobs 页面，无法在 Best matches 内打开详情";
          await recordError(storageKeys, {
            error_code: "DETAIL_NAVIGATED_AWAY",
            error_message_en: "Navigated away to /jobs page while opening details",
            error_message_zh: "打开详情时跳转到 /jobs 页面",
            step: "DETAIL_OPEN",
            url: location.href,
            selector_hint: JSON.stringify({ strategy: "NAV_AWAY", field: "url" }),
            job_key: record.job_key,
          });
          return finishRun("STOPPED", storageKeys, "DETAIL_NAVIGATED_AWAY");
        }
        const missing = Array.isArray(lastDetailMissing) ? lastDetailMissing : [];
        const missingText = missing.length > 0 ? `; missing: ${missing.join(",")}` : "";
        await recordError(storageKeys, {
          error_code: "DETAIL_READY_TIMEOUT_30S",
          error_message_en: `Detail slider not ready via ${openMethod.strategy}${missingText}`,
          error_message_zh:
            `详情面板未就绪（打开策略：${openMethod.strategy}）` +
            (missing.length > 0 ? `，缺少：${missing.join("、")}` : ""),
          step: "DETAIL_READY",
          url: record.job_url,
          selector_hint: JSON.stringify({
            strategy: `S1/S2|open:${openMethod.strategy}`,
            field: "slider",
            title: record.title || "",
            source_index: record.source_index ?? i,
            missing,
          }),
          job_key: record.job_key,
        });
        return finishRun("STOPPED", storageKeys, "DETAIL_READY_TIMEOUT_30S");
      }

      const detail = parser.extractDetailFromSlider(slider);
      if (!detail || !detail.description_full || !(record.title || detail.title_from_detail)) {
        await recordError(storageKeys, {
          error_code: "DETAIL_PARSE_DESCRIPTION_MISSING",
          error_message_en: "Description missing",
          error_message_zh: "详情描述缺失",
          step: "DETAIL_PARSE",
          url: record.job_url,
          selector_hint: JSON.stringify({ strategy: "S1/S2", field: "description_full" }),
          job_key: record.job_key,
        });
        return finishRun("STOPPED", storageKeys, "DETAIL_PARSE_DESCRIPTION_MISSING");
      }

      const detailMeta = parser.extractDetailMetaFromSlider(slider);
      Object.assign(record, detail, {
        detail_status: "ok",
        last_updated_at: nowIso(),
      });
      if (!record.job_type && detailMeta.job_type) {
        record.job_type = detailMeta.job_type;
      }
      if (!record.budget_or_hourly_range_raw && detailMeta.budget_or_hourly_range_raw) {
        record.budget_or_hourly_range_raw = detailMeta.budget_or_hourly_range_raw;
      }
      if (!record.posted_time_raw && detailMeta.posted_time_raw) {
        record.posted_time_raw = detailMeta.posted_time_raw;
      }
      if (!record.proposal_count_raw && detailMeta.proposal_count_raw) {
        record.proposal_count_raw = detailMeta.proposal_count_raw;
      }
      if (
        (!record.skills_tags_raw || record.skills_tags_raw.length === 0) &&
        detail.required_skills_detail_raw
      ) {
        record.skills_tags_raw = detail.required_skills_detail_raw;
      }
      if (!record.job_url && location.href.includes("/details/")) {
        record.job_url = location.href;
      }
      if (!record.job_id && record.job_url) {
        record.job_id = parser.parseJobIdFromUrl(record.job_url);
      }
      state.counts.detail_ok += 1;
      await recordEvent(storageKeys, {
        event_code: "DETAIL_READY",
        step: "DETAIL_READY",
        job_key: record.job_key,
        url: location.href,
      });
      await persistJobs(storageKeys);
      await updateMeta(storageKeys);
      updateView();

      const closeBtn = selectors.findCloseButton(slider);
      if (closeBtn) safeClick(closeBtn);
      else document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      await recordEvent(storageKeys, {
        event_code: "DETAIL_CLOSED",
        step: "DETAIL_CLOSE",
        job_key: record.job_key,
      });
      await ensureDetailClosed(selectors, storageKeys);
    }
    return "DETAIL_DONE";
  }

  function findLinkByUrl(url, parser) {
    if (!url) return null;
    const anchors = Array.from(document.querySelectorAll("a"));
    const decodedUrl = safeDecode(url);
    return anchors.find((a) => {
      if (isInsideOpenedSlider(a)) return false;
      const href = a.getAttribute("href");
      if (!href) return false;
      if (!parser.isDetailsHref(href)) return false;
      const abs = safeAbsUrl(href);
      const decodedHref = safeDecode(abs);
      return (
        abs === url ||
        decodedHref === decodedUrl ||
        decodedUrl.includes(decodedHref) ||
        decodedHref.includes(decodedUrl)
      );
    });
  }

  function clickCardByTitle(title) {
    const target = normalizeText(title).toLowerCase();
    if (!target) return false;
    const candidates = Array.from(
      document.querySelectorAll(
        [
          '[data-test*="job"]',
          '[data-test*="job-tile"]',
          '[data-test*="job-card"]',
          '[class*="job-tile"]',
          "article",
          "section",
          "li[data-test*=\"job\"]",
          'div[data-ev-label*="job"]',
        ].join(", ")
      )
    );
    for (const el of candidates) {
      if (isInsideOpenedSlider(el)) continue;
      const text = normalizeText(
        el.querySelector("h1, h2, h3, h4, a")?.textContent || ""
      ).toLowerCase();
      if (!text) continue;
      if (text.includes(target) || target.includes(text)) {
        const link =
          el.querySelector('a[href*="/details/"]') ||
          el.querySelector('a[href*="/jobs/"]') ||
          el.querySelector("a");
        safeClick(link || el);
        return true;
      }
    }
    return false;
  }

  function openDetailForRecord(record, index) {
    const byUrl = record.job_url ? findLinkByUrl(record.job_url, parserRef) : null;
    if (byUrl) {
      safeClick(byUrl);
      return { ok: true, strategy: "URL_LINK" };
    }

    if (record.job_id) {
      const byId = Array.from(document.querySelectorAll("a")).find((a) => {
        if (isInsideOpenedSlider(a)) return false;
        const href = a.getAttribute("href") || "";
        if (!href) return false;
        if (!parserRef.isDetailsHref(href)) return false;
        const decoded = safeDecode(safeAbsUrl(href));
        if (!decoded.includes(record.job_id)) return false;
        return decoded.includes("/details/");
      });
      if (byId) {
        safeClick(byId);
        return { ok: true, strategy: "JOB_ID_LINK" };
      }
    }

    if (clickCardByTitle(record.title)) {
      return { ok: true, strategy: "TITLE_CARD" };
    }

    const byIndex = clickCardByIndex(record.source_index ?? index);
    if (byIndex) {
      return { ok: true, strategy: "INDEX_CARD" };
    }

    if (record.job_id && navRef?.buildDetailsUrl) {
      const detailsUrl = navRef.buildDetailsUrl(location.origin, record.job_id);
      if (detailsUrl) {
        history.pushState({}, "", detailsUrl);
        window.dispatchEvent(new PopStateEvent("popstate"));
        return { ok: true, strategy: "DETAILS_URL_PUSHSTATE" };
      }
    }

    return { ok: false, strategy: "NONE" };
  }

  function clickCardByIndex(index) {
    if (typeof index !== "number" || index < 0) return false;
    const candidates = Array.from(
      document.querySelectorAll(
        [
          '[data-test*="job"]',
          '[data-test*="job-tile"]',
          '[data-test*="job-card"]',
          '[class*="job-tile"]',
          "article",
          "section",
          "li[data-test*=\"job\"]",
          'div[data-ev-label*="job"]',
        ].join(", ")
      )
    ).filter((el) => !isInsideOpenedSlider(el));
    if (index >= candidates.length) return false;
    const el = candidates[index];
    const link =
      el.querySelector('a[href*="/details/"]') ||
      el.querySelector('a[href*="/jobs/"]') ||
      el.querySelector("a");
    safeClick(link || el);
    return true;
  }

  function isInsideOpenedSlider(el) {
    if (!el) return false;
    return Boolean(el.closest(".air3-slider-job-details, [role='dialog'], [aria-modal='true']"));
  }

  function safeClick(el) {
    if (!el) return false;
    try {
      el.scrollIntoView({ block: "center", inline: "center" });
    } catch {
      // ignore
    }
    el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    if (typeof el.click === "function") {
      el.click();
    }
    return true;
  }

  function safeDecode(value) {
    try {
      return decodeURIComponent(value || "");
    } catch {
      return value || "";
    }
  }

  function safeAbsUrl(href) {
    try {
      return new URL(href, location.href).toString();
    } catch {
      return href || "";
    }
  }

  function normalizeText(text) {
    return (text || "").replace(/\s+/g, " ").trim();
  }

  function isDetailUrlReady(record) {
    const current = safeDecode(location.href);
    if (!current.includes("/details/")) return false;
    if (record?.job_id) {
      return current.includes(record.job_id);
    }
    return true;
  }

  async function waitForSlider(selectors, parser, record, timeoutMs, retryOpen) {
    const start = Date.now();
    let lastRetry = start;
    while (Date.now() - start < timeoutMs) {
      const { container } = selectors.findSliderContainer(document);
      if (container && isDetailUrlReady(record)) {
        const detail = parser.extractDetailFromSlider(container);
        const meta = parser.extractDetailMetaFromSlider(container);
        const readiness = parser.evaluateDetailReadiness
          ? parser.evaluateDetailReadiness(detail, meta)
          : { ready: Boolean(detail?.description_full), missing: [] };
        if (readiness.ready) {
          lastDetailMissing = null;
          return container;
        }
        lastDetailMissing = readiness.missing;
      }
      if (isDetailUrlReady(record) && location.href.includes("/details/")) {
        const fallback = selectors.findDetailContentContainer(document);
        if (fallback.container) {
          const detail = parser.extractDetailFromSlider(fallback.container);
          const meta = parser.extractDetailMetaFromSlider(fallback.container);
          const readiness = parser.evaluateDetailReadiness
            ? parser.evaluateDetailReadiness(detail, meta)
            : { ready: Boolean(detail?.description_full), missing: [] };
          if (readiness.ready) {
            lastDetailMissing = null;
            return fallback.container;
          }
          lastDetailMissing = readiness.missing;
        }
      }
      if (typeof retryOpen === "function" && Date.now() - lastRetry >= 1200) {
        retryOpen();
        lastRetry = Date.now();
      }
      if (state.stopRequested) {
        return null;
      }
      await sleep(300);
    }
    return null;
  }

  async function ensureDetailClosed(selectors, storageKeys) {
    const hasDetailUrl = () => safeDecode(location.href).includes("/details/");
    const hasSlider = () => Boolean(selectors.findSliderContainer(document).container);
    if (!hasDetailUrl() && !hasSlider()) return true;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const slider = selectors.findSliderContainer(document).container;
      const closeBtn = selectors.findCloseButton(slider || document.body);
      if (closeBtn) {
        safeClick(closeBtn);
      } else {
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      }
      const closed = await waitForCloseState(selectors, 1200);
      if (closed) return true;
      if (hasDetailUrl()) {
        history.back();
        await recordEvent(storageKeys, {
          event_code: "DETAIL_CLOSE_HISTORY_BACK",
          step: "DETAIL_CLOSE",
          details: { attempt: attempt + 1 },
        });
        const backClosed = await waitForCloseState(selectors, 2000);
        if (backClosed) return true;
      }
    }

    return !hasDetailUrl() && !hasSlider();
  }

  async function waitForCloseState(selectors, timeoutMs) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const hasDetailUrl = safeDecode(location.href).includes("/details/");
      const hasSlider = Boolean(selectors.findSliderContainer(document).container);
      if (!hasDetailUrl && !hasSlider) return true;
      await sleep(150);
    }
    return false;
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
    await recordEvent(storageKeys, {
      event_code: "DETAIL_OPEN_FAILED",
      step: "DETAIL_OPEN",
      job_key: record.job_key,
      url: record.job_url || location.href,
      details: { error_code: errorCode },
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
    await recordEvent(storageKeys, {
      event_code: "RUN_PAUSED_AUTH",
      step: "AUTH_DETECT",
      url: location.href,
      details: { reason: auth.reason, strategy: auth.strategy },
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
    await recordEvent(storageKeys, {
      event_code: finalStatus === "DONE" ? "RUN_DONE" : "RUN_STOPPED",
      step: "RUN_FINISH",
      details: { stop_reason: stopReason || null },
    });
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
    await recordEvent(storageKeys, {
      event_code: "RUN_ERROR",
      step: "RUN_FINISH",
      details: { last_error: state.last_error || null },
    });
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
      const path = result?.filename || `UpworkJobScout/${state.run_id}.log.json`;
      state.last_error = `日志下载已触发：${path}`;
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
