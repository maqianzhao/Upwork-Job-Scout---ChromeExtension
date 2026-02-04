import { describe, it, expect } from "vitest";
import { JSDOM } from "jsdom";
import {
  findLoadMoreButton,
  detectAuthChallenge,
  findSliderContainer,
  findDetailContentContainer,
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
});
