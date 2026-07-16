import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import Airtable from "airtable";
import { getSystemRole } from "@/lib/airtable";
import { AIRTABLE_TABLES } from "@/lib/config";

function getBase() {
  Airtable.configure({ apiKey: process.env.AIRTABLE_API_TOKEN! });
  return Airtable.base(process.env.AIRTABLE_BASE_ID!);
}

export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId);
  if (sysRole !== "TTTAdmin" && sysRole !== "TTTManager") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const base = getBase();

  // 1. Scan all Rooms → build tenantId → totalSqFt map
  const roomRecords = await base(AIRTABLE_TABLES.ROOMS)
    .select({ fields: ["TenantId", "SquareFeet"] })
    .all();

  const sqFtByTenant = new Map<string, number>();
  for (const r of roomRecords) {
    const tenantId = typeof r.fields["TenantId"] === "string" ? r.fields["TenantId"] : "";
    const sqFt = typeof r.fields["SquareFeet"] === "number" ? r.fields["SquareFeet"] : 0;
    if (!tenantId) continue;
    sqFtByTenant.set(tenantId, (sqFtByTenant.get(tenantId) ?? 0) + sqFt);
  }

  // 2. Find tenants with no OriginSqFt set
  const tenantRecords = await base(AIRTABLE_TABLES.TENANTS)
    .select({
      fields: ["OriginSqFt"],
      filterByFormula: "OR({OriginSqFt} = BLANK(), {OriginSqFt} = 0)",
    })
    .all();

  // 3. For each tenant with rooms, update OriginSqFt
  const toUpdate: { id: string; sqFt: number }[] = [];
  for (const record of tenantRecords) {
    const sqFt = sqFtByTenant.get(record.id);
    if (!sqFt || sqFt <= 0) continue;
    toUpdate.push({ id: record.id, sqFt });
  }

  // Airtable batch update: max 10 per call
  const BATCH = 10;
  let updated = 0;
  for (let i = 0; i < toUpdate.length; i += BATCH) {
    const chunk = toUpdate.slice(i, i + BATCH);
    await base(AIRTABLE_TABLES.TENANTS).update(
      chunk.map((t) => ({ id: t.id, fields: { OriginSqFt: t.sqFt } }))
    );
    updated += chunk.length;
  }

  return NextResponse.json({
    tenantsWithRooms: sqFtByTenant.size,
    tenantsNeedingBackfill: toUpdate.length,
    updated,
  });
}
