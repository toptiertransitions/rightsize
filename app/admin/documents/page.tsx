import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getSystemRole, getDocumentActivityLog } from "@/lib/airtable";

export const metadata = { title: "Document Activity — Admin" };

const STAFF_ROLES = ["TTTStaff", "TTTTeamLead", "TTTManager", "TTTAdmin"];

const ACTION_STYLES: Record<string, string> = {
  Upload: "bg-forest-50 text-forest-700",
  View: "bg-blue-50 text-blue-700",
  Download: "bg-blue-50 text-blue-700",
  Delete: "bg-gray-100 text-gray-600",
  Denied: "bg-red-50 text-red-700",
};

export default async function DocumentActivityPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const sysRole = await getSystemRole(userId).catch(() => null);
  if (!sysRole || !STAFF_ROLES.includes(sysRole)) redirect("/home");

  const entries = await getDocumentActivityLog(500).catch(() => []);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Document Activity</h1>
      <p className="text-sm text-gray-500 mb-6">
        Every upload, view, download, delete, and denied attempt on the Documents feature. Most recent 500 events.
      </p>

      {entries.length === 0 ? (
        <p className="text-sm text-gray-400">No activity yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="px-4 py-2.5">Time</th>
                <th className="px-4 py-2.5">Action</th>
                <th className="px-4 py-2.5">Actor</th>
                <th className="px-4 py-2.5">Role</th>
                <th className="px-4 py-2.5">File Key</th>
                <th className="px-4 py-2.5">Detail</th>
                <th className="px-4 py-2.5">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {entries.map((e) => (
                <tr key={e.id}>
                  <td className="px-4 py-2 whitespace-nowrap text-gray-500">{new Date(e.timestamp).toLocaleString()}</td>
                  <td className="px-4 py-2">
                    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${ACTION_STYLES[e.action] ?? "bg-gray-100 text-gray-600"}`}>{e.action}</span>
                  </td>
                  <td className="px-4 py-2 text-gray-700 font-mono text-xs">{e.actorUserId}</td>
                  <td className="px-4 py-2 text-gray-500">{e.actorRole}</td>
                  <td className="px-4 py-2 text-gray-400 font-mono text-xs truncate max-w-[120px]">{e.fileKey}</td>
                  <td className="px-4 py-2 text-gray-600 max-w-[320px] truncate" title={e.detail}>{e.detail}</td>
                  <td className="px-4 py-2 text-gray-400 font-mono text-xs">{e.ipAddress ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
