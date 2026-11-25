# Community merge fields

`lib/communities/mergeFields.ts` turns a community and its contacts into
values for `{{tokens}}`, for future mover instructions, client and team
emails, and checklists. No email feature uses it yet.

## Calling it

```ts
import { resolveCommunityMergeData, renderTemplate, COMMUNITY_MERGE_TOKENS } from "@/lib/communities/mergeFields";

const data = await resolveCommunityMergeData(communityId); // server only
const { text, missing } = renderTemplate(template, data, { onMissing: "flag" });
if (missing.length) {
  // Warn the sender before it goes out, e.g. "Elevator Rules isn't known yet"
}
```

- `resolveCommunityMergeData(communityId)` loads the community and its active
  contacts and returns `Record<string, string>` for every token.
- `buildCommunityMergeData(community, contacts)` does the same from data you
  already have (pure; use it in tests or when merging many communities).
- `renderTemplate(template, data, { onMissing })`:
  - `"blank"`: tokens with no value become empty text.
  - `"flag"`: same text, plus `missing` lists every token that had no value,
    so an email builder can warn or block.
  - Tokens that don't exist are always reported in `missing`.
- `COMMUNITY_MERGE_TOKENS` lists every token with a label and description,
  for a future token picker.

Unknown rules (blank text, an "Unknown" COI, or marked "Ask community")
resolve to "" and never print the word "unknown". Rules marked not applicable
also resolve to "".

## Tokens

| Token | Value |
| --- | --- |
| `{{community.name}}` | Community name |
| `{{community.type}}` | Senior Living, CCRC, Condo / Association, Other |
| `{{community.operator}}` | Operator / management company |
| `{{community.address}}` | "Street, City, State ZIP" |
| `{{community.street}}`, `{{community.city}}`, `{{community.state}}`, `{{community.zip}}`, `{{community.website}}` | |
| `{{community.rules.checkin}}` | Check-in on Arrival |
| `{{community.rules.parking}}` | Truck Parking / Entrance |
| `{{community.rules.elevator}}` | Elevator Rules |
| `{{community.rules.move_hours}}` | Move Hours & Timing Limits |
| `{{community.rules.advance_notice}}` | Advance Notice / Reservation |
| `{{community.rules.coi_required}}` | Yes, No or Confirm Per Move ("" when unknown) |
| `{{community.rules.coi_details}}` | COI Details |
| `{{community.rules.apartment_access}}` | Apartment Access |
| `{{community.rules.trash}}` | Trash & Packing Materials |
| `{{community.rules.other}}` | Other Rules & Tips |
| `{{community.contacts.move_in.name}}`, `.first_name`, `.title`, `.email`, `.phone` | The contact marked Primary Move-In Contact |
| `{{community.contacts.primary.*}}` (same fields) | The Primary Move-In Contact, or the first contact listed when none is marked |
| `{{community.move_day_instructions}}` | Every known rule as "Label: value", one per line, in rule order |

`.phone` is the best number: Direct, then Mobile, Office, Main, Text, 24/7.

## Adding a token

Rule tokens come from `RULE_DEFINITIONS` automatically (`RULE_TOKEN` maps a
rule key to its token name). For anything else, add it to
`COMMUNITY_MERGE_TOKENS` and set it in `buildCommunityMergeData`; the unit
test "every registered token resolves" keeps the two in step.

## For a future email feature

1. Pick the community (e.g. from the project's destination community).
2. `resolveCommunityMergeData(id)` and `renderTemplate(..., { onMissing: "flag" })`.
3. Show the sender anything in `missing` ("Ask the community for: Elevator
   Rules, Move Hours") before sending.
4. Log what was sent in the email feature's own table; this module never
   sends or logs anything.
