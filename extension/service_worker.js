import { toCsv, toMarkdown } from "./src/core/exporter.js";
import { createLogJson } from "./src/core/log.js";
import { runMetaKey, runJobsKey, runErrorsKey } from "./src/core/storage.js";

const storageGet = (keys) =>
  new Promise((resolve) => chrome.storage.local.get(keys, resolve));
const storageSet = (obj) =>
  new Promise((resolve) => chrome.storage.local.set(obj, resolve));
const DOWNLOAD_DIR = "UpworkJobScout";

async function downloadText(filename, content, mime, saveAs = false) {
  const url = buildDataUrl(content, mime);
  const downloadId = await new Promise((resolve, reject) => {
    chrome.downloads.download({ url, filename, saveAs }, (id) => {
      if (chrome.runtime.lastError || !id) {
        reject(new Error(chrome.runtime.lastError?.message || "download failed"));
        return;
      }
      resolve(id);
    });
  });
  return downloadId;
}

function buildDataUrl(content, mime) {
  const bytes = new TextEncoder().encode(content);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  const b64 = btoa(binary);
  return `data:${mime};base64,${b64}`;
}

async function exportAll(runId) {
  const metaKey = runMetaKey(runId);
  const jobsKey = runJobsKey(runId);
  const errorsKey = runErrorsKey(runId);
  const data = await storageGet([metaKey, jobsKey, errorsKey]);
  const meta = data[metaKey] || {};
  const jobs = Object.values(data[jobsKey] || {});
  const errors = data[errorsKey] || [];

  const csv = toCsv(meta, jobs);
  const md = toMarkdown(meta, jobs);
  let csvId = null;
  let mdId = null;
  let logId = null;

  try {
    csvId = await downloadText(
      `${DOWNLOAD_DIR}/${meta.run_id || runId}.csv`,
      csv,
      "text/csv;charset=utf-8"
    );
    mdId = await downloadText(
      `${DOWNLOAD_DIR}/${meta.run_id || runId}.md`,
      md,
      "text/markdown;charset=utf-8"
    );
  } catch (err) {
    await markExportError(meta, err);
    return;
  }

  const logJson = createLogJson({
    run_meta: meta,
    errors,
    events: [],
    summary: { download_ids: { csv: csvId, md: mdId, log: null } },
  });

  try {
    logId = await downloadText(
      `${DOWNLOAD_DIR}/${meta.run_id || runId}.log.json`,
      JSON.stringify(logJson, null, 2),
      "application/json;charset=utf-8"
    );
  } catch (err) {
    await markExportError(meta, err);
    return;
  }

  await finalizeExport(metaKey, meta, { csv: csvId, md: mdId, log: logId });
}

async function exportOne(runId, type) {
  const metaKey = runMetaKey(runId);
  const jobsKey = runJobsKey(runId);
  const errorsKey = runErrorsKey(runId);
  const data = await storageGet([metaKey, jobsKey, errorsKey]);
  const meta = data[metaKey] || {};
  const jobs = Object.values(data[jobsKey] || {});
  const errors = data[errorsKey] || [];

  if (type === "csv") {
    const csv = toCsv(meta, jobs);
    await downloadText(
      `${DOWNLOAD_DIR}/${meta.run_id || runId}.csv`,
      csv,
      "text/csv;charset=utf-8"
    );
  } else if (type === "md") {
    const md = toMarkdown(meta, jobs);
    await downloadText(
      `${DOWNLOAD_DIR}/${meta.run_id || runId}.md`,
      md,
      "text/markdown;charset=utf-8"
    );
  } else if (type === "log") {
    const logJson = createLogJson({
      run_meta: meta,
      errors,
      events: [],
      summary: { download_ids: { csv: null, md: null, log: null } },
    });
    const filename = `${DOWNLOAD_DIR}/${meta.run_id || runId}.log.json`;
    await downloadText(
      filename,
      JSON.stringify(logJson, null, 2),
      "application/json;charset=utf-8",
      true
    );
    return { filename };
  }
  return {};
}

async function finalizeExport(metaKey, meta, downloadIds) {
  const next = {
    ...meta,
    status: meta.post_export_status || meta.status || "DONE",
    post_export_status: null,
    download_ids: downloadIds,
  };
  await storageSet({ [metaKey]: next });
}

async function markExportError(meta, err) {
  const metaKey = runMetaKey(meta.run_id);
  await storageSet({
    [metaKey]: { ...meta, status: "ERROR", export_error: String(err?.message || err) },
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (msg?.type === "EXPORT_ALL") {
        await exportAll(msg.run_id);
      } else if (msg?.type === "EXPORT_CSV") {
        await exportOne(msg.run_id, "csv");
      } else if (msg?.type === "EXPORT_MD") {
        await exportOne(msg.run_id, "md");
      } else if (msg?.type === "EXPORT_LOG") {
        const data = await exportOne(msg.run_id, "log");
        sendResponse({ ok: true, download_dir: DOWNLOAD_DIR, ...data });
        return;
      }
      sendResponse({ ok: true, download_dir: DOWNLOAD_DIR });
    } catch (err) {
      sendResponse({ ok: false, error: String(err?.message || err) });
    }
  })();
  return true;
});
