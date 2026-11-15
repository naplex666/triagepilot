// TriagePilot — Rovo agent actions (GET only) + Jira issue-panel resolver.
// Actions only read: agents triggered by automation rules never call
// CREATE/UPDATE/DELETE actions, so every agent action here is a GET that
// returns data for Rovo to write into prose. All writes happen from the
// issue panel, where the user clicks a button and the resolver calls Jira.
import api, { route } from "@forge/api";
import Resolver from "@forge/resolver";
import { triageIssue as runTriage, rankDuplicates, draftReply as buildDraft } from "./triage.js";
import { twgAll, Q, workItemAri } from "./twg.js";

const log = (event, data) => console.log(JSON.stringify({ triagepilot: event, ...data }));

// --- shared helpers ---------------------------------------------------------
const askerOf = (payload) => payload?.context?.accountId || null;
const issueKeyOf = (payload) =>
  String(payload?.issueKey || payload?.context?.jira?.issueKey || "").trim().toUpperCase();

async function readIssue(key) {
  const res = await api.asUser().requestJira(
    route`/rest/api/3/issue/${key}?fields=summary,description,issuetype,labels,priority,assignee,reporter,status`
  );
  if (res.status === 404) return { error: `${key} does not exist or you cannot see it.` };
  if (!res.ok) return { error: `Could not read ${key} (${res.status}).` };
  const issue = await res.json();
  return { issue };
}

const plainText = (adf) => {
  if (!adf) return "";
  if (typeof adf === "string") return adf;
  let out = "";
  const walk = (node) => {
    if (!node) return;
    if (node.type === "text") out += node.text;
    if (Array.isArray(node.content)) node.content.forEach(walk);
    if (node.type === "paragraph" || node.type === "heading") out += "\n";
  };
  walk(adf);
  return out.trim();
};

const issueText = (issue) => ({
  summary: issue.fields?.summary || "",
  description: plainText(issue.fields?.description),
  issueType: issue.fields?.issuetype?.name || "",
  labels: issue.fields?.labels || [],
});

async function searchSimilar(issue) {
  const words = `${issueText(issue).summary} ${issueText(issue).description}`
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 8);
  if (words.length === 0) return { candidates: [] };
  const jql = `text ~ "${words.join(" ")}"`;
  const res = await api.asUser().requestJira(
    route`/rest/api/3/search/jql?jql=${jql}&fields=summary,description,status&maxResults=20`
  );
  if (!res.ok) return { candidates: [], error: `similar-issue search failed (${res.status})` };
  const json = await res.json();
  return {
    candidates: (json.issues || []).map((i) => ({
      key: i.key,
      summary: i.fields?.summary || "",
      description: plainText(i.fields?.description),
      status: i.fields?.status?.name || null,
    })),
  };
}

async function teamsOf(accountId, notes) {
  const r = await twgAll("userTeams", Q.userTeams, { userId: `ari:cloud:identity::user/${accountId}` }, "atlassianUserInTeams");
  if (!r.ok) notes.push(`teams could not be read: ${r.error}`);
  else if (!r.complete) notes.push("team list may be incomplete");
  return r.nodes.map((t) => ({ id: t.id, name: t.displayName }));
}

// --- Rovo actions (GET) ------------------------------------------------------
export async function triageIssue(payload) {
  const t0 = Date.now();
  const key = issueKeyOf(payload);
  if (!key) return { error: "Which work item? Give me a key such as PROJ-12." };
  const { issue, error } = await readIssue(key);
  if (error) return { error };
  const triage = runTriage(issueText(issue));
  log("triage-issue", { ms: Date.now() - t0, key, priority: triage.priority });
  return {
    workItem: { key, summary: issue.fields.summary, status: issue.fields.status?.name, type: issue.fields.issuetype?.name },
    triage,
  };
}

export async function findDuplicates(payload) {
  const t0 = Date.now();
  const key = issueKeyOf(payload);
  if (!key) return { error: "Which work item? Give me a key such as PROJ-12." };
  const { issue, error } = await readIssue(key);
  if (error) return { error };
  const { candidates, error: searchError } = await searchSimilar(issue);
  const notes = searchError ? [searchError] : [];
  const duplicates = rankDuplicates({ key, ...issueText(issue) }, candidates);
  log("find-duplicates", { ms: Date.now() - t0, key, found: duplicates.length });
  return { workItem: { key, summary: issue.fields.summary }, duplicates, notes };
}

export async function draftReply(payload) {
  const t0 = Date.now();
  const key = issueKeyOf(payload);
  if (!key) return { error: "Which work item? Give me a key such as PROJ-12." };
  const { issue, error } = await readIssue(key);
  if (error) return { error };
  const triage = runTriage(issueText(issue));
  const { candidates } = await searchSimilar(issue);
  const duplicates = rankDuplicates({ key, ...issueText(issue) }, candidates);
  const draft = buildDraft({
    issueKey: key,
    summary: issue.fields.summary,
    reporterName: issue.fields.reporter?.displayName || null,
    triage,
    duplicates,
  });
  log("draft-reply", { ms: Date.now() - t0, key });
  return { workItem: { key, summary: issue.fields.summary }, triage, duplicates, draft };
}

export async function workItemPeople(payload) {
  const t0 = Date.now();
  const notes = [];
  const key = issueKeyOf(payload);
  if (!key) return { error: "Which work item? Give me a key such as PROJ-12." };
  const { issue, error } = await readIssue(key);
  if (error) return { error };
  const cloudId = payload?.context?.cloudId;
  const ari = workItemAri(cloudId, issue.id);
  const [comments, goals] = await Promise.all([
    twgAll("workItemComments", Q.workItemComments, { id: ari, since: "P90D" }, "jiraWorkItemComments"),
    twgAll("workItemGoals", Q.workItemGoals, { id: ari }, "jiraWorkItemGoals"),
  ]);
  if (!comments.ok) notes.push(`comments could not be read: ${comments.error}`);
  if (!goals.ok) notes.push(`goals could not be read: ${goals.error}`);
  const byAuthor = new Map();
  for (const c of comments.nodes) {
    const name = c.author?.name || "unknown";
    const row = byAuthor.get(name) || { name, comments: 0, lastAt: null };
    row.comments += 1;
    if (!row.lastAt || c.createdAt > row.lastAt) row.lastAt = c.createdAt;
    byAuthor.set(name, row);
  }
  const assignee = issue.fields.assignee;
  const assigneeTeams = assignee ? (await teamsOf(assignee.accountId, notes)).map((t) => t.name) : [];
  log("work-item-people", { ms: Date.now() - t0, key, comments: comments.nodes.length, goals: goals.nodes.length });
  return {
    workItem: { key, summary: issue.fields.summary, status: issue.fields.status?.name },
    assignee: assignee ? { name: assignee.displayName, teams: assigneeTeams } : null,
    reporter: issue.fields.reporter?.displayName || null,
    commentersLast90Days: [...byAuthor.values()].sort((a, b) => b.comments - a.comments),
    goals: goals.nodes.map((g) => ({ name: g.name, url: g.url })),
    notes,
  };
}

// --- Issue panel resolver (UI actions, may write) ----------------------------
const PRIORITY_FALLBACK = { Highest: "1", High: "2", Medium: "3", Low: "4", Lowest: "5" };

async function priorityIdFor(name) {
  const res = await api.asUser().requestJira(route`/rest/api/3/priority`);
  if (res.ok) {
    const list = await res.json();
    const hit = list.find((p) => p.name.toLowerCase() === String(name).toLowerCase());
    if (hit) return hit.id;
  }
  return PRIORITY_FALLBACK[name] || null;
}

const resolver = new Resolver();

resolver.define("getTriage", async (req) => {
  const key = String(req.payload?.issueKey || "").trim().toUpperCase();
  if (!key) return { ok: false, error: "No work item key." };
  const { issue, error } = await readIssue(key);
  if (error) return { ok: false, error };
  const triage = runTriage(issueText(issue));
  const { candidates, error: searchError } = await searchSimilar(issue);
  const duplicates = rankDuplicates({ key, ...issueText(issue) }, candidates);
  const people = await workItemPeople({ issueKey: key, context: req.context });
  return {
    ok: true,
    workItem: {
      key,
      summary: issue.fields.summary,
      status: issue.fields.status?.name,
      type: issue.fields.issuetype?.name,
      priority: issue.fields.priority?.name || null,
      labels: issue.fields.labels || [],
    },
    triage,
    duplicates,
    people: people.error ? { error: people.error } : people,
    notes: searchError ? [searchError] : [],
  };
});

resolver.define("applyTriage", async (req) => {
  const { issueKey, priority, labels } = req.payload || {};
  const key = String(issueKey || "").trim().toUpperCase();
  if (!key) return { ok: false, error: "No work item key." };
  const fields = {};
  if (priority) {
    const id = await priorityIdFor(priority);
    if (!id) return { ok: false, error: `Unknown priority "${priority}".` };
    fields.priority = { id };
  }
  if (Array.isArray(labels) && labels.length > 0) fields.labels = labels;
  if (Object.keys(fields).length === 0) return { ok: false, error: "Nothing to apply." };
  const res = await api.asUser().requestJira(route`/rest/api/3/issue/${key}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fields }),
  });
  if (res.status !== 204 && !res.ok) return { ok: false, error: `Applying triage failed (${res.status}).` };
  return { ok: true, applied: fields };
});

resolver.define("postComment", async (req) => {
  const { issueKey, text } = req.payload || {};
  const key = String(issueKey || "").trim().toUpperCase();
  if (!key || !text) return { ok: false, error: "Need a work item key and comment text." };
  const body = {
    type: "doc",
    version: 1,
    content: [{ type: "paragraph", content: [{ type: "text", text: String(text) }] }],
  };
  const res = await api.asUser().requestJira(route`/rest/api/3/issue/${key}/comment`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body }),
  });
  if (!res.ok) return { ok: false, error: `Posting the comment failed (${res.status}).` };
  return { ok: true };
});

export const handler = resolver.getDefinitions();
