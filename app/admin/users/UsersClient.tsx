"use client";

import { useState, useMemo } from "react";
import { useSignIn } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import type { AdminUser } from "./page";

// Project-level membership roles (NOT system roles)
const PROJECT_ROLES = ["Owner", "Collaborator", "Viewer", "Vendor"] as const;

// System-level roles (stored in Airtable StaffMembers table)
const SYSTEM_ROLES = ["TTTStaff", "TTTManager", "TTTSales"] as const;

const SYSTEM_ROLE_LABELS: Record<string, string> = {
  TTTAdmin: "TTT Admin",
  TTTManager: "TTT Manager",
  TTTSales: "TTT Sales",
  TTTStaff: "TTT Staff",
};

function avatar(user: AdminUser) {
  return user.name?.[0]?.toUpperCase() || user.email?.[0]?.toUpperCase() || "?";
}

function avatarColor(id: string) {
  const colors = ["bg-forest-600", "bg-blue-600", "bg-purple-600", "bg-orange-600", "bg-teal-600", "bg-pink-600"];
  let hash = 0;
  for (const c of id) hash = (hash * 31 + c.charCodeAt(0)) % colors.length;
  return colors[hash];
}

const PROJECT_ROLE_COLORS: Record<string, string> = {
  Owner:        "bg-amber-900/50 text-amber-300 border border-amber-800",
  Collaborator: "bg-blue-900/50 text-blue-300 border border-blue-800",
  Viewer:       "bg-gray-700 text-gray-300 border border-gray-600",
  Vendor:       "bg-teal-900/50 text-teal-300 border border-teal-800",
};

// Returns the badge(s) to show in the "User Type" column
function userTypeBadges(user: AdminUser) {
  // System role takes priority
  if (user.systemRole) {
    const label = SYSTEM_ROLE_LABELS[user.systemRole] ?? user.systemRole;
    const cls =
      user.systemRole === "TTTAdmin"
        ? "bg-red-900/50 text-red-300 border border-red-800"
        : user.systemRole === "TTTManager"
        ? "bg-purple-900/50 text-purple-300 border border-purple-800"
        : user.systemRole === "TTTSales"
        ? "bg-blue-900/50 text-blue-300 border border-blue-800"
        : "bg-gray-700 text-gray-300 border border-gray-600";
    return [<span key="sys" className={`text-xs px-2 py-0.5 rounded-full font-medium ${cls}`}>{label}</span>];
  }
  // Vendor (LocalVendors table record)
  if (user.isVendor) {
    return [<span key="vendor" className="text-xs px-2 py-0.5 rounded-full font-medium bg-teal-900/50 text-teal-300 border border-teal-800">Vendor</span>];
  }
  // Distinct project roles from memberships
  const roles = [...new Set(user.memberships.map(m => m.role))];
  if (roles.length === 0) return [<span key="none" className="text-xs text-gray-600">—</span>];
  return roles.map(r => (
    <span key={r} className={`text-xs px-2 py-0.5 rounded-full font-medium ${PROJECT_ROLE_COLORS[r] ?? "bg-gray-700 text-gray-300 border border-gray-600"}`}>
      {r}
    </span>
  ));
}

function systemRoleBadge(role: string | undefined) {
  if (!role) return null;
  const label = SYSTEM_ROLE_LABELS[role] ?? role;
  const cls =
    role === "TTTAdmin"
      ? "bg-red-900/50 text-red-300 border border-red-800"
      : role === "TTTManager"
      ? "bg-purple-900/50 text-purple-300 border border-purple-800"
      : role === "TTTSales"
      ? "bg-blue-900/50 text-blue-300 border border-blue-800"
      : "bg-gray-700 text-gray-300 border border-gray-600";
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cls}`}>{label}</span>;
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
  const [addRole, setAddRole] = useState<string>(PROJECT_ROLES[1]);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [resetLink, setResetLink] = useState<string | null>(null);

  const availableTenants = tenants.filter(t => !current.memberships.some(m => m.tenantId === t.id));
  const isHardAdmin = current.systemRole === "TTTAdmin"; // hardcoded via env — can't be changed via API

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

  async function handleSystemRoleChange(newRole: string | null) {
    if (isHardAdmin) return;
    setLoading("systemRole");
    setError("");
    try {
      if (!newRole) {
        // Remove system role
        if (current.staffMemberId) {
          await fetch(`/api/admin/staff?id=${current.staffMemberId}`, { method: "DELETE" });
          const updated = { ...current, systemRole: undefined, staffMemberId: undefined };
          setCurrent(updated);
          onUpdate(updated);
        }
      } else if (current.staffMemberId) {
        // Update existing
        const res = await fetch("/api/admin/staff", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: current.staffMemberId, role: newRole }),
        });
        const data = await res.json();
        const updated = { ...current, systemRole: newRole, staffMemberId: data.member?.id ?? current.staffMemberId };
        setCurrent(updated);
        onUpdate(updated);
      } else {
        // Create new
        const res = await fetch("/api/admin/staff", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clerkUserId: current.clerkUserId,
            displayName: current.name,
            email: current.email,
            role: newRole,
          }),
        });
        const data = await res.json();
        const updated = { ...current, systemRole: newRole, staffMemberId: data.member?.id };
        setCurrent(updated);
        onUpdate(updated);
      }
    } catch (e) { setError(e instanceof Error ? e.message : "Failed"); }
    finally { setLoading(null); }
  }

  async function handlePasswordReset() {
    setLoading("pwReset");
    setError("");
    setResetLink(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "passwordReset", clerkUserId: current.clerkUserId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setResetLink(data.url);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to generate reset link"); }
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

          {/* System Role */}
          <section>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">System Role (TTT Staff)</h3>
            {isHardAdmin ? (
              <p className="text-sm text-red-300">TTT Admin — set via environment config, not editable here.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {(["None", ...SYSTEM_ROLES] as const).map(role => {
                  const value = role === "None" ? null : role;
                  const active = (value === null && !current.systemRole) || current.systemRole === value;
                  return (
                    <button
                      key={role}
                      onClick={() => handleSystemRoleChange(value)}
                      disabled={loading === "systemRole"}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        active
                          ? "bg-forest-600 text-white"
                          : "border border-gray-700 text-gray-400 hover:border-gray-500 hover:text-white"
                      } disabled:opacity-50`}
                    >
                      {role === "None" ? "No System Role" : SYSTEM_ROLE_LABELS[role]}
                    </button>
                  );
                })}
              </div>
            )}
          </section>

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
                      {PROJECT_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
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
                  {PROJECT_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
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

          {/* Password reset */}
          <section>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Password Reset</h3>
            <button
              onClick={handlePasswordReset}
              disabled={loading === "pwReset"}
              className="h-9 px-4 rounded-lg border border-gray-700 text-sm text-gray-300 hover:border-gray-500 hover:text-white transition-colors disabled:opacity-50"
            >
              {loading === "pwReset" ? "Generating…" : "Generate Sign-In Link"}
            </button>
            {resetLink && (
              <div className="mt-2 p-3 bg-gray-800 rounded-lg">
                <p className="text-xs text-gray-400 mb-1">Share this one-time sign-in link with the user (valid 24 hours):</p>
                <div className="flex items-center gap-2">
                  <input readOnly value={resetLink} className="flex-1 text-xs text-green-400 bg-transparent font-mono focus:outline-none truncate" />
                  <button
                    onClick={() => navigator.clipboard.writeText(resetLink)}
                    className="text-xs text-gray-400 hover:text-white border border-gray-600 rounded px-2 py-1"
                  >
                    Copy
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* Clerk ID */}
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

// ─── Create Staff Modal ────────────────────────────────────────────────────────

function CreateStaffModal({ onClose, onCreated }: { onClose: () => void; onCreated: (user: AdminUser, signInUrl: string) => void }) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"TTTStaff" | "TTTManager" | "TTTSales">("TTTStaff");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const inputClass = "h-9 px-3 rounded-lg border border-gray-700 bg-gray-800 text-sm text-white focus:outline-none focus:ring-1 focus:ring-forest-500 w-full";

  async function handleCreate() {
    if (!firstName.trim() || !email.trim()) { setError("First name and email are required."); return; }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "createStaff", firstName: firstName.trim(), lastName: lastName.trim(), email: email.trim(), role }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create user");
      onCreated(data.user, data.signInUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-start justify-center overflow-y-auto py-8 px-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md my-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <h2 className="font-semibold text-white">Create Staff User</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-800 text-gray-400">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">First Name *</label>
              <input value={firstName} onChange={e => setFirstName(e.target.value)} className={inputClass} placeholder="Jane" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Last Name</label>
              <input value={lastName} onChange={e => setLastName(e.target.value)} className={inputClass} placeholder="Smith" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Email *</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} className={inputClass} placeholder="jane@example.com" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Role</label>
            <div className="flex gap-2">
              {(["TTTStaff", "TTTManager", "TTTSales"] as const).map(r => (
                <button
                  key={r}
                  onClick={() => setRole(r)}
                  className={`flex-1 h-9 rounded-lg text-sm font-medium transition-colors ${
                    role === r ? "bg-forest-600 text-white" : "border border-gray-700 text-gray-400 hover:border-gray-500 hover:text-white"
                  }`}
                >
                  {SYSTEM_ROLE_LABELS[r]}
                </button>
              ))}
            </div>
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="flex-1 h-9 rounded-lg border border-gray-700 text-sm text-gray-300 hover:border-gray-500 hover:text-white transition-colors">
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={loading || !firstName.trim() || !email.trim()}
              className="flex-1 h-9 rounded-lg bg-forest-600 text-white text-sm font-medium hover:bg-forest-700 disabled:opacity-50 transition-colors"
            >
              {loading ? "Creating…" : "Create User"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Sign-In Link Modal ────────────────────────────────────────────────────────

function SignInLinkModal({ userName, signInUrl, onClose }: { userName: string; signInUrl: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(signInUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-start justify-center overflow-y-auto py-8 px-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md my-auto">
        <div className="px-6 py-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-forest-600/20 flex items-center justify-center">
              <svg className="w-5 h-5 text-forest-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-white">{userName} created</p>
              <p className="text-xs text-gray-400">Share the sign-in link below so they can access their account</p>
            </div>
          </div>
          <div className="bg-gray-800 rounded-xl p-4">
            <p className="text-xs text-gray-400 mb-2">One-time sign-in link (valid 7 days):</p>
            <div className="flex items-center gap-2">
              <input readOnly value={signInUrl} className="flex-1 text-xs text-green-400 bg-transparent font-mono focus:outline-none truncate" />
              <button onClick={copy} className="flex-shrink-0 text-xs border border-gray-600 rounded-lg px-3 py-1.5 text-gray-300 hover:text-white hover:border-gray-400 transition-colors">
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>
          <button onClick={onClose} className="w-full h-9 rounded-lg bg-forest-600 text-white text-sm font-medium hover:bg-forest-700 transition-colors">
            Done
          </button>
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
  const [showCreate, setShowCreate] = useState(false);
  const [newUserLink, setNewUserLink] = useState<{ userName: string; signInUrl: string } | null>(null);
  const [impersonating, setImpersonating] = useState<string | null>(null);
  const { signIn } = useSignIn();
  const router = useRouter();

  async function handleImpersonate(user: AdminUser) {
    if (!signIn) return;
    setImpersonating(user.clerkUserId);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "impersonate", clerkUserId: user.clerkUserId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to get impersonation token");
      const { error } = await signIn.ticket({ ticket: data.token });
      if (error) throw new Error(error.message ?? "Sign-in failed");
      router.push("/home");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Impersonation failed");
      setImpersonating(null);
    }
  }

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
    const existing = users.find(u => u.clerkUserId === user.clerkUserId);
    if (existing) {
      setManaging(existing);
    } else {
      setUsers(prev => [user, ...prev]);
      setManaging(user);
    }
  }

  const isStaffOrAdmin = (u: AdminUser) =>
    u.systemRole === "TTTAdmin" || u.systemRole === "TTTManager" || u.systemRole === "TTTStaff" || u.systemRole === "TTTSales";

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
      {showCreate && (
        <CreateStaffModal
          onClose={() => setShowCreate(false)}
          onCreated={(user, signInUrl) => {
            setUsers(prev => [user, ...prev]);
            setShowCreate(false);
            setNewUserLink({ userName: user.name, signInUrl });
          }}
        />
      )}
      {newUserLink && (
        <SignInLinkModal
          userName={newUserLink.userName}
          signInUrl={newUserLink.signInUrl}
          onClose={() => setNewUserLink(null)}
        />
      )}

      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Users</h1>
          <p className="text-gray-400 mt-0.5 text-sm">{users.length} account{users.length !== 1 ? "s" : ""} in Clerk</p>
        </div>
        <div className="flex items-center gap-2">
        <button
          onClick={() => setShowCreate(true)}
          className="h-10 px-4 rounded-xl bg-forest-600 text-white text-sm font-medium hover:bg-forest-700 transition-colors flex items-center gap-1.5"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Staff User
        </button>
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
      </div>

      <LookupPanel tenants={tenants} onFound={handleFoundUser} />

      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800">
              <th className="text-left px-5 py-3 font-semibold text-gray-400">User</th>
              <th className="text-left px-5 py-3 font-semibold text-gray-400">User Type</th>
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
                <td className="px-5 py-3">
                  <div className="flex flex-wrap gap-1">{userTypeBadges(user)}</div>
                </td>
                <td className="px-5 py-3 hidden md:table-cell">
                  {isStaffOrAdmin(user) ? (
                    <span className="text-xs text-gray-500 italic">All projects</span>
                  ) : user.memberships.length === 0 ? (
                    <span className="text-xs text-gray-600">—</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {user.memberships.slice(0, 3).map(m => (
                        <span key={m.membershipId} className="text-xs bg-gray-800 border border-gray-700 text-gray-300 px-2 py-0.5 rounded-full">
                          {m.tenantName} <span className="text-gray-500">· {m.role}</span>
                        </span>
                      ))}
                      {user.memberships.length > 3 && (
                        <span className="text-xs text-gray-500">+{user.memberships.length - 3} more</span>
                      )}
                    </div>
                  )}
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
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => handleImpersonate(user)}
                      disabled={impersonating === user.clerkUserId}
                      className="text-xs text-amber-400 hover:text-amber-300 border border-amber-800 hover:border-amber-700 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                      title={`View app as ${user.name}`}
                    >
                      {impersonating === user.clerkUserId ? "…" : "View As"}
                    </button>
                    <button
                      onClick={() => setManaging(user)}
                      className="text-xs text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      Manage
                    </button>
                  </div>
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
