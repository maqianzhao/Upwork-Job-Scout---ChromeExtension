import { describe, it, expect } from "vitest";
import { toCsv, toMarkdown } from "../extension/src/core/exporter.js";

describe("exporter", () => {
  it("renders CSV with BOM, CRLF, and escapes", () => {
    const runMeta = { run_id: "run_1", run_started_at: "2026-02-04T00:00:00Z" };
    const jobs = [
      {
        job_key: "~01",
        job_id: "~01",
        job_url: "https://u/1",
        title: 'Hello "World"',
        job_type: "Hourly",
        budget_or_hourly_range_raw: "$30-$60",
        posted_time_raw: "1 hour ago",
        description_snippet: "Hi, there",
        skills_tags_raw: ["React", "Node.js"],
        proposal_count_raw: "Proposals: Less than 5",
        description_full: "Line1\nLine2",
        deliverables_raw: "Build API",
        attachments_present: "unknown",
        required_skills_detail_raw: "React",
        client_history_detail_raw: "Great client",
        detail_status: "ok",
        detail_error_code: null,
      },
    ];
    const csv = toCsv(runMeta, jobs);
    expect(csv.startsWith("\ufeff")).toBe(true);
    expect(csv.includes("\r\n")).toBe(true);
    expect(csv).toContain('"Hello ""World"""');
    expect(csv).toContain('"Line1\nLine2"');
  });

  it("renders Markdown sections", () => {
    const runMeta = { run_id: "run_1" };
    const jobs = [
      {
        title: "Title",
        job_url: "https://u/1",
        budget_or_hourly_range_raw: "$100",
        posted_time_raw: "yesterday",
        proposal_count_raw: "Proposals: 5",
        skills_tags_raw: ["A", "B"],
        description_full: "Desc",
        deliverables_raw: "Del",
        client_history_detail_raw: "Client",
        detail_status: "failed",
        detail_error_code: "DETAIL_READY_TIMEOUT_10S",
      },
    ];
    const md = toMarkdown(runMeta, jobs);
    expect(md).toContain("## Title");
    expect(md).toContain("URL: https://u/1");
    expect(md).toContain("### Detail Error");
    expect(md).toContain("DETAIL_READY_TIMEOUT_10S");
  });
});
