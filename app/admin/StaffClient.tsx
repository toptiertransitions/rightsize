"use client";

import { useState } from "react";
import type { StaffMember, SystemRole } from "@/lib/types";

interface Props {
  initialStaff: StaffMember[];
}

const ROLE_LABELS: Record<string, string> = {
  TTTStaff:   "Staff",
  TTTManager: "Manager",
};

// ─── Modal ────────────────────────────────────────────────────────────────────
interface ModalProps {
  member?: StaffMember;
  onClose: () => void;
  onSaved: (m: StaffMember) => void;
}

function StaffModal({ member, onClose, onSaved }: ModalProps) {
  const [clerkUserId, setClerkUserId] = useState(member?.clerkUserId ?? "");
  const [displayName, setDisplayName] = useState(member?.displayName ?? "");
  const [email, setEmail] = useState(member?.email ?? "");
  const [role, setRole] = useState<"TTTStaff" | "TTTManager">(
    (member?.role === "TTTManager" ? "TTTManager" : "TTTStaff")
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [lookupEmail, setLookupEmail] = useState("");
  const [looking, setLooking] = useState(false);
  const [lookupError, setLookupError] = useState("");

  async function handleLookup() {
    if (!lookupEmail.trim()) return;
    setLooking(true);
    setLookupError("");
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "lookup", email: lookupEmail.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Lookup failed");
      if (!data.users?.length) { setLookupError("No account found with that email."); return; }
      const u = data.users[0];
      setClerkUserId(u.id);
      setDisplayName(u.name || "");
      setEmail(lookupEmail.trim());
    } catch (e) {
      setLookupError(e instanceof Error ? e.message : "Lookup failed");
    } finally {
      setLooking(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      if (member) {
        // Update existing
        const res = await fetch("/api/admin/staff", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: member.id, displayName, email, role }),
        });
        if (!res.ok) throw new Error((await res.json()).error ?? "Save failed");
        const data = await res.json();
        onSaved(data.member);
      } else {
        // Create new
        const res = await fetch("/api/admin/staff", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clerkUserId, displayName, email, role }),
        });
        if (!res.ok) throw new Error((await res.json()).error ?? "Save failed");
        const data = await res.json();
        onSaved(data.member);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-white">
            {member ? "Edit Staff Member" : "Add Staff Member"}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {!member && (
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Look up by email</label>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={lookupEmail}
                  onChange={e => setLookupEmail(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && (e.preventDefault(), handleLookup())}
                  placeholder="user@example.com"
                  className="flex-1 bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-forest-500"
                />
                <button
                  type="button"
                  onClick={handleLookup}
                  disabled={looking || !lookupEmail.trim()}
                  className="px-3 py-2 rounded-lg bg-gray-700 text-white text-sm hover:bg-gray-600 disabled:opacity-50 transition-colors"
                >
                  {looking ? "…" : "Find"}
                </button>
              </div>
              {lookupError && <p className="text-red-400 text-xs mt-1">{lookupError}</p>}
              {clerkUserId && (
                <p className="text-xs text-forest-400 mt-1 font-mono truncate">✓ {clerkUserId}</p>
              )}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Display Name</label>
            <input
              type="text"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              required
              placeholder="Jane Smith"
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-forest-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              placeholder="jane@example.com"
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-forest-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Role</label>
            <select
              value={role}
              onChange={e => setRole(e.target.value as "TTTStaff" | "TTTManager")}
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-forest-500"
            >
              <option value="TTTStaff">Staff</option>
              <option value="TTTManager">Manager</option>
            </select>
          </div>

          {error && <p className="text-red-400 text-xs">{error}</p>}

          <div className="flex gap-3 pt-1">
            <div className="flex-1" />
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-lg text-sm bg-forest-600 text-white hover:bg-forest-500 transition-colors disabled:opacity-50"
            >
              {saving ? "Saving…" : member ? "Save Changes" : "Add Staff"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function StaffClient({ initialStaff }: Props) {
  const [staff, setStaff] = useState<StaffMember[]>(initialStaff);
  const [showModal, setShowModal] = useState(false);
  const [editMember, setEditMember] = useState<StaffMember | undefined>(undefined);
  const [removing, setRemoving] = useState<string | null>(null);

  function openNew() { setEditMember(undefined); setShowModal(true); }
  function openEdit(m: StaffMember) { setEditMember(m); setShowModal(true); }
  function closeModal() { setShowModal(false); setEditMember(undefined); }

  function handleSaved(saved: StaffMember) {
    setStaff(prev => {
      const idx = prev.findIndex(m => m.id === saved.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = saved;
        return next;
      }
      return [...prev, saved];
    });
    closeModal();
  }

  async function handleRemove(member: StaffMember) {
    if (!confirm(`Remove ${member.displayName} from staff? They will lose access immediately.`)) return;
    setRemoving(member.id);
    try {
      const res = await fetch(`/api/admin/staff?id=${member.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Delete failed");
      setStaff(prev => prev.filter(m => m.id !== member.id));
    } catch (err) {
      alert(String(err));
    } finally {
      setRemoving(null);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-400">{staff.length} staff member{staff.length !== 1 ? "s" : ""}</p>
        <button
          onClick={openNew}
          className="px-4 py-2 rounded-xl text-sm bg-forest-600 text-white hover:bg-forest-500 transition-colors font-medium"
        >
          + Add Staff
        </button>
      </div>

      {staff.length === 0 ? (
        <div className="bg-gray-800 border border-gray-700 rounded-2xl p-8 text-center text-gray-500">
          <p className="text-sm">No staff members added yet.</p>
          <button onClick={openNew} className="mt-2 text-sm text-forest-400 hover:text-forest-300 transition-colors">
            Add the first staff member
          </button>
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-700 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Name</th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Email</th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Role</th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {staff.map((m, i) => (
                <tr key={m.id} className={i < staff.length - 1 ? "border-b border-gray-800" : ""}>
                  <td className="px-4 py-3">
                    <span className="text-white font-medium">{m.displayName}</span>
                    <p className="text-xs text-gray-500 font-mono mt-0.5 truncate max-w-[140px]">{m.clerkUserId}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-400">{m.email}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      m.role === "TTTManager"
                        ? "bg-purple-900/50 text-purple-300"
                        : "bg-gray-700 text-gray-300"
                    }`}>
                      {ROLE_LABELS[m.role] ?? m.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      m.isActive ? "bg-green-900/50 text-green-400" : "bg-red-900/50 text-red-400"
                    }`}>
                      {m.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 justify-end">
                      <button
                        onClick={() => openEdit(m)}
                        className="text-xs text-gray-400 hover:text-white px-2 py-1 rounded hover:bg-gray-700 transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleRemove(m)}
                        disabled={removing === m.id}
                        className="text-xs text-red-500 hover:text-red-400 px-2 py-1 rounded hover:bg-red-900/30 transition-colors disabled:opacity-50"
                      >
                        {removing === m.id ? "Removing…" : "Remove"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <StaffModal member={editMember} onClose={closeModal} onSaved={handleSaved} />
      )}
    </div>
  );
}
