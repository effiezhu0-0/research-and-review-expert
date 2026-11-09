type CandidateIdentity = {
  id?: string;
  source?: string | null;
  title?: string | null;
  url?: string | null;
  author?: string | null;
  identity_text?: string | null;
  identityText?: string | null;
  published_at?: string | null;
  publishedAt?: string | null;
  excerpt?: string | null;
  dedupe_key?: string | null;
  dedupeKey?: string | null;
  screenshot_hash?: string | null;
  screenshotHash?: string | null;
  selected?: number | boolean;
  excluded?: number | boolean;
};

export function normalizedText(value: unknown) {
  return String(value || "")
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[\s\p{P}\p{S}]+/gu, "");
}

export function canonicalVoiceDetailUrl(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (!/(^|\.)new-ux\.jd\.com$/i.test(url.hostname)) return "";
    // JD Voice of User uses camelCase identifiers such as feedbackId on its
    // search URL (for example /search?channel_id=1&keywords=...&feedbackId=...).
    // Keep only the stable entity identifier so the same feedback found under
    // different keywords resolves to the same canonical URL.
    const entityParams = [...url.searchParams.entries()].filter(([name]) =>
      /^(?:id|uuid|feedbackid|issueid|problemid|questionid|voiceid|ticketid|recordid|complaintid|experienceid)$/i.test(name)
      || /^(?:feedback|issue|problem|question|voice|ticket|record|complaint|experience)_(?:id|key|code)$/i.test(name),
    );
    const path = url.pathname.replace(/\/+$/, "");
    const detailPath = /\/(?:detail|issue-detail|feedback-detail|problem-detail)(?:\/|$)/i.test(path)
      || /\/(?:issue|feedback|problem|question)\/[^/]+$/i.test(path);
    const hashHasIdentity = /#\/(?:detail|issue|feedback|problem|question)\/[^/?#]+/i.test(url.hash)
      || /#(?:id|feedbackId|issueId|problemId|questionId)=?[\w-]{6,}/i.test(url.hash);
    if (!entityParams.length && !detailPath && !hashHasIdentity) return "";
    if (entityParams.length) {
      const stableParams = new URLSearchParams();
      for (const [name, value] of entityParams.sort(([a], [b]) => a.localeCompare(b))) stableParams.set(name.toLowerCase(), value);
      url.search = stableParams.toString();
      url.hash = "";
    } else if (hashHasIdentity) {
      url.search = "";
    } else {
      url.search = "";
      url.hash = "";
    }
    return url.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

export function hasVoiceFeedbackId(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return false;
  try {
    const url = new URL(raw);
    return /(^|\.)new-ux\.jd\.com$/i.test(url.hostname)
      && [...url.searchParams.entries()].some(([name, id]) => name.toLowerCase() === "feedbackid" && Boolean(id.trim()));
  } catch {
    return false;
  }
}

function exactTextIdentity(item: CandidateIdentity) {
  const title = normalizedText(item.title);
  const excerpt = normalizedText(item.excerpt);
  return title.length >= 8 && excerpt.length >= 36 ? `${title}|${excerpt}` : "";
}

export function candidatesAreDuplicates(left: CandidateIdentity, right: CandidateIdentity) {
  if (!left.source || left.source !== right.source) return false;
  const leftKey = String(left.dedupe_key || left.dedupeKey || "");
  const rightKey = String(right.dedupe_key || right.dedupeKey || "");
  if (leftKey && rightKey && leftKey === rightKey) return true;
  const leftScreenshot = String(left.screenshot_hash || left.screenshotHash || "");
  const rightScreenshot = String(right.screenshot_hash || right.screenshotHash || "");
  if (leftScreenshot && rightScreenshot && leftScreenshot === rightScreenshot) return true;

  if (left.source === "voice_of_user") {
    const leftUrl = canonicalVoiceDetailUrl(left.url);
    const rightUrl = canonicalVoiceDetailUrl(right.url);
    if (leftUrl && rightUrl && leftUrl === rightUrl) return true;
  }

  const leftIdentity = normalizedText(left.identity_text || left.identityText);
  const rightIdentity = normalizedText(right.identity_text || right.identityText);
  if (leftIdentity.length >= 40 && rightIdentity.length >= 40 && leftIdentity === rightIdentity) return true;

  const leftText = exactTextIdentity(left);
  const rightText = exactTextIdentity(right);
  return Boolean(leftText && rightText && leftText === rightText);
}

export function uniqueCandidates<T extends CandidateIdentity>(items: T[]) {
  const unique: T[] = [];
  for (const item of items) {
    const index = unique.findIndex((saved) => candidatesAreDuplicates(saved, item));
    if (index < 0) {
      unique.push(item);
      continue;
    }
    const saved = unique[index];
    unique[index] = {
      ...saved,
      selected: Boolean(saved.selected) || Boolean(item.selected),
      excluded: Boolean(saved.excluded) && Boolean(item.excluded),
    };
  }
  return unique;
}
