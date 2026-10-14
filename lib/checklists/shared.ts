// Community checklists: tasks a partner community (a Community Brand) sets
// for every resident moving in. Client-safe types and the one place that
// decides an item's due date and status, so the resident's Plan page, the
// admin editor and the partner portal always agree.

export type ChecklistDueType = "none" | "before" | "after" | "date";

export interface ChecklistItem {
  id: string;
  brandId: string;
  title: string;
  details: string;
  dueType: ChecklistDueType;
  /** Days before/after the move date (dueType before/after) */
  dueDays?: number;
  /** YYYY-MM-DD (dueType date) */
  dueDate?: string;
  sortOrder: number;
}

export type ChecklistActorRole = "Resident" | "Top Tier" | "Community";

export interface ChecklistItemState {
  itemId: string;
  tenantId: string;
  done: boolean;
  doneAt?: string;
  doneByName?: string;
  doneByRole?: ChecklistActorRole;
}

export type ChecklistStatus = "done" | "open" | "pastDue";

export interface ResidentChecklistRow {
  item: ChecklistItem;
  /** YYYY-MM-DD, when it can be worked out */
  dueDate?: string;
  status: ChecklistStatus;
  /** Open and due within the next 7 days */
  dueSoon: boolean;
  /** Relative to a move date the resident doesn't have yet */
  waitingOnMoveDate: boolean;
  state?: ChecklistItemState;
}

export interface ChecklistSummary {
  total: number;
  done: number;
  open: number;
  pastDue: number;
}

/** Today's date in Chicago (where Top Tier works), as YYYY-MM-DD. */
export function todayYmd(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export function computeDueDate(item: ChecklistItem, moveDate?: string): string | undefined {
  if (item.dueType === "date") return item.dueDate || undefined;
  if ((item.dueType === "before" || item.dueType === "after") && moveDate) {
    const days = Math.max(0, Math.round(item.dueDays ?? 0));
    return addDays(moveDate, item.dueType === "before" ? -days : days);
  }
  return undefined;
}

export function buildResidentChecklist(
  items: ChecklistItem[],
  states: ChecklistItemState[],
  moveDate: string | undefined,
  today: string = todayYmd()
): ResidentChecklistRow[] {
  const byItem = new Map(states.map((s) => [s.itemId, s]));
  const soon = addDays(today, 7);
  return [...items]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((item) => {
      const state = byItem.get(item.id);
      const dueDate = computeDueDate(item, moveDate);
      const done = state?.done === true;
      const status: ChecklistStatus = done ? "done" : dueDate && dueDate < today ? "pastDue" : "open";
      return {
        item,
        dueDate,
        status,
        dueSoon: status === "open" && !!dueDate && dueDate <= soon,
        waitingOnMoveDate: !dueDate && (item.dueType === "before" || item.dueType === "after"),
        state,
      };
    });
}

export function summarize(rows: ResidentChecklistRow[]): ChecklistSummary {
  return {
    total: rows.length,
    done: rows.filter((r) => r.status === "done").length,
    open: rows.filter((r) => r.status === "open").length,
    pastDue: rows.filter((r) => r.status === "pastDue").length,
  };
}

/** "3 days before move", "On move day", "Mar 4, 2027", "No due date" */
export function dueRuleLabel(item: Pick<ChecklistItem, "dueType" | "dueDays" | "dueDate">): string {
  if (item.dueType === "date") return item.dueDate ? formatYmd(item.dueDate, true) : "No due date";
  if (item.dueType === "before" || item.dueType === "after") {
    const n = Math.max(0, Math.round(item.dueDays ?? 0));
    if (n === 0) return "On move day";
    return `${n} ${n === 1 ? "day" : "days"} ${item.dueType} move`;
  }
  return "No due date";
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatYmd(ymd: string, withYear = false): string {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return ymd;
  return `${MONTHS[m - 1]} ${d}${withYear ? `, ${y}` : ""}`;
}
