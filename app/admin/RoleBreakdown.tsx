const CLIENT_ROLES = [
  {
    key: "Owner",
    label: "Owner",
    color: "border-amber-600",
    badge: "bg-amber-900/50 text-amber-300",
    desc: "TTT-managed project owner with full visibility. Receives a formal contract, TTT-issued invoices, and has TTT field staff assigned to their project.",
  },
  {
    key: "Collaborator",
    label: "Collaborator",
    color: "border-sky-700",
    badge: "bg-sky-900/50 text-sky-300",
    desc: "Family member or trusted contact on a TTT-managed project with edit access to items and rooms.",
  },
  {
    key: "Viewer",
    label: "Viewer",
    color: "border-gray-600",
    badge: "bg-gray-700 text-gray-400",
    desc: "Read-only access to view project status, catalog, and invoices on a TTT-managed project.",
  },
] as const;

const NON_TTT_CLIENT_ROLES = [
  {
    key: "NonTTTOwner",
    label: "Non-TTT Owner",
    color: "border-orange-700",
    badge: "bg-orange-900/50 text-orange-300",
    desc: "Self-managed project owner. Catalogs and routes items to FB/Marketplace, eBay, or Other Consignment Store (100% client earnings — no TTT take rate). AI route recommendations never suggest ProFoundFinds. Enters destination square footage on /rooms to generate service hour estimates on /plan. 'Get Professional Support' CTA on /plan and /sales replaces hours log and payout section — emails info@toptiertransitions.com with project context. No TTT staff, formal contract, or TTT-issued invoices.",
  },
] as const;

const STAFF_ROLES = [
  {
    key: "TTTStaff",
    label: "TTT Staff",
    color: "border-gray-600",
    badge: "bg-gray-700 text-gray-300",
    desc: "Field staff who log time, access client project data, edit sale prices, view Venmo/Zelle payment QR codes and the real-time Zelle Payment Feed on the Sales page, edit project addresses from /home, assign themselves as Staff Seller on FB/eBay items, filter the Catalog by staff seller, submit & associate expenses with projects (reimbursable by default), and access the Help tab.",
  },
  {
    key: "TTTManager",
    label: "TTT Manager",
    color: "border-purple-700",
    badge: "bg-purple-900/50 text-purple-300",
    desc: "Operations leads with full project, quoting, invoicing, expense, subcontractor, and time-tracking access. Can create new client projects from /home, reassign items between projects, configure payout settings, manage payment handles, and access the Ops console. Expenses are reimbursable by default.",
  },
  {
    key: "TTTSales",
    label: "TTT Sales",
    color: "border-blue-700",
    badge: "bg-blue-900/50 text-blue-300",
    desc: "Sales team with access to CRM, quoting, invoicing, drip campaigns, expenses, and the Staff page. Expenses are non-reimbursable by default.",
  },
  {
    key: "TTTAdmin",
    label: "TTT Admin",
    color: "border-red-700",
    badge: "bg-red-900/50 text-red-300",
    desc: "Full platform access including admin console, all settings, Venmo/Zelle handle configuration, and item reassignment across projects. Expenses are non-reimbursable by default.",
  },
] as const;

type RoleKey = "Owner" | "Collaborator" | "Viewer" | "NonTTTOwner" | "TTTStaff" | "TTTManager" | "TTTSales" | "TTTAdmin";
type Check = true | false | "view-only" | "partial";

interface FeatureRow {
  group?: string;
  label?: string;
  permissions?: Partial<Record<RoleKey, Check>>;
}

const FEATURE_ROWS: FeatureRow[] = [
  { group: "Navigation" },
  { label: "Home dashboard",              permissions: { Owner: true,  Collaborator: true,  Viewer: true,  NonTTTOwner: true,  TTTStaff: true,  TTTManager: true,  TTTSales: false, TTTAdmin: true  } },
  { label: "Plan tab",                    permissions: { Owner: true,  Collaborator: true,  Viewer: true,  NonTTTOwner: true,  TTTStaff: true,  TTTManager: true,  TTTSales: false, TTTAdmin: true  } },
  { label: "Catalog tab",                 permissions: { Owner: true,  Collaborator: true,  Viewer: true,  NonTTTOwner: true,  TTTStaff: true,  TTTManager: true,  TTTSales: false, TTTAdmin: true  } },
  { label: "Vendors tab",                 permissions: { Owner: true,  Collaborator: true,  Viewer: true,  NonTTTOwner: true,  TTTStaff: true,  TTTManager: true,  TTTSales: false, TTTAdmin: true  } },
  { label: "Local Vendor Directory (full access)", permissions: { Owner: false, Collaborator: false, Viewer: false, NonTTTOwner: false, TTTStaff: true, TTTManager: true, TTTSales: false, TTTAdmin: true } },
  { label: "Local Vendor Directory (managed by TTT message)", permissions: { Owner: true, Collaborator: true, Viewer: true, NonTTTOwner: false, TTTStaff: false, TTTManager: false, TTTSales: false, TTTAdmin: false } },
  { label: "Local Vendor Directory (upsell prompt)", permissions: { Owner: false, Collaborator: false, Viewer: false, NonTTTOwner: true, TTTStaff: false, TTTManager: false, TTTSales: false, TTTAdmin: false } },
  { label: "Sales tab",                   permissions: { Owner: true,  Collaborator: true,  Viewer: true,  NonTTTOwner: true,  TTTStaff: true,  TTTManager: true,  TTTSales: false, TTTAdmin: true  } },
  { label: "Invoices tab",                permissions: { Owner: true,  Collaborator: true,  Viewer: true,  NonTTTOwner: false, TTTStaff: false, TTTManager: true,  TTTSales: true,  TTTAdmin: true  } },
  { label: "Expenses tab",                permissions: { Owner: false, Collaborator: false, Viewer: false, NonTTTOwner: false, TTTStaff: true,  TTTManager: true,  TTTSales: true,  TTTAdmin: true  } },
  { label: "CRM tab",                     permissions: { Owner: false, Collaborator: false, Viewer: false, NonTTTOwner: false, TTTStaff: false, TTTManager: false, TTTSales: true,  TTTAdmin: true  } },
  { label: "Drips tab",                   permissions: { Owner: false, Collaborator: false, Viewer: false, NonTTTOwner: false, TTTStaff: false, TTTManager: false, TTTSales: true,  TTTAdmin: true  } },
  { label: "Quoting tab",                 permissions: { Owner: false, Collaborator: false, Viewer: false, NonTTTOwner: false, TTTStaff: false, TTTManager: true,  TTTSales: true,  TTTAdmin: true  } },
  { label: "Ops tab (/staff)",            permissions: { Owner: false, Collaborator: false, Viewer: false, NonTTTOwner: false, TTTStaff: false, TTTManager: true,  TTTSales: true, TTTAdmin: true  } },
  { label: "Help tab",                    permissions: { Owner: true,  Collaborator: true,  Viewer: true,  NonTTTOwner: true,  TTTStaff: true,  TTTManager: true,  TTTSales: true,  TTTAdmin: true  } },
  { group: "Plan & Calendar" },
  { label: "View Daily Focus shifts",                         permissions: { Owner: true,  Collaborator: true,  Viewer: true,  NonTTTOwner: true,  TTTStaff: true,  TTTManager: true,  TTTSales: false, TTTAdmin: true  } },
  { label: "Add & edit Daily Focus shifts",                   permissions: { Owner: true,  Collaborator: true,  Viewer: false, NonTTTOwner: true,  TTTStaff: true,  TTTManager: true,  TTTSales: false, TTTAdmin: true  } },
  { label: "Invite TTT Team Members via staff name picker",   permissions: { Owner: false, Collaborator: false, Viewer: false, NonTTTOwner: false, TTTStaff: false, TTTManager: true,  TTTSales: false, TTTAdmin: true  } },
  { label: "Invite Helpers via email (family / friends)",     permissions: { Owner: true,  Collaborator: true,  Viewer: false, NonTTTOwner: true,  TTTStaff: true,  TTTManager: true,  TTTSales: false, TTTAdmin: true  } },
  { group: "Project Access" },
  { label: "View project & rooms",        permissions: { Owner: true,  Collaborator: true,  Viewer: true,  NonTTTOwner: true,  TTTStaff: true,  TTTManager: true,  TTTSales: false, TTTAdmin: true  } },
  { label: "Add & edit items",            permissions: { Owner: true,  Collaborator: true,  Viewer: false, NonTTTOwner: true,  TTTStaff: true,  TTTManager: true,  TTTSales: false, TTTAdmin: true  } },
  { label: "Route & approve items",       permissions: { Owner: true,  Collaborator: true,  Viewer: false, NonTTTOwner: "partial", TTTStaff: true,  TTTManager: true,  TTTSales: false, TTTAdmin: true  } },
  { label: "Invite members to project",   permissions: { Owner: true,  Collaborator: false, Viewer: false, NonTTTOwner: true,  TTTStaff: true,  TTTManager: true,  TTTSales: true,  TTTAdmin: true  } },
  { label: "Archive project",             permissions: { Owner: true,  Collaborator: false, Viewer: false, NonTTTOwner: true,  TTTStaff: false, TTTManager: true,  TTTSales: false, TTTAdmin: true  } },
  { label: "Assign Staff Seller on FB/eBay items", permissions: { Owner: false, Collaborator: false, Viewer: false, NonTTTOwner: false, TTTStaff: true, TTTManager: true, TTTSales: false, TTTAdmin: true } },
  { label: "Filter Catalog by Staff Seller",  permissions: { Owner: false, Collaborator: false, Viewer: false, NonTTTOwner: false, TTTStaff: true, TTTManager: true, TTTSales: false, TTTAdmin: true } },
  { label: "Completed Date auto-stamp (status → Sold/Donated/Discarded)", permissions: { Owner: true, Collaborator: true, Viewer: false, NonTTTOwner: true, TTTStaff: true, TTTManager: true, TTTSales: false, TTTAdmin: true } },
  { label: "Completed Date column & sort in Catalog table view", permissions: { Owner: true, Collaborator: true, Viewer: true, NonTTTOwner: true, TTTStaff: true, TTTManager: true, TTTSales: false, TTTAdmin: true } },
  { label: "Reassign item to another project", permissions: { Owner: false, Collaborator: false, Viewer: false, NonTTTOwner: false, TTTStaff: false, TTTManager: true, TTTSales: false, TTTAdmin: true } },
  { label: "Edit project address from /home",  permissions: { Owner: false, Collaborator: false, Viewer: false, NonTTTOwner: false, TTTStaff: true,  TTTManager: true, TTTSales: false, TTTAdmin: true } },
  { label: "Toggle card/table view for all projects", permissions: { Owner: false, Collaborator: false, Viewer: false, NonTTTOwner: false, TTTStaff: true, TTTManager: true, TTTSales: false, TTTAdmin: true } },
  { label: "Create new project from /home",           permissions: { Owner: false, Collaborator: false, Viewer: false, NonTTTOwner: false, TTTStaff: false, TTTManager: true, TTTSales: false, TTTAdmin: true } },
  { group: "Service Model" },
  { label: "TTT field staff assigned to project",           permissions: { Owner: true,  Collaborator: true,  Viewer: true,  NonTTTOwner: false, TTTStaff: true,  TTTManager: true,  TTTSales: false, TTTAdmin: true  } },
  { label: "Formal TTT contract & signed quote",            permissions: { Owner: "view-only", Collaborator: "view-only", Viewer: "view-only", NonTTTOwner: false, TTTStaff: false, TTTManager: true,  TTTSales: true,  TTTAdmin: true  } },
  { label: "Receives TTT-issued invoices",                  permissions: { Owner: true,  Collaborator: true,  Viewer: true,  NonTTTOwner: false, TTTStaff: false, TTTManager: true,  TTTSales: true,  TTTAdmin: true  } },
  { label: "ProFoundFinds Consignment routing available",   permissions: { Owner: true,  Collaborator: true,  Viewer: true,  NonTTTOwner: false, TTTStaff: true,  TTTManager: true,  TTTSales: false, TTTAdmin: true  } },
  { label: "TTT-managed payout rates (67% PF, 59% FB/eBay)", permissions: { Owner: "view-only", Collaborator: "view-only", Viewer: "view-only", NonTTTOwner: false, TTTStaff: false, TTTManager: true,  TTTSales: false, TTTAdmin: true  } },
  { label: "Self-service Free Estimator (Home page)",       permissions: { Owner: false, Collaborator: false, Viewer: false, NonTTTOwner: true,  TTTStaff: false, TTTManager: false, TTTSales: false, TTTAdmin: false } },
  { label: "FB & eBay at 100% client share (no take rate)", permissions: { Owner: false, Collaborator: false, Viewer: false, NonTTTOwner: true,  TTTStaff: false, TTTManager: false, TTTSales: false, TTTAdmin: false } },
  { label: "Other Consignment Store at 50% client share (self-managed)", permissions: { Owner: false, Collaborator: false, Viewer: false, NonTTTOwner: true, TTTStaff: false, TTTManager: false, TTTSales: false, TTTAdmin: false } },
  { label: "AI route: ProFoundFinds remapped → Other Consignment Store", permissions: { Owner: false, Collaborator: false, Viewer: false, NonTTTOwner: true, TTTStaff: false, TTTManager: false, TTTSales: false, TTTAdmin: false } },
  { label: "Destination sq ft input on /rooms → generates service hour estimates on /plan", permissions: { Owner: false, Collaborator: false, Viewer: false, NonTTTOwner: true, TTTStaff: false, TTTManager: false, TTTSales: false, TTTAdmin: false } },
  { label: "Sales summary: 2-box (inventory value + total earned, 100% share)", permissions: { Owner: false, Collaborator: false, Viewer: false, NonTTTOwner: true, TTTStaff: false, TTTManager: false, TTTSales: false, TTTAdmin: false } },
  { label: "Sales tables: Client Payout / Paid / Paid Date columns hidden", permissions: { Owner: false, Collaborator: false, Viewer: false, NonTTTOwner: true, TTTStaff: false, TTTManager: false, TTTSales: false, TTTAdmin: false } },
  { label: "'Get Professional Support' CTA on /plan (replaces empty hours message)", permissions: { Owner: false, Collaborator: false, Viewer: false, NonTTTOwner: true, TTTStaff: false, TTTManager: false, TTTSales: false, TTTAdmin: false } },
  { label: "'Get Professional Support' CTA on /sales (replaces payout preference section)", permissions: { Owner: false, Collaborator: false, Viewer: false, NonTTTOwner: true, TTTStaff: false, TTTManager: false, TTTSales: false, TTTAdmin: false } },
  { label: "Visible to TTT Staff in project views & time tracker", permissions: { Owner: true, Collaborator: true, Viewer: true, NonTTTOwner: false, TTTStaff: true, TTTManager: true, TTTSales: false, TTTAdmin: true } },
  { group: "Invoices" },
  { label: "View invoices & PDF",         permissions: { Owner: true,  Collaborator: true,  Viewer: true,  NonTTTOwner: false, TTTStaff: false, TTTManager: true,  TTTSales: true,  TTTAdmin: true  } },
  { label: "Create invoices",             permissions: { Owner: false, Collaborator: false, Viewer: false, NonTTTOwner: false, TTTStaff: false, TTTManager: true,  TTTSales: true,  TTTAdmin: true  } },
  { label: "Mark invoices paid",          permissions: { Owner: false, Collaborator: false, Viewer: false, NonTTTOwner: false, TTTStaff: false, TTTManager: true,  TTTSales: true,  TTTAdmin: true  } },
  { label: "Delete invoices",             permissions: { Owner: false, Collaborator: false, Viewer: false, NonTTTOwner: false, TTTStaff: false, TTTManager: true,  TTTSales: true,  TTTAdmin: true  } },
  { group: "Time Tracking" },
  { label: "Log own time",                permissions: { Owner: false, Collaborator: false, Viewer: false, NonTTTOwner: false, TTTStaff: true,  TTTManager: true,  TTTSales: true,  TTTAdmin: true  } },
  { label: "Set own availability",        permissions: { Owner: false, Collaborator: false, Viewer: false, NonTTTOwner: false, TTTStaff: true,  TTTManager: true,  TTTSales: true,  TTTAdmin: true  } },
  { label: "Set time off",                permissions: { Owner: false, Collaborator: false, Viewer: false, NonTTTOwner: false, TTTStaff: true,  TTTManager: true,  TTTSales: true,  TTTAdmin: true  } },
  { label: "View Today's Plan (home)",    permissions: { Owner: false, Collaborator: false, Viewer: false, NonTTTOwner: false, TTTStaff: true,  TTTManager: true,  TTTSales: false, TTTAdmin: true  } },
  { label: "View all staff time",         permissions: { Owner: false, Collaborator: false, Viewer: false, NonTTTOwner: false, TTTStaff: false, TTTManager: true,  TTTSales: false, TTTAdmin: true  } },
  { label: "View staff name on logged time entries (Plan page)", permissions: { Owner: false, Collaborator: false, Viewer: false, NonTTTOwner: false, TTTStaff: false, TTTManager: true, TTTSales: false, TTTAdmin: true } },
  { label: "Edit logged time entries (Plan page)", permissions: { Owner: false, Collaborator: false, Viewer: false, NonTTTOwner: false, TTTStaff: false, TTTManager: true, TTTSales: false, TTTAdmin: true } },
  { label: "Export time data",            permissions: { Owner: false, Collaborator: false, Viewer: false, NonTTTOwner: false, TTTStaff: false, TTTManager: true,  TTTSales: false, TTTAdmin: true  } },
  { group: "Expenses" },
  { label: "Submit own expenses",                      permissions: { Owner: false, Collaborator: false, Viewer: false, NonTTTOwner: false, TTTStaff: true,  TTTManager: true,  TTTSales: true,  TTTAdmin: true  } },
  { label: "Associate expense with project",           permissions: { Owner: false, Collaborator: false, Viewer: false, NonTTTOwner: false, TTTStaff: true,  TTTManager: true,  TTTSales: true,  TTTAdmin: true  } },
  { label: "Expense reimbursable by default (YES)",    permissions: { Owner: false, Collaborator: false, Viewer: false, NonTTTOwner: false, TTTStaff: true,  TTTManager: true,  TTTSales: false, TTTAdmin: false } },
  { label: "Toggle expense reimbursable status",       permissions: { Owner: false, Collaborator: false, Viewer: false, NonTTTOwner: false, TTTStaff: true,  TTTManager: true,  TTTSales: true,  TTTAdmin: true  } },
  { label: "Reimbursable expenses included in payroll CSV export", permissions: { Owner: false, Collaborator: false, Viewer: false, NonTTTOwner: false, TTTStaff: false, TTTManager: true, TTTSales: false, TTTAdmin: true } },
  { label: "View All Company expenses",                permissions: { Owner: false, Collaborator: false, Viewer: false, NonTTTOwner: false, TTTStaff: false, TTTManager: true,  TTTSales: false, TTTAdmin: true  } },
  { label: "Edit any staff expense",                   permissions: { Owner: false, Collaborator: false, Viewer: false, NonTTTOwner: false, TTTStaff: false, TTTManager: true,  TTTSales: false, TTTAdmin: true  } },
  { label: "Include expenses in Full Invoice",         permissions: { Owner: false, Collaborator: false, Viewer: false, NonTTTOwner: false, TTTStaff: false, TTTManager: true,  TTTSales: true,  TTTAdmin: true  } },
  { group: "Subcontractors" },
  { label: "View subcontractor records",  permissions: { Owner: false, Collaborator: false, Viewer: false, NonTTTOwner: false, TTTStaff: false, TTTManager: true,  TTTSales: false, TTTAdmin: true  } },
  { label: "Add / edit subcontractors",   permissions: { Owner: false, Collaborator: false, Viewer: false, NonTTTOwner: false, TTTStaff: false, TTTManager: true,  TTTSales: false, TTTAdmin: true  } },
  { label: "Mark subcontractor paid",     permissions: { Owner: false, Collaborator: false, Viewer: false, NonTTTOwner: false, TTTStaff: false, TTTManager: true,  TTTSales: false, TTTAdmin: true  } },
  { label: "Delete subcontractor record", permissions: { Owner: false, Collaborator: false, Viewer: false, NonTTTOwner: false, TTTStaff: false, TTTManager: true,  TTTSales: false, TTTAdmin: true  } },
  { group: "CRM & Sales Pipeline" },
  { label: "View pipeline & contacts",    permissions: { Owner: false, Collaborator: false, Viewer: false, NonTTTOwner: false, TTTStaff: false, TTTManager: false, TTTSales: true,  TTTAdmin: true  } },
  { label: "Manage opportunities",        permissions: { Owner: false, Collaborator: false, Viewer: false, NonTTTOwner: false, TTTStaff: false, TTTManager: false, TTTSales: true,  TTTAdmin: true  } },
  { label: "Log CRM activities (Call, Email, Meeting, Note, Task, Text Message)", permissions: { Owner: false, Collaborator: false, Viewer: false, NonTTTOwner: false, TTTStaff: false, TTTManager: false, TTTSales: true, TTTAdmin: true } },
  { label: "Convert lead to project",     permissions: { Owner: false, Collaborator: false, Viewer: false, NonTTTOwner: false, TTTStaff: false, TTTManager: false, TTTSales: true,  TTTAdmin: true  } },
  { label: "Opportunity address auto-syncs to linked project", permissions: { Owner: false, Collaborator: false, Viewer: false, NonTTTOwner: false, TTTStaff: false, TTTManager: false, TTTSales: true, TTTAdmin: true } },
  { group: "Sales & Payouts" },
  { label: "View sales page (consignment & marketplace)", permissions: { Owner: true, Collaborator: true, Viewer: true, NonTTTOwner: true, TTTStaff: true, TTTManager: true, TTTSales: false, TTTAdmin: true } },
  { label: "Set client payout preference (Zelle/Venmo/Check/Other)", permissions: { Owner: true, Collaborator: "view-only", Viewer: "view-only", NonTTTOwner: false, TTTStaff: true, TTTManager: true, TTTSales: false, TTTAdmin: true } },
  { label: "Edit sale price & payout",    permissions: { Owner: false, Collaborator: false, Viewer: false, NonTTTOwner: false, TTTStaff: true,  TTTManager: true,  TTTSales: false, TTTAdmin: true  } },
  { label: "View Venmo/Zelle payment QR codes", permissions: { Owner: false, Collaborator: false, Viewer: false, NonTTTOwner: false, TTTStaff: true, TTTManager: true, TTTSales: false, TTTAdmin: true } },
  { label: "Upload proof of payment",     permissions: { Owner: true,  Collaborator: true,  Viewer: false, NonTTTOwner: true,  TTTStaff: true,  TTTManager: true,  TTTSales: false, TTTAdmin: true  } },
  { label: "Delete proof of payment",     permissions: { Owner: false, Collaborator: false, Viewer: false, NonTTTOwner: false, TTTStaff: false, TTTManager: true,  TTTSales: false, TTTAdmin: true  } },
  { label: "Generate client payout PDF",  permissions: { Owner: false, Collaborator: false, Viewer: false, NonTTTOwner: false, TTTStaff: false, TTTManager: true,  TTTSales: false, TTTAdmin: true  } },
  { label: "Zelle Payment Feed (real-time incoming payments)", permissions: { Owner: false, Collaborator: false, Viewer: false, NonTTTOwner: false, TTTStaff: true, TTTManager: true, TTTSales: false, TTTAdmin: true } },
  { group: "Staff Pay" },
  { label: "View My Pay section on Home (hours, commission, mileage, travel time, expenses)", permissions: { Owner: false, Collaborator: false, Viewer: false, NonTTTOwner: false, TTTStaff: true, TTTManager: true, TTTSales: false, TTTAdmin: false } },
  { label: "Admin Pay console (/admin/pay) — Hours tab",         permissions: { Owner: false, Collaborator: false, Viewer: false, NonTTTOwner: false, TTTStaff: false, TTTManager: true, TTTSales: false, TTTAdmin: true } },
  { label: "Admin Pay console — Commission tab",                  permissions: { Owner: false, Collaborator: false, Viewer: false, NonTTTOwner: false, TTTStaff: false, TTTManager: true, TTTSales: false, TTTAdmin: true } },
  { label: "Admin Pay console — Mileage tab",                    permissions: { Owner: false, Collaborator: false, Viewer: false, NonTTTOwner: false, TTTStaff: false, TTTManager: true, TTTSales: false, TTTAdmin: true } },
  { label: "Admin Pay console — Travel Time tab",                permissions: { Owner: false, Collaborator: false, Viewer: false, NonTTTOwner: false, TTTStaff: false, TTTManager: true, TTTSales: false, TTTAdmin: true } },
  { label: "Admin Pay console — Expenses tab",                   permissions: { Owner: false, Collaborator: false, Viewer: false, NonTTTOwner: false, TTTStaff: false, TTTManager: true, TTTSales: false, TTTAdmin: true } },
  { label: "Bulk mark pay items as paid",                        permissions: { Owner: false, Collaborator: false, Viewer: false, NonTTTOwner: false, TTTStaff: false, TTTManager: true, TTTSales: false, TTTAdmin: true } },
  { group: "Admin Console" },
  { label: "Access /admin",              permissions: { Owner: false, Collaborator: false, Viewer: false, NonTTTOwner: false, TTTStaff: false, TTTManager: false, TTTSales: false, TTTAdmin: true  } },
  { label: "Access Ops console (/admin/ops)", permissions: { Owner: false, Collaborator: false, Viewer: false, NonTTTOwner: false, TTTStaff: false, TTTManager: true, TTTSales: false, TTTAdmin: true } },
  { label: "View project address in admin projects table", permissions: { Owner: false, Collaborator: false, Viewer: false, NonTTTOwner: false, TTTStaff: false, TTTManager: false, TTTSales: false, TTTAdmin: true } },
  { label: "Manage users & roles",       permissions: { Owner: false, Collaborator: false, Viewer: false, NonTTTOwner: false, TTTStaff: false, TTTManager: false, TTTSales: false, TTTAdmin: true  } },
  { label: "Contract & invoice settings",permissions: { Owner: false, Collaborator: false, Viewer: false, NonTTTOwner: false, TTTStaff: false, TTTManager: false, TTTSales: false, TTTAdmin: true  } },
  { label: "Routing rules & integrations",permissions:{ Owner: false, Collaborator: false, Viewer: false, NonTTTOwner: false, TTTStaff: false, TTTManager: false, TTTSales: false, TTTAdmin: true  } },
  { label: "Configure Venmo/Zelle payment handles & QR codes", permissions: { Owner: false, Collaborator: false, Viewer: false, NonTTTOwner: false, TTTStaff: false, TTTManager: false, TTTSales: false, TTTAdmin: true } },
  { label: "Toggle TTT / Non-TTT flag per project",            permissions: { Owner: false, Collaborator: false, Viewer: false, NonTTTOwner: false, TTTStaff: false, TTTManager: false, TTTSales: false, TTTAdmin: true } },
  { label: "View PF/FB/eBay inventory tables", permissions: { Owner: false, Collaborator: false, Viewer: false, NonTTTOwner: false, TTTStaff: false, TTTManager: false, TTTSales: false, TTTAdmin: true } },
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
  if (value === "partial") {
    return <span className="text-xs text-amber-500 block text-center font-semibold" title="Available with restrictions">~</span>;
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

      {/* TTT Client role cards */}
      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2">TTT Client Roles</p>
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

      {/* Non-TTT Client role cards */}
      <p className="text-[10px] font-bold uppercase tracking-widest text-orange-600 mb-2">Non-TTT Client Roles</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        {NON_TTT_CLIENT_ROLES.map((r) => (
          <div key={r.key} className={`bg-gray-900 border ${r.color} rounded-xl p-4`}>
            <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium mb-2 ${r.badge}`}>
              {r.label}
            </span>
            <p className="text-xs text-gray-400 leading-relaxed">{r.desc}</p>
          </div>
        ))}
        <div className="bg-gray-900 border border-orange-900/40 rounded-xl p-4">
          <div className="flex items-center gap-1.5 mb-2">
            <span className="inline-block text-xs px-2 py-0.5 rounded-full font-medium bg-orange-900/30 text-orange-400">~ Partial access</span>
            <span className="text-xs text-gray-600">legend</span>
          </div>
          <p className="text-xs text-gray-400 leading-relaxed">
            In the matrix below, <span className="text-amber-500 font-semibold">~</span> means the feature exists but with restrictions — for example, Non-TTT Owners can route items but ProFoundFinds Consignment is replaced by Other Consignment Store, and client share rates differ from TTT-managed projects.
          </p>
        </div>
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
          <table className="w-full text-sm min-w-[960px]">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 w-[28%]">Feature</th>
                {/* TTT Client group header */}
                <th colSpan={3} className="px-3 py-3 text-center border-l border-gray-800">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">TTT Client</span>
                </th>
                {/* Non-TTT Client group header */}
                <th colSpan={1} className="px-3 py-3 text-center border-l border-orange-900/50">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-orange-500">Non-TTT Client</span>
                </th>
                {/* Staff group header */}
                <th colSpan={4} className="px-3 py-3 text-center border-l border-gray-800">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">TTT Staff</span>
                </th>
              </tr>
              <tr className="border-b border-gray-800 bg-gray-800/30">
                <th className="px-5 py-2" />
                {/* TTT Client role badges */}
                {CLIENT_ROLES.map((r, i) => (
                  <th key={r.key} className={`px-3 py-2 text-center ${i === 0 ? "border-l border-gray-800" : ""}`}>
                    <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${r.badge}`}>
                      {r.label}
                    </span>
                  </th>
                ))}
                {/* Non-TTT Client badge */}
                {NON_TTT_CLIENT_ROLES.map((r) => (
                  <th key={r.key} className="px-3 py-2 text-center border-l border-orange-900/40">
                    <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${r.badge}`}>
                      {r.label}
                    </span>
                  </th>
                ))}
                {/* Staff role badges */}
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
                    <td colSpan={9} className="px-5 py-2 text-[10px] font-bold uppercase tracking-widest text-gray-500">
                      {row.group}
                    </td>
                  </tr>
                ) : (
                  <tr key={`f-${i}`} className="hover:bg-gray-800/30 transition-colors">
                    <td className="px-5 py-2.5 text-sm text-gray-300">{row.label}</td>
                    {/* TTT Client cells */}
                    {CLIENT_ROLES.map((r, i) => (
                      <td key={r.key} className={`px-3 py-2.5 text-center ${i === 0 ? "border-l border-gray-800/50" : ""}`}>
                        <CheckCell value={row.permissions?.[r.key as RoleKey]} />
                      </td>
                    ))}
                    {/* Non-TTT Client cells */}
                    {NON_TTT_CLIENT_ROLES.map((r) => (
                      <td key={r.key} className="px-3 py-2.5 text-center border-l border-orange-900/30 bg-orange-950/10">
                        <CheckCell value={row.permissions?.[r.key as RoleKey]} />
                      </td>
                    ))}
                    {/* Staff cells */}
                    {STAFF_ROLES.map((r, i) => (
                      <td key={r.key} className={`px-3 py-2.5 text-center ${i === 0 ? "border-l border-gray-800/50" : ""}`}>
                        <CheckCell value={row.permissions?.[r.key as RoleKey]} />
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
