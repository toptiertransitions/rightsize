"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import type { ContentItem, ContentCategory, ContentComment, ContentItemType, ContentAudience, ContentPipelineStage, ContentStatus, StaffMember } from "@/lib/types";

// ─── Types ────────────────────────────────────────────────────────────────────

type ViewMode = "grid" | "table";
type SortKey = "newest" | "oldest" | "downloads" | "likes" | "az";

const AUDIENCES: { key: ContentAudience | "All"; label: string }[] = [
  { key: "Both", label: "External" },
  { key: "Clients", label: "Clients" },
  { key: "ReferralPartners", label: "Referral Partners" },
  { key: "InternalTraining", label: "Internal Training" },
  { key: "All", label: "All" },
];

type StageOption = { key: ContentPipelineStage | "All"; label: string };

const STAGES_BY_AUDIENCE: Record<ContentAudience | "All", StageOption[]> = {
  All: [{ key: "All", label: "All Stages" }],
  Both: [
    { key: "All", label: "All Stages" },
    { key: "Lead", label: "Lead" },
    { key: "Qualifying", label: "Qualifying" },
    { key: "Proposing", label: "Proposing" },
    { key: "Won", label: "Won" },
    { key: "Identified", label: "Identified" },
    { key: "Met", label: "Met" },
    { key: "Agreed to Refer", label: "Agreed to Refer" },
    { key: "Shared Leads", label: "Shared Leads" },
    { key: "Active Referral", label: "Active Referral" },
    { key: "Inactive Referral", label: "Inactive Referral" },
  ],
  Clients: [
    { key: "All", label: "All Stages" },
    { key: "Lead", label: "Lead" },
    { key: "Qualifying", label: "Qualifying" },
    { key: "Proposing", label: "Proposing" },
    { key: "Won", label: "Won" },
  ],
  ReferralPartners: [
    { key: "All", label: "All Stages" },
    { key: "Identified", label: "Identified" },
    { key: "Met", label: "Met" },
    { key: "Agreed to Refer", label: "Agreed to Refer" },
    { key: "Shared Leads", label: "Shared Leads" },
    { key: "Active Referral", label: "Active Referral" },
    { key: "Inactive Referral", label: "Inactive Referral" },
  ],
  InternalTraining: [
    { key: "All", label: "All Stages" },
    { key: "Onboarding", label: "Onboarding" },
    { key: "New Feature", label: "New Feature" },
    { key: "Ad Hoc", label: "Ad Hoc" },
  ],
};

const TYPES: { key: ContentItemType | "All"; label: string; icon: string }[] = [
  { key: "All", label: "All Types", icon: "◈" },
  { key: "PDF", label: "PDF", icon: "📄" },
  { key: "Image", label: "Image", icon: "🖼" },
  { key: "PartnerLogo", label: "Partner Logo", icon: "🏢" },
  { key: "URL", label: "Link", icon: "🔗" },
  { key: "LinkedIn", label: "LinkedIn", icon: "💼" },
];

const TYPE_COLORS: Record<ContentItemType, string> = {
  PDF: "bg-red-50 text-red-700 border-red-200",
  Image: "bg-purple-50 text-purple-700 border-purple-200",
  PartnerLogo: "bg-teal-50 text-teal-700 border-teal-200",
  URL: "bg-gray-50 text-gray-700 border-gray-200",
  LinkedIn: "bg-sky-50 text-sky-700 border-sky-200",
};

const AUDIENCE_COLORS: Record<ContentAudience, string> = {
  Clients: "bg-emerald-50 text-emerald-700",
  ReferralPartners: "bg-violet-50 text-violet-700",
  Both: "bg-amber-50 text-amber-700",
  InternalTraining: "bg-sky-50 text-sky-700",
};

function audienceLabel(a: ContentAudience): string {
  if (a === "ReferralPartners") return "Partners";
  if (a === "InternalTraining") return "Training";
  return a;
}

// ─── Download URL builder ─────────────────────────────────────────────────────
// Cloudinary raw URLs (PDFs, videos) have no extension and use a random internal
// ID as the filename. Route those through our proxy so the browser gets the
// correct Content-Type and a clean title-based filename. Images are served
// directly since their Cloudinary URLs already carry the right extension.

const PROXIED_TYPES = new Set<ContentItemType>(["PDF"]);

function buildDownloadUrl(item: ContentItem): string {
  if (!item.fileUrl) return item.linkUrl ?? "";
  if (PROXIED_TYPES.has(item.contentType)) {
    return `/api/content/items/${item.id}/file`;
  }
  return item.fileUrl;
}

// ─── Thumbnail component ──────────────────────────────────────────────────────

function ContentThumbnail({ item, category, size = "lg" }: { item: ContentItem; category?: ContentCategory; size?: "lg" | "sm" }) {
  const h = size === "lg" ? "h-44" : "h-12 w-12";
  const color = category?.color ?? "#6b7280";

  if (item.thumbnailUrl) {
    return (
      <div className={cn("overflow-hidden rounded-t-xl bg-gray-100", size === "lg" ? "w-full h-44" : "h-12 w-12 rounded-lg flex-shrink-0")}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={item.thumbnailUrl} alt={item.title} className="w-full h-full object-cover" />
      </div>
    );
  }

  const typeIcon = item.contentType === "PDF" ? "📄" : item.contentType === "Image" ? "🖼" : item.contentType === "PartnerLogo" ? "🏢" : item.contentType === "LinkedIn" ? "💼" : "🔗";
  const initial = item.title.charAt(0).toUpperCase();

  if (size === "sm") {
    return (
      <div className="h-12 w-12 rounded-lg flex-shrink-0 flex items-center justify-center text-white text-lg font-bold" style={{ background: `linear-gradient(135deg, ${color}cc, ${color})` }}>
        {initial}
      </div>
    );
  }

  return (
    <div className="w-full h-44 rounded-t-xl flex flex-col items-center justify-center gap-2" style={{ background: `linear-gradient(135deg, ${color}22, ${color}44)` }}>
      <span className="text-4xl">{typeIcon}</span>
      <span className="text-2xl font-bold" style={{ color }}>{initial}</span>
    </div>
  );
}

// ─── Content Card ─────────────────────────────────────────────────────────────

function ContentCard({
  item, category, isAdmin, likedByMe,
  onEdit, onArchive, onDelete, onSelect, onToggleLike,
}: {
  item: ContentItem;
  category?: ContentCategory;
  isAdmin: boolean;
  likedByMe: boolean;
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onSelect: () => void;
  onToggleLike: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    if (menuOpen) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  return (
    <div className="group bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-md hover:border-gray-300 transition-all duration-200 flex flex-col">
      {/* Thumbnail */}
      <button onClick={onSelect} className="w-full text-left relative">
        <ContentThumbnail item={item} category={category} size="lg" />
        {item.status === "Draft" && (
          <span className="absolute top-2 left-2 text-xs bg-gray-900/70 text-white px-2 py-0.5 rounded-full">Draft</span>
        )}
        {isAdmin && (
          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity" ref={menuRef}>
            <button
              onClick={e => { e.stopPropagation(); setMenuOpen(v => !v); }}
              className="w-7 h-7 bg-white/90 backdrop-blur-sm rounded-full border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-white shadow-sm"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" />
              </svg>
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-8 w-40 bg-white border border-gray-200 rounded-xl shadow-lg z-20 overflow-hidden">
                <button onClick={e => { e.stopPropagation(); setMenuOpen(false); onEdit(); }} className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                  Edit
                </button>
                <button onClick={e => { e.stopPropagation(); setMenuOpen(false); onArchive(); }} className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8l1 12a2 2 0 002 2h8a2 2 0 002-2L19 8" /></svg>
                  {item.status === "Archived" ? "Unarchive" : "Archive"}
                </button>
                <button onClick={e => { e.stopPropagation(); setMenuOpen(false); onDelete(); }} className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  Delete
                </button>
              </div>
            )}
          </div>
        )}
      </button>

      {/* Body */}
      <button onClick={onSelect} className="flex-1 text-left p-4 flex flex-col gap-2">
        {/* Badges */}
        <div className="flex flex-wrap gap-1.5">
          <span className={cn("text-xs px-2 py-0.5 rounded-full border font-medium", TYPE_COLORS[item.contentType])}>
            {item.contentType === "LinkedIn" ? "LinkedIn" : item.contentType}
          </span>
          <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", AUDIENCE_COLORS[item.audience])}>
            {audienceLabel(item.audience)}
          </span>
          {item.pipelineStage !== "All" && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-forest-50 text-forest-700 font-medium">{item.pipelineStage}</span>
          )}
        </div>

        {/* Title */}
        <p className="text-sm font-semibold text-gray-900 line-clamp-2 leading-snug">{item.title}</p>

        {/* Description */}
        {item.description && (
          <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed">{item.description}</p>
        )}

        {/* Tags */}
        {item.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-0.5">
            {item.tags.slice(0, 4).map(tag => (
              <span key={tag} className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{tag}</span>
            ))}
            {item.tags.length > 4 && <span className="text-xs text-gray-400">+{item.tags.length - 4}</span>}
          </div>
        )}
      </button>

      {/* Footer */}
      <div className="px-4 py-2.5 border-t border-gray-50 flex items-center justify-between">
        {category && (
          <span className="flex items-center gap-1.5 text-xs text-gray-500">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: category.color }} />
            {category.name}
          </span>
        )}
        <div className="flex items-center gap-3 ml-auto">
          <span className="flex items-center gap-1 text-xs text-gray-400">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
            {item.downloadCount}
          </span>
          <button
            onClick={e => { e.stopPropagation(); onToggleLike(); }}
            className={cn("flex items-center gap-1 text-xs transition-colors", likedByMe ? "text-red-500" : "text-gray-400 hover:text-red-400")}
          >
            <svg className="w-3.5 h-3.5" fill={likedByMe ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>
            {item.likeCount}
          </button>
          <button onClick={e => { e.stopPropagation(); onSelect(); }} className="flex items-center gap-1 text-xs text-gray-400 hover:text-forest-600 transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
            {item.commentCount}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Detail Panel ─────────────────────────────────────────────────────────────

function ContentDetailPanel({
  item, category, isAdmin, likedByMe, comments,
  onClose, onToggleLike, onAddComment, onDeleteComment, onDownload, onEdit,
}: {
  item: ContentItem;
  category?: ContentCategory;
  isAdmin: boolean;
  likedByMe: boolean;
  comments: ContentComment[];
  onClose: () => void;
  onToggleLike: () => void;
  onAddComment: (body: string) => Promise<void>;
  onDeleteComment: (id: string) => void;
  onDownload: () => void;
  onEdit: () => void;
}) {
  const [commentText, setCommentText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleComment() {
    if (!commentText.trim()) return;
    setSubmitting(true);
    await onAddComment(commentText.trim());
    setCommentText("");
    setSubmitting(false);
  }

  const url = item.fileUrl ? buildDownloadUrl(item) : item.linkUrl;
  const isExternal = !item.fileUrl && item.linkUrl;

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <div className="w-full max-w-xl bg-white h-full overflow-y-auto shadow-2xl flex flex-col">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center gap-3 z-10">
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-500 truncate">{item.contentType} · {audienceLabel(item.audience)}</p>
          </div>
          {isAdmin && (
            <button onClick={onEdit} className="text-xs text-forest-600 hover:text-forest-700 font-medium px-3 py-1.5 rounded-lg border border-forest-200 hover:bg-forest-50 transition-colors">
              Edit
            </button>
          )}
        </div>

        {/* Thumbnail */}
        <ContentThumbnail item={item} category={category} size="lg" />

        {/* Main content */}
        <div className="flex-1 p-6 flex flex-col gap-5">
          {/* Badges + title */}
          <div>
            <div className="flex flex-wrap gap-1.5 mb-3">
              <span className={cn("text-xs px-2 py-0.5 rounded-full border font-medium", TYPE_COLORS[item.contentType])}>{item.contentType}</span>
              {item.pipelineStage !== "All" && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-forest-50 text-forest-700 font-medium">{item.pipelineStage}</span>
              )}
              {category && (
                <span className="text-xs px-2 py-0.5 rounded-full font-medium text-white" style={{ background: category.color }}>{category.name}</span>
              )}
            </div>
            <h2 className="text-xl font-bold text-gray-900 leading-tight">{item.title}</h2>
            {item.description && <p className="text-sm text-gray-600 mt-2 leading-relaxed">{item.description}</p>}
          </div>

          {/* Tags */}
          {item.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {item.tags.map(tag => (
                <span key={tag} className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">{tag}</span>
              ))}
            </div>
          )}

          {/* Stats */}
          <div className="flex items-center gap-4 py-3 border-y border-gray-100">
            <div className="flex items-center gap-1.5 text-sm text-gray-500">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
              <span className="font-medium text-gray-900">{item.downloadCount}</span> downloads
            </div>
            <div className="flex items-center gap-1.5 text-sm text-gray-500">
              <svg className="w-4 h-4 text-red-400" fill="currentColor" viewBox="0 0 24 24"><path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>
              <span className="font-medium text-gray-900">{item.likeCount}</span> likes
            </div>
            <div className="text-sm text-gray-400 ml-auto">
              {new Date(item.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </div>
          </div>

          {/* Action buttons */}
          {url && (
            <div className="flex gap-2">
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                onClick={onDownload}
                className="flex-1 flex items-center justify-center gap-2 bg-forest-600 text-white text-sm font-medium px-4 py-2.5 rounded-xl hover:bg-forest-700 transition-colors"
              >
                {isExternal ? (
                  <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>Open Link</>
                ) : (
                  <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>Download</>
                )}
              </a>
              <button
                onClick={onToggleLike}
                className={cn("flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition-colors", likedByMe ? "bg-red-50 border-red-200 text-red-600" : "bg-white border-gray-200 text-gray-600 hover:border-red-200 hover:text-red-500")}
              >
                <svg className="w-4 h-4" fill={likedByMe ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>
                {likedByMe ? "Liked" : "Like"}
              </button>
            </div>
          )}

          {/* Comments */}
          <div>
            <p className="text-sm font-semibold text-gray-900 mb-3">Comments ({comments.length})</p>
            {comments.length === 0 ? (
              <p className="text-sm text-gray-400 italic">No comments yet. Be the first!</p>
            ) : (
              <div className="space-y-3 mb-4">
                {comments.map(c => (
                  <div key={c.id} className="flex gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-forest-100 flex items-center justify-center text-xs font-bold text-forest-700 flex-shrink-0">
                      {c.authorPhotoUrl
                        ? <img src={c.authorPhotoUrl} alt="" className="w-7 h-7 rounded-full object-cover" />
                        : c.authorName.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 bg-gray-50 rounded-xl px-3 py-2">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs font-semibold text-gray-800">{c.authorName}</span>
                        <span className="text-xs text-gray-400">{new Date(c.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                      </div>
                      <p className="text-sm text-gray-700 leading-relaxed">{c.body}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Comment input */}
            <div className="flex gap-2 mt-3">
              <textarea
                value={commentText}
                onChange={e => setCommentText(e.target.value)}
                placeholder="Add a comment…"
                rows={2}
                className="flex-1 text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-forest-500 resize-none placeholder-gray-400"
              />
              <button
                onClick={handleComment}
                disabled={!commentText.trim() || submitting}
                className="px-3 py-2 bg-forest-600 text-white text-sm rounded-xl hover:bg-forest-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors self-end"
              >
                {submitting ? "…" : "Post"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Upload / Edit Modal ──────────────────────────────────────────────────────

const PRESET_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e", "#14b8a6",
  "#3b82f6", "#8b5cf6", "#ec4899", "#6b7280", "#1d4ed8",
];

function ContentFormModal({
  item, categories, onClose, onSave, isAdmin, currentUserId, staffMembers,
}: {
  item?: ContentItem;
  categories: ContentCategory[];
  onClose: () => void;
  onSave: (data: Partial<ContentItem> & { fileObj?: File }) => Promise<void>;
  isAdmin: boolean;
  currentUserId: string;
  staffMembers: StaffMember[];
}) {
  const [title, setTitle] = useState(item?.title ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [contentType, setContentType] = useState<ContentItemType>(item?.contentType ?? "PDF");
  const [audience, setAudience] = useState<ContentAudience>(item?.audience ?? "Both");
  const [pipelineStage, setPipelineStage] = useState<ContentPipelineStage>(item?.pipelineStage ?? "All");
  const [categoryId, setCategoryId] = useState(item?.categoryId ?? "");
  const [tags, setTags] = useState(item?.tags.join(", ") ?? "");
  const [status, setStatus] = useState<ContentStatus>(item?.status ?? "Active");
  const [linkUrl, setLinkUrl] = useState(item?.linkUrl ?? "");
  const [scheduledDate, setScheduledDate] = useState(item?.scheduledDate ?? "");
  const [fileObj, setFileObj] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadedUrl, setUploadedUrl] = useState(item?.fileUrl ?? "");
  const [uploadedPublicId, setUploadedPublicId] = useState(item?.filePublicId ?? "");
  const [thumbnailUrl, setThumbnailUrl] = useState(item?.thumbnailUrl ?? "");
  const [thumbnailPublicId, setThumbnailPublicId] = useState(item?.thumbnailPublicId ?? "");
  const [generatingIcon, setGeneratingIcon] = useState(false);
  const [iconError, setIconError] = useState("");
  const [shareMode, setShareMode] = useState<"all" | "specific" | "private">(
    item ? (item.sharedWith?.length ? "specific" : "all") : "all"
  );
  const [sharedWith, setSharedWith] = useState<string[]>(item?.sharedWith ?? []);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const needsFile = contentType === "PDF" || contentType === "Image" || contentType === "PartnerLogo";
  const needsLink = contentType === "URL" || contentType === "LinkedIn";

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileObj(file);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("tenantId", "content");
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json();
      setUploadedUrl(data.photoUrl || data.fileUrl || "");
      setUploadedPublicId(data.photoPublicId || data.filePublicId || "");
      if (file.type.startsWith("image/")) setFilePreview(URL.createObjectURL(file));
    } finally {
      setUploading(false);
    }
  }

  async function generateIcon() {
    if (!title.trim()) return;
    setGeneratingIcon(true);
    setIconError("");
    try {
      const res = await fetch("/api/content/generate-icon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), description: description.trim() || undefined, contentType, audience }),
      });
      const data = await res.json();
      if (!res.ok) { setIconError(data.error ?? "Generation failed"); return; }
      setThumbnailUrl(data.thumbnailUrl);
      setThumbnailPublicId(data.thumbnailPublicId);
    } catch {
      setIconError("Something went wrong. Try again.");
    } finally {
      setGeneratingIcon(false);
    }
  }

  async function handleSave() {
    if (!title.trim()) return;
    setSaving(true);
    const parsedTags = tags.split(",").map(t => t.trim()).filter(Boolean);
    await onSave({
      title: title.trim(),
      description: description.trim() || undefined,
      contentType,
      audience,
      pipelineStage,
      categoryId: categoryId || undefined,
      tags: parsedTags,
      status,
      scheduledDate: scheduledDate || undefined,
      linkUrl: needsLink ? linkUrl : undefined,
      fileUrl: uploadedUrl || undefined,
      filePublicId: uploadedPublicId || undefined,
      thumbnailUrl: thumbnailUrl || undefined,
      thumbnailPublicId: thumbnailPublicId || undefined,
      sharedWith: shareMode === "specific" ? sharedWith : [],
    });
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between z-10">
          <h3 className="text-base font-semibold text-gray-900">{item ? "Edit Content" : "Add Content"}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Type */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Content Type</label>
            <div className="flex flex-wrap gap-2">
              {TYPES.slice(1).map(t => (
                <button key={t.key} onClick={() => setContentType(t.key as ContentItemType)}
                  className={cn("px-3 py-1.5 text-sm rounded-lg border transition-colors", contentType === t.key ? "border-forest-500 bg-forest-50 text-forest-700 font-medium" : "border-gray-200 text-gray-600 hover:border-gray-300")}
                >
                  {t.icon} {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* File upload or Link */}
          {needsFile && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                {contentType === "PDF" ? "Upload PDF" : contentType === "PartnerLogo" ? "Upload Logo (JPEG / PNG)" : "Upload Image"}
              </label>
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-gray-200 rounded-xl p-4 text-center cursor-pointer hover:border-forest-400 hover:bg-forest-50/30 transition-colors"
              >
                {uploading ? (
                  <p className="text-sm text-gray-500">Uploading…</p>
                ) : uploadedUrl || filePreview ? (
                  <div className="flex items-center gap-3">
                    {filePreview && <img src={filePreview} alt="" className="h-12 w-12 object-cover rounded-lg" />}
                    <div className="text-left">
                      <p className="text-sm font-medium text-gray-900">{fileObj?.name ?? "File uploaded"}</p>
                      <p className="text-xs text-green-600">✓ Ready to save</p>
                    </div>
                    <svg className="w-4 h-4 text-gray-400 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                  </div>
                ) : (
                  <>
                    <svg className="w-8 h-8 text-gray-300 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                    <p className="text-sm text-gray-500">Click to upload {contentType === "PDF" ? "a PDF" : "an image"}</p>
                  </>
                )}
                <input ref={fileInputRef} type="file" accept={contentType === "PDF" ? ".pdf" : "image/*"} onChange={handleFileChange} className="hidden" />
              </div>
            </div>
          )}
          {needsLink && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                {contentType === "LinkedIn" ? "LinkedIn Post URL" : "Link URL"}
              </label>
              <input
                type="url"
                value={linkUrl}
                onChange={e => setLinkUrl(e.target.value)}
                placeholder={contentType === "LinkedIn" ? "https://linkedin.com/posts/…" : "https://…"}
                className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-forest-500"
              />
            </div>
          )}

          {/* Title */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Title *</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Clear, descriptive title"
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-forest-500"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Brief description of the content…"
              rows={2}
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-forest-500 resize-none"
            />
          </div>

          {/* AI Icon */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Icon</label>
            <div className="flex items-start gap-3">
              {/* Preview */}
              <div className="shrink-0 w-16 h-16 rounded-xl border border-gray-200 overflow-hidden bg-gray-50 flex items-center justify-center">
                {thumbnailUrl ? (
                  <img src={thumbnailUrl} alt="icon" className="w-full h-full object-cover" />
                ) : (
                  <svg className="w-7 h-7 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                )}
              </div>
              {/* Controls */}
              <div className="flex-1 min-w-0">
                <button
                  type="button"
                  onClick={generateIcon}
                  disabled={!title.trim() || generatingIcon}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl border border-amber-200 bg-amber-50 text-sm font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {generatingIcon ? (
                    <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>Generating…</>
                  ) : (
                    <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>{thumbnailUrl ? "Regenerate Icon" : "Generate AI Icon"}</>
                  )}
                </button>
                {!title.trim() && <p className="mt-1.5 text-xs text-gray-400">Enter a title first</p>}
                {thumbnailUrl && !generatingIcon && (
                  <button type="button" onClick={() => { setThumbnailUrl(""); setThumbnailPublicId(""); }} className="mt-1.5 text-xs text-gray-400 hover:text-red-500 transition-colors">
                    Remove icon
                  </button>
                )}
                {iconError && <p className="mt-1.5 text-xs text-red-500">{iconError}</p>}
              </div>
            </div>
          </div>

          {/* Audience + Stage */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Audience</label>
              <select value={audience} onChange={e => { setAudience(e.target.value as ContentAudience); setPipelineStage("All"); }}
                className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-forest-500">
                <option value="Both">Both</option>
                <option value="Clients">Clients</option>
                <option value="ReferralPartners">Referral Partners</option>
                <option value="InternalTraining">Internal Training</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Pipeline Stage</label>
              <select value={pipelineStage} onChange={e => setPipelineStage(e.target.value as ContentPipelineStage)}
                className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-forest-500">
                {STAGES_BY_AUDIENCE[audience].map(s => (
                  <option key={s.key} value={s.key}>{s.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Category + Status */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Category</label>
              <select value={categoryId} onChange={e => setCategoryId(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-forest-500">
                <option value="">No category</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Status</label>
              <select value={status} onChange={e => setStatus(e.target.value as ContentStatus)}
                className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-forest-500">
                <option value="Active">Active</option>
                <option value="Draft">Draft</option>
                <option value="Archived">Archived</option>
              </select>
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Tags <span className="font-normal normal-case text-gray-400">(comma-separated)</span></label>
            <input
              type="text"
              value={tags}
              onChange={e => setTags(e.target.value)}
              placeholder="e.g. case study, senior living, nurture"
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-forest-500"
            />
          </div>

          {/* Scheduled date */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Calendar Date <span className="font-normal normal-case text-gray-400">(optional)</span></label>
            <input
              type="date"
              value={scheduledDate}
              onChange={e => setScheduledDate(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-forest-500"
            />
          </div>

          {/* Visibility (admin only) */}
          {isAdmin && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Visibility</label>
              <div className="space-y-2">
                {([
                  { mode: "all", label: "All reps", desc: "Visible to everyone on the team" },
                  { mode: "specific", label: "Specific reps", desc: "Choose who can see this content" },
                  { mode: "private", label: "Private", desc: "Only you can see this" },
                ] as const).map(opt => (
                  <label key={opt.mode} className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="radio"
                      name="contentShareMode"
                      value={opt.mode}
                      checked={shareMode === opt.mode}
                      onChange={() => setShareMode(opt.mode)}
                      className="mt-0.5 accent-forest-600 shrink-0"
                    />
                    <div>
                      <span className="text-sm text-gray-800 font-medium">{opt.label}</span>
                      <span className="text-xs text-gray-400 ml-2">{opt.desc}</span>
                    </div>
                  </label>
                ))}
                {shareMode === "specific" && (
                  <div className="ml-5 mt-2 rounded-xl border border-gray-200 p-3 bg-gray-50">
                    <p className="text-xs font-medium text-gray-600 mb-2">Select reps to share with:</p>
                    {staffMembers.filter(s => s.clerkUserId !== currentUserId && ["TTTSales", "TTTManager", "TTTAdmin"].includes(s.role ?? "")).length === 0 ? (
                      <p className="text-xs text-gray-400">No other staff members found.</p>
                    ) : (
                      <div className="space-y-1 max-h-44 overflow-y-auto">
                        {staffMembers.filter(s => s.clerkUserId !== currentUserId && ["TTTSales", "TTTManager", "TTTAdmin"].includes(s.role ?? "")).map(s => (
                          <label key={s.clerkUserId} className="flex items-center gap-2 cursor-pointer py-0.5">
                            <input
                              type="checkbox"
                              checked={sharedWith.includes(s.clerkUserId)}
                              onChange={e => {
                                const id = s.clerkUserId;
                                setSharedWith(prev => e.target.checked ? [...prev, id] : prev.filter(x => x !== id));
                              }}
                              className="h-3.5 w-3.5 rounded accent-forest-600"
                            />
                            <span className="text-sm text-gray-700">{s.displayName}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t border-gray-100 px-6 py-4 flex gap-3">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 border border-gray-200 text-sm text-gray-700 rounded-xl hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!title.trim() || saving || uploading}
            className="flex-1 px-4 py-2.5 bg-forest-600 text-white text-sm font-medium rounded-xl hover:bg-forest-700 disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving…" : item ? "Save Changes" : "Add Content"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Category Manager Modal ───────────────────────────────────────────────────

function CategoryManagerModal({ categories, onClose, onChange }: {
  categories: ContentCategory[];
  onClose: () => void;
  onChange: (cats: ContentCategory[]) => void;
}) {
  const [list, setList] = useState(categories);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]);
  const [saving, setSaving] = useState(false);
  const [addError, setAddError] = useState("");

  async function add() {
    if (!newName.trim()) return;
    setSaving(true);
    setAddError("");
    try {
      const res = await fetch("/api/content/categories", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: newName.trim(), color: newColor, sortOrder: list.length }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.category) { setAddError(data.error ?? "Failed to create category"); return; }
      const updated = [...list, data.category];
      setList(updated);
      onChange(updated);
      setNewName("");
    } catch {
      setAddError("Unexpected error — please try again");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    await fetch(`/api/content/categories/${id}`, { method: "DELETE" });
    const updated = list.filter(c => c.id !== id);
    setList(updated);
    onChange(updated);
  }

  async function updateColor(id: string, color: string) {
    await fetch(`/api/content/categories/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ color }) });
    const updated = list.map(c => c.id === id ? { ...c, color } : c);
    setList(updated);
    onChange(updated);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-900">Manage Categories</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="p-6 space-y-3 max-h-[50vh] overflow-y-auto">
          {list.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">No categories yet.</p>
          ) : list.map(cat => (
            <div key={cat.id} className="flex items-center gap-3">
              <div className="relative">
                <input type="color" value={cat.color} onChange={e => updateColor(cat.id, e.target.value)}
                  className="w-8 h-8 rounded-lg border border-gray-200 cursor-pointer p-0.5" title="Change color" />
              </div>
              <span className="flex-1 text-sm text-gray-800 font-medium">{cat.name}</span>
              <button onClick={() => remove(cat.id)} className="p-1.5 text-gray-400 hover:text-red-500 transition-colors rounded">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              </button>
            </div>
          ))}
        </div>

        <div className="px-6 pb-4 border-t border-gray-100 pt-4 space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Add New Category</p>
          <div className="flex gap-2">
            <input type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Category name"
              className="flex-1 text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-forest-500"
              onKeyDown={e => e.key === "Enter" && add()} />
            <input type="color" value={newColor} onChange={e => setNewColor(e.target.value)}
              className="w-9 h-9 rounded-lg border border-gray-200 cursor-pointer p-0.5 flex-shrink-0" />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {PRESET_COLORS.map(c => (
              <button key={c} onClick={() => setNewColor(c)} className={cn("w-6 h-6 rounded-full border-2 transition-transform hover:scale-110", newColor === c ? "border-gray-800 scale-110" : "border-transparent")} style={{ background: c }} />
            ))}
          </div>
          {addError && <p className="text-xs text-red-600">{addError}</p>}
          <button onClick={add} disabled={!newName.trim() || saving}
            className="w-full py-2 bg-forest-600 text-white text-sm font-medium rounded-xl hover:bg-forest-700 disabled:opacity-50 transition-colors">
            {saving ? "Adding…" : "Add Category"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main ContentRepository Component ────────────────────────────────────────

interface Props {
  isAdmin: boolean;
  currentUserId: string;
  staffMembers?: StaffMember[];
  focusItemId?: string | null;
  onFocusConsumed?: () => void;
  focusItemIdForEdit?: string | null;
  onFocusForEditConsumed?: () => void;
}

export default function ContentRepository({ isAdmin, currentUserId, staffMembers = [], focusItemId, onFocusConsumed, focusItemIdForEdit, onFocusForEditConsumed }: Props) {
  const [items, setItems] = useState<ContentItem[]>([]);
  const [categories, setCategories] = useState<ContentCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [search, setSearch] = useState("");
  const [audienceFilter, setAudienceFilter] = useState<ContentAudience | "All">("Both");
  const [stageFilter, setStageFilter] = useState<ContentPipelineStage | "All">("All");
  const [typeFilter, setTypeFilter] = useState<ContentItemType | "All">("All");
  const [statusFilter, setStatusFilter] = useState<ContentStatus | "All">("Active");
  const [sortKey, setSortKey] = useState<SortKey>("newest");
  const [selectedItem, setSelectedItem] = useState<ContentItem | null>(null);
  const [editingItem, setEditingItem] = useState<ContentItem | null | "new">(null);
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [comments, setComments] = useState<ContentComment[]>([]);
  const [likedSet, setLikedSet] = useState<Set<string>>(new Set());
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [pendingEditFocusId, setPendingEditFocusId] = useState<string | null>(null);
  const [templateBanner, setTemplateBanner] = useState<{ type: "generating" | "success" | "error"; msg: string } | null>(null);

  useEffect(() => {
    loadData();
  }, [statusFilter]);

  useEffect(() => {
    if (!focusItemId || items.length === 0) return;
    const target = items.find(i => i.id === focusItemId);
    if (target) {
      setSelectedItem(target);
      onFocusConsumed?.();
    }
  }, [focusItemId, items]);

  // When the calendar requests editing a specific item, switch to "All" status so
  // drafts (created via Quick Add) are visible, then open the edit modal once items load.
  // "__new__" is a sentinel meaning "open the new upload form immediately".
  useEffect(() => {
    if (!focusItemIdForEdit) return;
    if (focusItemIdForEdit === "__new__") {
      setEditingItem("new");
      onFocusForEditConsumed?.();
      return;
    }
    setPendingEditFocusId(focusItemIdForEdit);
    setStatusFilter("All");
    onFocusForEditConsumed?.();
  }, [focusItemIdForEdit]);

  useEffect(() => {
    if (!pendingEditFocusId || items.length === 0) return;
    const target = items.find(i => i.id === pendingEditFocusId);
    if (target) {
      setEditingItem(target);
      setPendingEditFocusId(null);
    }
  }, [pendingEditFocusId, items]);

  async function loadData() {
    setLoading(true);
    const apiStatus = statusFilter === "All" ? "all" : statusFilter;
    const [itemsRes, catsRes] = await Promise.all([
      fetch(`/api/content/items?status=${apiStatus}`).then(r => r.json()),
      fetch("/api/content/categories").then(r => r.json()),
    ]);
    setItems(itemsRes.items ?? []);
    setCategories(catsRes.categories ?? []);

    // Load likes for current user
    if (itemsRes.items?.length) {
      const ids = itemsRes.items.map((i: ContentItem) => i.id);
      const likeChecks = await Promise.all(ids.slice(0, 20).map((id: string) =>
        fetch(`/api/content/items/${id}/like`).then(r => r.json()).then((d: { liked: boolean }) => d.liked ? id : null).catch(() => null)
      ));
      setLikedSet(new Set(likeChecks.filter(Boolean) as string[]));
    }

    setLoading(false);
  }

  async function loadComments(itemId: string) {
    const res = await fetch(`/api/content/items/${itemId}/comments`);
    const data = await res.json();
    setComments(data.comments ?? []);
  }

  function openDetail(item: ContentItem) {
    setSelectedItem(item);
    loadComments(item.id);
  }

  async function handleToggleLike(id: string) {
    const res = await fetch(`/api/content/items/${id}/like`, { method: "POST" });
    const data = await res.json();
    setLikedSet(prev => {
      const next = new Set(prev);
      data.liked ? next.add(id) : next.delete(id);
      return next;
    });
    setItems(prev => prev.map(i => i.id === id ? { ...i, likeCount: i.likeCount + (data.liked ? 1 : -1) } : i));
    if (selectedItem?.id === id) setSelectedItem(prev => prev ? { ...prev, likeCount: prev.likeCount + (data.liked ? 1 : -1) } : prev);
  }

  async function handleDownload(id: string) {
    await fetch(`/api/content/items/${id}/download`, { method: "POST" });
    setItems(prev => prev.map(i => i.id === id ? { ...i, downloadCount: i.downloadCount + 1 } : i));
    if (selectedItem?.id === id) setSelectedItem(prev => prev ? { ...prev, downloadCount: prev.downloadCount + 1 } : prev);
  }

  async function handleAddComment(body: string) {
    if (!selectedItem) return;
    const res = await fetch(`/api/content/items/${selectedItem.id}/comments`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body }),
    });
    const data = await res.json();
    setComments(prev => [...prev, data.comment]);
    setItems(prev => prev.map(i => i.id === selectedItem.id ? { ...i, commentCount: i.commentCount + 1 } : i));
  }

  async function handleDeleteComment(commentId: string) {
    if (!selectedItem) return;
    await fetch(`/api/content/items/${selectedItem.id}/comments/${commentId}`, { method: "DELETE" });
    setComments(prev => prev.filter(c => c.id !== commentId));
  }

  function triggerAutoTemplate(itemId: string, itemTitle?: string) {
    setTemplateBanner({ type: "generating", msg: "Generating branded email template…" });
    fetch("/api/content/items/auto-template", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId }),
    })
      .then(r => r.json())
      .then((result: { success?: boolean; templateName?: string; error?: string; skipped?: boolean }) => {
        if (result.success) {
          setTemplateBanner({ type: "success", msg: `Email template "${result.templateName ?? itemTitle}" created — check the Templates tab.` });
          setTimeout(() => setTemplateBanner(null), 8000);
        } else {
          setTemplateBanner({ type: "error", msg: `Template generation failed: ${result.error ?? "unknown error"}` });
        }
      })
      .catch(err => {
        setTemplateBanner({ type: "error", msg: `Template generation request failed: ${String(err)}` });
      });
  }

  async function handleSaveItem(data: Partial<ContentItem> & { fileObj?: File }) {
    if (editingItem && editingItem !== "new") {
      const res = await fetch(`/api/content/items/${editingItem.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      });
      const d = await res.json();
      setItems(prev => prev.map(i => i.id === editingItem.id ? d.item : i));
      // Trigger when audience is explicitly being set to ReferralPartners on an edit
      if (data.audience === "ReferralPartners" && d.item) {
        triggerAutoTemplate(d.item.id, d.item.title);
      }
    } else {
      const res = await fetch("/api/content/items", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      });
      const d = await res.json();
      setItems(prev => [d.item, ...prev]);
      if (d.item?.audience === "ReferralPartners") {
        triggerAutoTemplate(d.item.id, d.item.title);
      }
    }
    setEditingItem(null);
  }

  async function handleArchiveToggle(item: ContentItem) {
    const newStatus: ContentStatus = item.status === "Archived" ? "Active" : "Archived";
    const res = await fetch(`/api/content/items/${item.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: newStatus }),
    });
    const data = await res.json();
    setItems(prev => prev.map(i => i.id === item.id ? data.item : i));
  }

  async function handleDelete(id: string) {
    await fetch(`/api/content/items/${id}`, { method: "DELETE" });
    setItems(prev => prev.filter(i => i.id !== id));
    setDeleteConfirm(null);
  }

  // ── Filtering + sorting ────────────────────────────────────────────────────
  const filtered = items.filter(item => {
    if (audienceFilter === "Both") { if (item.audience === "InternalTraining") return false; }
    else if (audienceFilter !== "All" && item.audience !== audienceFilter && item.audience !== "Both") return false;
    if (stageFilter !== "All" && item.pipelineStage !== stageFilter && item.pipelineStage !== "All") return false;
    if (typeFilter !== "All" && item.contentType !== typeFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const matchTitle = item.title.toLowerCase().includes(q);
      const matchDesc = item.description?.toLowerCase().includes(q);
      const matchTags = item.tags.some(t => t.toLowerCase().includes(q));
      if (!matchTitle && !matchDesc && !matchTags) return false;
    }
    return true;
  }).sort((a, b) => {
    if (sortKey === "newest") return b.createdAt.localeCompare(a.createdAt);
    if (sortKey === "oldest") return a.createdAt.localeCompare(b.createdAt);
    if (sortKey === "downloads") return b.downloadCount - a.downloadCount;
    if (sortKey === "likes") return b.likeCount - a.likeCount;
    return a.title.localeCompare(b.title);
  });

  const catMap = new Map(categories.map(c => [c.id, c]));

  return (
    <div className="space-y-4">
      {/* Template generation banner */}
      {templateBanner && (
        <div className={cn(
          "flex items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm font-medium",
          templateBanner.type === "generating" && "bg-forest-50 text-forest-700 border border-forest-200",
          templateBanner.type === "success" && "bg-green-50 text-green-700 border border-green-200",
          templateBanner.type === "error" && "bg-red-50 text-red-700 border border-red-200",
        )}>
          <div className="flex items-center gap-2">
            {templateBanner.type === "generating" && (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
            )}
            <span>{templateBanner.msg}</span>
          </div>
          <button onClick={() => setTemplateBanner(null)} className="text-current opacity-50 hover:opacity-100">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by title, description, or tag…"
            className="w-full pl-9 pr-4 h-9 rounded-xl border border-gray-200 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-forest-500"
          />
        </div>

        {/* Sort */}
        <select value={sortKey} onChange={e => setSortKey(e.target.value as SortKey)}
          className="h-9 border border-gray-200 rounded-xl px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-forest-500">
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="downloads">Most downloaded</option>
          <option value="likes">Most liked</option>
          <option value="az">A–Z</option>
        </select>

        {/* View toggle */}
        <div className="flex rounded-xl border border-gray-200 overflow-hidden">
          <button onClick={() => setViewMode("grid")} className={cn("px-3 py-1.5 transition-colors", viewMode === "grid" ? "bg-forest-600 text-white" : "bg-white text-gray-500 hover:bg-gray-50")}>
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>
          </button>
          <button onClick={() => setViewMode("table")} className={cn("px-3 py-1.5 transition-colors", viewMode === "table" ? "bg-forest-600 text-white" : "bg-white text-gray-500 hover:bg-gray-50")}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>
          </button>
        </div>

        {isAdmin && (
          <button onClick={() => setEditingItem("new")} className="h-9 px-4 bg-forest-600 text-white text-sm font-medium rounded-xl hover:bg-forest-700 transition-colors flex items-center gap-1.5">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            Add Content
          </button>
        )}
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-2">
        {/* Audience */}
        <div className="flex rounded-xl border border-gray-200 overflow-hidden">
          {AUDIENCES.map(a => (
            <button key={a.key} onClick={() => { setAudienceFilter(a.key as ContentAudience | "All"); setStageFilter("All"); }}
              className={cn("px-3 py-1 text-xs font-medium transition-colors", audienceFilter === a.key ? "bg-forest-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50")}>
              {a.label}
            </button>
          ))}
        </div>

        {/* Stage — options change based on selected audience */}
        <div className="flex rounded-xl border border-gray-200 overflow-hidden">
          {STAGES_BY_AUDIENCE[audienceFilter].map(s => (
            <button key={s.key} onClick={() => setStageFilter(s.key as ContentPipelineStage | "All")}
              className={cn("px-3 py-1 text-xs font-medium transition-colors", stageFilter === s.key ? "bg-forest-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50")}>
              {s.label}
            </button>
          ))}
        </div>

        {/* Type */}
        <div className="flex rounded-xl border border-gray-200 overflow-hidden">
          {TYPES.map(t => (
            <button key={t.key} onClick={() => setTypeFilter(t.key as ContentItemType | "All")}
              className={cn("px-3 py-1 text-xs font-medium transition-colors", typeFilter === t.key ? "bg-forest-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50")}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Status filter */}
        <div className="flex rounded-xl border border-gray-200 overflow-hidden">
          {(["Active", "Draft", "Archived", "All"] as const).map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={cn("px-3 py-1 text-xs font-medium transition-colors", statusFilter === s ? "bg-forest-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50")}>
              {s}
            </button>
          ))}
        </div>

        {/* Category manager */}
        {isAdmin && (
          <button onClick={() => setShowCategoryManager(true)}
            className="px-3 py-1 text-xs font-medium rounded-xl border border-gray-200 bg-white text-gray-500 hover:border-gray-300 flex items-center gap-1 transition-colors">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>
            Categories
          </button>
        )}
      </div>

      {/* Results count */}
      <p className="text-xs text-gray-400">{filtered.length} of {items.length} items</p>

      {/* Content */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1,2,3,4,5,6].map(i => <div key={i} className="bg-gray-100 rounded-xl h-64 animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-20 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
          </div>
          <p className="text-sm font-medium text-gray-900 mb-1">{search ? `No content matches "${search}"` : "No content yet"}</p>
          <p className="text-xs text-gray-400">{isAdmin ? 'Click "Add Content" to upload your first piece.' : "Content will appear here once added by your admin."}</p>
        </div>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(item => (
            <ContentCard
              key={item.id}
              item={item}
              category={item.categoryId ? catMap.get(item.categoryId) : undefined}
              isAdmin={isAdmin}
              likedByMe={likedSet.has(item.id)}
              onSelect={() => openDetail(item)}
              onEdit={() => setEditingItem(item)}
              onArchive={() => handleArchiveToggle(item)}
              onDelete={() => setDeleteConfirm(item.id)}
              onToggleLike={() => handleToggleLike(item.id)}
            />
          ))}
        </div>
      ) : (
        // Table view
        <div className="rounded-xl border border-gray-200 overflow-hidden bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Title</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Type</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Audience</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Stage</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Category</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">↓</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">♡</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">💬</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Added</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(item => {
                const cat = item.categoryId ? catMap.get(item.categoryId) : undefined;
                return (
                  <tr key={item.id} className="hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => openDetail(item)}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <ContentThumbnail item={item} category={cat} size="sm" />
                        <div>
                          <p className="font-medium text-gray-900">{item.title}</p>
                          {item.status === "Draft" && <span className="text-xs text-gray-400">Draft</span>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("text-xs px-2 py-0.5 rounded-full border font-medium", TYPE_COLORS[item.contentType])}>{item.contentType}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{audienceLabel(item.audience)}</td>
                    <td className="px-4 py-3 text-gray-600">{item.pipelineStage}</td>
                    <td className="px-4 py-3">
                      {cat && (
                        <span className="flex items-center gap-1.5 text-xs text-gray-600">
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: cat.color }} />{cat.name}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-500">{item.downloadCount}</td>
                    <td className="px-4 py-3 text-right text-gray-500">{item.likeCount}</td>
                    <td className="px-4 py-3 text-right text-gray-500">{item.commentCount}</td>
                    <td className="px-4 py-3 text-gray-400 whitespace-nowrap text-xs">
                      {new Date(item.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </td>
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      {isAdmin && (
                        <div className="flex gap-1">
                          <button onClick={() => setEditingItem(item)} className="p-1.5 text-gray-400 hover:text-forest-600 rounded transition-colors">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                          </button>
                          <button onClick={() => setDeleteConfirm(item.id)} className="p-1.5 text-gray-400 hover:text-red-500 rounded transition-colors">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail panel */}
      {selectedItem && (
        <ContentDetailPanel
          item={selectedItem}
          category={selectedItem.categoryId ? catMap.get(selectedItem.categoryId) : undefined}
          isAdmin={isAdmin}
          likedByMe={likedSet.has(selectedItem.id)}
          comments={comments}
          onClose={() => setSelectedItem(null)}
          onToggleLike={() => handleToggleLike(selectedItem.id)}
          onAddComment={handleAddComment}
          onDeleteComment={handleDeleteComment}
          onDownload={() => handleDownload(selectedItem.id)}
          onEdit={() => { setEditingItem(selectedItem); setSelectedItem(null); }}
        />
      )}

      {/* Edit/Create modal */}
      {editingItem !== null && (
        <ContentFormModal
          item={editingItem === "new" ? undefined : editingItem}
          categories={categories}
          onClose={() => setEditingItem(null)}
          onSave={handleSaveItem}
          isAdmin={isAdmin}
          currentUserId={currentUserId}
          staffMembers={staffMembers}
        />
      )}

      {/* Category manager */}
      {showCategoryManager && (
        <CategoryManagerModal
          categories={categories}
          onClose={() => setShowCategoryManager(false)}
          onChange={setCategories}
        />
      )}

      {/* Delete confirm */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDeleteConfirm(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h3 className="text-base font-semibold text-gray-900 mb-2">Delete content?</h3>
            <p className="text-sm text-gray-500 mb-5">This is permanent and cannot be undone. Consider archiving instead.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 px-4 py-2 border border-gray-200 text-sm text-gray-700 rounded-xl hover:bg-gray-50 transition-colors">Cancel</button>
              <button onClick={() => handleDelete(deleteConfirm)} className="flex-1 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-xl hover:bg-red-700 transition-colors">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
