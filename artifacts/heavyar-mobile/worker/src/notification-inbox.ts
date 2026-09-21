// The badge and ordered inbox must use the same field-existence boundary.
// Firestore orderBy excludes missing fields even for count aggregations.
// No history is rewritten/deleted and count still downloads zero documents.
export const notificationInboxOrder = [
  { field: { fieldPath: 'createdAt' }, direction: 'DESCENDING' },
  { field: { fieldPath: '__name__' }, direction: 'DESCENDING' },
];
// Match the already-provisioned uid/read/createdAt ascending index. Direction
// changes no membership and the aggregate does not need document-ID ordering.
export const notificationUnreadOrder = [{ field: { fieldPath: 'createdAt' }, direction: 'ASCENDING' }];

const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const date = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : '';

/** Read-only compatibility projection: retain legitimate old copy, never invent
 * business details, and make malformed content explicitly visible as unavailable.
 * Missing dates use actual Firestore creation metadata, not the current clock.
 */
export function notificationInboxItem(data: Record<string, any>, id: string, documentCreatedAt?: string) {
  const titleAr = text(data.titleAr) || text(data.titleEn) || 'تفاصيل الإشعار غير متاحة';
  const titleEn = text(data.titleEn) || text(data.titleAr) || 'Notification details unavailable';
  const action = typeof data.action === 'string' ? { type: data.action, subjectId: data.subjectId } : data.action;
  return {
    id, event: text(data.event), category: text(data.category),
    titleAr, titleEn,
    bodyAr: text(data.bodyAr) || text(data.body) || titleAr,
    bodyEn: text(data.bodyEn) || text(data.body) || titleEn,
    // Only explicit false is unread, exactly as in the aggregate.
    read: data.read !== false, critical: data.critical === true,
    createdAt: date(data.createdAt) || date(documentCreatedAt),
    action, subjectId: text(data.subjectId) || null,
  };
}