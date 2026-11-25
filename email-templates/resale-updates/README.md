# Resale update emails

Four emails for clients whose items are still selling after hands-on work ends.
These files hold the client-facing content only. The internal review banner
(project, client, trigger, data flags) is added by the sending system, not in
these files.

Each file is email markup only (no `<html>`, `<head>` or `<body>`). The first
line is an HTML comment with the subject and send timing.

## Emails

| File | Subject | Sends |
| --- | --- | --- |
| `01-hands-on-complete.html` | Your move is wrapped. Here's what's next for your items | When the full invoice is sent to the client |
| `02-day-30-update.html` | 30-day update on your items | Anchor date + 30 days |
| `03-day-60-update.html` | 60-day update and the plan for your remaining items | Anchor date + 60 days |
| `04-day-90-window-closed.html` | Your sale window has closed: final numbers and next steps | Anchor date + 90 days |

Anchor date: the earliest delivery date among the project's ProFound Finds
Consignment items with status Listed, locked the first time it is computed.

## Merge fields

Written as `{{field}}` in the files.

| Field | Meaning |
| --- | --- |
| `contact_first_name` | Client contact's first name |
| `pc_first_name` | Signature name: always "The Top Tier Team" |
| `listed_count` | Items currently Listed on the project |
| `sales_channels` | Where items are selling, e.g. "ProFound Finds, Facebook Marketplace, and eBay" |
| `sales_page_link` | The client's Rightsize sales page for the project (every button) |
| `day30_date` | Anchor + 30 days, e.g. "January 8" |
| `day60_date` | Anchor + 60 days |
| `window_end_date` | Anchor + 90 days |
| `disposition_deadline` | Window end minus 7 days |
| `blank_count` | Unsold items with no Donate or Return choice |
| `donate_count` | Unsold items marked Donate |
| `return_count` | Unsold items marked Return |
| `sold_since_last` | Items sold since the previous email in the sequence |
| `sold_total_count` | Items sold on the project |
| `sold_total_amount` | Total sales, formatted as currency |
| `proceeds_to_date` | Client's share of sales, formatted as currency |
| `payout_method` | Used only in IF conditions, never printed |

## IF blocks

Written as `<!--IF condition--> ... <!--END IF-->`. Blocks are not nested.
The sending system keeps or removes each block, then strips the comments.

| Condition | Emails | What it wraps |
| --- | --- | --- |
| `blank_count > 0` | 01 | "One quick ask" callout |
| `blank_count > 0` | 02 | "A quick reminder" callout |
| `blank_count > 0` | 03 | "items have no choice marked" row in the info list |
| `payout_method is blank` | 01 | "And one more" callout |
| `payout_method is blank` | 04 | "One last question" callout |
| `sold_since_last > 0` | 02, 03 | "Good news!" paragraph |
| `sold_since_last = 0` | 02, 03 | "Nothing new has sold" paragraph |
| `return_count > 0` | 03 | "items will be returned to you" row in the info list |
| `return_count > 0` | 04 | "Returns" row in the info list |
