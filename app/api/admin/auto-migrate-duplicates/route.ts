import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { isTTTAdmin, AIRTABLE_TABLES } from "@/lib/config";

const BASE_URL = `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}`;
const AT_HEADERS = {
  Authorization: `Bearer ${process.env.AIRTABLE_API_TOKEN}`,
  "Content-Type": "application/json",
};

const CLERK_ID_TABLES = [
  AIRTABLE_TABLES.USERS,
  AIRTABLE_TABLES.MEMBERSHIPS,
  AIRTABLE_TABLES.LOCAL_VENDORS,
  AIRTABLE_TABLES.TIME_ENTRIES,
  AIRTABLE_TABLES.STAFF_ROLES,
  AIRTABLE_TABLES.GMAIL_TOKENS,
  AIRTABLE_TABLES.EXPENSES,
];

const ASSIGNED_ID_TABLES = [
  AIRTABLE_TABLES.CRM_COMPANIES,
  AIRTABLE_TABLES.CRM_OPPORTUNITIES,
];

async function findAndUpdate(
  table: string,
  field: string,
  oldId: string,
  newId: string
): Promise<number> {
  const formula = encodeURIComponent(`{${field}} = "${oldId}"`);
  let offset: string | undefined;
  let updated = 0;

  do {
    const qs = `?filterByFormula=${formula}${offset ? `&offset=${offset}` : ""}`;
    const res = await fetch(`${BASE_URL}/${encodeURIComponent(table)}${qs}`, {
      headers: AT_HEADERS,
    });
    if (!res.ok) break;
    const data = await res.json();
    const records: { id: string }[] = data.records ?? [];
    offset = data.offset;

    for (const record of records) {
      const patchRes = await fetch(
        `${BASE_URL}/${encodeURIComponent(table)}/${record.id}`,
        {
          method: "PATCH",
          headers: AT_HEADERS,
          body: JSON.stringify({ fields: { [field]: newId } }),
        }
      );
      if (patchRes.ok) updated++;
    }
  } while (offset);

  return updated;
}

async function deleteAirtableRecord(table: string, recordId: string): Promise<boolean> {
  const res = await fetch(
    `${BASE_URL}/${encodeURIComponent(table)}/${recordId}`,
    { method: "DELETE", headers: AT_HEADERS }
  );
  return res.ok;
}

interface StaffRoleRecord {
  id: string;
  clerkUserId: string;
  email: string;
  displayName: string;
}

async function fetchAllStaffRoles(): Promise<StaffRoleRecord[]> {
  const table = AIRTABLE_TABLES.STAFF_ROLES;
  const records: StaffRoleRecord[] = [];
  let offset: string | undefined;

  do {
    const qs = `?fields[]=ClerkUserId&fields[]=Email&fields[]=DisplayName${offset ? `&offset=${offset}` : ""}`;
    const res = await fetch(`${BASE_URL}/${encodeURIComponent(table)}${qs}`, {
      headers: AT_HEADERS,
    });
    if (!res.ok) break;
    const data = await res.json();
    for (const r of data.records ?? []) {
      records.push({
        id: r.id,
        clerkUserId: r.fields?.ClerkUserId ?? "",
        email: (r.fields?.Email ?? "").toLowerCase().trim(),
        displayName: r.fields?.DisplayName ?? "",
      });
    }
    offset = data.offset;
  } while (offset);

  return records;
}

export async function POST() {
  const { userId } = await auth();
  if (!userId || !isTTTAdmin(userId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 1. Fetch all StaffRole records
  const allStaff = await fetchAllStaffRoles();

  // 2. Group by email, find duplicates
  const byEmail = new Map<string, StaffRoleRecord[]>();
  for (const s of allStaff) {
    if (!s.email) continue;
    if (!byEmail.has(s.email)) byEmail.set(s.email, []);
    byEmail.get(s.email)!.push(s);
  }

  const duplicateEmails = [...byEmail.entries()].filter(([, records]) => records.length > 1);

  if (duplicateEmails.length === 0) {
    return NextResponse.json({ message: "No duplicate staff entries found.", migrations: [] });
  }

  const clerk = await clerkClient();
  const migrations: {
    email: string;
    oldId: string;
    newId: string;
    oldRecordId: string;
    tableUpdates: Record<string, number>;
    deleted: boolean;
    error?: string;
  }[] = [];

  // 3. For each duplicate email, resolve current Clerk user
  for (const [email, records] of duplicateEmails) {
    try {
      const clerkUsers = await clerk.users.getUserList({ emailAddress: [email] });
      const clerkUser = clerkUsers.data?.[0];

      if (!clerkUser) {
        migrations.push({
          email,
          oldId: "",
          newId: "",
          oldRecordId: "",
          tableUpdates: {},
          deleted: false,
          error: "No matching Clerk user found for this email",
        });
        continue;
      }

      const currentClerkId = clerkUser.id;

      // The record whose clerkUserId matches current Clerk = "new" (keep)
      // The other record(s) = "old" (migrate + delete)
      const oldRecords = records.filter((r) => r.clerkUserId !== currentClerkId);
      const newRecord = records.find((r) => r.clerkUserId === currentClerkId);

      if (!newRecord) {
        migrations.push({
          email,
          oldId: "",
          newId: currentClerkId,
          oldRecordId: "",
          tableUpdates: {},
          deleted: false,
          error: `Current Clerk ID ${currentClerkId} not found in any StaffRole record — check manually`,
        });
        continue;
      }

      for (const oldRecord of oldRecords) {
        const oldId = oldRecord.clerkUserId;
        const newId = currentClerkId;
        const tableUpdates: Record<string, number> = {};

        // 4. Migrate all ClerkUserId references
        for (const table of CLERK_ID_TABLES) {
          const count = await findAndUpdate(table, "ClerkUserId", oldId, newId);
          if (count > 0) tableUpdates[table] = count;
        }

        // 5. Migrate all AssignedToClerkId references
        for (const table of ASSIGNED_ID_TABLES) {
          const count = await findAndUpdate(table, "AssignedToClerkId", oldId, newId);
          if (count > 0) tableUpdates[table] = count;
        }

        // 6. Delete the now-redundant old StaffRole record
        // (After migration, the STAFF_ROLES entry was updated from oldId→newId,
        //  creating a duplicate in that table. Delete the one with the old airtable record id.)
        const deleted = await deleteAirtableRecord(AIRTABLE_TABLES.STAFF_ROLES, oldRecord.id);

        migrations.push({
          email,
          oldId,
          newId,
          oldRecordId: oldRecord.id,
          tableUpdates,
          deleted,
        });
      }
    } catch (err) {
      migrations.push({
        email,
        oldId: "",
        newId: "",
        oldRecordId: "",
        tableUpdates: {},
        deleted: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({ migrations });
}
