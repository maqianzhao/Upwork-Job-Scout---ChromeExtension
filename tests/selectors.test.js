import { describe, it, expect } from "vitest";
import { JSDOM } from "jsdom";
import {
  findLoadMoreButton,
  detectAuthChallenge,
  findSliderContainer,
  findDetailContentContainer,
  findCloseButton,
} from "../extension/src/core/selectors.js";

describe("selectors", () => {
  it("finds Load more jobs button by text", () => {
    const dom = new JSDOM(
      `<button>Load more jobs</button><button>Other</button>`
    );
    const { button } = findLoadMoreButton(dom.window.document);
    expect(button).not.toBe(null);
  });

  it("finds load more role button fallback", () => {
    const dom = new JSDOM(`<div role="button">Show more jobs</div>`);
    const { button } = findLoadMoreButton(dom.window.document);
    expect(button).not.toBe(null);
  });

  it("detects auth challenge by url", () => {
    const dom = new JSDOM(`<div>Sign in</div>`);
    const res = detectAuthChallenge(dom.window.document, "https://x/login");
    expect(res.detected).toBe(true);
    expect(res.reason).toBe("AUTH_SIGNIN_DETECTED");
  });

  it("finds slider container by role", () => {
    const dom = new JSDOM(`<div role="dialog">Job Details</div>`);
    const { container } = findSliderContainer(dom.window.document);
    expect(container).not.toBe(null);
  });

  it("finds slider container by class fallback", () => {
    const dom = new JSDOM(`<div class="job-details-slider">Job Details body</div>`);
    const { container } = findSliderContainer(dom.window.document);
    expect(container).not.toBe(null);
  });

  it("finds air3 job details slider even without keyword text", () => {
    const dom = new JSDOM(`<div class="air3-slider air3-slider-job-details" data-test="air3-slider">Body</div>`);
    const { container } = findSliderContainer(dom.window.document);
    expect(container).not.toBe(null);
  });

  it("does not treat generic panel as slider container", () => {
    const dom = new JSDOM(`<div class="left-panel">Navigation panel</div>`);
    const { container } = findSliderContainer(dom.window.document);
    expect(container).toBe(null);
  });

  it("finds detail content container from main content", () => {
    const dom = new JSDOM(`
      <main>
        <section class="content">tiny</section>
        <section class="job-details">This is a long detail content block for testing parser fallback.</section>
      </main>
    `);
    const { container } = findDetailContentContainer(dom.window.document);
    expect(container).not.toBe(null);
    expect(container.textContent).toContain("long detail content block");
  });

  it("finds detail content container from slider content", () => {
    const dom = new JSDOM(`
      <div class="air3-slider-content">
        <div class="job-details-content">
          Details text goes here with enough length to pass visibility scoring threshold.
        </div>
      </div>
    `);
    const { container } = findDetailContentContainer(dom.window.document);
    expect(container).not.toBe(null);
    expect(container.textContent).toContain("Details text");
  });

  it("finds close button by Back text fallback", () => {
    const dom = new JSDOM(`<div role="dialog"><button>Go Back</button></div>`);
    const slider = dom.window.document.querySelector("[role='dialog']");
    const btn = findCloseButton(slider);
    expect(btn).not.toBe(null);
    expect(btn.textContent).toContain("Go Back");
  });
});
