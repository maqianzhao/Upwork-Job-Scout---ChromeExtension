export function isBestMatchesPath(pathname) {
  if (!pathname || typeof pathname !== "string") return false;
  return pathname.startsWith("/nx/find-work/best-matches");
}

export function buildDetailsUrl(origin, jobId) {
  if (!origin || !jobId) return null;
  try {
    const url = new URL(`/nx/find-work/best-matches/details/${jobId}`, origin);
    url.searchParams.set("pageTitle", "Job Details");
    return url.toString();
  } catch {
    return null;
  }
}
