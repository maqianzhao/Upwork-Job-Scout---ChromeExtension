export function isBestMatchesPath(pathname) {
  if (!pathname || typeof pathname !== "string") return false;
  return pathname.startsWith("/nx/find-work/best-matches");
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
