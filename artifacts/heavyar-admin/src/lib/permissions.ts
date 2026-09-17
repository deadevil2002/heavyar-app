export type StaffRole = 'owner' | 'super_admin' | 'admin' | 'finance' | 'payouts' | 'operations' | 'support' | 'verification' | 'marketing' | 'auditor' | 'moderator' | string;
export type Permission = 'users.read' | 'users.manage' | 'providers.read' | 'providers.manage' | 'drivers.read' | 'drivers.manage' | 'equipment.read' | 'equipment.moderate' | 'requests.read' | 'requests.manage' | 'finance.read' | 'refunds.manage' | 'complaints.read' | 'complaints.manage' | 'verification.read' | 'verification.manage' | 'exports.read' | 'staff.manage' | 'security.manage';
const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  owner: ['users.read','users.manage','providers.read','providers.manage','drivers.read','drivers.manage','equipment.read','equipment.moderate','requests.read','requests.manage','finance.read','refunds.manage','complaints.read','complaints.manage','verification.read','verification.manage','exports.read','staff.manage','security.manage'],
  super_admin: ['users.read','users.manage','providers.read','providers.manage','drivers.read','drivers.manage','equipment.read','equipment.moderate','requests.read','requests.manage','finance.read','refunds.manage','complaints.read','complaints.manage','verification.read','verification.manage','exports.read','staff.manage'],
  admin: ['users.read','users.manage','providers.read','providers.manage','drivers.read','drivers.manage','equipment.read','equipment.moderate','requests.read','requests.manage','complaints.read','complaints.manage','verification.read','exports.read'],
  finance: ['finance.read','refunds.manage','requests.read','exports.read'],
  payouts: ['finance.read','refunds.manage','exports.read'],
  operations: ['providers.read','providers.manage','drivers.read','drivers.manage','equipment.read','equipment.moderate','requests.read','requests.manage','exports.read'],
  support: ['users.read','users.manage','providers.read','complaints.read','complaints.manage','requests.read','exports.read'],
  verification: ['users.read','providers.read','verification.read','verification.manage','exports.read'],
  moderator: ['equipment.read','equipment.moderate','exports.read'],
  auditor: ['users.read','providers.read','drivers.read','equipment.read','requests.read','finance.read','complaints.read','verification.read','exports.read'],
  marketing: [],
};
export function hasPermission(role: StaffRole | undefined, permission: Permission) { return Boolean(role && ROLE_PERMISSIONS[role]?.includes(permission)); }
export function permissionsForRole(role: StaffRole | undefined) { return role ? [...(ROLE_PERMISSIONS[role] || [])] : []; }
export function canManageStaff(role: StaffRole | undefined) { return role === 'owner' || role === 'super_admin'; }