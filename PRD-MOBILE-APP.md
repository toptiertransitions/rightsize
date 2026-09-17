# PRD — Rightsize Mobile App (Capacitor + GPS Check-In/Check-Out)
**Top Tier Transitions · Internal Platform Evolution**
**Status: Draft for Review · September 2026**

---

## Table of Contents

1. [Capacitor Wrapper Architecture](#1-capacitor-wrapper-architecture)
2. [Geolocation Check-In/Check-Out Feature](#2-geolocation-check-incheck-out-feature)
3. [Permission & Privacy Policy Requirements](#3-permission--privacy-policy-requirements)
4. [Data Model Integration](#4-data-model-integration)
5. [Rollout Plan & Risks](#5-rollout-plan--risks)
6. [Open Decisions](#6-open-decisions)

---

## 1. Capacitor Wrapper Architecture

### 1.1 Remote URL Mode — How It Works

Capacitor supports a `server.url` configuration that instructs the native WebView to load a remote URL instead of bundled static files. The entire app is served from Vercel at `https://app.toptiertransitions.com` — the native shell is a thin container that adds native plugin bridges (geolocation, etc.) on top of the existing web app.

**What this means in practice:**
- Every web app update deployed to Vercel is live in the mobile app immediately, with zero App Store release cycle
- Only changes that add, remove, or reconfigure native plugins require a new binary submission to the stores
- The native builds (ios/ and android/) are rebuilt and resubmitted only for: native plugin changes, app icon/splash updates, or OS-level permission changes

**`capacitor.config.ts`:**
```typescript
import { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.toptiertransitions.rightsize",
  appName: "Rightsize by TTT",
  webDir: "out",                          // Required by Capacitor CLI, but unused in remote mode
  server: {
    url: "https://app.toptiertransitions.com",
    cleartext: false,                     // HTTPS only — never allow HTTP
    allowNavigation: [
      "app.toptiertransitions.com",
      "*.clerk.accounts.dev",             // Clerk auth endpoints
      "accounts.google.com",              // If Google OAuth is added later
    ],
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: "#2d4a3e",
      showSpinner: false,
    },
    StatusBar: {
      style: "Light",
      backgroundColor: "#2d4a3e",
    },
  },
};

export default config;
```

### 1.2 Clerk Auth in a WebView

Clerk's standard `@clerk/nextjs` setup uses HTTP-only cookies for session persistence. This works in Capacitor's WKWebView (iOS) and Android WebView without modification because both support cookie storage. However, three specific areas require attention:

**Session persistence:**
- The WebView maintains its own cookie jar. Once a user signs in, the session persists across app restarts exactly as in a browser.
- `SameSite=Lax` cookies work correctly in WKWebView. No changes to Clerk configuration needed.
- On iOS, clearing app data via Settings → [App] → Clear Cache will destroy the session. This is expected behavior.

**Auth redirect URLs:**
- Clerk requires redirect URLs to be whitelisted in the Clerk Dashboard.
- Add `com.toptiertransitions.rightsize://` as an allowed redirect URL in Clerk Dashboard → Paths → Allowed Redirect URLs.
- In `capacitor.config.ts` above, `allowNavigation` already includes Clerk's domain.

**OAuth popups (Google/Apple Sign-In, if ever added):**
- Clerk's `<SignIn>` component uses in-page redirects, not popups, for OAuth flows — this is safe in a WebView.
- If Clerk is ever configured to use popup windows for OAuth, install `@capacitor/browser` and configure Clerk to use it. Currently not needed since TTT uses email/password or magic link.
- Social providers that open external browser tabs (e.g., via `window.open`) will fail silently in a WebView. If social login is added, route it through `@capacitor/browser` and `app-scheme://auth/callback`.

**Sign-out:**
- Clerk's `signOut()` call clears the cookie. Works identically in WebView.

**Offline / error states:**
- When the device is offline and the WebView cannot load `app.toptiertransitions.com`, Capacitor shows a blank screen by default.
- Recommended: add a native offline fallback page. In `AppDelegate.swift` / `MainActivity.java`, detect load failures and inject a minimal HTML "No connection" screen.
- Alternatively, configure a Capacitor plugin like `@capacitor/network` to detect connectivity and display a native alert before the WebView attempts to load.

### 1.3 Native Project Structure

Running `npx cap init && npx cap add ios && npx cap add android` creates:

```
rightsize/
├── ios/                     # Xcode project — commit to version control
│   ├── App/
│   │   ├── App/
│   │   │   ├── AppDelegate.swift
│   │   │   ├── Info.plist   # ← Permission strings live here
│   │   │   └── Assets.xcassets/   # App icons, launch screen
│   │   └── App.xcworkspace
│   └── Podfile              # CocoaPods dependencies
├── android/                 # Android Studio project — commit to version control
│   ├── app/
│   │   ├── src/main/
│   │   │   ├── AndroidManifest.xml   # ← Permissions live here
│   │   │   └── res/
│   │   │       ├── drawable/         # Icons, splash
│   │   │       └── values/
│   │   └── build.gradle
│   └── build.gradle
├── capacitor.config.ts      # Commit
├── package.json             # Already exists
└── ... (existing Next.js files)
```

**Version control:**
| Commit | .gitignore |
|---|---|
| `ios/` entire directory | `ios/Pods/` (CocoaPods cache, ~200 MB) |
| `android/` entire directory | `android/.gradle/`, `android/build/` |
| `capacitor.config.ts` | — |
| `ios/App/App/GoogleService-Info.plist` if added | — |

Add to `.gitignore`:
```
ios/Pods/
android/.gradle/
android/build/
android/app/build/
*.ipa
*.apk
*.aab
```

### 1.4 What Changes vs. Does Not Change in Next.js

**Does NOT change:**
- All Next.js pages, API routes, components, Airtable calls, Clerk middleware, Tailwind styles
- Vercel deployment pipeline — `git push` deploys exactly as today
- Web app at `app.toptiertransitions.com` — unaffected
- TypeScript, ESLint, build configuration

**Does change:**
- `capacitor.config.ts` is added at repo root
- `package.json` gains Capacitor dependencies and a `cap sync` script
- The new geolocation service (section 2) adds a thin client-side module that detects whether Capacitor native plugins are available and falls back to the browser Geolocation API on web

**How to detect native vs. web at runtime:**
```typescript
import { Capacitor } from "@capacitor/core";

export const isNativeApp = Capacitor.isNativePlatform(); // true on iOS/Android, false on web
export const platform = Capacitor.getPlatform();         // "ios" | "android" | "web"
```

Use this to conditionally render the GPS check-in control on the Home tab only when running natively.

### 1.5 App Icons, Splash Screens, Safe Areas, Status Bar

**Icons:**
- Required sizes vary by platform; use a 1024×1024 master PNG and generate all sizes with `@capacitor/assets` (`npx @capacitor/assets generate`)
- App icon should match the Rightsize/TTT brand (forest green `#2d4a3e` background, wordmark or icon)

**Splash screen:**
- Use `@capacitor/splash-screen`. Configured in `capacitor.config.ts` (see 1.1 above)
- Show immediately on launch, hide when the WebView finishes loading (`SplashScreen.hide()` called from the web app after the page is interactive)

**Safe areas:**
- iOS notch / Dynamic Island: add `viewport-fit=cover` to the `<meta name="viewport">` tag in `layout.tsx`, then use CSS `env(safe-area-inset-*)` for any fixed headers/footers on the Home tab
- The existing Tailwind layout likely needs `pt-safe` / `pb-safe` utility classes added to nav bars — minimal change, affects ~2–3 layout components

**Status bar:**
- `@capacitor/status-bar` is already referenced in `capacitor.config.ts` above
- Set to `Light` style (white icons) on the forest-green `#2d4a3e` background

---

## 2. Geolocation Check-In/Check-Out Feature

### 2.1 Foreground vs. Background Location

| | Foreground (While In Use) | Background |
|---|---|---|
| **Trigger** | App is open on screen | App minimized or screen off |
| **iOS permission** | `When In Use` | `Always` (two-step prompt) |
| **Android permission** | `ACCESS_FINE_LOCATION` | + `ACCESS_BACKGROUND_LOCATION` |
| **App Store scrutiny** | Low | High — requires written justification |
| **Play Store scrutiny** | Low | High — separate declaration form |
| **Battery impact** | Minimal | Moderate (configurable) |
| **Use case** | Point-in-time check-in/check-out tap | Continuous shift tracking, travel time capture |

**Recommended initial scope:** implement background tracking. The core value proposition — GPS-verified travel time and on-site time — requires it. Foreground-only degrades to "user taps check-in button" which adds little over today's manual flow.

### 2.2 Plugin Recommendation

**Three options evaluated:**

| Plugin | License | Background iOS | Background Android | Maintenance | Notes |
|---|---|---|---|---|---|
| `@capacitor/geolocation` | Free / Apache 2 | No | No | Capacitor core team | Foreground only. Not sufficient. |
| `@capacitor-community/background-geolocation` | Free / MIT | Yes | Yes | Community (sporadic) | Works but unreliable in production; limited config; not suitable for payroll-grade accuracy |
| `@transistorsoft/capacitor-background-geolocation` | $149/app (one-time) | Yes | Yes | Commercial (active) | Industry standard; used by fleet/employee tracking apps; iOS silent push heartbeat; configurable distanceFilter, geofencing, accuracy modes, foreground service notification |

**Recommendation: `@transistorsoft/capacitor-background-geolocation`**

Rationale: GPS data here feeds payroll calculations and shift verification. A dropped check-in event or missed background update has a direct dollar cost (incorrect hours, a staff dispute). The $149 license cost is negligible against that risk. The plugin handles the iOS background fetch / significant-change monitoring correctly, manages Android foreground service lifecycle automatically, and has a documented compliance mode specifically for employee time-and-attendance apps.

Community plugin is fine for prototype but not for production payroll.

### 2.3 iOS Background Location Specifics

**Info.plist additions** (in `ios/App/App/Info.plist`):
```xml
<key>NSLocationWhenInUseUsageDescription</key>
<string>Rightsize uses your location when the app is open to verify your check-in at the project site.</string>

<key>NSLocationAlwaysAndWhenInUseUsageDescription</key>
<string>Rightsize uses your location in the background to accurately track your travel time and on-site hours during an active shift, so your pay records are accurate without manual entry.</string>

<key>NSLocationAlwaysUsageDescription</key>
<string>Rightsize uses your location in the background to track shift time and travel. This is required for accurate payroll.</string>

<key>UIBackgroundModes</key>
<array>
  <string>location</string>
  <string>fetch</string>
</array>
```

**iOS two-step permission flow:**
- iOS always prompts "When In Use" first, then shows a separate "Upgrade to Always" prompt
- The Transistor plugin handles the two-step upgrade automatically
- Do NOT request `Always` upfront — Apple rejects this. The plugin asks "When In Use" first and upgrades when a shift begins

### 2.4 Android Background Location Specifics

**AndroidManifest.xml additions:**
```xml
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<!-- Required for background tracking on Android 10+ (API 29+) -->
<uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />
<!-- Required for foreground service (keeps GPS alive when app is backgrounded) -->
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION" />
```

**Android 10+ (API 29+) background location:**
- System shows a separate permission dialog: "Allow [App] to access location all the time?" — user must select "Allow all the time", not just "While using"
- Android 11+ requires the user to go to Settings to grant "Allow all the time" — the in-app dialog cannot take them there directly. The Transistor plugin shows appropriate guidance text.
- A persistent foreground service notification is required while background tracking is active. Configure it to say "TTT Rightsize — Shift in progress" so staff understand it.

### 2.5 UX on the Home Tab

**Principle:** GPS check-in/check-out is an upgrade to the existing flow, not a replacement. The existing time-entry form stays intact. On native, a "Check In" button appears above or alongside the existing log entry area. On web, nothing changes.

**States on the Home tab (native only):**

```
┌─────────────────────────────────────┐
│  Today at [Project Name]            │
│  123 Main St, Springfield           │
│                                     │
│  ◉ GPS: 42 ft from site ✓          │  ← live proximity indicator
│                                     │
│  [  CHECK IN  ]                     │  ← large tap target, green
│                                     │
│  ─────── or log manually ─────────  │
│  [existing time entry form]         │
└─────────────────────────────────────┘

After check-in:

┌─────────────────────────────────────┐
│  ● Shift in progress — 1h 23m       │
│  Checked in 9:14 AM                 │
│  📍 Verified at site                │
│                                     │
│  [  CHECK OUT  ]                    │  ← red
└─────────────────────────────────────┘
```

**Radius validation:**
- On check-in tap: compare device GPS coordinates to the project's address (geocoded once and stored with the project record)
- Suggested radius: 300 ft (91 m) for dense suburban/urban job sites; configurable per-project by TTT Admin
- If outside radius: show "You appear to be X ft from [address]. Check in anyway?" — do not hard-block, just flag
- GPS accuracy reading (from `accuracy` field in the location object) is stored with the event. If accuracy > 150 m, show "GPS signal is weak — your check-in location may be approximate"

**Permission denied / downgraded mid-shift:**
- On launch: if location permission is `denied`, show a non-blocking banner: "Enable location to use GPS check-in. You can still log time manually."
- If permission is downgraded mid-shift (user went to Settings and changed it): the background service stops sending updates. On next foreground: show "Location permission was changed — your shift time was partially captured. Please verify your hours."
- Manual entry fallback is always available — GPS check-in is never the only path

**Travel time capture:**
- Background location events during the window between "previous check-out" and "current check-in" can be used to calculate actual travel miles/minutes
- This auto-populates `travelMiles` and `travelMinutes` on the time entry, replacing manual estimation
- Staff see a "Travel captured: 12 mi, 23 min" confirmation on check-in

### 2.6 Battery and Reliability Considerations

**Transistor plugin configuration for employee time-tracking (balanced mode):**
```typescript
BackgroundGeolocation.ready({
  desiredAccuracy: BackgroundGeolocation.DESIRED_ACCURACY_HIGH,
  distanceFilter: 50,           // meters — only record if moved 50m (saves battery)
  stopTimeout: 5,               // minutes idle before stopping
  debug: false,
  logLevel: BackgroundGeolocation.LOG_LEVEL_VERBOSE,  // dev only
  stopOnTerminate: false,       // continue tracking if app is force-quit (Android)
  startOnBoot: false,           // do not auto-start on device reboot
  heartbeatInterval: 120,       // seconds — iOS heartbeat (keeps process alive)
  preventSuspend: false,        // do not prevent iOS sleep (battery drain)
});
```

**Battery impact estimate:**
- Continuous GPS (high accuracy, no distanceFilter): ~15–20% battery drain per hour
- With `distanceFilter: 50m`: ~3–6% per hour for typical job-site work (mostly stationary)
- Significant-location-change only: ~0.5–1% per hour but impractical for travel tracking

**Reliability edge cases:**
- Tunnel/indoor/basement: GPS accuracy degrades. Store `accuracy` on each event and flag low-accuracy records in the Admin view.
- Device reboot mid-shift: Transistor's `startOnBoot: false` means tracking stops. The foreground notification and app re-open restore it. Consider setting `startOnBoot: true` with a guard that only resumes if there is an open (un-checked-out) shift for this user.
- Background app refresh disabled by user: on iOS this also disables background location outside of `Always` permission. The `UIBackgroundModes: location` entry bypasses this restriction for location specifically.

---

## 3. Permission & Privacy Policy Requirements

### 3.1 Apple App Store

**App Store Review Guideline 5.1.1 — Location:**
> Apps that collect continuous location data in the background must clearly explain the benefit to users. Apps whose use case does not require background location will be rejected.

**What Apple requires for background location approval:**
1. `NSLocationAlwaysAndWhenInUseUsageDescription` must explain the specific benefit ("accurate payroll") — not a generic "for better experience"
2. A runtime prompt upgrade: request `WhenInUse` first, upgrade to `Always` only when a shift is started
3. The in-app UI must show users when background location is active (the Transistor foreground notification satisfies this)
4. The App Store Connect Privacy Nutrition Label must declare: **Location > Precise Location > Used for App Functionality > Linked to User Identity**

**What Apple commonly rejects for:**
- Requesting `Always` permission before the user engages with the feature
- Purpose strings that are vague or copied from templates
- No visible indicator that background tracking is active
- Tracking location when no shift is in progress (i.e., 24/7 always-on tracking)

**Mitigation:** Background tracking is ONLY active during an open shift (after Check In, before Check Out). Tracking is explicitly started by the user and shown via a persistent notification. This is the approved employee time-tracking pattern.

**App Privacy Nutrition Label declarations (App Store Connect):**
| Data type | Collected | Linked to identity | Used for tracking |
|---|---|---|---|
| Precise Location | Yes | Yes | No |
| Coarse Location | Yes | Yes | No |
| User ID | Yes | Yes | No |
| Name | Yes | Yes | No |

### 3.2 Google Play Store

**Background Location policy:**
Google Play requires apps that use `ACCESS_BACKGROUND_LOCATION` to:
1. Submit a **Background Location Permission Declaration form** in Play Console explaining why background location is needed
2. Show a **prominent in-app disclosure** before requesting background location permission — a separate dialog or screen that reads (verbatim per policy): "This app collects location data to [reason] even when the app is closed or not in use."

**Employee time-and-attendance apps are an explicitly approved use case.** Google Play's policy lists "employee time and attendance tracking" as a permitted use for background location. In the declaration form, state:
> "Rightsize is an internal enterprise tool used exclusively by employees of Top Tier Transitions (a senior move management company). Background location is collected only during an active employee shift — initiated by the employee via Check In and terminated by Check Out. Location data is used to verify on-site time and auto-calculate travel mileage for bi-weekly payroll processing. No location data is shared with third parties or used for advertising."

**Play Console Data Safety form:**
| Field | Answer |
|---|---|
| Location data collected | Precise location |
| Is location shared with third parties | No |
| Is location used for advertising | No |
| Can users request data deletion | Yes (via Admin) |
| Data encrypted in transit | Yes |

**What Play reviewers reject for:**
- Generic disclosure text ("we use your location to improve your experience")
- Background location active outside a declared, reviewable use case
- No in-app disclosure shown before the permission request

### 3.3 Privacy Policy Requirements

The existing TTT privacy policy (or a new in-app policy linked from the app) must state:

**Required language covering:**

1. **What is collected:** Precise GPS coordinates, timestamps, and accuracy readings during active employee shifts only.
2. **Who it applies to:** TTT employees using the Rightsize mobile app. Not clients, partners, or visitors.
3. **When collection occurs:** Only during a shift explicitly started by the employee (Check In) and ending when the employee checks out or ends the shift. Location is never collected outside of active shifts.
4. **How it is stored:** Encrypted in transit via HTTPS. Stored in Airtable (US-based). Retained for [X] months / indefinitely for payroll audit purposes — **open decision, see section 6.**
5. **Who has access:** TTT Admins and Managers can view GPS-verified check-in records. Other staff can see only their own records. Clients and Partners cannot see any GPS data.
6. **Third parties:** Location data is not sold, shared with advertisers, or transmitted to any third party other than Airtable (data storage) and Vercel (compute).
7. **Employee rights:** Employees can request a copy of their location history or request deletion of historical records by contacting [admin email].

### 3.4 Employee Notice & Consent Considerations

> **Disclaimer:** This is informational, not legal advice. Consult an attorney before deploying employee location tracking.

**Key state-level considerations worth flagging:**

| State | Requirement |
|---|---|
| California | California Labor Code requires employers to notify employees in writing of electronic monitoring. GPS tracking of employees requires prior written notice under some interpretations of Cal. Penal Code 637.7 for non-commercial vehicles. |
| Illinois | Biometric Information Privacy Act (BIPA) does not cover GPS, but Illinois courts have broad employee privacy interpretations. Written consent recommended. |
| New York | NYC Local Law 1894-A (effective 2022) requires written notice of electronic monitoring at hiring and annually. Applies to any electronic device including phones. |
| Texas, Florida, most others | No specific employee GPS law; general consent and notice recommended as best practice. |

**Recommended action regardless of state:** Have employees sign an acknowledgment (digital, stored in Airtable against their staff record) that states: "I understand that the Rightsize mobile app collects my GPS location during active shifts for the purpose of verifying on-site hours and calculating travel time for payroll. I can log time manually if I choose not to use the GPS check-in feature."

A checkbox in the app during first launch ("I agree to GPS-based shift tracking for payroll purposes") satisfies disclosure in most jurisdictions.

---

## 4. Data Model Integration

### 4.1 Existing TimeEntry Schema (Do Not Break)

Current `TimeEntry` Airtable fields consumed by Home tab, Plan tab, and Pay tab:

```
ClerkUserId       string    Staff member identifier
TenantId          string    Project identifier
StaffName         string    Display name
ProjectName       string    Display name
Date              YYYY-MM-DD
StartTime         HH:MM (24h)
EndTime           HH:MM (24h)
DurationMinutes   number
FocusArea         string    Service type
TravelMiles       number?   Manual entry today
TravelMinutes     number?   Manual entry today
Notes             string?
NonBillable       boolean?
CreatedAt         ISO string
HoursPaidAt       ISO date? — set by Admin on Pay tab
MileagePaidAt     ISO date? — set by Admin on Pay tab
TravelPaidAt      ISO date? — set by Admin on Pay tab
```

All of these remain untouched. GPS data is additive.

### 4.2 Proposed: New `CheckInEvents` Airtable Table

Store raw GPS events in a separate table. This is the source-of-truth for GPS data and allows replay/audit without polluting the time entry record.

**Table name:** `CheckInEvents`

| Field | Type | Description |
|---|---|---|
| `ClerkUserId` | Single line | Staff member |
| `TenantId` | Single line | Project |
| `TimeEntryId` | Single line | Airtable record ID of the linked TimeEntry (nullable until check-out creates the entry) |
| `EventType` | Single select | `CheckIn`, `CheckOut`, `Heartbeat`, `TravelStart`, `TravelEnd` |
| `Timestamp` | ISO 8601 string | Device-reported UTC time |
| `Latitude` | Number | Decimal degrees |
| `Longitude` | Number | Decimal degrees |
| `AccuracyMeters` | Number | GPS accuracy radius — low values = high accuracy |
| `DistanceFromSite` | Number | Meters from project address at time of event |
| `WithinRadius` | Checkbox | Was device within the configured check-in radius? |
| `DevicePlatform` | Single select | `ios`, `android` |
| `AppVersion` | Single line | For debugging |
| `CreatedAt` | ISO 8601 string | Server-receipt time |

### 4.3 Proposed: Additive GPS Fields on Existing TimeEntry

Add these fields to the existing `TimeEntry` Airtable table. All are nullable — existing records without GPS data are unaffected.

| New Field | Type | Description |
|---|---|---|
| `GpsCheckInEventId` | Single line | `CheckInEvents` record ID for check-in |
| `GpsCheckOutEventId` | Single line | `CheckInEvents` record ID for check-out |
| `GpsCheckInAt` | DateTime | Timestamp of GPS check-in |
| `GpsCheckOutAt` | DateTime | Timestamp of GPS check-out |
| `GpsTravelMiles` | Number | GPS-derived travel distance (replaces/supplements `TravelMiles`) |
| `GpsTravelMinutes` | Number | GPS-derived travel time (replaces/supplements `TravelMinutes`) |
| `GpsDurationMinutes` | Number | GPS-derived on-site duration (audit vs. `DurationMinutes`) |
| `GpsVerified` | Checkbox | Both check-in AND check-out captured with adequate accuracy |
| `GpsMismatch` | Checkbox | `DurationMinutes` differs from `GpsDurationMinutes` by > 10 min |

### 4.4 How GPS Integrates with Existing Time Logging

**The mental model: GPS is a verification layer, not a replacement.**

```
TODAY (web + native):
  Staff manually fills StartTime, EndTime, TravelMiles, TravelMinutes → TimeEntry created

AFTER IMPLEMENTATION (native only):
  Staff taps Check In → CheckInEvent(CheckIn) created
  Background tracking runs during shift
  Staff taps Check Out →
    - CheckInEvent(CheckOut) created
    - GPS travel stats calculated from heartbeat events
    - TimeEntry created with:
        StartTime / EndTime = from GPS timestamps (pre-filled, editable)
        TravelMiles = GpsTravelMiles (pre-filled, editable)
        TravelMinutes = GpsTravelMinutes (pre-filled, editable)
        GpsVerified = true
        GpsCheckInEventId / GpsCheckOutEventId = linked
  Staff reviews pre-filled entry, adjusts if needed, taps Save
```

**Key principle confirmed:** Hours and travel time continue to be logged from the Home tab exactly as today. GPS pre-fills the fields to save time and adds verification — staff can still adjust before saving. The Pay tab reads `TravelMiles`, `TravelMinutes`, and `DurationMinutes` exactly as today; `GpsMismatch` is surfaced to Admins as an optional audit flag, not a blocker.

**Web users (no Capacitor):** Check-in/Check-out controls do not appear. Manual entry continues unchanged. Entries created on web have no GPS fields set — this is valid and backward-compatible.

### 4.5 Role-Based Access to GPS Data

| Role | Can see GPS data |
|---|---|
| TTT Staff (own records) | Yes — sees "GPS verified" badge on their own entries |
| TTT Staff (others' records) | No |
| TTT Team Lead | Yes — sees GPS-verified badge on project entries |
| TTT Manager | Yes — sees GPS-verified badge + mismatch flags |
| TTT Admin | Full — sees raw lat/long, mismatch flags, manual-override log |
| Owner / Collaborator (client) | No — GPS data is never surfaced on the client portal |
| Partner | No |

The `GpsMismatch` flag in the Admin Pay tab view is the primary Admin-facing output: a yellow indicator on time entries where the GPS duration differs from logged duration by more than a configurable threshold (default: 15 minutes).

### 4.6 New API Routes Required

| Route | Method | Auth | Purpose |
|---|---|---|---|
| `/api/time/checkin` | POST | TTT Staff+ | Create CheckInEvent(CheckIn), begin background tracking token |
| `/api/time/checkout` | POST | TTT Staff+ | Create CheckInEvent(CheckOut), calculate GPS stats, create/pre-fill TimeEntry |
| `/api/time/heartbeat` | POST | TTT Staff+ | Store periodic location update during shift |
| `/api/time/checkin-events` | GET | TTT Manager+ | Fetch CheckInEvents for a date range / staff member |

These are thin Airtable-write routes matching the existing pattern in the codebase (`raw fetch`, no ORM, same auth middleware).

---

## 5. Rollout Plan & Risks

### 5.1 Order of Operations — Prerequisites Before First Build

**Phase 0 — Accounts & Certificates (blocking):**
- [x] Apple Developer Program account — **Active. Organization (Top Tier Transitions) confirmed selectable as a real Team in Xcode's Signing & Capabilities.**
- [ ] Google Play Console account active (25 USD one-time)
- [x] Xcode installed and Command Line Tools configured on dev Mac
- [ ] Android Studio installed with Android SDK 34 (API 34 / Android 14)
- [x] `npx cap doctor` passes on dev machine

**Phase 1 — Capacitor shell (no GPS yet):**
- [x] `npm install @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android`
- [x] `npx cap init` + `npx cap add ios` — done. `npx cap add android` — not started
- [x] Set `server.url` to production Vercel URL in `capacitor.config.ts`
- [~] Verify Clerk sign-in works inside the simulator (iOS) and emulator (Android) — **iOS: email-code/password sign-in confirmed working; Google OAuth does NOT work in the embedded WebView (Google blocks embedded-WebView OAuth) — hidden on native for now, native system-browser OAuth is a separate deferred task. Android: not started.**
- [x] Verify all existing routes work — Home, Plan, Catalog, CRM — **confirmed working in iOS simulator 2026-09-16**
- [~] Configure app icons and splash screen — **iOS done (TTT house/hands mark, brand green). Android not started.**
- [x] Add safe-area CSS tweaks (`env(safe-area-inset-*)`) to main layout
- [ ] First TestFlight build distributed to TTT team for smoke testing — **unblocked; next milestone, see plan below**

**Phase 2 — GPS Check-In (foreground first, background second):**
- [ ] Airtable: add `CheckInEvents` table + GPS fields to `TimeEntry` (schema change, no data migration needed)
- [ ] Install Transistor `@transistorsoft/capacitor-background-geolocation`
- [ ] Add `NSLocation*` strings to Info.plist, background location permissions to AndroidManifest
- [ ] Implement foreground-only check-in (tap → record point-in-time → creates TimeEntry) first
- [ ] Ship foreground version via TestFlight / internal Play track for validation
- [ ] Add background tracking + travel calculation
- [ ] Second TestFlight / internal Play track with background GPS
- [ ] In-app first-run consent screen added

**Phase 3 — Store Submission:**
- [ ] Privacy policy updated (section 3.3)
- [ ] Employee consent workflow added
- [ ] App Store Connect: complete Privacy Nutrition Label
- [ ] Play Console: complete Data Safety form + Background Location Declaration form
- [ ] Apple App Review submission — expect 1–3 day review, possible clarification request on background location purpose
- [ ] Google Play submission — expect 3–7 day review for new app with background location

### 5.2 App Store / Play Store Rejection Risks

**Highest-risk rejection reasons and mitigations:**

| Risk | Platform | Likelihood | Mitigation |
|---|---|---|---|
| Background location purpose rejected as insufficient | iOS | Medium | Purpose strings must explicitly say "payroll" and "shift verification" — not generic. Show Apple the in-app shift-active notification. |
| Requesting `Always` permission too early | iOS | High if not handled | Use the Transistor plugin's built-in two-step flow — never request `Always` on first launch. |
| Missing prominent disclosure for background location | Android | High if not added | Must show the verbatim disclosure dialog before requesting `ACCESS_BACKGROUND_LOCATION`. Transistor plugin can be configured to show this. |
| App rejected as "not primarily for employees" | Android | Low | The app is behind Clerk auth with invitation-only staff roles. No public sign-up. Make this clear in the Play Console listing description. |
| Metadata mismatch (app does X, privacy label says Y) | Both | Medium | Declare location precisely. GPS data linked to user identity is the most sensitive declaration — declare it, don't minimize. |

### 5.3 Fallback Plan — If Background Location Is Rejected

Background location approval is not guaranteed on first submission. A graceful degradation path is built into the design:

**Foreground-only fallback (no code change to web, no separate codebase):**
- Disable the Transistor plugin's background mode via config flag (`stopOnTerminate: true`, remove `UIBackgroundModes: location` from Info.plist for the fallback build)
- GPS check-in/check-out still works: staff tap Check In → GPS point captured → tap Check Out → GPS point captured → delta = rough on-site duration
- Travel miles/minutes are NOT auto-calculated (no background heartbeats between jobs) — staff enters travel manually as today
- The time entry is still GPS-verified for on-site presence (geofence check at check-in and check-out), just not enriched with travel data

This foreground-only mode delivers ~70% of the value with zero approval risk. Ship it first, add background tracking in v1.1 after initial review relationship is established with Apple/Google.

**The fallback requires zero changes to web app or data model.** The same `CheckInEvents` table and GPS fields on `TimeEntry` are used; they just have a CheckIn and CheckOut event and no Heartbeat events in between.

---

## 6. Open Decisions

These require input before implementation begins:

| # | Decision | Options | Impact |
|---|---|---|---|
| **OD-1** | GPS location retention period | 6 months / 12 months / indefinitely / until payroll processed | Privacy policy language, Airtable storage cost, employee consent wording |
| **OD-2** | Check-in radius per project | Single global value (300 ft) / configurable per project by Admin | Admin UI complexity; if per-project, need a radius field on the tenant/project record |
| **OD-3** | What happens when GPS mismatch exceeds threshold | Flag for Admin review only / require staff note / auto-hold pay entry | Pay tab UX changes, potential staff friction |
| **OD-4** | Employee consent mechanism | In-app first-run checkbox / separate paper/DocuSign / email acknowledgment | Legal, timing before rollout |
| **OD-5** | App name and bundle ID | "Rightsize by TTT" / "Top Tier Rightsize" / other | Needs to be decided before first App Store Connect app record is created |
| **OD-6** | Initial rollout scope | All TTT staff simultaneously / pilot with one team / iOS only first | Store review timeline planning |
| **OD-7** | `startOnBoot` behavior | True (resume tracking if device reboots mid-shift) / False (require manual reopen) | Complexity, Play Store foreground service behavior |
| **OD-8** | Client/Partner-facing impact | Confirm: no GPS data ever surfaced in client portal | Scope boundary confirmation |

---

*End of PRD — v1.0 Draft*
