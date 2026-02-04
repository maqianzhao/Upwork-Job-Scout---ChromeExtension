function normalizeText(text) {
  return (text || "").replace(/\s+/g, " ").trim();
}

function isVisible(el) {
  if (!el) return false;
  const style = el.ownerDocument?.defaultView?.getComputedStyle(el);
  if (!style) return true;
  return style.display !== "none" && style.visibility !== "hidden";
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
