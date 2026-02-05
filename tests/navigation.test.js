import { describe, it, expect } from "vitest";
import {
  isBestMatchesPath,
  buildDetailsUrl,
  buildBestMatchesUrl,
  normalizeOrigin,
} from "../extension/src/core/navigation.js";

describe("navigation", () => {
  it("detects best matches paths", () => {
    expect(isBestMatchesPath("/nx/find-work/best-matches")).toBe(true);
    expect(isBestMatchesPath("/nx/find-work/best-matches/details/~02")).toBe(true);
    expect(isBestMatchesPath("/jobs/Backend_~02")).toBe(false);
    expect(isBestMatchesPath("/nx/search/jobs/saved/")).toBe(false);
  });

  it("builds details url from origin and job id", () => {
    expect(buildDetailsUrl("https://www.upwork.com", "~02")).toBe(
      "https://www.upwork.com/nx/find-work/best-matches/details/~02?pageTitle=Job+Details"
    );
    expect(buildDetailsUrl("http://upwork.com", "~02")).toBe(
      "https://www.upwork.com/nx/find-work/best-matches/details/~02?pageTitle=Job+Details"
    );
    expect(buildDetailsUrl("https://www.upwork.com", null)).toBe(null);
    expect(buildDetailsUrl("", "~02")).toBe(null);
  });

  it("normalizes origin to https www", () => {
    expect(normalizeOrigin("http://upwork.com")).toBe("https://www.upwork.com");
    expect(normalizeOrigin("https://upwork.com")).toBe("https://www.upwork.com");
    expect(normalizeOrigin("https://www.upwork.com")).toBe("https://www.upwork.com");
    expect(normalizeOrigin("not-a-url")).toBe(null);
  });

  it("builds best matches url from origin", () => {
    expect(buildBestMatchesUrl("http://upwork.com")).toBe(
      "https://www.upwork.com/nx/find-work/best-matches"
    );
    expect(buildBestMatchesUrl("https://upwork.com")).toBe(
      "https://www.upwork.com/nx/find-work/best-matches"
    );
    expect(buildBestMatchesUrl("")).toBe(null);
  });
});
