import type { SystemRole } from "./types";

export const PERMISSIONS = {
  TIME_VIEW_SELF:   "time:view:self",
  TIME_EDIT_SELF:   "time:edit:self",
  TIME_VIEW_ALL:    "time:view:all",
  TIME_EDIT_ALL:    "time:edit:all",
  TIME_EXPORT:      "time:export",
  PROJECTS_WRITE:   "projects:write",
  PROJECTS_ARCHIVE: "projects:archive",
  STAFF_MANAGE:     "staff:manage",
} as const;

export type Permission = typeof PERMISSIONS[keyof typeof PERMISSIONS];

const ALL_PERMISSIONS: Permission[] = Object.values(PERMISSIONS);

export const ROLE_PERMISSIONS: Record<SystemRole, Permission[]> = {
  TTTStaff: [
    "time:view:self",
    "time:edit:self",
    "projects:write",
  ],
  TTTManager: [
    "time:view:self",
    "time:edit:self",
    "time:view:all",
    "time:edit:all",
    "time:export",
    "projects:write",
    "projects:archive",
  ],
  TTTAdmin: ALL_PERMISSIONS,
};

export function hasPermission(role: SystemRole | null, perm: Permission): boolean {
  if (!role) return false;
  return (ROLE_PERMISSIONS[role] as Permission[]).includes(perm);
}
