export function createErrorRecord({
  error_code,
  error_message_en,
  error_message_zh,
  step,
  url,
  selector_hint,
  ts,
  job_key,
}) {
  return {
    error_code,
    error_message_en,
    error_message_zh,
    step,
    url,
    selector_hint,
    ts,
    ...(job_key ? { job_key } : {}),
  };
}

export function createEventRecord({ event_code, step, ts, job_key, url, details }) {
  const record = { event_code, step, ts };
  if (job_key) record.job_key = job_key;
  if (url) record.url = url;
  if (details) record.details = details;
  return record;
}

export function createLogJson({ run_meta, errors = [], events = [], summary = {} }) {
  return {
    run_meta,
    errors,
    events,
    summary,
  };
}
