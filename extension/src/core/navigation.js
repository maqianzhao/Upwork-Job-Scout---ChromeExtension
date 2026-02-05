export function isBestMatchesPath(pathname) {
  if (!pathname || typeof pathname !== "string") return false;
  return pathname.startsWith("/nx/find-work/best-matches");
}

export function isDetailsPath(pathname) {
  if (!pathname || typeof pathname !== "string") return false;
  return pathname.includes("/details/");
}

export function isJobsPath(pathname) {
  if (!pathname || typeof pathname !== "string") return false;
  return pathname.startsWith("/jobs/");
}

export function getDetailMode(pathname) {
  if (isDetailsPath(pathname)) return "details";
  if (isJobsPath(pathname)) return "jobs";
  return null;
}

export function getDetailOpenStrategyOrder() {
  return [
    "DETAILS_URL_PUSHSTATE",
    "URL_LINK",
    "JOB_ID_LINK",
    "TITLE_CARD",
    "INDEX_CARD",
  ];
}

export function hasModalInfoParam(url) {
  if (!url || typeof url !== "string") return false;
  return url.includes("_modalInfo=");
}

export function normalizeOrigin(origin) {
  if (!origin || typeof origin !== "string") return null;
  try {
    const url = new URL(origin);
    let host = url.host.toLowerCase();
    if (host === "upwork.com") host = "www.upwork.com";
    return `https://${host}`;
  } catch {
    return null;
  }
}

export function buildDetailsUrl(origin, jobId) {
  if (!origin || !jobId) return null;
  try {
    const normalized = normalizeOrigin(origin);
    if (!normalized) return null;
    const url = new URL(`/nx/find-work/best-matches/details/${jobId}`, normalized);
    url.searchParams.set("pageTitle", "Job Details");
    return url.toString();
  } catch {
    return null;
  }
}

export function buildBestMatchesUrl(origin) {
  const normalized = normalizeOrigin(origin);
  if (!normalized) return null;
  return `${normalized}/nx/find-work/best-matches`;
}
