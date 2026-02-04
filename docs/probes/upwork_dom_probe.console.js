/* eslint-disable no-alert */
// Upwork Best Matches DOM Probe
// Usage: open https://www.upwork.com/nx/find-work/best-matches in logged-in Chrome,
// paste this whole file into DevTools Console, press Enter.

(async () => {
  const PROBE_VERSION = "v1.0.0";
  const MAX_CLICK_TEST = 3;
  const WAIT_DETAIL_MS = 10000;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
  const lower = (s) => norm(s).toLowerCase();

  const isVisible = (el) => {
    if (!el) return false;
    const st = getComputedStyle(el);
    if (st.display === "none" || st.visibility === "hidden" || Number(st.opacity) === 0) {
      return false;
    }
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  const clip = (s, n = 180) => {
    const t = norm(s);
    return t.length > n ? t.slice(0, n) + "..." : t;
  };

  const cssPath = (el) => {
    if (!el || !(el instanceof Element)) return null;
    const parts = [];
    let cur = el;
    let depth = 0;
    while (cur && cur.nodeType === 1 && depth < 6) {
      let part = cur.tagName.toLowerCase();
      if (cur.id) {
        part += `#${cur.id}`;
        parts.unshift(part);
        break;
      }
      if (cur.classList && cur.classList.length) {
        const cls = [...cur.classList].slice(0, 2).join(".");
        if (cls) part += `.${cls}`;
      }
      const parent = cur.parentElement;
      if (parent) {
        const sib = [...parent.children].filter((c) => c.tagName === cur.tagName);
        if (sib.length > 1) part += `:nth-of-type(${sib.indexOf(cur) + 1})`;
      }
      parts.unshift(part);
      cur = parent;
      depth += 1;
    }
    return parts.join(" > ");
  };

  const elInfo = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      tag: el.tagName ? el.tagName.toLowerCase() : null,
      id: el.id || null,
      class: el.className || null,
      role: el.getAttribute ? el.getAttribute("role") : null,
      data_test: el.getAttribute ? el.getAttribute("data-test") : null,
      aria_label: el.getAttribute ? el.getAttribute("aria-label") : null,
      href: el.getAttribute ? el.getAttribute("href") : null,
      text_sample: clip(el.textContent, 160),
      visible: isVisible(el),
      rect: {
        x: Math.round(r.x),
        y: Math.round(r.y),
        w: Math.round(r.width),
        h: Math.round(r.height),
      },
      path: cssPath(el),
    };
  };

  const detectAuth = () => {
    const body = lower(document.body ? document.body.textContent : "");
    const url = location.href.toLowerCase();
    const hasPwd = !!document.querySelector('input[type="password"]');
    const signin = body.includes("sign in") || body.includes("log in");
    const verifyHuman = body.includes("verify you are human");
    const byUrl = /\/login|account-security|challenge|captcha/.test(url);
    return {
      detected: !!(hasPwd || verifyHuman || byUrl || signin),
      has_password_input: hasPwd,
      text_signin: signin,
      text_verify_human: verifyHuman,
      url_challenge_like: byUrl,
    };
  };

  const scoreJobCard = (el) => {
    const t = lower(el.textContent || "");
    let score = 0;
    if (/\$[\d,.]/.test(t)) score += 2;
    if (t.includes("hourly") || t.includes("fixed-price")) score += 2;
    if (t.includes("proposals")) score += 1;
    if (t.includes("ago") || t.includes("yesterday")) score += 1;
    if (el.querySelector('a[href*="/details/"]')) score += 3;
    return score;
  };

  const dedupeElements = (arr) => {
    const set = new Set();
    const out = [];
    for (const el of arr) {
      if (!el || set.has(el)) continue;
      set.add(el);
      out.push(el);
    }
    return out;
  };

  const findJobCards = () => {
    const raw = [
      ...document.querySelectorAll(
        'article, li, section, div[data-test*="job"], [class*="job-tile"], [data-ev-label*="job"]'
      ),
    ].filter(isVisible);
    return dedupeElements(raw)
      .map((el) => ({ el, score: scoreJobCard(el) }))
      .filter((x) => x.score >= 3)
      .sort((a, b) => b.score - a.score)
      .slice(0, 40);
  };

  const pickClickTarget = (cardEl) => {
    return (
      cardEl.querySelector('a[href*="/details/"]') ||
      cardEl.querySelector("h1 a, h2 a, h3 a, h4 a") ||
      cardEl.querySelector("a") ||
      cardEl
    );
  };

  const findLoadMoreButtons = () => {
    const cands = [...document.querySelectorAll("button,[role='button']")].filter(isVisible);
    return cands
      .map((el) => ({ el, txt: lower(el.textContent || "") }))
      .filter((x) => /load more|show more|more jobs/.test(x.txt))
      .slice(0, 10)
      .map((x) => ({ text: clip(x.el.textContent, 80), info: elInfo(x.el) }));
  };

  const findSliderCandidates = () => {
    const cands = [
      ...document.querySelectorAll(
        '[role="dialog"], [aria-modal="true"], [class*="slider"], [class*="drawer"], [class*="job-details"], [data-test*="job-details"], [id*="job-details"]'
      ),
    ].filter(isVisible);
    return dedupeElements(cands)
      .map((el) => {
        const txt = lower(el.textContent || "");
        let semanticScore = 0;
        if (txt.includes("job details")) semanticScore += 2;
        if (txt.includes("about the client")) semanticScore += 2;
        if (txt.includes("deliverables")) semanticScore += 1;
        if (txt.includes("attachments")) semanticScore += 1;
        if (txt.includes("skills")) semanticScore += 1;
        const len = norm(el.textContent || "").length;
        return { el, semanticScore, len };
      })
      .sort((a, b) => b.semanticScore - a.semanticScore || b.len - a.len)
      .slice(0, 8);
  };

  const findDescriptionCandidates = (root) => {
    if (!root) return [];
    const cands = [
      ...root.querySelectorAll(
        '[data-test*="description"], [class*="description"], article, section, p, div'
      ),
    ].filter(isVisible);
    return cands
      .map((el) => ({ el, len: norm(el.textContent || "").length }))
      .filter((x) => x.len >= 40)
      .sort((a, b) => b.len - a.len)
      .slice(0, 5)
      .map((x) => ({ len: x.len, info: elInfo(x.el) }));
  };

  const safeClick = (el) => {
    if (!el) return false;
    try {
      el.scrollIntoView({ block: "center", inline: "center" });
    } catch {
      // ignore
    }
    ["mousedown", "mouseup", "click"].forEach((ev) =>
      el.dispatchEvent(new MouseEvent(ev, { bubbles: true, cancelable: true, view: window }))
    );
    try {
      if (typeof el.click === "function") el.click();
    } catch {
      // ignore
    }
    return true;
  };

  const closeDetail = () => {
    const btn =
      document.querySelector('button[aria-label*="Close" i]') ||
      document.querySelector('button[data-test*="close" i]');
    if (btn) {
      safeClick(btn);
      return "close_button";
    }
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    return "escape";
  };

  const snapshot = (stage) => {
    const cards = findJobCards();
    const sliders = findSliderCandidates();
    return {
      stage,
      at: new Date().toISOString(),
      url: location.href,
      auth: detectAuth(),
      load_more_buttons: findLoadMoreButtons(),
      list_cards_top: cards.slice(0, 12).map((x, idx) => {
        const card = x.el;
        const clickTarget = pickClickTarget(card);
        const detailLinks = [...card.querySelectorAll('a[href*="/details/"]')]
          .slice(0, 2)
          .map((a) => ({
            href: a.getAttribute("href"),
            text: clip(a.textContent, 100),
            path: cssPath(a),
          }));
        return {
          idx,
          score: x.score,
          title: clip(card.querySelector("h1,h2,h3,h4,a")?.textContent || "", 120),
          card: elInfo(card),
          click_target: elInfo(clickTarget),
          detail_links: detailLinks,
        };
      }),
      slider_candidates: sliders.map((x) => ({
        semantic_score: x.semanticScore,
        text_len: x.len,
        info: elInfo(x.el),
        description_candidates: findDescriptionCandidates(x.el),
      })),
    };
  };

  const report = {
    meta: {
      probe_version: PROBE_VERSION,
      started_at: new Date().toISOString(),
      start_url: location.href,
      title: document.title,
      ua: navigator.userAgent,
      viewport: { w: innerWidth, h: innerHeight },
    },
    snapshots: [],
    click_tests: [],
    summary: {},
  };

  report.snapshots.push(snapshot("initial"));

  const cards = findJobCards();
  const testCount = Math.min(MAX_CLICK_TEST, cards.length);

  for (let i = 0; i < testCount; i += 1) {
    const card = cards[i].el;
    const target = pickClickTarget(card);
    const beforeUrl = location.href;
    const beforeSliderCount = findSliderCandidates().length;
    const title = clip(card.querySelector("h1,h2,h3,h4,a")?.textContent || "", 120);

    safeClick(target);

    let opened = false;
    let signal = null;
    const start = Date.now();
    while (Date.now() - start < WAIT_DETAIL_MS) {
      const curUrl = location.href;
      const sliders = findSliderCandidates();
      if (curUrl !== beforeUrl && curUrl.includes("/details/")) {
        opened = true;
        signal = "url_changed_to_details";
        break;
      }
      if (sliders.length > beforeSliderCount && sliders[0] && sliders[0].len > 60) {
        opened = true;
        signal = "slider_count_increased";
        break;
      }
      await sleep(250);
    }

    const afterSliders = findSliderCandidates();
    const bestSlider = afterSliders[0] ? afterSliders[0].el : null;

    report.click_tests.push({
      idx: i,
      title,
      before_url: beforeUrl,
      after_url: location.href,
      clicked_target: elInfo(target),
      opened,
      open_signal: signal,
      wait_ms: Date.now() - start,
      slider_count_before: beforeSliderCount,
      slider_count_after: afterSliders.length,
      best_slider: bestSlider ? elInfo(bestSlider) : null,
      best_slider_description_candidates: findDescriptionCandidates(bestSlider),
    });

    if (opened) {
      const closeBy = closeDetail();
      await sleep(600);
      report.click_tests[report.click_tests.length - 1].closed_by = closeBy;
    }
  }

  report.snapshots.push(snapshot("final"));

  report.summary = {
    list_card_count_detected: cards.length,
    click_tests_run: testCount,
    click_open_success_count: report.click_tests.filter((x) => x.opened).length,
    auth_detected: report.snapshots[0] && report.snapshots[0].auth
      ? report.snapshots[0].auth.detected
      : false,
  };
  report.meta.finished_at = new Date().toISOString();

  const ts = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const file = `upwork_probe_${ts.getFullYear()}${pad(ts.getMonth() + 1)}${pad(ts.getDate())}_${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}.json`;

  const text = JSON.stringify(report, null, 2);
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = file;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);

  console.log("[UJSC_PROBE] done:", report.summary);
  alert(
    `Probe done. File downloaded: ${file}\n` +
      `detail opened: ${report.summary.click_open_success_count}/${report.summary.click_tests_run}`
  );
})();

