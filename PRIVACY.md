# TriagePilot — Privacy Policy

**Last updated:** 16 November 2026
**Contact:** Fuadh591@gmail.com

TriagePilot is a Forge app for Jira Cloud (a Codegeist 2026 entry). It helps teams triage Jira work items: suggesting a priority, type and labels, finding likely duplicates, and drafting a first reply to the reporter.

## What data the app accesses

When you open the TriagePilot panel on a work item, or ask the TriagePilot Rovo agent about one, the app reads — through the Jira REST API and the Atlassian Teamwork Graph API, acting as you and only with your existing Jira permissions:

- Work item fields: summary, description, issue type, labels, priority, assignee, reporter and status.
- Comments on the work item (last 90 days) and linked goals, to show who is involved.
- Similar work items (by keyword search) to suggest possible duplicates.

## What the app does NOT do

- **It does not store personal data anywhere.** Triage results are computed in memory inside Atlassian's Forge runtime and returned to your screen; nothing is written to any database, file or external server.
- **It does not send data to any third party.** The app has no external network egress, no analytics, no tracking and no cookies.
- **It does not change anything by itself.** The Rovo agent only analyses. A priority, label or comment is only applied or posted when you click a button in the panel.

## Data retention

No personal data is retained by the app. Jira data remains in your own Atlassian site under your own Atlassian terms. Uninstalling the app removes its access entirely.

## Contact

Questions about this policy: Fuadh591@gmail.com
