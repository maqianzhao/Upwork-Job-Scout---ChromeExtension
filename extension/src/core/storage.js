export const RUNS_INDEX_KEY = "runs_index";

export function runMetaKey(runId) {
  return `runs:${runId}:meta`;
}

export function runJobsKey(runId) {
  return `runs:${runId}:jobs_by_key`;
}

export function runErrorsKey(runId) {
  return `runs:${runId}:errors`;
}

export function runEventsKey(runId) {
  return `runs:${runId}:events`;
}
