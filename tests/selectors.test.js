import { describe, it, expect } from "vitest";
import { JSDOM } from "jsdom";
import {
  findLoadMoreButton,
  detectAuthChallenge,
  findSliderContainer,
} from "../extension/src/core/selectors.js";

describe("selectors", () => {
  it("finds Load more jobs button by text", () => {
    const dom = new JSDOM(
      `<button>Load more jobs</button><button>Other</button>`
    );
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
});
