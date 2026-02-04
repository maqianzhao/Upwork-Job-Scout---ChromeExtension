export function transition(state, event, payload = {}) {
  const next = { ...state };
  switch (event) {
    case "UI_START_CLICK":
      return {
        ...next,
        status: "RUNNING_LIST",
        run_id: payload.run_id || next.run_id,
        post_export_status: null,
        stopped_by_user: false,
        stop_reason: null,
      };
    case "UI_STOP_CLICK":
      return { ...next, status: "STOPPING", stopped_by_user: true };
    case "STOPPING_DRAINED":
      return { ...next, status: "EXPORTING", post_export_status: "STOPPED" };
    case "LIST_LOAD_MORE_TIMEOUT_10S":
    case "LIST_LOAD_MORE_CLICK_FAILED":
      return { ...next, status: "EXPORTING", post_export_status: "STOPPED" };
    case "DETAIL_READY_TIMEOUT_10S":
      return { ...next, status: "EXPORTING", post_export_status: "STOPPED" };
    case "DETAIL_ALL_DONE":
      return { ...next, status: "EXPORTING", post_export_status: "DONE" };
    case "EXPORT_ALL_DONE":
      return { ...next, status: next.post_export_status || "DONE", post_export_status: null };
    case "AUTH_CHALLENGE_DETECTED":
      return { ...next, status: "PAUSED_AUTH" };
    case "EXPORT_DOWNLOAD_FAILED":
      return { ...next, status: "ERROR" };
    default:
      return next;
  }
}
