import { describe, it, expect } from "vitest";
import { JSDOM } from "jsdom";
import {
  parseJobIdFromUrl,
  buildJobKey,
  extractListItemsFromDocument,
  extractDetailFromSlider,
} from "../extension/src/core/parser.js";

describe("parser", () => {
  it("parses job_id from details url", () => {
    const url =
      "https://www.upwork.com/nx/find-work/best-matches/details/~022018254936864221677?pageTitle=Job%20Details";
    expect(parseJobIdFromUrl(url)).toBe("~022018254936864221677");
    const encodedUrl =
      "https://www.upwork.com/nx/find-work/best-matches/details/%7E022018254936864221677?pageTitle=Job%20Details";
    expect(parseJobIdFromUrl(encodedUrl)).toBe("~022018254936864221677");
    expect(parseJobIdFromUrl("https://www.upwork.com")).toBe(null);
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
