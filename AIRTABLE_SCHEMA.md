# Airtable Schema — Rightsize by Top Tier

Create these 5 tables in your Airtable base. Copy each table's ID from the URL
when viewing it (e.g., `tblXXXXXXXXXXXXXX`) and paste into `.env.local`.

---

## Table 1: Tenants

| Field Name     | Type            | Notes                         |
|---------------|-----------------|-------------------------------|
| Name          | Single line text| Project/client name           |
| Slug          | Single line text| URL-friendly unique identifier|
| Plan          | Single select   | Options: free, pro, enterprise|
| OwnerUserId   | Single line text| Clerk user ID of the owner    |
| CreatedAt     | Single line text| ISO 8601 datetime             |

---

## Table 2: Users

| Field Name   | Type            | Notes                    |
|-------------|-----------------|--------------------------|
| ClerkUserId | Single line text| Clerk's user ID (unique) |
| Email       | Email           | User email               |
| Name        | Single line text| Display name             |
| CreatedAt   | Single line text| ISO 8601 datetime        |

---

## Table 3: Memberships

| Field Name   | Type            | Notes                                              |
|-------------|-----------------|-----------------------------------------------------|
| TenantId    | Single line text| Airtable record ID of the tenant                   |
| ClerkUserId | Single line text| Clerk user ID                                      |
| Role        | Single select   | Options: Owner, Collaborator, Viewer, TTTStaff, TTTAdmin |
| CreatedAt   | Single line text| ISO 8601 datetime                                   |

---

## Table 4: Rooms

| Field Name  | Type            | Notes                                          |
|------------|-----------------|------------------------------------------------|
| TenantId   | Single line text| Airtable record ID of the tenant               |
| Name       | Single line text| Room display name (e.g., "Master Bedroom")     |
| RoomType   | Single select   | See list below                                 |
| SquareFeet | Number          | Square footage (integer)                       |
| Density    | Single select   | Options: Low, Medium, High                     |
| CreatedAt  | Single line text| ISO 8601 datetime                              |

**RoomType options:** Living Room, Bedroom, Master Bedroom, Kitchen, Dining Room,
Office/Study, Garage, Basement, Attic, Bathroom, Closet, Storage Room, Sunroom, Other

---

## Table 5: Items

| Field Name            | Type            | Notes                                             |
|----------------------|-----------------|---------------------------------------------------|
| TenantId             | Single line text| Airtable record ID of the tenant                  |
| RoomId               | Single line text| Airtable record ID of the room (optional)          |
| PhotoUrl             | URL             | Cloudinary secure URL                             |
| PhotoPublicId        | Single line text| Cloudinary public_id for deletion/transforms      |
| ItemName             | Single line text| Item display name                                 |
| Category             | Single line text| e.g., Furniture, Electronics                      |
| Condition            | Single select   | Excellent, Good, Fair, Poor, For Parts            |
| ConditionNotes       | Long text       | AI condition description                          |
| SizeClass            | Single select   | Small & Shippable, Fits in Car-SUV, Needs Movers  |
| Fragility            | Single select   | Not Fragile, Somewhat Fragile, Very Fragile       |
| ItemType             | Single select   | Daily Use, Collector Item                         |
| ValueLow             | Currency        | Low value estimate                                |
| ValueMid             | Currency        | Mid value estimate                                |
| ValueHigh            | Currency        | High value estimate                               |
| PrimaryRoute         | Single select   | Online Marketplace, Local Consignment, Donate, Discard |
| RouteReasoning       | Long text       | AI reasoning for route                            |
| ConsignmentCategory  | Single line text| Consignment shop category if applicable           |
| ListingTitleEbay     | Single line text| eBay listing title                                |
| ListingDescriptionEbay | Long text     | eBay listing description                          |
| ListingFb            | Long text       | Facebook Marketplace post                         |
| ListingOfferup       | Long text       | OfferUp listing                                   |
| StaffTips            | Long text       | Practical notes for TTT helper                    |
| Status               | Single select   | Pending Review, Reviewed, Listed, Sold, Donated, Discarded |
| CreatedAt            | Single line text| ISO 8601 datetime                                 |
| UpdatedAt            | Single line text| ISO 8601 datetime                                 |

---

## Table 6: PlanEntries

| Field Name  | Type             | Notes                                           |
|-------------|------------------|-------------------------------------------------|
| TenantId    | Single line text | Airtable record ID of the tenant                |
| Date        | Single line text | ISO date YYYY-MM-DD                             |
| Activity    | Single select    | See activity list below                         |
| RoomId      | Single line text | Optional — Airtable record ID of a project room |
| RoomLabel   | Single line text | Optional — custom free-form room name           |
| Notes       | Long text        | Optional                                        |
| CreatedAt   | Single line text | ISO 8601 datetime                               |

**Activity options:** Sorting, Packing, Selling / Listing, Staging, Donating, Discarding, Photography, Moving, Estate Sale Prep, Other

**Room logic:** RoomId links to a project room; RoomLabel is free-form text. Both optional. Display: project room name > RoomLabel > blank.

---

## Setup Steps

1. Go to [airtable.com](https://airtable.com) → create a new base called **Rightsize**
2. Create the 5 tables above with the exact field names shown
3. For Single select fields, add all the options listed
4. Get your **Personal Access Token** at [airtable.com/create/tokens](https://airtable.com/create/tokens)
   - Scopes needed: `data.records:read`, `data.records:write`, `schema.bases:read`
   - Add your base to the token's access list
5. Get your **Base ID** from the URL: `https://airtable.com/appXXXXXXXXXXXXXX/...`
6. Get each **Table ID** from the URL when viewing each table: `.../tblXXXXXXXXXXXXXX/...`
7. Fill in `.env.local` with all values
