const CLIENT_ROLES = [
  {
    key: "Owner",
    label: "Owner",
    color: "border-amber-600",
    badge: "bg-amber-900/50 text-amber-300",
    desc: "Project owner with full visibility and the ability to manage their estate project.",
  },
  {
    key: "Collaborator",
    label: "Collaborator",
    color: "border-sky-700",
    badge: "bg-sky-900/50 text-sky-300",
    desc: "Family member or trusted contact with edit access to items and rooms.",
  },
  {
    key: "Viewer",
    label: "Viewer",
    color: "border-gray-600",
    badge: "bg-gray-700 text-gray-400",
    desc: "Read-only access to view project status, catalog, and invoices.",
  },
] as const;

const STAFF_ROLES = [
  {
    key: "TTTStaff",
    label: "TTT Staff",
    color: "border-gray-600",
    badge: "bg-gray-700 text-gray-300",
    desc: "Field staff who log time and access client project data.",
  },
  {
    key: "TTTManager",
    label: "TTT Manager",
    color: "border-purple-700",
    badge: "bg-purple-900/50 text-purple-300",
    desc: "Operations leads with full project, quoting, invoicing, expense, and time-tracking access.",
  },
  {
    key: "TTTSales",
    label: "TTT Sales",
    color: "border-blue-700",
    badge: "bg-blue-900/50 text-blue-300",
    desc: "Sales team with access to CRM, quoting, invoicing, drip campaigns, and expenses.",
  },
  {
    key: "TTTAdmin",
    label: "TTT Admin",
    color: "border-red-700",
    badge: "bg-red-900/50 text-red-300",
    desc: "Full platform access including admin console and all settings.",
  },
] as const;

const ALL_ROLES = [...CLIENT_ROLES, ...STAFF_ROLES] as const;
type RoleKey = (typeof ALL_ROLES)[number]["key"];
type Check = true | false | "view-only";

interface FeatureRow {
  group?: string;
  label?: string;
  permissions?: Partial<Record<RoleKey, Check>>;
}

const FEATURE_ROWS: FeatureRow[] = [
  { group: "Navigation" },
  { label: "Home dashboard",              permissions: { Owner: true,  Collaborator: true,  Viewer: true,  TTTStaff: true,  TTTManager: true,  TTTSales: false, TTTAdmin: true  } },
  { label: "Plan tab",                    permissions: { Owner: true,  Collaborator: true,  Viewer: true,  TTTStaff: true,  TTTManager: true,  TTTSales: false, TTTAdmin: true  } },
  { label: "Catalog tab",                 permissions: { Owner: true,  Collaborator: true,  Viewer: true,  TTTStaff: true,  TTTManager: true,  TTTSales: false, TTTAdmin: true  } },
  { label: "Vendors tab",                 permissions: { Owner: true,  Collaborator: true,  Viewer: true,  TTTStaff: true,  TTTManager: true,  TTTSales: false, TTTAdmin: true  } },
  { label: "Sales tab",                   permissions: { Owner: true,  Collaborator: true,  Viewer: true,  TTTStaff: true,  TTTManager: true,  TTTSales: false, TTTAdmin: true  } },
  { label: "Invoices tab",               permissions: { Owner: true,  Collaborator: true,  Viewer: true,  TTTStaff: false, TTTManager: true,  TTTSales: true,  TTTAdmin: true  } },
  { label: "Expenses tab",               permissions: { Owner: false, Collaborator: false, Viewer: false, TTTStaff: false, TTTManager: true,  TTTSales: true,  TTTAdmin: true  } },
  { label: "CRM tab",                     permissions: { Owner: false, Collaborator: false, Viewer: false, TTTStaff: false, TTTManager: false, TTTSales: true,  TTTAdmin: true  } },
  { label: "Drips tab",                   permissions: { Owner: false, Collaborator: false, Viewer: false, TTTStaff: false, TTTManager: false, TTTSales: true,  TTTAdmin: true  } },
  { label: "Quoting tab",                 permissions: { Owner: false, Collaborator: false, Viewer: false, TTTStaff: false, TTTManager: true,  TTTSales: true,  TTTAdmin: true  } },
  { group: "Project Access" },
  { label: "View project & rooms",       permissions: { Owner: true,  Collaborator: true,  Viewer: true,  TTTStaff: true,  TTTManager: true,  TTTSales: false, TTTAdmin: true  } },
  { label: "Add & edit items",           permissions: { Owner: true,  Collaborator: true,  Viewer: false, TTTStaff: true,  TTTManager: true,  TTTSales: false, TTTAdmin: true  } },
  { label: "Route & approve items",      permissions: { Owner: true,  Collaborator: true,  Viewer: false, TTTStaff: true,  TTTManager: true,  TTTSales: false, TTTAdmin: true  } },
  { label: "Invite members to project",  permissions: { Owner: true,  Collaborator: false, Viewer: false, TTTStaff: false, TTTManager: false, TTTSales: false, TTTAdmin: true  } },
  { label: "Archive project",            permissions: { Owner: true,  Collaborator: false, Viewer: false, TTTStaff: false, TTTManager: true,  TTTSales: false, TTTAdmin: true  } },
  { group: "Invoices" },
  { label: "View invoices & PDF",        permissions: { Owner: true,  Collaborator: true,  Viewer: true,  TTTStaff: false, TTTManager: true,  TTTSales: true,  TTTAdmin: true  } },
  { label: "Create invoices",            permissions: { Owner: false, Collaborator: false, Viewer: false, TTTStaff: false, TTTManager: true,  TTTSales: true,  TTTAdmin: true  } },
  { label: "Mark invoices paid",         permissions: { Owner: false, Collaborator: false, Viewer: false, TTTStaff: false, TTTManager: true,  TTTSales: true,  TTTAdmin: true  } },
  { group: "Time Tracking" },
  { label: "Log own time",               permissions: { Owner: false, Collaborator: false, Viewer: false, TTTStaff: true,  TTTManager: true,  TTTSales: true,  TTTAdmin: true  } },
  { label: "View all staff time",        permissions: { Owner: false, Collaborator: false, Viewer: false, TTTStaff: false, TTTManager: true,  TTTSales: false, TTTAdmin: true  } },
  { label: "Export time data",           permissions: { Owner: false, Collaborator: false, Viewer: false, TTTStaff: false, TTTManager: true,  TTTSales: false, TTTAdmin: true  } },
  { group: "Expenses" },
  { label: "Submit own expenses",        permissions: { Owner: false, Collaborator: false, Viewer: false, TTTStaff: false, TTTManager: true,  TTTSales: true,  TTTAdmin: true  } },
  { label: "View & edit all expenses",   permissions: { Owner: false, Collaborator: false, Viewer: false, TTTStaff: false, TTTManager: false, TTTSales: false, TTTAdmin: true  } },
  { group: "CRM & Sales" },
  { label: "View pipeline & contacts",   permissions: { Owner: false, Collaborator: false, Viewer: false, TTTStaff: false, TTTManager: false, TTTSales: true,  TTTAdmin: true  } },
  { label: "Manage opportunities",       permissions: { Owner: false, Collaborator: false, Viewer: false, TTTStaff: false, TTTManager: false, TTTSales: true,  TTTAdmin: true  } },
  { label: "Convert lead to project",    permissions: { Owner: false, Collaborator: false, Viewer: false, TTTStaff: false, TTTManager: false, TTTSales: true,  TTTAdmin: true  } },
  { group: "Sales & Payouts" },
  { label: "Edit sale price & payout",    permissions: { Owner: false, Collaborator: false, Viewer: false, TTTStaff: true,  TTTManager: true,  TTTSales: false, TTTAdmin: true  } },
  { label: "Generate client payout PDF",  permissions: { Owner: false, Collaborator: false, Viewer: false, TTTStaff: false, TTTManager: true,  TTTSales: false, TTTAdmin: true  } },
  { label: "Delete payment proofs",       permissions: { Owner: false, Collaborator: false, Viewer: false, TTTStaff: false, TTTManager: true,  TTTSales: false, TTTAdmin: true  } },
  { group: "Admin Console" },
  { label: "Access /admin",              permissions: { Owner: false, Collaborator: false, Viewer: false, TTTStaff: false, TTTManager: false, TTTSales: false, TTTAdmin: true  } },
  { label: "Manage users & roles",       permissions: { Owner: false, Collaborator: false, Viewer: false, TTTStaff: false, TTTManager: false, TTTSales: false, TTTAdmin: true  } },
  { label: "Contract & invoice settings",permissions: { Owner: false, Collaborator: false, Viewer: false, TTTStaff: false, TTTManager: false, TTTSales: false, TTTAdmin: true  } },
  { label: "Routing rules & integrations",permissions:{ Owner: false, Collaborator: false, Viewer: false, TTTStaff: false, TTTManager: false, TTTSales: false, TTTAdmin: true  } },
];

function CheckCell({ value }: { value: Check | undefined }) {
  if (value === true) {
    return (
      <svg className="w-4 h-4 text-forest-400 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    );
  }
  if (value === "view-only") {
    return <span className="text-xs text-gray-500 block text-center">View</span>;
  }
  return (
    <svg className="w-3.5 h-3.5 text-gray-700 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
    </svg>
  );
}

export function RoleBreakdown() {
  return (
    <div className="mt-8">
      <div className="mb-5">
        <h2 className="text-base font-semibold text-white">User Role Guide</h2>
        <p className="text-sm text-gray-400 mt-0.5">Permissions and access for every role type across the platform.</p>
      </div>

      {/* Client role cards */}
      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2">Client Roles</p>
      <div className="grid grid-cols-3 gap-3 mb-4">
        {CLIENT_ROLES.map((r) => (
          <div key={r.key} className={`bg-gray-900 border ${r.color} rounded-xl p-4`}>
            <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium mb-2 ${r.badge}`}>
              {r.label}
            </span>
            <p className="text-xs text-gray-400 leading-relaxed">{r.desc}</p>
          </div>
        ))}
      </div>

      {/* Staff role cards */}
      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2">TTT Staff Roles</p>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {STAFF_ROLES.map((r) => (
          <div key={r.key} className={`bg-gray-900 border ${r.color} rounded-xl p-4`}>
            <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium mb-2 ${r.badge}`}>
              {r.label}
            </span>
            <p className="text-xs text-gray-400 leading-relaxed">{r.desc}</p>
          </div>
        ))}
      </div>

      {/* Feature matrix */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[780px]">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 w-[30%]">Feature</th>
                {/* Client group header */}
                <th colSpan={3} className="px-3 py-3 text-center border-l border-gray-800">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Client</span>
                </th>
                {/* Staff group header */}
                <th colSpan={4} className="px-3 py-3 text-center border-l border-gray-800">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">TTT Staff</span>
                </th>
              </tr>
              <tr className="border-b border-gray-800 bg-gray-800/30">
                <th className="px-5 py-2" />
                {CLIENT_ROLES.map((r, i) => (
                  <th key={r.key} className={`px-3 py-2 text-center ${i === 0 ? "border-l border-gray-800" : ""}`}>
                    <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${r.badge}`}>
                      {r.label}
                    </span>
                  </th>
                ))}
                {STAFF_ROLES.map((r, i) => (
                  <th key={r.key} className={`px-3 py-2 text-center ${i === 0 ? "border-l border-gray-800" : ""}`}>
                    <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${r.badge}`}>
                      {r.label}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/60">
              {FEATURE_ROWS.map((row, i) =>
                row.group ? (
                  <tr key={`g-${i}`} className="bg-gray-800/40">
                    <td colSpan={8} className="px-5 py-2 text-[10px] font-bold uppercase tracking-widest text-gray-500">
                      {row.group}
                    </td>
                  </tr>
                ) : (
                  <tr key={`f-${i}`} className="hover:bg-gray-800/30 transition-colors">
                    <td className="px-5 py-2.5 text-sm text-gray-300">{row.label}</td>
                    {CLIENT_ROLES.map((r, i) => (
                      <td key={r.key} className={`px-3 py-2.5 text-center ${i === 0 ? "border-l border-gray-800/50" : ""}`}>
                        <CheckCell value={row.permissions?.[r.key]} />
                      </td>
                    ))}
                    {STAFF_ROLES.map((r, i) => (
                      <td key={r.key} className={`px-3 py-2.5 text-center ${i === 0 ? "border-l border-gray-800/50" : ""}`}>
                        <CheckCell value={row.permissions?.[r.key]} />
                      </td>
                    ))}
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
