const CSV_HEADERS = [
  "run_id",
  "run_started_at",
  "job_key",
  "job_id",
  "job_url",
  "title",
  "job_type",
  "budget_or_hourly_range_raw",
  "posted_time_raw",
  "description_snippet",
  "skills_tags_raw",
  "proposal_count_raw",
  "description_full",
  "deliverables_raw",
  "attachments_present",
  "required_skills_detail_raw",
  "client_history_detail_raw",
  "detail_status",
  "detail_error_code",
];

function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function normalizeSkills(skills) {
  if (!skills) return "";
  if (Array.isArray(skills)) return skills.join(" | ");
  return String(skills);
}

export function toCsv(runMeta, jobs) {
  const bom = "\ufeff";
  const lines = [];
  lines.push(CSV_HEADERS.join(","));
  for (const job of jobs) {
    const row = {
      run_id: runMeta.run_id || "",
      run_started_at: runMeta.run_started_at || "",
      job_key: job.job_key || "",
      job_id: job.job_id || "",
      job_url: job.job_url || "",
      title: job.title || "",
      job_type: job.job_type || "",
      budget_or_hourly_range_raw: job.budget_or_hourly_range_raw || "",
      posted_time_raw: job.posted_time_raw || "",
      description_snippet: job.description_snippet || "",
      skills_tags_raw: normalizeSkills(job.skills_tags_raw),
      proposal_count_raw: job.proposal_count_raw || "",
      description_full: job.description_full || "",
      deliverables_raw: job.deliverables_raw || "",
      attachments_present: job.attachments_present || "unknown",
      required_skills_detail_raw: job.required_skills_detail_raw || "",
      client_history_detail_raw: job.client_history_detail_raw || "",
      detail_status: job.detail_status || "",
      detail_error_code: job.detail_status === "failed" ? job.detail_error_code || "" : "",
    };
    const line = CSV_HEADERS.map((key) => csvEscape(row[key])).join(",");
    lines.push(line);
  }
  return bom + lines.join("\r\n");
}

export function toMarkdown(runMeta, jobs) {
  const sections = [];
  for (const job of jobs) {
    sections.push(`## ${job.title || "Untitled"}`);
    sections.push(`URL: ${job.job_url || ""}`);
    sections.push(
      `Budget/Rate: ${job.budget_or_hourly_range_raw || ""}; Posted: ${
        job.posted_time_raw || ""
      }; Proposals: ${job.proposal_count_raw || ""}`
    );
    sections.push(`Skills: ${normalizeSkills(job.skills_tags_raw)}`);
    sections.push("### Description");
    sections.push(job.description_full || "");
    sections.push("### Deliverables");
    sections.push(job.deliverables_raw || "");
    sections.push("### Client History");
    sections.push(job.client_history_detail_raw || "");
    if (job.detail_status === "failed") {
      sections.push("### Detail Error");
      sections.push(`${job.detail_error_code || ""}`);
    }
    sections.push("");
  }
  return sections.join("\n");
}
