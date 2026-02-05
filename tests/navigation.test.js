import { describe, it, expect } from "vitest";
import { isBestMatchesPath, buildDetailsUrl } from "../extension/src/core/navigation.js";

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
    expect(buildDetailsUrl("https://www.upwork.com", null)).toBe(null);
    expect(buildDetailsUrl("", "~02")).toBe(null);
  });
});
