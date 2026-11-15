// TriagePilot — pure triage logic. No Atlassian API calls here, so it is
// unit-testable with plain node. The scoring is deliberately transparent:
// every point comes from a named signal, and the result lists its reasons,
// so a human can disagree with it in the panel instead of trusting a black box.

// --- Signal tables ---------------------------------------------------------
const SEVERITY = [
  { re: /\b(crash|crashes|crashing|data loss|lost data|security|vulnerab|breach|exploit|payment|billing|charged|outage|downtime|site is down|corrupt|deleted all)\b/i, points: 40, label: "severity-critical", reason: "critical keyword (crash, data loss, security, payment, outage)" },
  { re: /\b(blocks|blocking|blocker|regression|broken|fails|failing|failure|error|exception|500|timeout|timed out|cannot|cant|can't|unable to|not working|doesn't work)\b/i, points: 25, label: "broken", reason: "broken-functionality keyword (fails, error, blocked, regression)" },
  { re: /\b(slow|slowness|lag|laggy|intermittent|flaky|sometimes|occasionally|confusing|unclear|wrong value|incorrect)\b/i, points: 10, label: "degraded", reason: "degraded-experience keyword (slow, intermittent, wrong value)" },
  { re: /\b(typo|spelling|docs|documentation|cosmetic|colour|color|wording|nice to have|enhancement|feature request|polish)\b/i, points: -10, label: "minor", reason: "minor keyword (typo, docs, cosmetic, nice-to-have)" },
];

const IMPACT = [
  { re: /\b(all users|every user|everyone|everybody|production|prod |live site|customers?|all customers)\b/i, points: 15, label: "wide-impact", reason: "wide impact (all users / production / customers)" },
  { re: /\b(some users|a few users|occasionally|rarely|edge case)\b/i, points: 5, label: "limited-impact", reason: "limited impact (some users, occasionally)" },
];

const STOPWORDS = new Set(
  "a an the and or of to in on for with is are was were be been it this that these those i you he she we they my your his her our their as at by from not no do does did don t s re ve ll".split(" ")
);

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

function matchSignals(text, table) {
  const hits = [];
  for (const s of table) if (s.re.test(text)) hits.push(s);
  return hits;
}

// --- Priority --------------------------------------------------------------
export function triageIssue({ summary = "", description = "", issueType = "", labels = [] } = {}) {
  const text = `${summary}\n${description}`;
  const reasons = [];
  const suggestedLabels = new Set(labels || []);
  let score = 0;
  let signalCount = 0;

  for (const s of matchSignals(text, SEVERITY)) {
    score += s.points;
    signalCount += 1;
    reasons.push(s.reason);
    suggestedLabels.add(s.label);
  }
  for (const s of matchSignals(text, IMPACT)) {
    score += s.points;
    signalCount += 1;
    reasons.push(s.reason);
    suggestedLabels.add(s.label);
  }

  const type = String(issueType || "").toLowerCase();
  let suggestedType = issueType || "Task";
  if (/bug/.test(type)) { score += 10; suggestedType = "Bug"; }
  else if (/story/.test(type)) { score += 5; suggestedType = "Story"; }
  else if (/task/.test(type)) { score += 5; suggestedType = "Task"; }

  let priority;
  if (score >= 50) priority = "Highest";
  else if (score >= 30) priority = "High";
  else if (score >= 10) priority = "Medium";
  else priority = "Low";

  // Confidence grows with the number of independent signals; with almost no
  // signal the result is honest about being a guess.
  const confidence = Math.min(0.95, 0.45 + 0.12 * signalCount);
  if (signalCount === 0) reasons.push("no strong signal in the text — treated as a guess, please review");

  return {
    priority,
    score,
    confidence: Math.round(confidence * 100) / 100,
    suggestedType,
    suggestedLabels: [...suggestedLabels],
    reasons,
  };
}

// --- Duplicate detection ---------------------------------------------------
export function tokenSimilarity(a, b) {
  const setA = new Set(tokenize(a));
  const setB = new Set(tokenize(b));
  if (setA.size === 0 || setB.size === 0) return 0;
  let overlap = 0;
  for (const t of setA) if (setB.has(t)) overlap += 1;
  return overlap / Math.max(setA.size, setB.size);
}

// Ranks candidate issues against the current one. Returns the best matches
// above `threshold`, highest first. `current` and each candidate need
// { key, summary, description }.
export function rankDuplicates(current, candidates, threshold = 0.35, limit = 5) {
  const currentText = `${current.summary || ""}\n${current.description || ""}`;
  const scored = [];
  for (const c of candidates || []) {
    if (c.key === current.key) continue;
    const score = tokenSimilarity(currentText, `${c.summary || ""}\n${c.description || ""}`);
    if (score >= threshold) scored.push({ key: c.key, summary: c.summary || "", status: c.status || null, score: Math.round(score * 100) / 100 });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

// --- Draft reply -----------------------------------------------------------
export function draftReply({ issueKey, summary, reporterName, triage, duplicates = [] }) {
  const name = reporterName ? `Hi ${reporterName},` : "Hi,";
  const lines = [
    `${name} thanks for reporting this.`,
    "",
    `We've triaged it as **${triage.priority}** priority (${triage.suggestedType.toLowerCase()}) — ${triage.reasons[0] || "based on the report"}.`,
  ];
  if (duplicates.length > 0) {
    lines.push("", `This looks related to ${duplicates.map((d) => d.key).join(", ")} — we're tracking it there and will link the two.`);
  }
  lines.push("", "We'll update this issue as soon as we have a fix or need more detail from you.");
  lines.push("", `— TriagePilot (auto-triage for ${issueKey || "this issue"}${summary ? `: ${summary}` : ""})`);
  return lines.join("\n");
}
