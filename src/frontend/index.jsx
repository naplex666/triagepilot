import React, { useEffect, useState } from "react";
import ForgeReconciler, {
  Text,
  Button,
  SectionMessage,
  Stack,
  Box,
  Lozenge,
  useProductContext,
} from "@forge/react";
import { invoke } from "@forge/bridge";
import { draftReply as buildDraft } from "../triage.js";

const LOZENGE_FOR = { Highest: "removed", High: "new", Medium: "inprogress", Low: "default" };

function App() {
  const context = useProductContext();
  const issueKey = context?.extension?.issue?.key;
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);
  const [done, setDone] = useState(null);

  useEffect(() => {
    if (!issueKey) return;
    invoke("getTriage", { issueKey })
      .then((res) => (res.ok ? setData(res) : setError(res.error || "Could not load triage.")))
      .catch((e) => setError(String(e?.message || e)));
  }, [issueKey]);

  if (!issueKey) return <Text>Open a Jira work item to see its triage.</Text>;
  if (error) return <SectionMessage title="TriagePilot could not load" appearance="error"><Text>{error}</Text></SectionMessage>;
  if (!data) return <Text>Triaging {issueKey}…</Text>;

  const { workItem, triage, duplicates, people } = data;
  const draft = buildDraft({
    issueKey,
    summary: workItem.summary,
    reporterName: people?.reporter || null,
    triage,
    duplicates,
  });

  const apply = async () => {
    setBusy("apply");
    const res = await invoke("applyTriage", {
      issueKey,
      priority: triage.priority,
      labels: triage.suggestedLabels,
    }).catch((e) => ({ ok: false, error: String(e?.message || e) }));
    setBusy(null);
    if (res.ok) setDone(`Applied: priority ${triage.priority} + labels ${triage.suggestedLabels.join(", ")}.`);
    else setError(res.error || "Applying triage failed.");
  };

  const post = async () => {
    setBusy("post");
    const res = await invoke("postComment", { issueKey, text: draft }).catch((e) => ({
      ok: false,
      error: String(e?.message || e),
    }));
    setBusy(null);
    if (res.ok) setDone("Draft reply posted as a comment.");
    else setError(res.error || "Posting the comment failed.");
  };

  return (
    <Stack space="space.200">
      <Box>
        <Text>
          <strong>{workItem.key}</strong> — {workItem.summary}
        </Text>
        <Text>
          Current: {workItem.type || "?"} · {workItem.priority || "no priority"} · {workItem.status || "?"}
        </Text>
      </Box>

      <Box>
        <Lozenge appearance={LOZENGE_FOR[triage.priority] || "default"}>{triage.priority}</Lozenge>
        <Text>
          Suggested: {triage.suggestedType} · confidence {Math.round(triage.confidence * 100)}% · score{" "}
          {triage.score}
        </Text>
        {triage.reasons.map((r, i) => (
          <Text key={i}>• {r}</Text>
        ))}
        <Text>Suggested labels: {triage.suggestedLabels.join(", ") || "none"}</Text>
      </Box>

      <Box>
        <Text>
          <strong>Possible duplicates ({duplicates.length})</strong>
        </Text>
        {duplicates.length === 0 ? (
          <Text>No similar work items found.</Text>
        ) : (
          duplicates.map((d) => (
            <Text key={d.key}>
              {d.key} — {d.summary} ({d.status || "?"}, similarity {d.score})
            </Text>
          ))
        )}
      </Box>

      {people && !people.error && (
        <Box>
          <Text>
            <strong>People</strong>
          </Text>
          <Text>Assignee: {people.assignee ? `${people.assignee.name} (${people.assignee.teams.join(", ") || "no team"})` : "unassigned"}</Text>
          <Text>Reporter: {people.reporter || "unknown"}</Text>
          {people.commentersLast90Days.slice(0, 3).map((c) => (
            <Text key={c.name}>
              {c.name}: {c.comments} comment(s) in the last 90 days
            </Text>
          ))}
        </Box>
      )}

      <Box>
        <Text>
          <strong>Draft first reply</strong>
        </Text>
        <Text>{draft}</Text>
      </Box>

      {done && (
        <SectionMessage title="Done" appearance="confirmation">
          <Text>{done}</Text>
        </SectionMessage>
      )}

      <Stack space="space.100">
        <Button appearance="primary" onClick={apply} isDisabled={busy !== null}>
          {busy === "apply" ? "Applying…" : `Apply priority ${triage.priority} + labels`}
        </Button>
        <Button appearance="default" onClick={post} isDisabled={busy !== null}>
          {busy === "post" ? "Posting…" : "Post draft reply as comment"}
        </Button>
      </Stack>
    </Stack>
  );
}

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
