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

  // 1. Scan all Rooms → build per-tenant density breakdown
  const roomRecords = await base(AIRTABLE_TABLES.ROOMS)
    .select({ fields: ["TenantId", "SquareFeet", "Density"] })
    .all();

  type DensityMap = { High: number; Medium: number; Low: number; total: number };
  const byTenant = new Map<string, DensityMap>();

  for (const r of roomRecords) {
    const tenantId = typeof r.fields["TenantId"] === "string" ? r.fields["TenantId"] : "";
    const sqFt = typeof r.fields["SquareFeet"] === "number" ? r.fields["SquareFeet"] : 0;
    const density = (typeof r.fields["Density"] === "string" ? r.fields["Density"] : "Medium") as "High" | "Medium" | "Low";
    if (!tenantId || sqFt <= 0) continue;
    const entry = byTenant.get(tenantId) ?? { High: 0, Medium: 0, Low: 0, total: 0 };
    entry[density] = (entry[density] ?? 0) + sqFt;
    entry.total += sqFt;
    byTenant.set(tenantId, entry);
  }

  // 2. Fetch ALL tenants — we'll update any that are missing any of the four fields
  const tenantRecords = await base(AIRTABLE_TABLES.TENANTS)
    .select({ fields: ["OriginSqFt", "OriginHighSqFt", "OriginMedSqFt", "OriginLowSqFt"] })
    .all();

  type TenantUpdate = {
    id: string;
    fields: Record<string, number>;
  };
  const toUpdate: TenantUpdate[] = [];

  for (const record of tenantRecords) {
    const f = record.fields;
    const hasHigh = typeof f["OriginHighSqFt"] === "number" && (f["OriginHighSqFt"] as number) > 0;
    const hasMed  = typeof f["OriginMedSqFt"]  === "number" && (f["OriginMedSqFt"]  as number) > 0;
    const hasLow  = typeof f["OriginLowSqFt"]  === "number" && (f["OriginLowSqFt"]  as number) > 0;
    const hasTotal = typeof f["OriginSqFt"] === "number" && (f["OriginSqFt"] as number) > 0;

    const rooms = byTenant.get(record.id);

    if (rooms) {
      // Tenant has catalogued rooms — fill from room density breakdown
      const needsUpdate =
        (!hasHigh && rooms.High > 0) ||
        (!hasMed  && rooms.Medium > 0) ||
        (!hasLow  && rooms.Low > 0) ||
        !hasTotal;
      if (!needsUpdate) continue;

      const fields: Record<string, number> = {};
      if (!hasTotal) fields["OriginSqFt"] = rooms.total;
      // Only overwrite per-density if not already set
      if (!hasHigh && rooms.High > 0) fields["OriginHighSqFt"] = rooms.High;
      if (!hasMed  && rooms.Medium > 0) fields["OriginMedSqFt"] = rooms.Medium;
      if (!hasLow  && rooms.Low > 0) fields["OriginLowSqFt"] = rooms.Low;

      if (Object.keys(fields).length > 0) toUpdate.push({ id: record.id, fields });
    } else if (hasTotal && !hasMed && !hasHigh && !hasLow) {
      // No rooms but has a total — put it in Average so the edit form isn't blank
      toUpdate.push({ id: record.id, fields: { OriginMedSqFt: f["OriginSqFt"] as number } });
    }
  }

  // Airtable batch update: max 10 per call
  const BATCH = 10;
  let updated = 0;
  for (let i = 0; i < toUpdate.length; i += BATCH) {
    const chunk = toUpdate.slice(i, i + BATCH);
    await base(AIRTABLE_TABLES.TENANTS).update(
      chunk.map((t) => ({ id: t.id, fields: t.fields }))
    );
    updated += chunk.length;
  }

  return NextResponse.json({
    tenantsWithRooms: byTenant.size,
    tenantsUpdated: updated,
  });
}
