import test from "node:test";
import assert from "node:assert/strict";
import { triageIssue, tokenSimilarity, rankDuplicates, draftReply } from "../src/triage.js";

test("crash in production is Highest", () => {
  const r = triageIssue({
    summary: "App crashes on checkout",
    description: "All users hit this in production, the app crashes every time.",
    issueType: "Bug",
  });
  assert.equal(r.priority, "Highest");
  assert.ok(r.reasons.length >= 2);
  assert.ok(r.suggestedLabels.includes("severity-critical"));
});

test("typo in docs is Low", () => {
  const r = triageIssue({
    summary: "Typo in getting-started docs",
    description: "The word 'recieve' is spelled wrong in the docs.",
    issueType: "Task",
  });
  assert.equal(r.priority, "Low");
});

test("broken login is at least High", () => {
  const r = triageIssue({
    summary: "Login fails with 500 error",
    description: "Users cannot log in, the login page returns an error.",
    issueType: "Bug",
  });
  assert.ok(["High", "Highest"].includes(r.priority));
});

test("empty text is an honest guess", () => {
  const r = triageIssue({ summary: "Something", description: "" });
  assert.ok(r.confidence <= 0.6);
  assert.match(r.reasons.join(" "), /guess/);
});

test("tokenSimilarity: identical texts score 1, unrelated score 0", () => {
  assert.equal(tokenSimilarity("login fails on submit", "login fails on submit"), 1);
  assert.equal(tokenSimilarity("login fails on submit", "purple elephant dances"), 0);
});

test("rankDuplicates finds the real duplicate and skips self", () => {
  const current = { key: "PROJ-1", summary: "Login fails with 500 error", description: "Cannot log in" };
  const candidates = [
    { key: "PROJ-1", summary: "Login fails with 500 error", description: "Cannot log in" },
    { key: "PROJ-7", summary: "Login fails with 500 error on submit", description: "Cannot log in after submit" },
    { key: "PROJ-9", summary: "Change button colour to blue", description: "Cosmetic change" },
  ];
  const out = rankDuplicates(current, candidates);
  assert.equal(out[0].key, "PROJ-7");
  assert.ok(!out.some((d) => d.key === "PROJ-1"));
  assert.ok(!out.some((d) => d.key === "PROJ-9"));
});

test("draftReply mentions priority and duplicates", () => {
  const triage = triageIssue({ summary: "App crashes", description: "All users, production", issueType: "Bug" });
  const text = draftReply({
    issueKey: "PROJ-1",
    summary: "App crashes",
    reporterName: "Ana",
    triage,
    duplicates: [{ key: "PROJ-7", score: 0.8 }],
  });
  assert.match(text, /Hi Ana/);
  assert.match(text, /Highest/);
  assert.match(text, /PROJ-7/);
});
