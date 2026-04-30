import Airtable from "airtable";

function getBase() {
  if (!process.env.AIRTABLE_API_TOKEN) throw new Error("AIRTABLE_API_TOKEN is not set");
  if (!process.env.AIRTABLE_BASE_ID) throw new Error("AIRTABLE_BASE_ID is not set");
  Airtable.configure({ apiKey: process.env.AIRTABLE_API_TOKEN });
  return Airtable.base(process.env.AIRTABLE_BASE_ID);
}

const NOTES_TABLE = process.env.AIRTABLE_PROJECT_NOTES_TABLE || "ProjectNotes";
const COMMENTS_TABLE = process.env.AIRTABLE_NOTE_COMMENTS_TABLE || "NoteComments";

function toStr(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

export interface NoteComment {
  id: string;
  authorClerkId: string;
  authorName: string;
  authorPhotoUrl?: string;
  content: string;
  createdAt: string;
}

export interface ProjectNote {
  id: string;
  authorClerkId: string;
  authorName: string;
  authorPhotoUrl?: string;
  content: string;
  createdAt: string;
  comments: NoteComment[];
}

export async function getProjectNotes(tenantId: string): Promise<ProjectNote[]> {
  const base = getBase();

  const noteRecords = await base(NOTES_TABLE)
    .select({
      filterByFormula: `{TenantId} = "${tenantId}"`,
      sort: [{ field: "CreatedAt", direction: "desc" }],
    })
    .all();

  if (noteRecords.length === 0) return [];

  // Fetch all comments for these notes in a single Airtable call
  const idFilter = noteRecords.map(n => `{NoteRecordId} = "${n.id}"`).join(",");
  const commentRecords = await base(COMMENTS_TABLE)
    .select({
      filterByFormula: `OR(${idFilter})`,
      sort: [{ field: "CreatedAt", direction: "asc" }],
    })
    .all();

  const commentsByNote: Record<string, NoteComment[]> = {};
  for (const c of commentRecords) {
    const noteId = toStr(c.fields["NoteRecordId"]);
    if (!commentsByNote[noteId]) commentsByNote[noteId] = [];
    commentsByNote[noteId].push({
      id: c.id,
      authorClerkId: toStr(c.fields["AuthorClerkId"]),
      authorName: toStr(c.fields["AuthorName"]) || "Staff",
      authorPhotoUrl: toStr(c.fields["AuthorPhotoUrl"]) || undefined,
      content: toStr(c.fields["Content"]),
      createdAt: toStr(c.fields["CreatedAt"]),
    });
  }

  return noteRecords.map(n => ({
    id: n.id,
    authorClerkId: toStr(n.fields["AuthorClerkId"]),
    authorName: toStr(n.fields["AuthorName"]) || "Staff",
    authorPhotoUrl: toStr(n.fields["AuthorPhotoUrl"]) || undefined,
    content: toStr(n.fields["Content"]),
    createdAt: toStr(n.fields["CreatedAt"]),
    comments: commentsByNote[n.id] ?? [],
  }));
}

export async function createProjectNote(data: {
  tenantId: string;
  authorClerkId: string;
  authorName: string;
  authorPhotoUrl?: string;
  content: string;
}): Promise<ProjectNote> {
  const base = getBase();
  const createdAt = new Date().toISOString();

  const record = await base(NOTES_TABLE).create({
    TenantId: data.tenantId,
    AuthorClerkId: data.authorClerkId,
    AuthorName: data.authorName,
    AuthorPhotoUrl: data.authorPhotoUrl ?? "",
    Content: data.content,
    CreatedAt: createdAt,
  });

  return {
    id: record.id,
    authorClerkId: data.authorClerkId,
    authorName: data.authorName,
    authorPhotoUrl: data.authorPhotoUrl,
    content: data.content,
    createdAt,
    comments: [],
  };
}

export async function createNoteComment(data: {
  noteId: string;
  authorClerkId: string;
  authorName: string;
  authorPhotoUrl?: string;
  content: string;
}): Promise<NoteComment> {
  const base = getBase();
  const createdAt = new Date().toISOString();

  const record = await base(COMMENTS_TABLE).create({
    NoteRecordId: data.noteId,
    AuthorClerkId: data.authorClerkId,
    AuthorName: data.authorName,
    AuthorPhotoUrl: data.authorPhotoUrl ?? "",
    Content: data.content,
    CreatedAt: createdAt,
  });

  return {
    id: record.id,
    authorClerkId: data.authorClerkId,
    authorName: data.authorName,
    authorPhotoUrl: data.authorPhotoUrl,
    content: data.content,
    createdAt,
  };
}

export async function deleteProjectNote(noteId: string): Promise<void> {
  const base = getBase();
  // Delete associated comments first
  const comments = await base(COMMENTS_TABLE)
    .select({ filterByFormula: `{NoteRecordId} = "${noteId}"` })
    .all();
  for (const c of comments) {
    await base(COMMENTS_TABLE).destroy(c.id);
  }
  await base(NOTES_TABLE).destroy(noteId);
}
