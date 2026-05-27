import { AIRTABLE_TABLES } from "./config";
import type { PartnerLoyaltyRecord, PartnerLedgerEntry } from "./types";
import type { TierName, LedgerEventType } from "./loyalty";

type AirtableRec = { id: string; fields: Record<string, unknown> };

function loyaltyFetch(path: string, options?: RequestInit) {
  const token = process.env.AIRTABLE_API_TOKEN!;
  const baseId = process.env.AIRTABLE_BASE_ID!;
  return fetch(
    `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(AIRTABLE_TABLES.PARTNER_LOYALTY)}${path}`,
    {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(options?.headers ?? {}),
      },
    }
  );
}

function ledgerFetch(path: string, options?: RequestInit) {
  const token = process.env.AIRTABLE_API_TOKEN!;
  const baseId = process.env.AIRTABLE_BASE_ID!;
  return fetch(
    `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(AIRTABLE_TABLES.PARTNER_POINTS_LEDGER)}${path}`,
    {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(options?.headers ?? {}),
      },
    }
  );
}

function str(v: unknown): string { return v != null ? String(v) : ""; }
function num(v: unknown): number { return v != null ? Number(v) : 0; }

function mapLoyalty(rec: AirtableRec): PartnerLoyaltyRecord {
  const f = rec.fields;
  return {
    id: rec.id,
    partnerId: str(f.PartnerId),
    partnerName: str(f.PartnerName),
    partnerEmail: str(f.PartnerEmail),
    companyName: str(f.CompanyName),
    currentTier: (str(f.CurrentTier) as TierName) || "None",
    currentYearPoints: num(f.CurrentYearPoints),
    lifetimePoints: num(f.LifetimePoints),
    currentProgramYear: num(f.CurrentProgramYear),
    currentMultiplier: num(f.CurrentMultiplier) || 1,
    statusEarnedYear: f.StatusEarnedYear != null ? num(f.StatusEarnedYear) : undefined,
    silverBonusApplied: Boolean(f.SilverBonusApplied),
    lastUpdated: f.LastUpdated ? str(f.LastUpdated) : undefined,
    notes: f.Notes ? str(f.Notes) : undefined,
  };
}

function mapLedger(rec: AirtableRec): PartnerLedgerEntry {
  const f = rec.fields;
  return {
    id: rec.id,
    partnerId: str(f.PartnerId),
    companyName: str(f.CompanyName),
    eventType: (str(f.EventType) as LedgerEventType) || "project_completed",
    pointsDelta: num(f.PointsDelta),
    pointsBalanceAfter: num(f.PointsBalanceAfter),
    tierBefore: (str(f.TierBefore) as TierName) || "None",
    tierAfter: (str(f.TierAfter) as TierName) || "None",
    relatedProjectId: f.RelatedProjectId ? str(f.RelatedProjectId) : undefined,
    adminUserId: f.AdminUserId ? str(f.AdminUserId) : undefined,
    note: f.Note ? str(f.Note) : undefined,
    createdAt: str(f.CreatedAt),
    programYear: num(f.ProgramYear),
  };
}

// ─── Loyalty record CRUD ──────────────────────────────────────────────────────

export async function getLoyaltyRecord(partnerId: string): Promise<PartnerLoyaltyRecord | null> {
  const formula = encodeURIComponent(`{PartnerId} = "${partnerId}"`);
  const res = await loyaltyFetch(`?filterByFormula=${formula}&maxRecords=1`);
  if (!res.ok) return null;
  const data = await res.json();
  if (!data.records?.length) return null;
  return mapLoyalty(data.records[0]);
}

export async function getAllLoyaltyRecords(): Promise<PartnerLoyaltyRecord[]> {
  let offset: string | undefined;
  const all: PartnerLoyaltyRecord[] = [];
  do {
    const qs = `?sort[0][field]=CurrentYearPoints&sort[0][direction]=desc${offset ? `&offset=${offset}` : ""}`;
    const res = await loyaltyFetch(qs);
    if (!res.ok) break;
    const data = await res.json();
    all.push(...(data.records as AirtableRec[]).map(mapLoyalty));
    offset = data.offset;
  } while (offset);
  return all;
}

type LoyaltyCreateFields = Omit<PartnerLoyaltyRecord, "id">;

export async function createLoyaltyRecord(fields: LoyaltyCreateFields): Promise<PartnerLoyaltyRecord> {
  const res = await loyaltyFetch("", {
    method: "POST",
    body: JSON.stringify({
      fields: {
        PartnerId: fields.partnerId,
        PartnerName: fields.partnerName,
        PartnerEmail: fields.partnerEmail,
        CompanyName: fields.companyName,
        CurrentTier: fields.currentTier,
        CurrentYearPoints: fields.currentYearPoints,
        LifetimePoints: fields.lifetimePoints,
        CurrentProgramYear: fields.currentProgramYear,
        CurrentMultiplier: fields.currentMultiplier,
        StatusEarnedYear: fields.statusEarnedYear ?? null,
        SilverBonusApplied: fields.silverBonusApplied,
        LastUpdated: new Date().toISOString().slice(0, 10),
        Notes: fields.notes ?? "",
      },
    }),
  });
  if (!res.ok) throw new Error(`Failed to create loyalty record: ${await res.text()}`);
  return mapLoyalty(await res.json());
}

export async function updateLoyaltyRecord(
  id: string,
  fields: Partial<LoyaltyCreateFields>
): Promise<PartnerLoyaltyRecord> {
  const f: Record<string, unknown> = { LastUpdated: new Date().toISOString().slice(0, 10) };
  if (fields.partnerName !== undefined)       f.PartnerName = fields.partnerName;
  if (fields.partnerEmail !== undefined)      f.PartnerEmail = fields.partnerEmail;
  if (fields.companyName !== undefined)       f.CompanyName = fields.companyName;
  if (fields.currentTier !== undefined)       f.CurrentTier = fields.currentTier;
  if (fields.currentYearPoints !== undefined) f.CurrentYearPoints = fields.currentYearPoints;
  if (fields.lifetimePoints !== undefined)    f.LifetimePoints = fields.lifetimePoints;
  if (fields.currentProgramYear !== undefined) f.CurrentProgramYear = fields.currentProgramYear;
  if (fields.currentMultiplier !== undefined) f.CurrentMultiplier = fields.currentMultiplier;
  if (fields.statusEarnedYear !== undefined)  f.StatusEarnedYear = fields.statusEarnedYear;
  if (fields.silverBonusApplied !== undefined) f.SilverBonusApplied = fields.silverBonusApplied;
  if (fields.notes !== undefined)             f.Notes = fields.notes;

  const res = await loyaltyFetch(`/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ fields: f }),
  });
  if (!res.ok) throw new Error(`Failed to update loyalty record: ${await res.text()}`);
  return mapLoyalty(await res.json());
}

// ─── Ledger CRUD ──────────────────────────────────────────────────────────────

export async function createLedgerEntry(entry: Omit<PartnerLedgerEntry, "id">): Promise<PartnerLedgerEntry> {
  const res = await ledgerFetch("", {
    method: "POST",
    body: JSON.stringify({
      fields: {
        PartnerId: entry.partnerId,
        CompanyName: entry.companyName,
        EventType: entry.eventType,
        PointsDelta: entry.pointsDelta,
        PointsBalanceAfter: entry.pointsBalanceAfter,
        TierBefore: entry.tierBefore,
        TierAfter: entry.tierAfter,
        RelatedProjectId: entry.relatedProjectId ?? "",
        AdminUserId: entry.adminUserId ?? "",
        Note: entry.note ?? "",
        CreatedAt: entry.createdAt || new Date().toISOString(),
        ProgramYear: entry.programYear,
      },
    }),
  });
  if (!res.ok) throw new Error(`Failed to create ledger entry: ${await res.text()}`);
  return mapLedger(await res.json());
}

export async function getLedgerEntries(partnerId: string, limit = 10): Promise<PartnerLedgerEntry[]> {
  const formula = encodeURIComponent(`{PartnerId} = "${partnerId}"`);
  const res = await ledgerFetch(
    `?filterByFormula=${formula}&sort[0][field]=CreatedAt&sort[0][direction]=desc&maxRecords=${limit}`
  );
  if (!res.ok) return [];
  const data = await res.json();
  return (data.records as AirtableRec[]).map(mapLedger);
}

export async function getAllLedgerEntriesForPartner(partnerId: string): Promise<PartnerLedgerEntry[]> {
  const formula = encodeURIComponent(`{PartnerId} = "${partnerId}"`);
  let offset: string | undefined;
  const all: PartnerLedgerEntry[] = [];
  do {
    const qs = `?filterByFormula=${formula}&sort[0][field]=CreatedAt&sort[0][direction]=desc${offset ? `&offset=${offset}` : ""}`;
    const res = await ledgerFetch(qs);
    if (!res.ok) break;
    const data = await res.json();
    all.push(...(data.records as AirtableRec[]).map(mapLedger));
    offset = data.offset;
  } while (offset);
  return all;
}
