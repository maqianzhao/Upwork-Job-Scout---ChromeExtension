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
  const detailMatch = decoded.match(/\/details\/(~[0-9A-Za-z]+)/);
  if (detailMatch) return detailMatch[1];
  const jobsSlugMatch = decoded.match(/_(~[0-9A-Za-z]+)(?:[/?]|$)/);
  return jobsSlugMatch ? jobsSlugMatch[1] : null;
}

export function isDetailsHref(href) {
  if (!href) return false;
  const value = String(href);
  return value.includes("/details/");
}

export function isJobsHref(href) {
  if (!href) return false;
  const value = String(href);
  return value.includes("/jobs/");
}

export function buildDetailsPath(jobId) {
  if (!jobId) return null;
  return `/nx/find-work/best-matches/details/${jobId}`;
}

export function buildJobKey({ jobId, jobUrl }) {
  if (jobId) return jobId;
  if (jobUrl) return jobUrl;
  return null;
}

export function evaluateDetailReadiness(detail, meta) {
  const missing = [];
  const title = normalizeText(detail?.title_from_detail || "");
  const summary = normalizeText(detail?.description_full || "");
  const about = normalizeText(detail?.client_history_detail_raw || "");
  const rate = normalizeText(meta?.budget_or_hourly_range_raw || "");
  const jobType = normalizeText(meta?.job_type || "");

  if (!title) missing.push("title");
  if (summary.length < 20) missing.push("summary");
  if (!about) missing.push("about_client");
  if (!rate || (jobType !== "Hourly" && jobType !== "Fixed-price")) {
    missing.push("rate");
  }

  return { ready: missing.length === 0, missing };
}

function normalizeText(text) {
  if (!text) return "";
  return text.replace(/\s+/g, " ").trim();
}

function resolveDetailRoot(slider) {
  if (!slider) return null;
  return (
    slider.querySelector(".job-details-content") ||
    slider.querySelector(".air3-slider-content") ||
    slider.querySelector(".air3-slider-body") ||
    slider
  );
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

function isInsideDetailContainer(element) {
  if (!element) return false;
  return Boolean(
    element.closest(
      '[role="dialog"], [aria-modal="true"], [class*="slider"], [class*="drawer"], [class*="job-details"], [data-test*="job-details"], [id*="job-details"]'
    )
  );
}

function extractCardsFallback(doc) {
  const specificCandidates = Array.from(
    doc.querySelectorAll(
      "section.air3-card-section.air3-card-hover, section[data-ev-sublocation*='jobs'], [data-test*='JobTile']"
    )
  );
  const candidates =
    specificCandidates.length > 0
      ? specificCandidates
      : Array.from(
          doc.querySelectorAll(
            '[data-test*="job"], [class*="job-tile"], article, section, li[data-test*="job"], div[data-ev-label*="job"]'
          )
        );
  const items = [];
  const seen = new Set();
  for (const container of candidates) {
    if (isInsideDetailContainer(container)) continue;
    const title = normalizeText(
      container.querySelector("h1, h2, h3, h4, a")?.textContent || ""
    );
    if (!title) continue;
    const text = normalizeText(container.textContent || "");
    const hasJobSignal =
      /\b(hourly|fixed-price|proposals?|budget|\$)\b/i.test(text) ||
      /\$[0-9]/.test(text);
    if (!hasJobSignal) continue;

    if (title.toLowerCase() === "featured job posts") continue;
    const link =
      container.querySelector('a[href*="/details/"]') ||
      container.querySelector('a[href*="/jobs/"]') ||
      container.querySelector("h1 a, h2 a, h3 a, h4 a, a");
    const href = link?.getAttribute("href") || null;
    const jobUrl = href ? new URL(href, doc.baseURI).toString() : null;
    const jobId = parseJobIdFromUrl(jobUrl);
    if (link && !jobId) continue;
    const fallbackKey = buildFallbackKeyFromTitle(title, items.length);
    const jobKey = buildJobKey({ jobId, jobUrl }) || fallbackKey;
    if (seen.has(jobKey)) continue;
    seen.add(jobKey);
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
    doc.querySelectorAll('a[href*="/nx/find-work/best-matches/details/"], a[href*="/details/"]')
  );
  const anchorsA2 = Array.from(doc.querySelectorAll('a[href*="/jobs/"]'));
  const anchors = anchorsA1.length > 0 ? anchorsA1 : anchorsA2;

  const items = [];
  const seen = new Set();
  for (const link of anchors) {
    if (isInsideDetailContainer(link)) continue;
    const href = link.getAttribute("href");
    if (!href) continue;
    const jobUrl = new URL(href, doc.baseURI).toString();
    const jobId = parseJobIdFromUrl(jobUrl);
    if (!jobId) continue;
    const jobKey = jobId;
    if (!jobKey) continue;
    if (seen.has(jobKey)) continue;
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
    seen.add(jobKey);
  }
  if (items.length > 0) return items;
  return extractCardsFallback(doc);
}

function findHeadingElement(container, headingRegex) {
  const candidates = Array.from(
    container.querySelectorAll("h1, h2, h3, h4, h5, h6, div, span, strong, b, p")
  );
  return candidates.find((el) => {
    const text = normalizeText(el.textContent || "");
    if (!text || text.length > 60) return false;
    return headingRegex.test(text);
  });
}

function extractSectionText(container, headingRegex) {
  const heading = findHeadingElement(container, headingRegex);
  if (!heading) return null;
  let section = heading.closest("section, article") || heading.parentElement;
  const headingText = normalizeText(heading.textContent || "");
  if (section) {
    const sectionText = normalizeText(section.textContent || "");
    if (sectionText === headingText && section.parentElement) {
      section = section.parentElement;
    }
  }
  return normalizeText(section?.textContent || "");
}

export function extractDetailFromSlider(slider) {
  if (!slider) return null;
  const detailRoot = resolveDetailRoot(slider);
  const titleFromDetail = normalizeText(
    detailRoot.querySelector("h1, h2, h3, [data-test*='title']")?.textContent || ""
  );
  const explicitDescription =
    detailRoot.querySelector('[data-test*="description"]') ||
    detailRoot.querySelector('[class*="description"]');
  let descriptionFull = "";
  if (explicitDescription) {
    descriptionFull = textWithBreaks(explicitDescription);
  } else {
    const descriptionCandidates = [
      ...detailRoot.querySelectorAll("article, section, p, div"),
    ];
    descriptionFull = pickLongestText(descriptionCandidates);
  }
  if (!descriptionFull) {
    descriptionFull = textWithBreaks(detailRoot.querySelector("p") || detailRoot);
  }
  const deliverables = extractSectionText(detailRoot, /Deliverables/i);
  const skills = extractSectionText(detailRoot, /\bSkills\b/i);
  const client = extractSectionText(detailRoot, /About the client|Client/i);
  const attachments = /\bAttachments?\b/i.test(detailRoot.textContent || "")
    ? "true"
    : "unknown";

  return {
    title_from_detail: titleFromDetail || null,
    description_full: descriptionFull || null,
    deliverables_raw: deliverables || null,
    attachments_present: attachments,
    required_skills_detail_raw: skills || null,
    client_history_detail_raw: client || null,
  };
}

export function extractDetailMetaFromSlider(slider) {
  if (!slider) return {};
  const detailRoot = resolveDetailRoot(slider);
  const text = normalizeText(detailRoot?.textContent || "");
  const proposals = findFirstMatch(text, /Proposals[^.]*?(?=$|[.!])/i);
  const postedMatch = text.match(
    /Posted\s+([0-9]+\s+(?:minute|hour|day|week|month|year)s?\s+ago|yesterday)/i
  );
  const posted = postedMatch ? postedMatch[1] : null;

  const range = findFirstMatch(
    text,
    /\$[0-9][0-9,]*(?:\.[0-9]+)?\s*-\s*\$[0-9][0-9,]*(?:\.[0-9]+)?/i
  );
  const budgetLabel = findFirstMatch(
    text,
    /Budget\s*[:：]?\s*\$[0-9][0-9,]*(?:\.[0-9]+)?/i
  );
  const hourly = findFirstMatch(
    text,
    /\$[0-9][0-9,]*(?:\.[0-9]+)?\s*\/\s*hr/i
  );
  let budget = null;
  if (range) budget = range;
  else if (budgetLabel) budget = budgetLabel.replace(/Budget\s*[:：]?\s*/i, "");
  else if (hourly) budget = hourly.replace(/\s*\/\s*hr/i, "");

  let jobType = null;
  if (/\bHourly\b/i.test(text)) jobType = "Hourly";
  else if (/\bFixed-price\b/i.test(text)) jobType = "Fixed-price";

  return {
    posted_time_raw: posted || null,
    budget_or_hourly_range_raw: budget || null,
    proposal_count_raw: proposals || null,
    job_type: jobType || null,
  };
}
