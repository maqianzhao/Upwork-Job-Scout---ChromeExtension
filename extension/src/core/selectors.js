function normalizeText(text) {
  return (text || "").replace(/\s+/g, " ").trim();
}

function isVisible(el) {
  if (!el) return false;
  const style = el.ownerDocument?.defaultView?.getComputedStyle(el);
  if (!style) return true;
  return style.display !== "none" && style.visibility !== "hidden";
}

function scoreContainer(el) {
  if (!el) return 0;
  const textLen = normalizeText(el.textContent || "").length;
  return textLen;
}

function hasDetailSemantics(el) {
  if (!el) return false;
  const text = normalizeText(el.textContent || "").toLowerCase();
  const explicitAir3 =
    (el.classList && el.classList.contains("air3-slider-job-details")) ||
    el.getAttribute("data-test") === "air3-slider";
  if (explicitAir3) return true;
  const hasKeyword =
    text.includes("job details") ||
    text.includes("about the client") ||
    text.includes("deliverables") ||
    text.includes("proposals") ||
    text.includes("hourly") ||
    text.includes("fixed-price") ||
    text.includes("attachments") ||
    text.includes("skills");
  const hasDescriptionNode = Boolean(
    el.querySelector('[data-test*="description"], [class*="description"]')
  );
  return hasKeyword || hasDescriptionNode;
}

export function findLoadMoreButton(doc) {
  const candidates = Array.from(
    doc.querySelectorAll("button, [role='button']")
  ).filter(isVisible);
  const exact = candidates.find((b) => {
    const t = normalizeText(b.textContent).toLowerCase();
    return t === "load more jobs" || t === "load more";
  });
  if (exact) return { button: exact, strategy: "B1" };
  const contains = candidates.find((b) => {
    const t = normalizeText(b.textContent).toLowerCase();
    return (
      t.includes("load more jobs") ||
      t.includes("load more") ||
      t.includes("show more") ||
      t.includes("more jobs")
    );
  });
  if (contains) return { button: contains, strategy: "B2" };
  return { button: null, strategy: null };
}

export function findSliderContainer(doc) {
  const roleCandidates = Array.from(
    doc.querySelectorAll('[role="dialog"], [aria-modal="true"]')
  )
    .filter(isVisible)
    .filter((el) => hasDetailSemantics(el));
  if (roleCandidates.length > 0) {
    const best = roleCandidates.sort((a, b) => scoreContainer(b) - scoreContainer(a))[0];
    return { container: best, strategy: "S1" };
  }

  const classCandidates = Array.from(
    doc.querySelectorAll(
      '[class*="slider"], [class*="drawer"], [class*="job-details"], [data-test*="job-details"], [data-test*="jobDetails"], [id*="job-details"]'
    )
  )
    .filter(isVisible)
    .filter((el) => hasDetailSemantics(el));
  if (classCandidates.length > 0) {
    const best = classCandidates.sort((a, b) => scoreContainer(b) - scoreContainer(a))[0];
    return { container: best, strategy: "S2" };
  }

  return { container: null, strategy: null };
}

export function findDetailContentContainer(doc) {
  const candidates = Array.from(
    doc.querySelectorAll(
      [
        "[class*='air3-slider-content']",
        "[class*='air3-slider-body']",
        "[class*='job-details-content']",
        "main [data-test*='job-details']",
        "main [class*='job-details']",
        "main section",
        "main article",
        "[class*='description']",
      ].join(", ")
    )
  ).filter(isVisible);
  if (candidates.length === 0) return { container: null, strategy: null };
  const best = candidates.sort((a, b) => scoreContainer(b) - scoreContainer(a))[0];
  if (scoreContainer(best) < 40) return { container: null, strategy: null };
  return { container: best, strategy: "D1" };
}

export function findCloseButton(container) {
  if (!container) return null;
  const closeByAria =
    container.querySelector('button[aria-label*="Close" i]') ||
    container.querySelector('button[data-test*="close" i]');
  if (closeByAria) return closeByAria;
  const buttons = Array.from(container.querySelectorAll("button, a[role='button']"));
  const back = buttons.find((btn) => {
    const text = normalizeText(btn.textContent || "").toLowerCase();
    return text === "back" || text === "go back";
  });
  return back || null;
}

export function detectAuthChallenge(doc, url) {
  const lowerUrl = (url || "").toLowerCase();
  if (lowerUrl.includes("/login")) {
    return { detected: true, reason: "AUTH_SIGNIN_DETECTED", strategy: "URL_LOGIN" };
  }
  if (doc.querySelector('input[type="password"]')) {
    return { detected: true, reason: "AUTH_SIGNIN_DETECTED", strategy: "FORM_PASSWORD" };
  }
  const text = normalizeText(doc.body?.textContent || "");
  if (text.includes("verify you are human")) {
    return { detected: true, reason: "AUTH_VERIFY_HUMAN_DETECTED", strategy: "TEXT_VERIFY" };
  }
  if (text.includes("sign in")) {
    return { detected: true, reason: "AUTH_SIGNIN_DETECTED", strategy: "TEXT_SIGNIN" };
  }
  return { detected: false, reason: null, strategy: null };
}
