# Rightsize — PRD Addendum: Internal Communication Hub

**Date:** September 15, 2026
**Status:** Planning only. Nothing in this document has been built. No code changes accompany this addendum.
**Related docs:** Builds on top of `PRD-MOBILE-APP.md` (the Capacitor iOS/Android shell) — this feature is the reason that shell needs native push notification support.

---

## How to use this document

This captures the design decisions made while scoping a communication hub — a way for crew, Team Leads, and Ops/HQ to message each other and get pushed alerts, across both the web app and the native mobile app. It exists so the shape of the feature is settled *before* implementation starts. Nothing here is committed to code yet.

---

## 1. Goals & Non-Goals

**Goal:** Replace the current scattered, one-way communication (separate emails for time-off requests, shelf alerts, weekly digests, plus ad hoc texts/calls outside the system) with a single in-system channel that covers the three real communication relationships at TTT:

- Crew ↔ their Team Lead, per project
- Team Lead ↔ Ops/HQ (Manager/Admin), for escalations
- Ops/HQ → everyone or → a specific project's crew, for broadcasts

**Explicit non-goals for this phase:**
- Not building open peer-to-peer DMs between crew members. Every message is anchored to a project or is a company-wide broadcast.
- Not building a live-chat experience (typing indicators, instant delivery, read-while-typing). This is structured alerts with replies, refresh/poll-based.
- Not replacing phone calls for true emergencies — this is operational communication, not a 911 substitute.

---

## 2. Locked Design Decisions

| Decision | Choice | Why |
|---|---|---|
| Message scope | Project-anchored only, no open DMs | Every message has an obvious home; avoids becoming an unmoderated group chat |
| Real-time requirement | Structured alerts + replies, not live chat | Keeps this in Airtable with polling — no new real-time infra (Firestore/Supabase/Stream) needed |
| Urgency model | Three tiers: Urgent / Normal / FYI-Broadcast | Prevents notification fatigue — not everything should interrupt someone |
| Ops visibility | Ops does **not** passively watch every project thread | Dozens of active projects at once; Ops only gets pulled in when something is flagged Urgent |
| Broadcast rights | Team Lead → own crew only. Manager/Admin → company-wide | Matches existing role hierarchy (TTTStaff/TTTTeamLead/TTTManager/TTTAdmin) |
| Urgent accountability | Requires explicit acknowledgment, not just "push was sent" | Safety/client-escalation messages need to show who saw it and when, and stay open until acked |

---

## 3. Urgency Tiers

| Tier | Example | In-app | Push | Email fallback |
|---|---|---|---|---|
| **Urgent** | Client isn't home, safety issue, crew injury | Yes, flagged | Yes, immediately | Yes, if recipient has no active push target |
| **Normal** | Schedule question, client note, general update | Yes, badge count | No | No (digest only if unread after N hours — open decision, see OD-3) |
| **FYI / Broadcast** | Policy update, office closed Friday | Yes | No | No |

An Urgent message stays visible on the Ops "Open Issues" view until acknowledged by a Manager or Admin (any one of them — not all of them; matches the existing pattern where time-off notifications go to all active Managers/Admins and any one of them can act).

---

## 4. Data Model (proposed, not built)

**New Airtable table: `ProjectMessages`**

| Field | Type | Notes |
|---|---|---|
| TenantId | Link to Tenants | Or a sentinel value (`__broadcast__`) for company-wide messages |
| AuthorClerkId | Text | Who sent it |
| Body | Long text | |
| Timestamp | Date/time | |
| Urgency | Single select: Normal / Urgent / FYI | |
| AcknowledgedBy | Text (JSON array of clerkUserIds) or linked record | Only meaningful for Urgent |
| AcknowledgedAt | Date/time | |
| ParentMessageId | Text, optional | For threaded replies within a project's feed |

**New Airtable table: `PushTargets`** (only needed once Phase 2/3 — push — is built)

| Field | Type | Notes |
|---|---|---|
| ClerkUserId | Text | |
| Platform | Single select: ios / android / web | |
| Token | Text | APNs/FCM device token, or Web Push subscription JSON |
| DeviceLabel | Text | e.g. "iPhone — Matt" — helps staff manage their own registered devices |
| LastSeenAt | Date/time | For pruning stale tokens |
| IsActive | Checkbox | |

A person can have multiple active `PushTargets` rows (phone app + desktop browser). Dispatch fans out to all active targets for a recipient — duplicate delivery across devices is an acceptable tradeoff for an Urgent alert; missed delivery is not.

**Retention:** No separate retention policy needed — messages tied to a project naturally go quiet/archive when the project itself archives, consistent with existing `isArchived` conventions elsewhere in the schema.

---

## 5. Delivery: Web App vs. Mobile App

These are genuinely two different technical mechanisms, not one feature with two skins. Both need to work; neither is optional, since staff will use both depending on context (Ops at a desktop, crew on their phone).

### 5.1 Web App (desktop or mobile browser, not through the Capacitor shell)

- The in-app inbox and project threads work identically here — same Next.js pages, no extra work beyond building the feature once.
- No native push available in a plain browser tab. The only way to get a push-like alert to a browser user is the **Web Push API** (service worker + push subscription) — a separate mechanism from native app push, with its own registration flow and its own row in `PushTargets` (Platform = `web`).
- **Caveat worth flagging now:** Safari's Web Push support has historically been limited and version-dependent (desktop Safari since v16; iOS Safari requires the site be added to the home screen in some versions before push works at all). Any TTT staff using Safari without installing the mobile app may not reliably get push — this is a real gap, not a nice-to-have edge case, since it's the default browser on every iPhone.
- **Fallback for web-only users with no push target registered:** Urgent-tier messages email them instead, using the existing Resend infrastructure already in place for time-off notifications. Normal/FYI tiers have no fallback — those stay in-app only by design.

### 5.2 Mobile App (iOS/Android, through the Capacitor native shell)

- Same in-app inbox as the web app — it's the same website, loaded in the native webview (per the remote-URL architecture in `PRD-MOBILE-APP.md`).
- **Plus real native push**, which requires actual plumbing beyond a Capacitor config flip:
  - `@capacitor/push-notifications` plugin (not yet installed)
  - An APNs Auth Key for iOS — available once the Apple Developer Program enrollment (submitted, awaiting approval as of this writing) is active
  - Firebase Cloud Messaging (FCM) as the cross-platform dispatch layer — the common approach even for iOS-only, since it gives one unified server-side API instead of hand-rolling raw APNs HTTP/2 calls; free tier is sufficient at TTT's scale (~40 staff)
  - A backend route that decides when to fire a push (triggered on Urgent `ProjectMessages` inserts) and dispatches through FCM to every active `PushTargets` row for the recipient(s)
  - **Android specifically** needs `npx cap add android` completed first — not yet started per `PRD-MOBILE-APP.md`'s Phase 1 checklist, and needs its own FCM sender key config (Android's push path goes through FCM natively, unlike iOS which goes through APNs either directly or via FCM as a relay)
- Device token registration flow: on app launch (native only) after a successful sign-in, request push permission, receive a token from the OS, upsert it into `PushTargets` keyed by ClerkUserId + device.

---

## 6. Escalation & Recipient Logic

- **Normal-tier project message:** visible to the project's assigned crew + Team Lead only. Ops sees it only if they open that project's thread.
- **Urgent-tier project message:** same visibility, **plus** immediately surfaces on the company-wide "Open Issues" view for all active Managers/Admins, and triggers push to the project's Team Lead + all active Managers/Admins — mirroring the exact recipient logic already used for the time-off notification emails (`getStaffMembers().filter(s => s.isActive && (role === Manager || Admin))`), so this is extending an existing pattern rather than inventing a new one.
- **Broadcast (Team Lead → own crew):** visible only to staff currently assigned to that Team Lead's active project(s).
- **Broadcast (Manager/Admin → company-wide):** visible to all active TTT staff. Should respect the same suspended/deleted staff exclusion already built for the Ops area (`lib/staff-visibility.ts`) — a suspended staff member shouldn't receive company broadcasts any more than they should show up in AI Staff Mapping.

---

## 7. UI Surfaces (proposed)

- **Per-project thread:** a new section within each project's Plan page — matches how everything else (rooms, time entries, key dates) is already organized per-project.
- **Unified Inbox:** a single cross-project view, since a Team Lead running 3 projects needs one place to see what's new without checking three separate project pages. Likely lives as a new top-level nav item, mirroring `/staff`'s role in the Ops area.
- **Ops "Open Issues" dashboard:** lists every currently-unacknowledged Urgent message company-wide, who it's from, which project, how long it's been open. Clears an item once any Manager/Admin acknowledges it.

---

## 8. Rollout Phases

Deliberately sequenced so the expensive part (native push) isn't built before it's clear people will actually use the underlying feature.

**Phase A — Structured messaging, no push:**
- `ProjectMessages` table
- Per-project thread UI + unified inbox
- Urgency tiers, Ops escalation view, acknowledgment tracking
- Works identically on web and inside the mobile app webview (same website either way) — no native plugin work required
- Ships and gets used for a stretch before Phase B, to validate the model before investing in push infra

**Phase B — Native push (iOS, then Android):**
- Requires Apple Developer Program approved (Phase 0 of `PRD-MOBILE-APP.md`) and, for Android, `cap add android` completed
- `@capacitor/push-notifications` + FCM + `PushTargets` table + dispatch route
- Push fires only for Urgent-tier messages, per the tiering rule in §3

**Phase C — Web Push for browser-only users:**
- Service worker + Web Push API registration
- Lower priority than Phase B — most urgent field communication will come through the mobile app; this closes the gap for Ops staff who live in a desktop browser

**Phase D — Reassess open peer-to-peer chat:**
- Only if Phase A/B usage shows people actually want more than project-anchored structure allows. Not scoped further until then.

---

## 9. Open Decisions

These need input before implementation begins:

| # | Decision | Options | Impact |
|---|---|---|---|
| **OD-1** | Do existing one-way emails (time-off requests, shelf alerts) eventually route through this same system as system-generated messages? | Keep them as separate ad hoc emails / migrate them into `ProjectMessages` as system-authored entries | Doesn't block Phase A, but affects whether the data model should distinguish human vs. system-authored messages from day one |
| **OD-2** | Who exactly can acknowledge an Urgent message? | Any active Manager/Admin / must be the specific person addressed / the project's assigned Team Lead specifically | Ops dashboard UX, `AcknowledgedBy` semantics |
| **OD-3** | Does Normal-tier get a digest email if left unread for N hours? | No fallback ever / digest after 4h / digest after 24h | Whether Normal tier needs any email infra at all, or stays purely in-app |
| **OD-4** | Reply threading depth | Flat feed per project (no nested replies) / one level of threading via `ParentMessageId` | UI complexity, data model |
| **OD-5** | iOS Safari / web push gap | Accept the gap and push everyone toward installing the native app / invest in PWA installability prompts to unlock iOS web push | Whether Phase C is worth building at all for iOS web users specifically |
| **OD-6** | Message editing/deletion | Allowed within a time window / never editable (audit trail) | Matters more for Urgent messages where accountability is the point |

---
