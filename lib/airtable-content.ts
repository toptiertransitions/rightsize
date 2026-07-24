import Airtable from "airtable";
import { AIRTABLE_TABLES } from "./config";
import type {
  ContentItem, ContentCategory, ContentComment, ContentItemType,
  ContentAudience, ContentStatus, ContentPipelineStage,
} from "./types";

function getBase() {
  if (!process.env.AIRTABLE_API_TOKEN) throw new Error("AIRTABLE_API_TOKEN not set");
  if (!process.env.AIRTABLE_BASE_ID) throw new Error("AIRTABLE_BASE_ID not set");
  Airtable.configure({ apiKey: process.env.AIRTABLE_API_TOKEN });
  return Airtable.base(process.env.AIRTABLE_BASE_ID);
}

function toStr(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

function toNum(v: unknown): number {
  return typeof v === "number" ? v : 0;
}

// ─── Categories ───────────────────────────────────────────────────────────────

function mapCategory(record: Airtable.Record<Airtable.FieldSet>): ContentCategory {
  const f = record.fields;
  return {
    id: record.id,
    name: toStr(f["Name"]),
    color: toStr(f["Color"]) || "#6b7280",
    sortOrder: toNum(f["SortOrder"]),
    createdAt: toStr(f["CreatedAt"]),
  };
}

export async function getContentCategories(): Promise<ContentCategory[]> {
  const base = getBase();
  const records = await base(AIRTABLE_TABLES.CONTENT_CATEGORIES)
    .select({ sort: [{ field: "SortOrder", direction: "asc" }, { field: "CreatedAt", direction: "asc" }] })
    .all();
  return records.map(mapCategory);
}

export async function createContentCategory(data: { name: string; color: string; sortOrder?: number }): Promise<ContentCategory> {
  const base = getBase();
  const record = await base(AIRTABLE_TABLES.CONTENT_CATEGORIES).create({
    Name: data.name,
    Color: data.color,
    SortOrder: data.sortOrder ?? 0,
    CreatedAt: new Date().toISOString(),
  });
  return mapCategory(record);
}

export async function updateContentCategory(id: string, data: Partial<{ name: string; color: string; sortOrder: number }>): Promise<ContentCategory> {
  const base = getBase();
  const fields: Airtable.FieldSet = {};
  if (data.name !== undefined) fields["Name"] = data.name;
  if (data.color !== undefined) fields["Color"] = data.color;
  if (data.sortOrder !== undefined) fields["SortOrder"] = data.sortOrder;
  const record = await base(AIRTABLE_TABLES.CONTENT_CATEGORIES).update(id, fields);
  return mapCategory(record);
}

export async function deleteContentCategory(id: string): Promise<void> {
  const base = getBase();
  await base(AIRTABLE_TABLES.CONTENT_CATEGORIES).destroy(id);
}

// ─── Content Items ────────────────────────────────────────────────────────────

function parseTags(raw: unknown): string[] {
  if (!raw) return [];
  if (typeof raw === "string") {
    try { return JSON.parse(raw); } catch { return []; }
  }
  return [];
}

function mapItem(record: Airtable.Record<Airtable.FieldSet>): ContentItem {
  const f = record.fields;
  return {
    id: record.id,
    title: toStr(f["Title"]),
    description: toStr(f["Description"]) || undefined,
    contentType: (toStr(f["ContentType"]) || "URL") as ContentItemType,
    fileUrl: toStr(f["FileUrl"]) || undefined,
    filePublicId: toStr(f["FilePublicId"]) || undefined,
    linkUrl: toStr(f["LinkUrl"]) || undefined,
    thumbnailUrl: toStr(f["ThumbnailUrl"]) || undefined,
    thumbnailPublicId: toStr(f["ThumbnailPublicId"]) || undefined,
    audience: (toStr(f["Audience"]) || "Both") as ContentAudience,
    pipelineStage: (toStr(f["PipelineStage"]) || "All") as ContentPipelineStage,
    categoryId: toStr(f["CategoryId"]) || undefined,
    tags: parseTags(f["Tags"]),
    authorClerkId: toStr(f["AuthorClerkId"]),
    sharedWith: (() => { try { const s = toStr(f["SharedWithClerkIds"]); return s ? s.split(",").filter(Boolean) : []; } catch { return []; } })(),
    status: (toStr(f["Status"]) || "Draft") as ContentStatus,
    downloadCount: toNum(f["DownloadCount"]),
    likeCount: toNum(f["LikeCount"]),
    commentCount: toNum(f["CommentCount"]),
    scheduledDate: toStr(f["ScheduledDate"]) || undefined,
    createdAt: toStr(f["CreatedAt"]),
    updatedAt: toStr(f["UpdatedAt"]),
  };
}

export async function getContentItems(opts?: {
  status?: ContentStatus | "active_draft" | "all";
  audience?: ContentAudience;
  pipelineStage?: ContentPipelineStage;
  categoryId?: string;
  scheduledDateFrom?: string;
  scheduledDateTo?: string;
}): Promise<ContentItem[]> {
  const base = getBase();
  const filters: string[] = [];

  if (opts?.status === "all") {
    // no status filter — return every status
  } else if (opts?.status === "active_draft") {
    filters.push(`OR({Status} = "Active", {Status} = "Draft")`);
  } else if (opts?.status) {
    filters.push(`{Status} = "${opts.status}"`);
  } else {
    filters.push(`OR({Status} = "Active", {Status} = "Draft")`);
  }
  if (opts?.audience && opts.audience !== "Both") filters.push(`OR({Audience} = "${opts.audience}", {Audience} = "Both")`);
  if (opts?.pipelineStage && opts.pipelineStage !== "All") filters.push(`OR({PipelineStage} = "${opts.pipelineStage}", {PipelineStage} = "All")`);
  if (opts?.categoryId) filters.push(`{CategoryId} = "${opts.categoryId}"`);
  if (opts?.scheduledDateFrom) filters.push(`{ScheduledDate} >= "${opts.scheduledDateFrom}"`);
  if (opts?.scheduledDateTo) filters.push(`{ScheduledDate} <= "${opts.scheduledDateTo}"`);

  const formula = filters.length > 1 ? `AND(${filters.join(",")})` : filters[0] ?? "1=1";

  const records = await base(AIRTABLE_TABLES.CONTENT_ITEMS)
    .select({ filterByFormula: formula, sort: [{ field: "CreatedAt", direction: "desc" }] })
    .all();
  return records.map(mapItem);
}

export async function getContentItemById(id: string): Promise<ContentItem | null> {
  const base = getBase();
  try {
    const record = await base(AIRTABLE_TABLES.CONTENT_ITEMS).find(id);
    return mapItem(record);
  } catch { return null; }
}

export async function createContentItem(data: {
  title: string;
  description?: string;
  contentType: ContentItemType;
  fileUrl?: string;
  filePublicId?: string;
  linkUrl?: string;
  thumbnailUrl?: string;
  thumbnailPublicId?: string;
  audience: ContentAudience;
  pipelineStage: ContentPipelineStage;
  categoryId?: string;
  tags?: string[];
  authorClerkId: string;
  status?: ContentStatus;
  scheduledDate?: string;
  sharedWith?: string[];
}): Promise<ContentItem> {
  const base = getBase();
  const fields: Airtable.FieldSet = {
    Title: data.title,
    ContentType: data.contentType,
    Audience: data.audience,
    PipelineStage: data.pipelineStage,
    AuthorClerkId: data.authorClerkId,
    Status: data.status ?? "Draft",
    DownloadCount: 0,
    LikeCount: 0,
    CommentCount: 0,
    Tags: JSON.stringify(data.tags ?? []),
    CreatedAt: new Date().toISOString(),
    UpdatedAt: new Date().toISOString(),
  };
  if (data.description) fields["Description"] = data.description;
  if (data.fileUrl) fields["FileUrl"] = data.fileUrl;
  if (data.filePublicId) fields["FilePublicId"] = data.filePublicId;
  if (data.linkUrl) fields["LinkUrl"] = data.linkUrl;
  if (data.thumbnailUrl) fields["ThumbnailUrl"] = data.thumbnailUrl;
  if (data.thumbnailPublicId) fields["ThumbnailPublicId"] = data.thumbnailPublicId;
  if (data.categoryId) fields["CategoryId"] = data.categoryId;
  if (data.scheduledDate) fields["ScheduledDate"] = data.scheduledDate;
  fields["SharedWithClerkIds"] = (data.sharedWith ?? []).join(",");
  const record = await base(AIRTABLE_TABLES.CONTENT_ITEMS).create(fields);
  return mapItem(record);
}

export async function updateContentItem(id: string, data: Partial<{
  title: string;
  description: string;
  contentType: ContentItemType;
  fileUrl: string | null;
  sharedWith: string[];
  filePublicId: string | null;
  linkUrl: string | null;
  thumbnailUrl: string | null;
  thumbnailPublicId: string | null;
  audience: ContentAudience;
  pipelineStage: ContentPipelineStage;
  categoryId: string | null;
  tags: string[];
  status: ContentStatus;
  scheduledDate: string | null;
}>): Promise<ContentItem> {
  const base = getBase();
  const fields: Airtable.FieldSet = { UpdatedAt: new Date().toISOString() };
  if (data.title !== undefined) fields["Title"] = data.title;
  if (data.description !== undefined) fields["Description"] = data.description;
  if (data.contentType !== undefined) fields["ContentType"] = data.contentType;
  if (data.fileUrl !== undefined) fields["FileUrl"] = data.fileUrl ?? "";
  if (data.filePublicId !== undefined) fields["FilePublicId"] = data.filePublicId ?? "";
  if (data.linkUrl !== undefined) fields["LinkUrl"] = data.linkUrl ?? "";
  if (data.thumbnailUrl !== undefined) fields["ThumbnailUrl"] = data.thumbnailUrl ?? "";
  if (data.thumbnailPublicId !== undefined) fields["ThumbnailPublicId"] = data.thumbnailPublicId ?? "";
  if (data.audience !== undefined) fields["Audience"] = data.audience;
  if (data.pipelineStage !== undefined) fields["PipelineStage"] = data.pipelineStage;
  if (data.categoryId !== undefined) fields["CategoryId"] = data.categoryId ?? "";
  if (data.tags !== undefined) fields["Tags"] = JSON.stringify(data.tags);
  if (data.status !== undefined) fields["Status"] = data.status;
  if (data.scheduledDate !== undefined) fields["ScheduledDate"] = data.scheduledDate ?? "";
  if (data.sharedWith !== undefined) fields["SharedWithClerkIds"] = data.sharedWith.join(",");
  const record = await base(AIRTABLE_TABLES.CONTENT_ITEMS).update(id, fields);
  return mapItem(record);
}

export async function deleteContentItem(id: string): Promise<void> {
  const base = getBase();
  await base(AIRTABLE_TABLES.CONTENT_ITEMS).destroy(id);
}

export async function incrementDownloadCount(id: string): Promise<void> {
  const base = getBase();
  const record = await base(AIRTABLE_TABLES.CONTENT_ITEMS).find(id);
  const current = toNum(record.fields["DownloadCount"]);
  await base(AIRTABLE_TABLES.CONTENT_ITEMS).update(id, { DownloadCount: current + 1 });
}

// ─── Likes ────────────────────────────────────────────────────────────────────

export async function getLikeForUser(contentId: string, userClerkId: string): Promise<string | null> {
  const base = getBase();
  const records = await base(AIRTABLE_TABLES.CONTENT_LIKES)
    .select({ filterByFormula: `AND({ContentId} = "${contentId}", {UserClerkId} = "${userClerkId}")`, maxRecords: 1 })
    .all();
  return records[0]?.id ?? null;
}

export async function getLikesForUser(userClerkId: string, contentIds: string[]): Promise<Set<string>> {
  if (contentIds.length === 0) return new Set();
  const base = getBase();
  const idFilter = contentIds.map(id => `{ContentId} = "${id}"`).join(",");
  const records = await base(AIRTABLE_TABLES.CONTENT_LIKES)
    .select({ filterByFormula: `AND({UserClerkId} = "${userClerkId}", OR(${idFilter}))` })
    .all();
  return new Set(records.map(r => String(r.fields["ContentId"] ?? "")));
}

export async function getAllLikedItemIds(userClerkId: string): Promise<string[]> {
  const base = getBase();
  const records = await base(AIRTABLE_TABLES.CONTENT_LIKES)
    .select({ filterByFormula: `{UserClerkId} = "${userClerkId}"` })
    .all();
  return records.map(r => String(r.fields["ContentId"] ?? "")).filter(Boolean);
}

export async function addLike(contentId: string, userClerkId: string): Promise<void> {
  const base = getBase();
  await base(AIRTABLE_TABLES.CONTENT_LIKES).create({
    ContentId: contentId,
    UserClerkId: userClerkId,
    CreatedAt: new Date().toISOString(),
  });
  const item = await base(AIRTABLE_TABLES.CONTENT_ITEMS).find(contentId);
  const current = toNum(item.fields["LikeCount"]);
  await base(AIRTABLE_TABLES.CONTENT_ITEMS).update(contentId, { LikeCount: current + 1 });
}

export async function removeLike(likeId: string, contentId: string): Promise<void> {
  const base = getBase();
  await base(AIRTABLE_TABLES.CONTENT_LIKES).destroy(likeId);
  const item = await base(AIRTABLE_TABLES.CONTENT_ITEMS).find(contentId);
  const current = toNum(item.fields["LikeCount"]);
  await base(AIRTABLE_TABLES.CONTENT_ITEMS).update(contentId, { LikeCount: Math.max(0, current - 1) });
}

// ─── Comments ─────────────────────────────────────────────────────────────────

function mapComment(record: Airtable.Record<Airtable.FieldSet>): ContentComment {
  const f = record.fields;
  return {
    id: record.id,
    contentId: toStr(f["ContentId"]),
    authorClerkId: toStr(f["AuthorClerkId"]),
    authorName: toStr(f["AuthorName"]) || "Staff",
    authorPhotoUrl: toStr(f["AuthorPhotoUrl"]) || undefined,
    body: toStr(f["Body"]),
    createdAt: toStr(f["CreatedAt"]),
  };
}

export async function getComments(contentId: string): Promise<ContentComment[]> {
  const base = getBase();
  const records = await base(AIRTABLE_TABLES.CONTENT_COMMENTS)
    .select({
      filterByFormula: `{ContentId} = "${contentId}"`,
      sort: [{ field: "CreatedAt", direction: "asc" }],
    })
    .all();
  return records.map(mapComment);
}

export async function addComment(data: {
  contentId: string;
  authorClerkId: string;
  authorName: string;
  authorPhotoUrl?: string;
  body: string;
}): Promise<ContentComment> {
  const base = getBase();
  const record = await base(AIRTABLE_TABLES.CONTENT_COMMENTS).create({
    ContentId: data.contentId,
    AuthorClerkId: data.authorClerkId,
    AuthorName: data.authorName,
    AuthorPhotoUrl: data.authorPhotoUrl ?? "",
    Body: data.body,
    CreatedAt: new Date().toISOString(),
  });
  // Increment comment count
  const item = await base(AIRTABLE_TABLES.CONTENT_ITEMS).find(data.contentId);
  const current = toNum(item.fields["CommentCount"]);
  await base(AIRTABLE_TABLES.CONTENT_ITEMS).update(data.contentId, { CommentCount: current + 1 });
  return mapComment(record);
}

export async function deleteComment(commentId: string, contentId: string): Promise<void> {
  const base = getBase();
  await base(AIRTABLE_TABLES.CONTENT_COMMENTS).destroy(commentId);
  const item = await base(AIRTABLE_TABLES.CONTENT_ITEMS).find(contentId);
  const current = toNum(item.fields["CommentCount"]);
  await base(AIRTABLE_TABLES.CONTENT_COMMENTS).destroy(commentId).catch(() => {});
  await base(AIRTABLE_TABLES.CONTENT_ITEMS).update(contentId, { CommentCount: Math.max(0, current - 1) });
}

// ─── Author lookup from AuthorClerkId ─────────────────────────────────────────

export async function getAuthorEmailForContent(contentId: string): Promise<string | null> {
  const base = getBase();
  try {
    const record = await base(AIRTABLE_TABLES.CONTENT_ITEMS).find(contentId);
    const authorClerkId = toStr(record.fields["AuthorClerkId"]);
    if (!authorClerkId) return null;
    const staffRecords = await base(AIRTABLE_TABLES.STAFF_ROLES ?? "StaffRoles")
      .select({ filterByFormula: `{ClerkUserId} = "${authorClerkId}"`, maxRecords: 1 })
      .all();
    return toStr(staffRecords[0]?.fields["Email"]) || null;
  } catch { return null; }
}
