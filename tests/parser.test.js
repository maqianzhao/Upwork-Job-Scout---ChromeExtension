import { describe, it, expect } from "vitest";
import { JSDOM } from "jsdom";
import {
  parseJobIdFromUrl,
  buildJobKey,
  extractListItemsFromDocument,
  extractDetailFromSlider,
  extractDetailMetaFromSlider,
  isDetailsHref,
  isJobsHref,
  buildDetailsPath,
} from "../extension/src/core/parser.js";

describe("parser", () => {
  it("parses job_id from details url", () => {
    const url =
      "https://www.upwork.com/nx/find-work/best-matches/details/~022018254936864221677?pageTitle=Job%20Details";
    expect(parseJobIdFromUrl(url)).toBe("~022018254936864221677");
    const encodedUrl =
      "https://www.upwork.com/nx/find-work/best-matches/details/%7E022018254936864221677?pageTitle=Job%20Details";
    expect(parseJobIdFromUrl(encodedUrl)).toBe("~022018254936864221677");
    const jobsUrl =
      "https://www.upwork.com/jobs/Backend-Developer-Build-FastAPI-Semantic-Router-Cost-Control_~022018964228810997065/?referrer_url_path=find_work_home";
    expect(parseJobIdFromUrl(jobsUrl)).toBe("~022018964228810997065");
    expect(parseJobIdFromUrl("https://www.upwork.com")).toBe(null);
  });

  it("detects jobs/details href types", () => {
    expect(isDetailsHref("/nx/find-work/best-matches/details/~02")).toBe(true);
    expect(isDetailsHref("/jobs/Backend_~02/")).toBe(false);
    expect(isJobsHref("/jobs/Backend_~02/")).toBe(true);
    expect(isJobsHref("/nx/find-work/best-matches/details/~02")).toBe(false);
  });

  it("builds details path from job id", () => {
    expect(buildDetailsPath("~02")).toBe("/nx/find-work/best-matches/details/~02");
    expect(buildDetailsPath(null)).toBe(null);
  });

  it("builds job_key preferring job_id", () => {
    expect(buildJobKey({ jobId: "~02", jobUrl: "u" })).toBe("~02");
    expect(buildJobKey({ jobId: null, jobUrl: "u" })).toBe("u");
    expect(buildJobKey({ jobId: "", jobUrl: "" })).toBe(null);
  });

  it("extracts list items with minimal fields", () => {
    const html = `
      <div>
        <article>
          <a href="/nx/find-work/best-matches/details/~01">Senior JS Dev</a>
          <div>Hourly</div>
          <div>$30-$60</div>
          <div>5 hours ago</div>
          <div>Proposals: Less than 5</div>
          <div class="tags"><span>React</span><span>Node.js</span></div>
        </article>
        <article>
          <a href="/nx/find-work/best-matches/details/~02">Fix bug</a>
          <div>Fixed-price</div>
        </article>
      </div>
    `;
    const dom = new JSDOM(html, { url: "https://www.upwork.com" });
    const items = extractListItemsFromDocument(dom.window.document);
    expect(items.length).toBe(2);
    expect(items[0].job_url).toContain("/details/~01");
    expect(items[0].job_id).toBe("~01");
    expect(items[0].job_type).toBe("Hourly");
    expect(items[0].budget_or_hourly_range_raw).toBe("$30-$60");
    expect(items[0].posted_time_raw).toBe("5 hours ago");
    expect(items[0].proposal_count_raw).toBe("Proposals: Less than 5");
    expect(items[0].skills_tags_raw).toEqual(["React", "Node.js"]);
  });

  it("extracts list items from /jobs links", () => {
    const html = `
      <section class="air3-card-section air3-card-hover">
        <h3><a href="/jobs/Backend-Developer_~022018964228810997065/?referrer_url_path=find_work_home">Backend Developer</a></h3>
        <div>Hourly</div>
        <div>$30-$60</div>
        <div>1 hour ago</div>
      </section>
    `;
    const dom = new JSDOM(html, { url: "https://www.upwork.com/nx/find-work/best-matches" });
    const items = extractListItemsFromDocument(dom.window.document);
    expect(items.length).toBe(1);
    expect(items[0].job_id).toBe("~022018964228810997065");
    expect(items[0].job_url).toContain("/jobs/Backend-Developer_~022018964228810997065/");
  });

  it("ignores saved jobs navigation links", () => {
    const html = `
      <nav>
        <a href="/nx/search/jobs/saved/">Saved jobs</a>
      </nav>
      <section class="air3-card-section air3-card-hover">
        <h3><a href="/jobs/Backend-Developer_~022018964228810997065/">Backend Developer</a></h3>
        <div>Hourly</div>
        <div>$30-$60</div>
        <div>1 hour ago</div>
      </section>
    `;
    const dom = new JSDOM(html, { url: "https://www.upwork.com/nx/find-work/best-matches" });
    const items = extractListItemsFromDocument(dom.window.document);
    expect(items.length).toBe(1);
    expect(items[0].job_id).toBe("~022018964228810997065");
    expect(items[0].job_url).toContain("/jobs/Backend-Developer_~022018964228810997065/");
  });

  it("extracts detail fields from slider", () => {
    const html = `
      <div role="dialog">
        <h2>Senior JS Dev</h2>
        <div class="description">Line1<br/>Line2</div>
        <div><h3>Deliverables</h3><p>Build API</p></div>
        <div><h3>Skills</h3><span>React</span></div>
        <div><h3>About the client</h3><p>Great client</p></div>
      </div>
    `;
    const dom = new JSDOM(html);
    const slider = dom.window.document.querySelector("[role='dialog']");
    const detail = extractDetailFromSlider(slider);
    expect(detail.title_from_detail).toBe("Senior JS Dev");
    expect(detail.description_full).toContain("Line1");
    expect(detail.deliverables_raw).toContain("Build API");
    expect(detail.required_skills_detail_raw).toContain("React");
    expect(detail.client_history_detail_raw).toContain("Great client");
  });

  it("extracts detail description from longest section fallback", () => {
    const html = `
      <div class="job-details-panel">
        <section>tiny</section>
        <section>
          This is a much longer description block for a job detail page.
          It includes multiple sentences and should be chosen by parser.
        </section>
      </div>
    `;
    const dom = new JSDOM(html);
    const slider = dom.window.document.querySelector(".job-details-panel");
    const detail = extractDetailFromSlider(slider);
    expect(detail.description_full).toContain("much longer description block");
  });

  it("extracts detail description from job-details-content", () => {
    const html = `
      <div class="air3-slider air3-slider-job-details">
        <div class="air3-slider-content">
          <div class="job-details-content">
            This is the real job description inside job-details-content.
          </div>
        </div>
      </div>
    `;
    const dom = new JSDOM(html);
    const slider = dom.window.document.querySelector(".air3-slider-job-details");
    const detail = extractDetailFromSlider(slider);
    expect(detail.description_full).toContain("real job description");
  });

  it("extracts meta fields from detail text", () => {
    const html = `
      <div class="air3-slider air3-slider-job-details" data-test="air3-slider">
        <div>Posted 34 minutes ago</div>
        <div>Hourly</div>
        <div>$10.00-$30.00</div>
        <div>Proposals: Less than 5</div>
      </div>
    `;
    const dom = new JSDOM(html);
    const slider = dom.window.document.querySelector(".air3-slider-job-details");
    const meta = extractDetailMetaFromSlider(slider);
    expect(meta.posted_time_raw).toBe("34 minutes ago");
    expect(meta.job_type).toBe("Hourly");
    expect(meta.budget_or_hourly_range_raw).toBe("$10.00-$30.00");
    expect(meta.proposal_count_raw).toContain("Proposals");
  });

  it("extracts client history from non-heading node", () => {
    const html = `
      <div class="air3-slider air3-slider-job-details">
        <section>
          <div>About the client</div>
          <div>Payment method verified</div>
        </section>
      </div>
    `;
    const dom = new JSDOM(html);
    const slider = dom.window.document.querySelector(".air3-slider-job-details");
    const detail = extractDetailFromSlider(slider);
    expect(detail.client_history_detail_raw).toContain("Payment method verified");
  });

  it("falls back to card extraction without details links", () => {
    const html = `
      <article class="job-tile">
        <h3>Build Chrome Extension</h3>
        <div>Hourly</div>
        <div>$20-$40</div>
        <div>2 hours ago</div>
        <div>Proposals: 10 to 15</div>
      </article>
    `;
    const dom = new JSDOM(html, { url: "https://www.upwork.com/nx/find-work/best-matches" });
    const items = extractListItemsFromDocument(dom.window.document);
    expect(items.length).toBe(1);
    expect(items[0].title).toBe("Build Chrome Extension");
    expect(items[0].job_key.startsWith("card_")).toBe(true);
  });

  it("dedupes nested fallback cards for the same job link", () => {
    const html = `
      <div class="feeds-card">
        <div>
          <section class="air3-card-section air3-card-hover">
            <div>
              <h3><a href="/jobs/Backend-Developer_~022018964228810997065/">Backend Developer</a></h3>
              <div>Hourly</div>
              <div>$30-$60</div>
              <div>1 hour ago</div>
            </div>
          </section>
        </div>
      </div>
    `;
    const dom = new JSDOM(html, { url: "https://www.upwork.com/nx/find-work/best-matches" });
    const items = extractListItemsFromDocument(dom.window.document);
    expect(items.length).toBe(1);
    expect(items[0].job_id).toBe("~022018964228810997065");
  });

  it("ignores detail-panel links when extracting list items", () => {
    const html = `
      <div role="dialog" class="job-details-slider">
        <a href="/nx/find-work/best-matches/details/~99">Opened detail item</a>
        <div>About the client</div>
      </div>
      <article class="job-tile">
        <a href="/nx/find-work/best-matches/details/~01">Real list item</a>
        <div>Hourly</div>
        <div>$20-$40</div>
      </article>
    `;
    const dom = new JSDOM(html, { url: "https://www.upwork.com/nx/find-work/best-matches" });
    const items = extractListItemsFromDocument(dom.window.document);
    expect(items.length).toBe(1);
    expect(items[0].job_id).toBe("~01");
  });
});
