"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";

const SUGGESTIONS = [
  "Mom's Downsizing",
  "Dad's Move to Condo",
  "Grandma's Transition",
  "Our Family Home",
  "Smith Residence",
];

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA",
  "HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
  "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
  "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY",
];

interface OnboardingClientProps {
  email: string;
  displayName: string;
}

export function OnboardingClient({ email, displayName }: OnboardingClientProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleCreate = async () => {
    if (!name.trim()) { setError("Please enter a project name"); return; }
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          displayName,
          address: address.trim() || undefined,
          city: city.trim() || undefined,
          state: state || undefined,
          zip: zip.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create project");
      }
      const data = await res.json();
      router.push(`/rooms?tenantId=${data.tenant.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const inputCls = "w-full h-11 px-3 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-forest-400 bg-white";

  return (
    <Card>
      <CardContent className="space-y-5">
        {/* Project name */}
        <Input
          label="Project Name"
          placeholder="e.g. Mom's Downsizing"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          hint="This is just for your reference — it won't be seen publicly."
        />

        <div>
          <p className="text-xs font-medium text-gray-500 mb-2">Quick picks:</p>
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => setName(s)}
                className={`px-3 py-1.5 text-sm rounded-full border transition-all ${
                  name === s
                    ? "bg-forest-50 border-forest-400 text-forest-700"
                    : "border-gray-300 text-gray-600 hover:border-forest-300"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Address */}
        <div className="pt-1 border-t border-gray-100">
          <p className="text-sm font-medium text-gray-700 mb-3">
            Project Address <span className="text-xs text-gray-400 font-normal">(optional — used for calendar invites &amp; vendor proximity)</span>
          </p>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Street Address</label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="123 Main St"
                className={inputCls}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-xs font-medium text-gray-600 mb-1">City</label>
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Chicago"
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">State</label>
                <select
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  className={inputCls}
                >
                  <option value="">—</option>
                  {US_STATES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">ZIP Code</label>
                <input
                  type="text"
                  value={zip}
                  onChange={(e) => setZip(e.target.value)}
                  placeholder="60601"
                  maxLength={10}
                  className={inputCls}
                />
              </div>
            </div>
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <Button onClick={handleCreate} loading={loading} size="lg" className="w-full">
          Create Project
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        </Button>
      </CardContent>
    </Card>
  );
}
