"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Pagination } from "../components/Pagination";
import type { LocalVendor, PartnerCategory, PartnerCommunityCompletion } from "@/lib/types";

const PAGE_SIZE = 25;

// The only categories a client actually has a partner "complete work" for —
// Move Manager is the synthetic TTT card on the Partners page, and Community
// is the destination itself, not a partner, so neither is taggable here.
const TAGGABLE_CATEGORIES: PartnerCategory[] = ["Realtor", "Mover", "Hauler", "Donation"];

export interface AdminProject {
  id: string;
  name: string;
  city: string;
  state: string;
  isArchived: boolean;
  isTTT: boolean;
  destinationCommunity?: string;
  destinationCommunityOther?: string;
  seniorCommunityName?: string;
  createdAt: string;
  archivedAt?: string;
}

export interface AdminCommunityOption {
  id: string;
  name: string;
  city: string;
}

interface Props {
  projects: AdminProject[];
  vendors: LocalVendor[];
  seniorCommunities: AdminCommunityOption[];
  completions: PartnerCommunityCompletion[];
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function resolveDisplayCommunity(
  project: AdminProject,
  projectCompletions: PartnerCommunityCompletion[],
  communitiesById: Map<string, AdminCommunityOption>
): string {
  if (projectCompletions.length > 0) return projectCompletions[0].communityName;
  if (project.destinationCommunity) {
    const c = communitiesById.get(project.destinationCommunity);
    if (c) return c.name;
  }
  return project.destinationCommunityOther || project.seniorCommunityName || "";
}

// ─── Tagging Modal ────────────────────────────────────────────────────────────
function TaggingModal({
  project,
  vendors,
  seniorCommunities,
  projectCompletions,
  suggestedCommunityName,
  onClose,
  onSaved,
}: {
  project: AdminProject;
  vendors: LocalVendor[];
  seniorCommunities: AdminCommunityOption[];
  projectCompletions: PartnerCommunityCompletion[];
  suggestedCommunityName: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const existingCommunityId = projectCompletions[0]?.communityId;
  const [communityQuery, setCommunityQuery] = useState(
    projectCompletions[0]?.communityName || suggestedCommunityName
  );
  const [selectedCommunity, setSelectedCommunity] = useState<AdminCommunityOption | null>(
    existingCommunityId ? seniorCommunities.find((c) => c.id === existingCommunityId) ?? null : null
  );
  const [showSuggestions, setShowSuggestions] = useState(false);

  const [categoryPartners, setCategoryPartners] = useState<Record<string, Set<string>>>(() => {
    const initial: Record<string, Set<string>> = {};
    for (const cat of TAGGABLE_CATEGORIES) {
      initial[cat] = new Set(projectCompletions.filter((c) => c.category === cat).map((c) => c.partnerId));
    }
    return initial;
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const filteredCommunities = useMemo(() => {
    const q = communityQuery.trim().toLowerCase();
    if (!q) return seniorCommunities.slice(0, 8);
    return seniorCommunities.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 8);
  }, [communityQuery, seniorCommunities]);

  const togglePartner = (category: string, partnerId: string) => {
    setCategoryPartners((prev) => {
      const next = new Set(prev[category]);
      if (next.has(partnerId)) next.delete(partnerId);
      else next.add(partnerId);
      return { ...prev, [category]: next };
    });
  };

  const totalTagged = Object.values(categoryPartners).reduce((sum, s) => sum + s.size, 0);

  const handleSave = async () => {
    const communityName = (selectedCommunity?.name || communityQuery).trim();
    if (totalTagged > 0 && !communityName) {
      setError("Select or enter a community before tagging partners.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const entries = TAGGABLE_CATEGORIES.flatMap((category) =>
        [...categoryPartners[category]].map((partnerId) => ({ category, partnerId }))
      );
      const res = await fetch("/api/admin/partner-community-completions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: project.id,
          communityId: selectedCommunity?.id,
          communityName,
          entries,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Failed to save");
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-800 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold text-white">{project.name}</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {[project.city, project.state].filter(Boolean).join(", ") || "No location on file"}
              {" · "}
              {project.isArchived ? "Archived" : "Active"}
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-800 text-gray-400">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-5 overflow-y-auto flex-1">
          <div className="relative">
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Destination Community</label>
            <input
              type="text"
              value={selectedCommunity ? selectedCommunity.name : communityQuery}
              onChange={(e) => {
                setSelectedCommunity(null);
                setCommunityQuery(e.target.value);
                setShowSuggestions(true);
              }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              placeholder="Search senior communities…"
              className="w-full h-11 px-3 rounded-xl border border-gray-600 bg-gray-800 text-white text-sm focus:outline-none focus:ring-2 focus:ring-forest-500/40"
            />
            {showSuggestions && filteredCommunities.length > 0 && (
              <div className="absolute z-10 mt-1 w-full bg-gray-800 border border-gray-700 rounded-xl shadow-lg overflow-hidden">
                {filteredCommunities.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onMouseDown={() => {
                      setSelectedCommunity(c);
                      setCommunityQuery(c.name);
                      setShowSuggestions(false);
                    }}
                    className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-gray-700"
                  >
                    {c.name}
                    {c.city && <span className="text-gray-500"> — {c.city}</span>}
                  </button>
                ))}
              </div>
            )}
            {!selectedCommunity && communityQuery.trim() && (
              <p className="text-[11px] text-amber-400 mt-1">
                No matching community selected — will save as free text &ldquo;{communityQuery.trim()}&rdquo;.
              </p>
            )}
          </div>

          {TAGGABLE_CATEGORIES.map((category) => {
            const options = vendors.filter((v) => v.category === category && v.isActive);
            return (
              <div key={category}>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">
                  {category}{category === "Hauler" ? " (Junk Haulers)" : ""}
                </label>
                {options.length === 0 ? (
                  <p className="text-xs text-gray-600">No active {category.toLowerCase()} partners in the directory.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {options.map((v) => {
                      const checked = categoryPartners[category]?.has(v.id) ?? false;
                      return (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() => togglePartner(category, v.id)}
                          className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                            checked
                              ? "bg-forest-600/30 border-forest-500 text-forest-200"
                              : "bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-200"
                          }`}
                        >
                          {v.vendorName}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>

        <div className="px-6 py-4 border-t border-gray-800 flex-shrink-0 flex gap-2">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 h-11 rounded-xl border border-gray-700 text-gray-300 font-medium hover:bg-gray-800 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={loading}
            className="flex-1 h-11 rounded-xl bg-forest-600 text-white font-semibold hover:bg-forest-700 disabled:opacity-50"
          >
            {loading ? "Saving…" : "Save Tagging"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Tab ─────────────────────────────────────────────────────────────────
export function ProjectHistoryTab({ projects, vendors, seniorCommunities, completions }: Props) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "archived">("all");
  const [taggedFilter, setTaggedFilter] = useState<"all" | "tagged" | "untagged">("all");
  const [page, setPage] = useState(1);
  const [editingProject, setEditingProject] = useState<AdminProject | null>(null);
  const [sortCol, setSortCol] = useState<string>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const handleSort = (col: string) => {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortDir("asc"); }
  };

  const sortTh = (col: string, label: string) => (
    <th
      onClick={() => handleSort(col)}
      className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider cursor-pointer select-none hover:text-gray-200 transition-colors"
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <span className="text-[9px]">{sortCol === col ? (sortDir === "asc" ? "↑" : "↓") : "↕"}</span>
      </span>
    </th>
  );

  const communitiesById = useMemo(() => new Map(seniorCommunities.map((c) => [c.id, c])), [seniorCommunities]);

  const completionsByTenant = useMemo(() => {
    const map = new Map<string, PartnerCommunityCompletion[]>();
    for (const c of completions) {
      if (!map.has(c.tenantId)) map.set(c.tenantId, []);
      map.get(c.tenantId)!.push(c);
    }
    return map;
  }, [completions]);

  const rows = useMemo(() => {
    return projects
      .map((p) => {
        const projectCompletions = completionsByTenant.get(p.id) ?? [];
        return {
          project: p,
          completions: projectCompletions,
          communityDisplay: resolveDisplayCommunity(p, projectCompletions, communitiesById),
          taggedCount: projectCompletions.length,
        };
      })
      .filter((r) => {
        if (search.trim() && !r.project.name.toLowerCase().includes(search.trim().toLowerCase())) return false;
        if (statusFilter === "active" && r.project.isArchived) return false;
        if (statusFilter === "archived" && !r.project.isArchived) return false;
        if (taggedFilter === "tagged" && r.taggedCount === 0) return false;
        if (taggedFilter === "untagged" && r.taggedCount > 0) return false;
        return true;
      })
      .sort((a, b) => {
        let av: string | number = "";
        let bv: string | number = "";
        switch (sortCol) {
          case "name":       av = a.project.name.toLowerCase();    bv = b.project.name.toLowerCase();    break;
          case "status":     av = a.project.isArchived ? 1 : 0;    bv = b.project.isArchived ? 1 : 0;    break;
          case "community":  av = a.communityDisplay.toLowerCase(); bv = b.communityDisplay.toLowerCase(); break;
          case "createdAt":  av = a.project.createdAt ?? "";       bv = b.project.createdAt ?? "";       break;
          case "archivedAt": av = a.project.archivedAt ?? "";      bv = b.project.archivedAt ?? "";      break;
          case "tagged":     av = a.taggedCount;                   bv = b.taggedCount;                   break;
        }
        if (av < bv) return sortDir === "asc" ? -1 : 1;
        if (av > bv) return sortDir === "asc" ? 1 : -1;
        return 0;
      });
  }, [projects, completionsByTenant, communitiesById, search, statusFilter, taggedFilter, sortCol, sortDir]);

  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Project History</h1>
        <p className="text-gray-400 mt-1">
          Tag each project&rsquo;s destination community and which partners completed the work — backfill past
          projects and keep this current going forward. Drives the &ldquo;Completed N to [Community]&rdquo; stat
          shown to clients on the Partners page.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder="Search projects…"
          className="h-10 px-3 rounded-xl border border-gray-600 text-sm bg-gray-800 text-white focus:outline-none w-64"
        />
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value as typeof statusFilter); setPage(1); }}
          className="h-10 px-3 rounded-xl border border-gray-600 text-sm bg-gray-800 text-white focus:outline-none"
        >
          <option value="all">All Statuses</option>
          <option value="active">Active</option>
          <option value="archived">Archived</option>
        </select>
        <select
          value={taggedFilter}
          onChange={(e) => { setTaggedFilter(e.target.value as typeof taggedFilter); setPage(1); }}
          className="h-10 px-3 rounded-xl border border-gray-600 text-sm bg-gray-800 text-white focus:outline-none"
        >
          <option value="all">Tagged + Untagged</option>
          <option value="tagged">Tagged only</option>
          <option value="untagged">Untagged only</option>
        </select>
        <span className="text-sm text-gray-500">{rows.length} project{rows.length !== 1 ? "s" : ""}</span>
      </div>

      {rows.length === 0 ? (
        <div className="text-center py-20 text-gray-500">
          <p>No projects match these filters.</p>
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-700 rounded-2xl overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700">
                {sortTh("name", "Project")}
                {sortTh("status", "Status")}
                {sortTh("community", "Community")}
                {sortTh("createdAt", "Created")}
                {sortTh("archivedAt", "Archived")}
                {sortTh("tagged", "Partners Tagged")}
                <th className="sticky right-0 bg-gray-900 px-4 py-3 border-l border-gray-700"></th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((r, i) => (
                <tr key={r.project.id} className={`border-b border-gray-800 ${i % 2 === 0 ? "" : "bg-gray-800/20"}`}>
                  <td className="px-4 py-3 font-medium text-white">
                    {r.project.name}
                    <div className="text-xs text-gray-500">{[r.project.city, r.project.state].filter(Boolean).join(", ")}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${r.project.isArchived ? "bg-gray-700/50 text-gray-300" : "bg-green-900/40 text-green-300"}`}>
                      {r.project.isArchived ? "Archived" : "Active"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-300">
                    {r.communityDisplay || <span className="text-gray-600">—</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-400 whitespace-nowrap">{formatDate(r.project.createdAt)}</td>
                  <td className="px-4 py-3 text-gray-400 whitespace-nowrap">{formatDate(r.project.archivedAt)}</td>
                  <td className="px-4 py-3 text-gray-400">
                    {r.taggedCount > 0 ? `${r.taggedCount} tagged` : <span className="text-gray-600">Untagged</span>}
                  </td>
                  <td className={`sticky right-0 px-4 py-3 border-l border-gray-700 ${i % 2 === 0 ? "bg-gray-900" : "bg-[#171f2e]"}`}>
                    <button
                      onClick={() => setEditingProject(r.project)}
                      className="text-xs text-gray-400 hover:text-white px-2 py-1 rounded-lg hover:bg-gray-700 transition-colors whitespace-nowrap"
                    >
                      {r.taggedCount > 0 ? "Edit" : "Tag"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination currentPage={page} totalItems={rows.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
        </div>
      )}

      {editingProject && (
        <TaggingModal
          project={editingProject}
          vendors={vendors}
          seniorCommunities={seniorCommunities}
          projectCompletions={completionsByTenant.get(editingProject.id) ?? []}
          suggestedCommunityName={resolveDisplayCommunity(editingProject, [], communitiesById)}
          onClose={() => setEditingProject(null)}
          onSaved={() => { setEditingProject(null); router.refresh(); }}
        />
      )}
    </div>
  );
}
