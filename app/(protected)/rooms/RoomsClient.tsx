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

// ─── Shared form fields ────────────────────────────────────────────────────────
interface RoomFormProps {
  name: string; setName: (v: string) => void;
  roomType: RoomType; setRoomType: (v: RoomType) => void;
  squareFeet: string; setSquareFeet: (v: string) => void;
  density: DensityLevel; setDensity: (v: DensityLevel) => void;
  error: string;
}

function RoomFormFields({ name, setName, roomType, setRoomType, squareFeet, setSquareFeet, density, setDensity, error }: RoomFormProps) {
  return (
    <div className="px-6 py-5 space-y-4">
      <Select
        label="Room Type"
        value={roomType}
        onChange={(e) => setRoomType(e.target.value as RoomType)}
        options={ROOM_TYPES.map((t) => ({ value: t, label: t }))}
      />
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Room Name <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        <input
          type="text"
          placeholder={`e.g. ${roomType}`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full h-10 px-3 rounded-xl border border-gray-200 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-forest-400"
        />
        <p className="text-xs text-gray-400 mt-1">Leave blank to use the room type as the name.</p>
      </div>
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
              {d === "Medium" ? "Average" : d}
            </button>
          ))}
        </div>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

// ─── Add modal ─────────────────────────────────────────────────────────────────
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
    if (!Number(squareFeet) || Number(squareFeet) <= 0) { setError("Enter valid square footage"); return; }
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, name: name.trim() || roomType, roomType, squareFeet: Number(squareFeet), density }),
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
        <RoomFormFields name={name} setName={setName} roomType={roomType} setRoomType={setRoomType}
          squareFeet={squareFeet} setSquareFeet={setSquareFeet} density={density} setDensity={setDensity} error={error} />
        <div className="px-6 py-4 flex gap-3 border-t border-cream-100">
          <Button variant="secondary" onClick={onClose} className="flex-1">Cancel</Button>
          <Button onClick={handleSave} loading={loading} className="flex-1">Save Room</Button>
        </div>
      </div>
    </div>
  );
}

// ─── Edit modal ────────────────────────────────────────────────────────────────
interface EditRoomModalProps {
  room: Room;
  tenantId: string;
  onClose: () => void;
  onSaved: () => void;
}

function EditRoomModal({ room, tenantId, onClose, onSaved }: EditRoomModalProps) {
  const [name, setName] = useState(room.name);
  const [roomType, setRoomType] = useState<RoomType>(room.roomType);
  const [squareFeet, setSquareFeet] = useState(String(room.squareFeet));
  const [density, setDensity] = useState<DensityLevel>(room.density);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    if (!Number(squareFeet) || Number(squareFeet) <= 0) { setError("Enter valid square footage"); return; }
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/rooms", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: room.id, tenantId, name: name.trim() || roomType, roomType, squareFeet: Number(squareFeet), density }),
      });
      if (!res.ok) throw new Error("Failed to save");
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error saving");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true); setError("");
    try {
      const res = await fetch(`/api/rooms?id=${room.id}&tenantId=${tenantId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error deleting");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="px-6 py-5 border-b border-cream-100 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">Edit Room</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <RoomFormFields name={name} setName={setName} roomType={roomType} setRoomType={setRoomType}
          squareFeet={squareFeet} setSquareFeet={setSquareFeet} density={density} setDensity={setDensity} error={error} />
        <div className="px-6 py-4 flex gap-3 border-t border-cream-100">
          {!confirmDelete ? (
            <button
              onClick={() => setConfirmDelete(true)}
              disabled={loading || deleting}
              className="h-10 px-4 rounded-xl border border-red-200 text-red-500 text-sm font-medium hover:bg-red-50 transition-colors disabled:opacity-50"
            >
              Delete
            </button>
          ) : (
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="h-10 px-4 rounded-xl bg-red-500 text-white text-sm font-medium hover:bg-red-600 transition-colors disabled:opacity-50"
            >
              {deleting ? "Deleting…" : "Yes, Delete"}
            </button>
          )}
          <Button variant="secondary" onClick={confirmDelete ? () => setConfirmDelete(false) : onClose} className="flex-1" disabled={loading || deleting}>
            Cancel
          </Button>
          {!confirmDelete && (
            <Button onClick={handleSave} loading={loading} className="flex-1">Save</Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Add Room Button ───────────────────────────────────────────────────────────
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

// ─── Rooms grid ────────────────────────────────────────────────────────────────
const DENSITY_BADGE: Record<DensityLevel, { variant: "blue" | "green" | "orange"; label: string }> = {
  Low: { variant: "blue", label: "Low" },
  Medium: { variant: "green", label: "Average" },
  High: { variant: "orange", label: "High" },
};

export function RoomsClient({ rooms, tenantId, canEdit }: RoomsClientProps) {
  const router = useRouter();
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);

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
    <>
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
                  <div className="flex items-center gap-2">
                    <Badge variant={density.variant}>{density.label} density</Badge>
                    <button
                      onClick={() => setEditingRoom(room)}
                      className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                      title="Edit room"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>
                  </div>
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

      {editingRoom && (
        <EditRoomModal
          room={editingRoom}
          tenantId={tenantId}
          onClose={() => setEditingRoom(null)}
          onSaved={() => { setEditingRoom(null); router.refresh(); }}
        />
      )}
    </>
  );
}
