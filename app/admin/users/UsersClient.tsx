"use client";

import { useState, useMemo } from "react";
import type { AdminUser } from "./page";

const ROLES = ["Owner", "Collaborator", "Viewer", "TTTStaff", "TTTAdmin"] as const;

function avatar(user: AdminUser) {
  return user.name?.[0]?.toUpperCase() || user.email?.[0]?.toUpperCase() || "?";
}

function avatarColor(id: string) {
  const colors = ["bg-forest-600", "bg-blue-600", "bg-purple-600", "bg-orange-600", "bg-teal-600", "bg-pink-600"];
  let hash = 0;
  for (const c of id) hash = (hash * 31 + c.charCodeAt(0)) % colors.length;
  return colors[hash];
}

interface ManageModalProps {
  user: AdminUser;
  tenants: Array<{ id: string; name: string }>;
  onClose: () => void;
  onUpdate: (updated: AdminUser) => void;
}

function ManageModal({ user, tenants, onClose, onUpdate }: ManageModalProps) {
  const [current, setCurrent] = useState(user);
  const [addTenantId, setAddTenantId] = useState("");
  const [addRole, setAddRole] = useState("Collaborator");
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState("");

  const availableTenants = tenants.filter(t => !current.memberships.some(m => m.tenantId === t.id));

  async function call(method: string, body: object) {
    const res = await fetch("/api/admin/memberships", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error((await res.json()).error ?? "Request failed");
    return res.json();
  }

  async function handleRoleChange(membershipId: string, role: string) {
    setLoading(membershipId);
    setError("");
    try {
      await call("PATCH", { membershipId, role });
      const updated = { ...current, memberships: current.memberships.map(m => m.membershipId === membershipId ? { ...m, role } : m) };
      setCurrent(updated);
      onUpdate(updated);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed"); }
    finally { setLoading(null); }
  }

  async function handleRemove(membershipId: string) {
    setLoading(membershipId + "-remove");
    setError("");
    try {
      await call("DELETE", { membershipId });
      const updated = { ...current, memberships: current.memberships.filter(m => m.membershipId !== membershipId) };
      setCurrent(updated);
      onUpdate(updated);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed"); }
    finally { setLoading(null); }
  }

  async function handleAdd() {
    if (!addTenantId) return;
    setLoading("add");
    setError("");
    try {
      const data = await call("POST", { tenantId: addTenantId, clerkUserId: current.clerkUserId, role: addRole });
      const tenantName = tenants.find(t => t.id === addTenantId)?.name ?? "Unknown";
      const updated = {
        ...current,
        memberships: [...current.memberships, { membershipId: data.membership.id, tenantId: addTenantId, tenantName, role: addRole }],
      };
      setCurrent(updated);
      onUpdate(updated);
      setAddTenantId("");
    } catch (e) { setError(e instanceof Error ? e.message : "Failed"); }
    finally { setLoading(null); }
  }

  async function handleRemoveAll() {
    if (!confirm(`Remove ${current.name} from all projects? They will lose all access.`)) return;
    setLoading("removeAll");
    setError("");
    try {
      await call("DELETE", { clerkUserId: current.clerkUserId });
      const updated = { ...current, memberships: [] };
      setCurrent(updated);
      onUpdate(updated);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed"); }
    finally { setLoading(null); }
  }

  async function handleSuspend() {
    const action = current.banned ? "unsuspend" : "suspend";
    if (!confirm(`${action === "suspend" ? "Suspend" : "Unsuspend"} ${current.name}'s account?`)) return;
    setLoading("suspend");
    setError("");
    try {
      await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, clerkUserId: current.clerkUserId }),
      });
      const updated = { ...current, banned: !current.banned };
      setCurrent(updated);
      onUpdate(updated);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed"); }
    finally { setLoading(null); }
  }

  const inputClass = "h-9 px-3 rounded-lg border border-gray-700 bg-gray-800 text-sm text-white focus:outline-none focus:ring-1 focus:ring-forest-500";

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-start justify-center overflow-y-auto py-8 px-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg my-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm ${avatarColor(current.clerkUserId)}`}>
              {avatar(current)}
            </div>
            <div>
              <div className="font-semibold text-white">{current.name}</div>
              <div className="text-xs text-gray-400">{current.email}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {current.banned && <span className="text-xs bg-red-900/50 text-red-400 border border-red-800 px-2 py-0.5 rounded-full">Suspended</span>}
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-800 text-gray-400">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="px-6 py-5 space-y-6">
          {/* Project memberships */}
          <section>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Project Access</h3>
            {current.memberships.length === 0 ? (
              <p className="text-sm text-gray-500">No project access.</p>
            ) : (
              <div className="space-y-2">
                {current.memberships.map(m => (
                  <div key={m.membershipId} className="flex items-center gap-2">
                    <span className="flex-1 text-sm text-white truncate">{m.tenantName}</span>
                    <select
                      value={m.role}
                      onChange={e => handleRoleChange(m.membershipId, e.target.value)}
                      disabled={loading === m.membershipId}
                      className={inputClass}
                    >
                      {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                    <button
                      onClick={() => handleRemove(m.membershipId)}
                      disabled={!!loading}
                      className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-red-900/30 text-gray-500 hover:text-red-400 transition-colors"
                      title="Remove from project"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Add to project */}
          {availableTenants.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Add to Project</h3>
              <div className="flex gap-2">
                <select value={addTenantId} onChange={e => setAddTenantId(e.target.value)} className={`flex-1 ${inputClass}`}>
                  <option value="">Select project…</option>
                  {availableTenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <select value={addRole} onChange={e => setAddRole(e.target.value)} className={inputClass}>
                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
                <button
                  onClick={handleAdd}
                  disabled={!addTenantId || loading === "add"}
                  className="px-3 h-9 rounded-lg bg-forest-600 text-white text-sm font-medium hover:bg-forest-700 disabled:opacity-50 transition-colors"
                >
                  {loading === "add" ? "…" : "Add"}
                </button>
              </div>
            </section>
          )}

          {/* Find user by email */}
          <section>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Clerk ID</h3>
            <p className="text-xs text-gray-500 font-mono select-all">{current.clerkUserId}</p>
          </section>

          {error && <p className="text-sm text-red-400">{error}</p>}

          {/* Danger zone */}
          <section className="border-t border-gray-800 pt-5 space-y-2">
            <h3 className="text-xs font-semibold text-red-500 uppercase tracking-wide mb-3">Danger Zone</h3>
            <div className="flex gap-2">
              <button
                onClick={handleRemoveAll}
                disabled={!!loading || current.memberships.length === 0}
                className="flex-1 h-9 rounded-lg border border-red-800 text-red-400 text-sm hover:bg-red-900/20 disabled:opacity-40 transition-colors"
              >
                {loading === "removeAll" ? "Removing…" : "Remove from All Projects"}
              </button>
              <button
                onClick={handleSuspend}
                disabled={loading === "suspend"}
                className="flex-1 h-9 rounded-lg border border-red-800 text-red-400 text-sm hover:bg-red-900/20 disabled:opacity-40 transition-colors"
              >
                {loading === "suspend" ? "…" : current.banned ? "Unsuspend Account" : "Suspend Account"}
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

// ─── Email Lookup ──────────────────────────────────────────────────────────────

function LookupPanel({ tenants, onFound }: { tenants: Array<{ id: string; name: string }>; onFound: (user: AdminUser) => void }) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AdminUser | null>(null);
  const [error, setError] = useState("");

  async function handleLookup() {
    if (!email.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "lookup", email: email.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (data.users.length === 0) { setError("No Clerk account found with that email."); return; }
      const u = data.users[0];
      setResult({ clerkUserId: u.id, email: u.email, name: u.name, imageUrl: u.imageUrl, createdAt: "", banned: false, memberships: [] });
    } catch (e) { setError(e instanceof Error ? e.message : "Lookup failed"); }
    finally { setLoading(false); }
  }

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 mb-6">
      <h3 className="text-sm font-semibold text-gray-300 mb-3">Find user by email to assign to a project</h3>
      <div className="flex gap-2">
        <input
          type="email"
          placeholder="user@example.com"
          value={email}
          onChange={e => setEmail(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleLookup()}
          className="flex-1 h-9 px-3 rounded-lg border border-gray-700 bg-gray-900 text-sm text-white focus:outline-none focus:ring-1 focus:ring-forest-500"
        />
        <button
          onClick={handleLookup}
          disabled={loading || !email.trim()}
          className="px-4 h-9 rounded-lg bg-forest-600 text-white text-sm font-medium hover:bg-forest-700 disabled:opacity-50 transition-colors"
        >
          {loading ? "…" : "Lookup"}
        </button>
      </div>
      {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
      {result && (
        <div className="mt-3 flex items-center justify-between bg-gray-900 rounded-lg px-3 py-2">
          <div>
            <p className="text-sm text-white font-medium">{result.name}</p>
            <p className="text-xs text-gray-400 font-mono">{result.clerkUserId}</p>
          </div>
          <button
            onClick={() => onFound(result)}
            className="text-xs text-forest-400 hover:text-forest-300 font-medium"
          >
            Manage →
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Main Users Client ─────────────────────────────────────────────────────────

interface Props {
  users: AdminUser[];
  tenants: Array<{ id: string; name: string }>;
}

export function UsersClient({ users: initialUsers, tenants }: Props) {
  const [users, setUsers] = useState(initialUsers);
  const [search, setSearch] = useState("");
  const [managing, setManaging] = useState<AdminUser | null>(null);

  const filtered = useMemo(() => {
    if (!search.trim()) return users;
    const q = search.toLowerCase();
    return users.filter(u => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
  }, [users, search]);

  function handleUpdate(updated: AdminUser) {
    setUsers(prev => prev.map(u => u.clerkUserId === updated.clerkUserId ? updated : u));
    setManaging(updated);
  }

  function handleFoundUser(user: AdminUser) {
    // If user already in list, open their modal; otherwise add to list temporarily
    const existing = users.find(u => u.clerkUserId === user.clerkUserId);
    if (existing) {
      setManaging(existing);
    } else {
      setUsers(prev => [user, ...prev]);
      setManaging(user);
    }
  }

  return (
    <>
      {managing && (
        <ManageModal
          user={managing}
          tenants={tenants}
          onClose={() => setManaging(null)}
          onUpdate={handleUpdate}
        />
      )}

      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Users</h1>
          <p className="text-gray-400 mt-0.5 text-sm">{users.length} account{users.length !== 1 ? "s" : ""} in Clerk</p>
        </div>
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search name or email…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-64 h-10 pl-9 pr-3 rounded-xl border border-gray-700 bg-gray-800 text-sm text-white focus:outline-none focus:ring-1 focus:ring-forest-500 placeholder-gray-500"
          />
        </div>
      </div>

      <LookupPanel tenants={tenants} onFound={handleFoundUser} />

      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800">
              <th className="text-left px-5 py-3 font-semibold text-gray-400">User</th>
              <th className="text-left px-5 py-3 font-semibold text-gray-400 hidden sm:table-cell">System Role</th>
              <th className="text-left px-5 py-3 font-semibold text-gray-400 hidden md:table-cell">Projects</th>
              <th className="text-left px-5 py-3 font-semibold text-gray-400 hidden lg:table-cell">Joined</th>
              <th className="text-left px-5 py-3 font-semibold text-gray-400">Status</th>
              <th className="px-5 py-3 w-24"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {filtered.map(user => (
              <tr key={user.clerkUserId} className="hover:bg-gray-800/50 transition-colors">
                <td className="px-5 py-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0 ${avatarColor(user.clerkUserId)}`}>
                      {avatar(user)}
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium text-white truncate">{user.name}</div>
                      <div className="text-xs text-gray-400 truncate">{user.email}</div>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-3 hidden sm:table-cell">
                  {user.systemRole ? (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      user.systemRole === "TTTAdmin"
                        ? "bg-red-900/50 text-red-300 border border-red-800"
                        : user.systemRole === "TTTManager"
                        ? "bg-purple-900/50 text-purple-300 border border-purple-800"
                        : "bg-gray-700 text-gray-300 border border-gray-600"
                    }`}>
                      {user.systemRole === "TTTAdmin" ? "Admin" : user.systemRole === "TTTManager" ? "Manager" : "Staff"}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-600">—</span>
                  )}
                </td>
                <td className="px-5 py-3 hidden md:table-cell">
                  <div className="flex flex-wrap gap-1">
                    {user.memberships.length === 0 ? (
                      <span className="text-xs text-gray-600">—</span>
                    ) : user.memberships.slice(0, 3).map(m => (
                      <span key={m.membershipId} className="text-xs bg-gray-800 border border-gray-700 text-gray-300 px-2 py-0.5 rounded-full">
                        {m.tenantName} <span className="text-gray-500">· {m.role}</span>
                      </span>
                    ))}
                    {user.memberships.length > 3 && (
                      <span className="text-xs text-gray-500">+{user.memberships.length - 3} more</span>
                    )}
                  </div>
                </td>
                <td className="px-5 py-3 text-gray-500 text-xs hidden lg:table-cell">
                  {user.createdAt ? new Date(user.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}
                </td>
                <td className="px-5 py-3">
                  {user.banned ? (
                    <span className="text-xs bg-red-900/30 text-red-400 border border-red-800 px-2 py-0.5 rounded-full">Suspended</span>
                  ) : (
                    <span className="text-xs bg-forest-900/30 text-forest-400 border border-forest-800 px-2 py-0.5 rounded-full">Active</span>
                  )}
                </td>
                <td className="px-5 py-3 text-right">
                  <button
                    onClick={() => setManaging(user)}
                    className="text-xs text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    Manage
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-12 text-center text-gray-600">No users found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
