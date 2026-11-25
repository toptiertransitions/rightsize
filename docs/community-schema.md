# Community Details: Airtable schema

Three new tables in the Rightsize base. Nothing else in the base is read or
changed by this feature. Create them with:

```sh
set -a; source .env.local; set +a
npx tsx scripts/community/create-airtable-tables.ts
```

The script is idempotent (it adds only missing tables and fields). Table
names can be overridden with `AIRTABLE_COMMUNITIES_TABLE`,
`AIRTABLE_COMMUNITY_CONTACTS_TABLE` and `AIRTABLE_COMMUNITY_ACTIVITY_TABLE`.
If a table is missing, the API answers 503 with "Communities aren't set up in
Airtable yet" and logs which table to create.

Nothing is hard-deleted from the UI: communities and contacts are archived.

## Communities

| Field | Type | Notes |
| --- | --- | --- |
| Name | Single line text (primary) | Required. The UI warns on near-duplicates by normalized name or address. |
| Type | Single select | Senior Living, CCRC, Condo / Association, Other |
| Operator / Management Company | Single line text | e.g. Senior Lifestyle, FirstService Residential |
| Street Address | Single line text | |
| City | Single line text | |
| State | Single line text | Defaults to IL |
| ZIP | Single line text | |
| Website | URL | Optional |
| Linked Company Record ID | Single line text | Optional ID of a CRM referral company (CRMReferralCompanies). Stored only; that table is never written to. |
| Status | Single select | Active, Prospect, Inactive |
| Check-in on Arrival | Long text | Move-Day Rule |
| Truck Parking / Entrance | Long text | Move-Day Rule |
| Elevator Rules | Long text | Move-Day Rule |
| Move Hours & Timing Limits | Long text | Move-Day Rule |
| Advance Notice / Reservation | Long text | Move-Day Rule |
| COI Required | Single select | Yes, No, Confirm Per Move, Unknown |
| COI Details | Long text | Certificate holder, additional insured wording, who supplies it |
| Apartment Access | Long text | Move-Day Rule |
| Trash & Packing Materials | Long text | Move-Day Rule |
| Other Rules & Tips | Long text | Move-Day Rule |
| Rule Status JSON | Long text | JSON map of rule key to `known`, `unknown` or `not_applicable`. A rule is unknown when its text is empty or the map says unknown. One field, so new rules never need a schema change. |
| Floor Plans On File | Checkbox | |
| Floor Plans Notes | Long text | e.g. "Drive: Dartmouth, Bristol, York" |
| Open Items | Long text | What we still need to collect |
| Source Notes | Long text | Where the information came from |
| Last Verified | Date | Blank until someone clicks Mark verified today |
| Last Verified By | Single line text | |
| Internal Notes | Long text | TTT only. Never on the PDF unless "Include internal notes" is chosen. |
| Archived | Checkbox | Soft delete |
| Created At | Date and time | Written by Rightsize |
| Updated At | Date and time | Written by Rightsize |
| Updated By | Single line text | Name (email) of the Clerk user |
| Seed Snapshot JSON | Long text | What the Excel seed last wrote, so re-running it never overwrites a human edit. Not shown in the UI. |

Rule keys used in Rule Status JSON and merge fields: `checkin`, `parking`,
`elevator`, `move_hours`, `advance_notice`, `coi_required`, `coi_details`,
`apartment_access`, `trash`, `other`. Labels, help text, icons and which
rules count toward completeness live in `RULE_DEFINITIONS`
(`lib/communities/types.ts`). Adding a rule: one entry there, plus its long
text field here (re-run the setup script).

Floor plan files: a future `Floor Plan Files` field (Cloudinary URLs as JSON,
like other Rightsize attachments) can sit beside `Floor Plans On File`
without changing anything else.

## Community Contacts

| Field | Type | Notes |
| --- | --- | --- |
| Name | Single line text (primary) | Required |
| Community | Link to Communities | Required |
| Community Record ID | Single line text | Plain copy of the link, so formulas can filter by record ID |
| Title | Single line text | As they sign it |
| Role | Single select | Move-In Coordinator, Move Scheduling, Sales / Residency, Marketing, Maintenance, Executive Director, Property Manager, Association Manager, Front Desk, Other |
| Email | Email | |
| Phones JSON | Long text | `[{"label":"Office","number":"(773) 878-6039"}]`. Labels: Office, Direct, Mobile, Text, 24/7, Main |
| Phones Display | Single line text | Flat "Office: (773) 878-6039 \| Mobile: ..." written on every save, for reading in Airtable |
| Is Primary Move-In Contact | Checkbox | At most one per community, enforced by the service layer |
| Notes | Long text | |
| Linked Contact Record ID | Single line text | Optional ID of a CRM referral contact. Stored only. |
| Sort Order | Number (integer) | |
| Archived | Checkbox | Remove = archive |
| Created At, Updated At | Date and time | |
| Updated By | Single line text | |
| Seed Snapshot JSON | Long text | As above |

## Community Activity

| Field | Type | Notes |
| --- | --- | --- |
| Summary | Single line text (primary) | e.g. "Changed Elevator Rules, City" |
| Community | Link to Communities | |
| Community Record ID | Single line text | Plain copy of the link |
| Action | Single select | Created, Updated, Archived, Restored, PDF Generated, Contact Added, Contact Updated, Contact Removed |
| By | Single line text | |
| At | Date and time | |

The drawer shows the latest 10 entries under History.

## Links to other Rightsize data

- CRM / referral partners: `Linked Company Record ID` and `Linked Contact
  Record ID` hold existing record IDs from `CRMReferralCompanies` and
  `CRMReferralContacts`. Rightsize never writes to those tables from here.
- Tenant Config / white-labeled communities (`CommunityBrands`, e.g. The
  Roosevelt at Salt Creek): a brand can reference a community later by
  storing the Communities record ID. Nothing here changes `CommunityBrands`.
