export function createOverlay({
  onStart,
  onStop,
  onExportCsv,
  onExportMd,
  onDownloadLog,
  onClearHistory,
  isSupported,
}) {
  const capsule = document.createElement("button");
  capsule.className = "ujsc-capsule";
  capsule.type = "button";

  const statusDot = document.createElement("span");
  statusDot.className = "ujsc-status-dot";
  const statusLabel = document.createElement("span");
  statusLabel.textContent = "Idle";

  capsule.append(statusDot, statusLabel);

  const panel = document.createElement("div");
  panel.className = "ujsc-panel";
  panel.innerHTML = `
    <h3>Upwork Job Scout</h3>
    <div class="ujsc-row" data-role="support"></div>
    <div class="ujsc-row">
      <label>max_items</label>
      <input class="ujsc-input" type="number" min="1" max="200" value="30" data-role="max-items"/>
    </div>
    <div class="ujsc-row" data-role="status"></div>
    <div class="ujsc-row" data-role="counts"></div>
    <div class="ujsc-actions">
      <button data-role="start">Start</button>
      <button data-role="stop">Stop</button>
      <button data-role="export-csv">Export CSV</button>
      <button data-role="export-md">Export MD</button>
      <button data-role="download-log">Download Log</button>
      <button data-role="clear-history">Clear History</button>
    </div>
    <div class="ujsc-row" data-role="error"></div>
  `;

  const supportEl = panel.querySelector('[data-role="support"]');
  const statusEl = panel.querySelector('[data-role="status"]');
  const countsEl = panel.querySelector('[data-role="counts"]');
  const errorEl = panel.querySelector('[data-role="error"]');
  const maxItemsInput = panel.querySelector('[data-role="max-items"]');

  const startBtn = panel.querySelector('[data-role="start"]');
  const stopBtn = panel.querySelector('[data-role="stop"]');
  const exportCsvBtn = panel.querySelector('[data-role="export-csv"]');
  const exportMdBtn = panel.querySelector('[data-role="export-md"]');
  const downloadLogBtn = panel.querySelector('[data-role="download-log"]');
  const clearHistoryBtn = panel.querySelector('[data-role="clear-history"]');

  function togglePanel() {
    panel.style.display = panel.style.display === "block" ? "none" : "block";
  }

  capsule.addEventListener("click", togglePanel);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") panel.style.display = "none";
  });

  startBtn.addEventListener("click", () => {
    const maxItems = Number(maxItemsInput.value || 30);
    onStart?.(maxItems);
  });
  stopBtn.addEventListener("click", () => onStop?.());
  exportCsvBtn.addEventListener("click", () => onExportCsv?.());
  exportMdBtn.addEventListener("click", () => onExportMd?.());
  downloadLogBtn.addEventListener("click", () => onDownloadLog?.());
  clearHistoryBtn.addEventListener("click", () => onClearHistory?.());

  function setStatusDot(status) {
    const map = {
      IDLE: "#6b7280",
      RUNNING_LIST: "#22c55e",
      RUNNING_DETAIL: "#22c55e",
      PAUSED_AUTH: "#f59e0b",
      STOPPING: "#f97316",
      STOPPED: "#9ca3af",
      EXPORTING: "#38bdf8",
      DONE: "#10b981",
      ERROR: "#ef4444",
    };
    statusDot.style.background = map[status] || "#6b7280";
    statusLabel.textContent = status || "Idle";
  }

  function updateView(state) {
    supportEl.textContent = isSupported ? "Supported" : "Not supported";
    setStatusDot(state.status);
    statusEl.textContent = `Status: ${state.status || "IDLE"} | Phase: ${
      state.phase || "-"
    }`;
    countsEl.textContent = `Counts: ${state.counts?.list_found || 0}/${
      state.max_items || 0
    } | ok ${state.counts?.detail_ok || 0} / failed ${
      state.counts?.detail_failed || 0
    }`;
    errorEl.textContent = state.last_error || "";

    startBtn.disabled = !isSupported || ["RUNNING_LIST", "RUNNING_DETAIL", "STOPPING"].includes(state.status);
    clearHistoryBtn.disabled = ["RUNNING_LIST", "RUNNING_DETAIL", "STOPPING"].includes(state.status);
    startBtn.textContent = state.status === "PAUSED_AUTH" ? "Start (New Run)" : "Start";
  }

  document.body.append(capsule, panel);

  return {
    updateView,
    getMaxItems: () => Number(maxItemsInput.value || 30),
  };
}
