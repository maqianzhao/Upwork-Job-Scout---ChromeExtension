function normalizeText(text) {
  return (text || "").replace(/\s+/g, " ").trim();
}

export function findLoadMoreButton(doc) {
  const buttons = Array.from(doc.querySelectorAll("button"));
  const exact = buttons.find(
    (b) => normalizeText(b.textContent).toLowerCase() === "load more jobs"
  );
  if (exact) return { button: exact, strategy: "B1" };
  const contains = buttons.find((b) =>
    normalizeText(b.textContent).toLowerCase().includes("load more jobs")
  );
  if (contains) return { button: contains, strategy: "B2" };
  return { button: null, strategy: null };
}

export function findSliderContainer(doc) {
  const dialog = doc.querySelector('[role="dialog"]');
  if (dialog) return { container: dialog, strategy: "S1" };
  const modal = doc.querySelector('[aria-modal="true"]');
  if (modal) return { container: modal, strategy: "S1" };
  return { container: null, strategy: null };
}

export function findCloseButton(container) {
  if (!container) return null;
  return container.querySelector('button[aria-label*="Close"]');
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
