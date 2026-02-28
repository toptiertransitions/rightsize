"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { ROOM_TYPES } from "@/lib/types";
import type { Room, RoomType, DensityLevel } from "@/lib/types";

interface RoomsClientProps {
  rooms: Room[];
  tenantId: string;
  canEdit: boolean;
}

interface AddRoomModalProps {
  tenantId: string;
  onClose: () => void;
  onSaved: () => void;
}

function AddRoomModal({ tenantId, onClose, onSaved }: AddRoomModalProps) {
  const [name, setName] = useState("");
  const [roomType, setRoomType] = useState<RoomType>("Living Room");
  const [squareFeet, setSquareFeet] = useState("200");
  const [density, setDensity] = useState<DensityLevel>("Medium");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    if (!name.trim()) { setError("Room name is required"); return; }
    if (!Number(squareFeet) || Number(squareFeet) <= 0) { setError("Enter valid square footage"); return; }

    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, name, roomType, squareFeet: Number(squareFeet), density }),
      });
      if (!res.ok) throw new Error("Failed to save room");
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error saving room");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="px-6 py-5 border-b border-cream-100 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">Add Room</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <Input label="Room Name" placeholder="e.g. Master Bedroom" value={name} onChange={(e) => setName(e.target.value)} />
          <Select
            label="Room Type"
            value={roomType}
            onChange={(e) => setRoomType(e.target.value as RoomType)}
            options={ROOM_TYPES.map((t) => ({ value: t, label: t }))}
          />
          <Input label="Square Feet" type="number" min="1" value={squareFeet} onChange={(e) => setSquareFeet(e.target.value)} />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Density</label>
            <div className="flex gap-2">
              {(["Low", "Medium", "High"] as DensityLevel[]).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDensity(d)}
                  className={`flex-1 h-11 rounded-xl border text-sm font-medium transition-all ${
                    density === d
                      ? "bg-forest-50 border-forest-400 text-forest-700"
                      : "border-gray-300 text-gray-500 hover:border-gray-400"
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <div className="px-6 py-4 flex gap-3 border-t border-cream-100">
          <Button variant="secondary" onClick={onClose} className="flex-1">Cancel</Button>
          <Button onClick={handleSave} loading={loading} className="flex-1">Save Room</Button>
        </div>
      </div>
    </div>
  );
}

interface InviteModalProps {
  tenantId: string;
  onClose: () => void;
}

function InviteModal({ tenantId, onClose }: InviteModalProps) {
  const [role, setRole] = useState<"Collaborator" | "Viewer">("Collaborator");
  const [loading, setLoading] = useState(false);
  const [inviteUrl, setInviteUrl] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const handleGenerate = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, role }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to generate link"); return; }
      setInviteUrl(data.inviteUrl);
    } catch {
      setError("Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy to clipboard.");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="px-6 py-5 border-b border-cream-100 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">Invite Member</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Role</label>
            <div className="flex gap-2">
              {(["Collaborator", "Viewer"] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={`flex-1 h-11 rounded-xl border text-sm font-medium transition-all ${
                    role === r
                      ? "bg-forest-50 border-forest-400 text-forest-700"
                      : "border-gray-300 text-gray-500 hover:border-gray-400"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-1.5">
              {role === "Collaborator" ? "Can add and edit rooms and items." : "Can view rooms and items only."}
            </p>
          </div>
          {inviteUrl && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Invite Link</label>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={inviteUrl}
                  className="flex-1 h-11 px-3 rounded-xl border border-gray-300 text-sm text-gray-600 bg-gray-50 truncate"
                />
                <button
                  onClick={handleCopy}
                  className="h-11 px-4 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors whitespace-nowrap"
                >
                  {copied ? "Copied!" : "Copy Link"}
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-1.5">Link expires in 7 days.</p>
            </div>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <div className="px-6 py-4 flex gap-3 border-t border-cream-100">
          <Button variant="secondary" onClick={onClose} className="flex-1">Close</Button>
          {!inviteUrl && (
            <Button onClick={handleGenerate} loading={loading} className="flex-1">Generate Link</Button>
          )}
        </div>
      </div>
    </div>
  );
}

export function InviteButton({ tenantId }: { tenantId: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
        </svg>
        Invite Member
      </Button>
      {open && (
        <InviteModal
          tenantId={tenantId}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

export function AddRoomButton({ tenantId }: { tenantId: string }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        Add Room
      </Button>
      {open && (
        <AddRoomModal
          tenantId={tenantId}
          onClose={() => setOpen(false)}
          onSaved={() => { setOpen(false); router.refresh(); }}
        />
      )}
    </>
  );
}

const DENSITY_BADGE: Record<DensityLevel, { variant: "blue" | "green" | "orange"; label: string }> = {
  Low: { variant: "blue", label: "Low" },
  Medium: { variant: "green", label: "Medium" },
  High: { variant: "orange", label: "High" },
};

export function RoomsClient({ rooms, tenantId, canEdit }: RoomsClientProps) {
  if (rooms.length === 0) {
    return (
      <Card className="max-w-md mx-auto">
        <CardContent className="text-center py-12">
          <div className="text-4xl mb-3">🏠</div>
          <h2 className="text-lg font-bold text-gray-900 mb-2">No rooms yet</h2>
          <p className="text-gray-500 text-sm mb-6">
            Add your current home&apos;s rooms to start tracking what needs to be sorted.
          </p>
          {canEdit && <AddRoomButton tenantId={tenantId} />}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {rooms.map((room) => {
        const density = DENSITY_BADGE[room.density];
        return (
          <Card key={room.id}>
            <CardContent>
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 bg-cream-100 rounded-xl flex items-center justify-center text-xl">
                  {room.roomType === "Kitchen" ? "🍳" :
                   room.roomType === "Garage" ? "🚗" :
                   room.roomType === "Basement" ? "🪵" :
                   room.roomType === "Attic" ? "📦" :
                   room.roomType.includes("Bedroom") ? "🛏" :
                   room.roomType === "Dining Room" ? "🍽" :
                   room.roomType === "Office/Study" ? "💼" :
                   "🏠"}
                </div>
                <Badge variant={density.variant}>{density.label} density</Badge>
              </div>
              <h3 className="font-bold text-gray-900">{room.name}</h3>
              <p className="text-sm text-gray-400 mt-0.5">{room.roomType}</p>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-lg font-bold text-forest-700">
                  {room.squareFeet.toLocaleString()}
                </span>
                <span className="text-sm text-gray-400">sq ft</span>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
