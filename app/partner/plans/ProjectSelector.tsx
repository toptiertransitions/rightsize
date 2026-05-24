"use client";
import { useRouter } from "next/navigation";

interface Project {
  tenantId: string;
  name: string;
}

export function ProjectSelector({ projects, selectedId }: { projects: Project[]; selectedId: string }) {
  const router = useRouter();
  return (
    <select
      value={selectedId}
      onChange={(e) => router.push(`/partner/plans?t=${e.target.value}`)}
      className="h-9 pl-3 pr-8 rounded-lg border border-gray-200 bg-white text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#2d4a3e]/30 appearance-none cursor-pointer"
      style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236B7280' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 10px center" }}
    >
      <option value="all">All Active Projects</option>
      {projects.map((p) => (
        <option key={p.tenantId} value={p.tenantId}>{p.name}</option>
      ))}
    </select>
  );
}
