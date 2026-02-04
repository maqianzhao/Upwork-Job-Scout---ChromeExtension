export function parseJobIdFromUrl(url) {
  if (!url || typeof url !== "string") {
    return null;
  }
  let decoded = url;
  try {
    decoded = decodeURIComponent(url);
  } catch {
    // Keep original value when decoding fails.
  }
  const match = decoded.match(/\/details\/(~[0-9A-Za-z]+)/);
  return match ? match[1] : null;
}

export function buildJobKey({ jobId, jobUrl }) {
  if (jobId) return jobId;
  if (jobUrl) return jobUrl;
  return null;
}

function normalizeText(text) {
  if (!text) return "";
  return text.replace(/\s+/g, " ").trim();
}

function textWithBreaks(element) {
  if (!element) return "";
  const clone = element.cloneNode(true);
  clone.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
  return normalizeText(clone.textContent || "");
}

function pickLongestText(elements) {
  let best = "";
  for (const el of elements) {
    const t = textWithBreaks(el);
    if (t.length > best.length) best = t;
  }
  return best || "";
}

function findTitle(container, link) {
  const linkText = normalizeText(link?.textContent || "");
  if (linkText) return linkText;
  const heading = container?.querySelector("h1, h2, h3, h4");
  return normalizeText(heading?.textContent || "");
}

function findFirstMatch(text, regex) {
  const match = text.match(regex);
  return match ? match[0].trim() : null;
}

function findProposalText(container) {
  if (!container) return null;
  const elements = Array.from(container.querySelectorAll("*"));
  for (const el of elements) {
    const text = normalizeText(el.textContent || "");
    if (text.toLowerCase().startsWith("proposals")) {
      return text;
    }
  }
  return null;
}

function extractSkills(container) {
  const tagContainer = container?.querySelectorAll(".tags span");
  if (tagContainer && tagContainer.length > 0) {
    return Array.from(tagContainer)
      .map((el) => normalizeText(el.textContent))
      .filter(Boolean);
  }
  return null;
}

function buildFallbackKeyFromTitle(title, index) {
  const base = normalizeText(title || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32);
  return `card_${index}_${base || "unknown"}`;
}

function extractCardsFallback(doc) {
  const candidates = Array.from(
    doc.querySelectorAll(
      '[data-test*="job"], [class*="job-tile"], article, li[data-test*="job"], div[data-ev-label*="job"]'
    )
  );
  const items = [];
  const seen = new Set();
  for (const container of candidates) {
    const title = normalizeText(
      container.querySelector("h1, h2, h3, h4, a")?.textContent || ""
    );
    if (!title) continue;
    const text = normalizeText(container.textContent || "");
    const hasJobSignal =
      /\b(hourly|fixed-price|proposals?|budget|\$)\b/i.test(text) ||
      /\$[0-9]/.test(text);
    if (!hasJobSignal) continue;

    const fallbackKey = buildFallbackKeyFromTitle(title, items.length);
    if (seen.has(fallbackKey)) continue;
    seen.add(fallbackKey);

    const link = container.querySelector('a[href*="/details/"]');
    const href = link?.getAttribute("href") || null;
    const jobUrl = href ? new URL(href, doc.baseURI).toString() : null;
    const jobId = parseJobIdFromUrl(jobUrl);
    const jobKey = buildJobKey({ jobId, jobUrl }) || fallbackKey;
    const budget = findFirstMatch(text, /\$[0-9.,]+(?:\s*-\s*\$[0-9.,]+)?/);
    const posted = findFirstMatch(
      text,
      /(\d+\s+(minute|hour|day|week|month|year)s?\s+ago|yesterday)/i
    );
    const proposals = findProposalText(container) || findFirstMatch(text, /Proposals[^.]*?(?=$|[.!])/i);

    items.push({
      source_index: items.length,
      job_key: jobKey,
      job_id: jobId,
      job_url: jobUrl,
      title,
      job_type: findFirstMatch(text, /\bHourly\b/i)
        ? "Hourly"
        : findFirstMatch(text, /\bFixed-price\b/i)
          ? "Fixed-price"
          : "unknown",
      budget_or_hourly_range_raw: budget || null,
      posted_time_raw: posted || null,
      description_snippet: null,
      skills_tags_raw: extractSkills(container),
      proposal_count_raw: proposals || null,
    });
  }
  return items;
}

export function extractListItemsFromDocument(doc) {
  const anchorsA1 = Array.from(
    doc.querySelectorAll('a[href*="/nx/find-work/best-matches/details/"]')
  );
  const anchors =
    anchorsA1.length > 0
      ? anchorsA1
      : Array.from(doc.querySelectorAll('a[href*="/details/"]'));

  const items = [];
  for (const link of anchors) {
    const href = link.getAttribute("href");
    if (!href) continue;
    const jobUrl = new URL(href, doc.baseURI).toString();
    const jobId = parseJobIdFromUrl(jobUrl);
    const jobKey = buildJobKey({ jobId, jobUrl });
    if (!jobKey) continue;
    const container = link.closest("article, section, li, div") || link.parentElement;
    const containerText = normalizeText(container?.textContent || "");

    const jobTypeMatch = findFirstMatch(containerText, /\bHourly\b/i)
      ? "Hourly"
      : findFirstMatch(containerText, /\bFixed-price\b/i)
        ? "Fixed-price"
        : "unknown";
    const budget = findFirstMatch(containerText, /\$[0-9.,]+(?:\s*-\s*\$[0-9.,]+)?/);
    const posted = findFirstMatch(
      containerText,
      /(\d+\s+(minute|hour|day|week|month|year)s?\s+ago|yesterday)/i
    );
    const proposals = findProposalText(container) || findFirstMatch(containerText, /Proposals[^.]*?(?=$|[.!])/i);

    items.push({
      source_index: items.length,
      job_key: jobKey,
      job_id: jobId,
      job_url: jobUrl,
      title: findTitle(container, link),
      job_type: jobTypeMatch,
      budget_or_hourly_range_raw: budget || null,
      posted_time_raw: posted || null,
      description_snippet: null,
      skills_tags_raw: extractSkills(container),
      proposal_count_raw: proposals || null,
    });
  }
  if (items.length > 0) return items;
  return extractCardsFallback(doc);
}

function extractSectionText(container, headingRegex) {
  const headings = Array.from(container.querySelectorAll("h1, h2, h3, h4"));
  const heading = headings.find((h) => headingRegex.test(h.textContent || ""));
  if (!heading) return null;
  const section = heading.parentElement;
  return normalizeText(section?.textContent || "");
}

export function extractDetailFromSlider(slider) {
  if (!slider) return null;
  const explicitDescription =
    slider.querySelector('[data-test*="description"]') ||
    slider.querySelector('[class*="description"]');
  let descriptionFull = "";
  if (explicitDescription) {
    descriptionFull = textWithBreaks(explicitDescription);
  } else {
    const descriptionCandidates = [
      ...slider.querySelectorAll("article, section, p"),
    ];
    descriptionFull = pickLongestText(descriptionCandidates);
  }
  if (!descriptionFull) {
    descriptionFull = textWithBreaks(slider.querySelector("p") || slider);
  }
  const deliverables = extractSectionText(slider, /Deliverables/i);
  const skills = extractSectionText(slider, /\bSkills\b/i);
  const client = extractSectionText(slider, /About the client|Client/i);
  const attachments = /\bAttachments?\b/i.test(slider.textContent || "")
    ? "true"
    : "unknown";

  return {
    description_full: descriptionFull || null,
    deliverables_raw: deliverables || null,
    attachments_present: attachments,
    required_skills_detail_raw: skills || null,
    client_history_detail_raw: client || null,
  };
}
