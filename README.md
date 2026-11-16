# TriagePilot — Rovo triage agent for Jira

**Codegeist 2026 entry — Apps for Software Teams, aiming for the Best Agents (Rovo) and Best Teamwork Graph Integration bonus prizes.**

New Jira issues pile up faster than anyone can triage them. TriagePilot reads a work item the moment it is opened, suggests a priority, type and labels with transparent reasons, finds likely duplicates, and drafts a first reply to the reporter. It works two ways:

1. **Issue panel** — open any Jira work item and the TriagePilot panel shows the triage, possible duplicates, the people around the issue, and a draft reply. One click applies the priority + labels, another posts the draft as a comment.
2. **Rovo agent** — chat with TriagePilot in Rovo: "triage this issue", "are there duplicates?", "draft a reply to the reporter", "who is involved in this?". The agent only analyses; it never applies or posts anything by itself.

## How it works

- **Transparent scoring, not a black box.** `src/triage.js` scores severity keywords (crash, data loss, security, outage), breakage signals, impact (all users / production) and issue type into a priority band, and lists every reason. Confidence is honest: with almost no signal it says so.
- **Duplicate detection.** A JQL `text ~` search finds similar issues, ranked locally by token overlap (`src/triage.js: rankDuplicates`).
- **Teamwork Graph.** The panel and the `work-item-people` action read the graph (comments, goals, teams) through curated GraphQL queries with paging, retries and backoff (`src/twg.js`). A missing or unreadable source is reported as "may be incomplete", never as "nothing there".
- **Safe by design.** All four Rovo actions are `GET` — agents triggered by automation rules cannot call write actions anyway. Writes only happen when a human clicks a button in the panel.

## Install (for judges)

- **Installation link:** [Install TriagePilot on Jira](https://developer.atlassian.com/console/install/70a61209-19b7-4420-9722-9d037a035b80?signature=AYABeM6bXcDP0PX3IGN%2BueUm43IAAAADAAdhd3Mta21zAEthcm46YXdzOmttczp1cy13ZXN0LTI6NzA5NTg3ODM1MjQzOmtleS83MDVlZDY3MC1mNTdjLTQxYjUtOWY5Yi1lM2YyZGNjMTQ2ZTcAuAECAQB4CxqLTo9l4lqXuFjNim1xJM%2Bp%2F3TVP9xHS2BrU5DRRucBi4sk40g9a9THu%2B8Nr5I%2FBgAAAH4wfAYJKoZIhvcNAQcGoG8wbQIBADBoBgkqhkiG9w0BBwEwHgYJYIZIAWUDBAEuMBEEDL%2FeEbSfWEKbVygmuwIBEIA77ZdMC4tYrf6liVOlL9neIZDEancvdpEd%2FuY5%2Ft%2BtQPhJH4ZbDNLe3pjxkdqDkHj%2Fn4Ernz1936zkLZAAB2F3cy1rbXMAS2Fybjphd3M6a21zOmV1LXdlc3QtMTo3MDk1ODc4MzUyNDM6a2V5LzQ2MzBjZTZiLTAwYzMtNGRlMi04NzdiLTYyN2UyMDYwZTVjYwC4AQICAHi9bVMAkme4qVQX1fQHo6ePw3H40A7cGfz7yrmSfBWMXgHjVlTARjaUaFk3G%2FvQJr3IAAAAfjB8BgkqhkiG9w0BBwagbzBtAgEAMGgGCSqGSIb3DQEHATAeBglghkgBZQMEAS4wEQQM%2FdFrMxMUpqnCERkgAgEQgDtaptTn%2BPTiX1qcrF%2FiQRdXpwQ0YjaaPxW51E2k4mTi2brMouTJ%2BoUt0JyG1A02aJPMVHxFw%2BUa6ZXJHQAHYXdzLWttcwBLYXJuOmF3czprbXM6dXMtZWFzdC0xOjcwOTU4NzgzNTI0MzprZXkvNmMxMjBiYTAtNGNkNS00OTg1LWI4MmUtNDBhMDQ5NTJjYzU3ALgBAgIAeDYASx0XCjkny4iLV6vz%2BKtEGSGT6kdt0QRpkn6D%2FlVEAaVdYi6JZ8z79cw58KEOa4wAAAB%2BMHwGCSqGSIb3DQEHBqBvMG0CAQAwaAYJKoZIhvcNAQcBMB4GCWCGSAFlAwQBLjARBAwYLFHHRQsue5%2FXrZcCARCAO3rYfTkNxZ4tI3WOe0fmZap8Vdm1c%2BiiIihCpogyprPP8qa8pcGMxMsgiO7gYZbiSaVm9SUxwbsuIerJAgAAAAAMAAAQAAAAAAAAAAAAAAAAAOt9dhssR%2BY%2BzjyyIT%2FgFs7%2F%2F%2F%2F%2FAAAAAQAAAAAAAAAAAAAAAQAAADJj8RlG6aPgkQ1ebfiVxPO6CUjqC8i4O1F%2FCMaHk7Qj2RA8XAWDGtPPSZSp1LE0BHdGZgA6UROhcA9GDu3Hd64CEYE%3D&product=jira) — production version, shared with anyone (distribution: "Sharing with anyone").
- Privacy policy: [PRIVACY.md](PRIVACY.md)
- Requirements: a Jira Cloud site. Rovo needs a Standard, Premium or Enterprise plan (a trial includes it). Installing the app needs an organization admin, who approves the Teamwork Graph scopes at install time.
- Demo video (public, under 5 minutes): _link added once recorded_

## Develop

```bash
npm install
npm test            # unit tests for the triage logic (no Atlassian account needed)
forge lint          # manifest + handler check
forge deploy -e development
forge install -e development --site <your-site>.atlassian.net --product jira
forge logs -e development   # one JSON line per action call
```

`forge login` needs an Atlassian account; the app id in `manifest.yml` is currently a placeholder and is replaced by `forge create` / `forge register` on first login.

## Layout

- `manifest.yml` — rovo:agent + 4 actions + jira:issuePanel + scopes
- `prompts/prompt.md` — the agent prompt
- `src/index.js` — Rovo actions + panel resolver (the only place that writes)
- `src/triage.js` — pure triage + duplicate + draft logic (unit-tested)
- `src/twg.js` — Teamwork Graph client (curated queries, paging, retries)
- `src/frontend/index.jsx` — the issue panel (UI Kit)
- `tests/triage.test.js` — 7 tests, all passing
