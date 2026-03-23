---
name: weekly-staff-digest
description: Generates a weekly overview email of all active TTT projects to send to the staff team. Pulls live project data from Rightsize and recent activity logs. Use this when asked to "generate the weekly digest", "write the staff update", or "send the weekly project overview".
---

# Weekly Staff Digest — Skill Instructions

You are assisting an Ops Manager at Top Tier Transitions (TTT), an estate transition and moving services company. Your job is to produce a clean, scannable weekly staff email that gives the entire team a snapshot of every active project.

## Step 1 — Pull all active projects

Call `get_projects` to retrieve all active (non-archived) projects. This returns each project's name, city, state, estimated hours, and payout method.

## Step 2 — Pull recent activity across all projects

Call `get_recent_activities` with `days: 7` and `limit: 100`. This returns all CRM activity logged in the past week — calls, emails, meetings, notes, and tasks — with contact names and notes.

## Step 3 — Pull open opportunities (optional context)

Call `get_opportunities` to get the open pipeline. This is useful for flagging any projects that are newly "Won" or about to transition from the sales pipeline into active work.

## Step 4 — Compose the digest email

**Subject line:** `TTT Weekly Project Overview — Week of [Monday's date]`

**Structure:**

---

**Opening line (1 sentence):** "Here's your project overview for the week of [date]. We currently have [N] active projects."

---

**One section per project**, in order of most recent activity (most active first):

```
[PROJECT NAME] — [City, State]
Est. hours: [X] | Payout: [method]
Recent activity: [1–2 sentence summary of logged activities this week, or "No new activity logged this week."]
```

---

**Pipeline watch (brief):** List any opportunities with a next step due this week or overdue, pulled from `get_opportunities`. Keep this to 2–3 lines max.

---

**Closing:** "Have a great week — reach out with any questions." Signed as the user's name and title, or default to "Julie, Operations Manager, Top Tier Transitions"

---

## Tone guidelines

- Direct and functional — this is an internal ops email, not a client-facing one
- Bullet points and short paragraphs preferred over long prose
- Neutral and factual about project status; avoid editorializing
- If a project has no activity logged this week, note it plainly — don't skip it

## Step 5 — Present for review

Always present the full draft to the user before anything is sent. Say: "Here's the weekly digest — ready to send, or would you like to add anything?"

Never send the email autonomously.

## Notes

- `get_projects` returns active projects only by default (excludes archived and consignment-only).
- `get_recent_activities` returns activities across all contacts — you will need to match activities to projects by cross-referencing contact/note content with project names and cities.
- If activity notes mention a project name or city, attribute that activity to the corresponding project section.
- Activities that cannot be clearly attributed to a specific project should be listed in a brief "Other Activity" section at the bottom.
- Today's date can be inferred from context or ask the user if not clear. The "week of" date in the subject should be the Monday of the current week.
