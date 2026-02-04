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
  return items;
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
  const descriptionElement = slider.querySelector(".description") || slider.querySelector("p") || slider;
  const descriptionFull = textWithBreaks(descriptionElement);
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
