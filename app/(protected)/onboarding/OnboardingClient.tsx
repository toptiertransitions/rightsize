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

interface OnboardingClientProps {
  email: string;
  displayName: string;
}

export function OnboardingClient({ email, displayName }: OnboardingClientProps) {
  const router = useRouter();
  const [name, setName] = useState("");
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
        body: JSON.stringify({ name, email, displayName }),
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

  return (
    <Card>
      <CardContent className="space-y-5">
        <Input
          label="Project Name"
          placeholder="e.g. Mom's Downsizing"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          error={error}
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
