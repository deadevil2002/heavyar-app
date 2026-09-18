export type StaffRole = 'owner' | 'super_admin' | 'admin' | 'finance' | 'payouts' | 'operations' | 'support' | 'verification' | 'marketing' | 'auditor' | 'moderator' | string;
export type Permission = 'users.read' | 'users.manage' | 'providers.read' | 'providers.manage' | 'drivers.read' | 'drivers.manage' | 'equipment.read' | 'equipment.moderate' | 'requests.read' | 'requests.manage' | 'finance.read' | 'refunds.manage' | 'fees.read' | 'fees.manage' | 'complaints.read' | 'complaints.manage' | 'verification.read' | 'verification.manage' | 'exports.read' | 'staff.manage' | 'security.manage' | 'seo.read' | 'seo.edit' | 'seo.publish';
const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  owner: ['users.read','users.manage','providers.read','providers.manage','drivers.read','drivers.manage','equipment.read','equipment.moderate','requests.read','requests.manage','finance.read','refunds.manage','fees.read','fees.manage','complaints.read','complaints.manage','verification.read','verification.manage','exports.read','staff.manage','security.manage', 'seo.read', 'seo.edit', 'seo.publish'],
  super_admin: ['users.read','users.manage','providers.read','providers.manage','drivers.read','drivers.manage','equipment.read','equipment.moderate','requests.read','requests.manage','finance.read','refunds.manage','fees.read','fees.manage','complaints.read','complaints.manage','verification.read','verification.manage','exports.read','staff.manage', 'seo.read', 'seo.edit', 'seo.publish'],
  admin: ['users.read','users.manage','providers.read','providers.manage','drivers.read','drivers.manage','equipment.read','equipment.moderate','requests.read','requests.manage','complaints.read','complaints.manage','verification.read','exports.read', 'seo.read'],
  finance: ['finance.read','refunds.manage','fees.read','requests.read','exports.read'],
  payouts: ['finance.read','refunds.manage','exports.read'],
  operations: ['providers.read','providers.manage','drivers.read','drivers.manage','equipment.read','equipment.moderate','requests.read','requests.manage','exports.read'],
  support: ['users.read','users.manage','providers.read','complaints.read','complaints.manage','requests.read','exports.read'],
  verification: ['users.read','providers.read','verification.read','verification.manage','exports.read'],
  moderator: ['equipment.read','equipment.moderate','exports.read'],
  auditor: ['users.read','providers.read','drivers.read','equipment.read','requests.read','finance.read','fees.read','complaints.read','verification.read','exports.read', 'seo.read'],
  marketing: ['seo.read', 'seo.edit'],
};
export function hasPermission(role: StaffRole | undefined, permission: Permission) { return Boolean(role && ROLE_PERMISSIONS[role]?.includes(permission)); }
export function permissionsForRole(role: StaffRole | undefined) { return role ? [...(ROLE_PERMISSIONS[role] || [])] : []; }
export function canManageStaff(role: StaffRole | undefined) { return role === 'owner' || role === 'super_admin'; }