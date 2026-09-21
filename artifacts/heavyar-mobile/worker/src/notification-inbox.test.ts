import { expect, test } from 'bun:test';
import { notificationInboxItem, notificationInboxOrder, notificationUnreadOrder } from './notification-inbox';

test('count/list/read-all share createdAt existence, not a schema migration', () => {
  expect(notificationInboxOrder[0].field.fieldPath).toBe('createdAt');
  expect(notificationUnreadOrder[0].field.fieldPath).toBe('createdAt');
  const fixtures = [
    { id: 'valid', uid: 'A', read: false, createdAt: '2026-09-20T12:00:00Z', titleEn: 'New request' },
    { id: 'legacy', uid: 'A', read: false, createdAt: null, titleAr: 'إشعار', body: 'Legacy body' },
    { id: 'malformed', uid: 'A', read: false, createdAt: 42, titleEn: { unsafe: true } },
    { id: 'missing-date', uid: 'A', read: false, titleEn: 'Preserved, not counted' },
    { id: 'missing-read', uid: 'A', createdAt: '2026-09-19' },
    { id: 'read', uid: 'A', read: true, createdAt: '2026-09-18' },
    { id: 'other', uid: 'B', read: false, createdAt: '2026-09-20' },
  ];
  const eligible = fixtures.filter(row => row.uid === 'A' && Object.hasOwn(row, 'createdAt'));
  const aggregate = eligible.filter(row => row.read === false).length;
  const pages = [eligible.slice(0, 2), eligible.slice(2, 4), eligible.slice(4)];
  const inbox = pages.flatMap(page => page.map(row => notificationInboxItem(row, row.id, '2026-09-18T00:00:00Z')));
  expect(inbox.filter(item => !item.read)).toHaveLength(aggregate);
  expect(aggregate).toBe(3);
  for (const item of inbox) {
    expect(typeof item.titleAr).toBe('string');
    expect(item.titleAr.length).toBeGreaterThan(0);
    expect(typeof item.titleEn).toBe('string');
    expect(Number.isFinite(Date.parse(item.createdAt))).toBe(true);
  }
  fixtures[0].read = true;
  expect(fixtures.filter(row => row.uid === 'A' && Object.hasOwn(row, 'createdAt') && row.read === false)).toHaveLength(2);
});

test('legacy language/body/action remain representable; unknown content is explicit', () => {
  const legacy = notificationInboxItem({ titleAr: 'قديم', body: 'Saved message', action: 'request', subjectId: 'request_1', read: false }, 'legacy', '2026-09-20T00:00:00Z');
  expect(legacy.titleEn).toBe('قديم');
  expect(legacy.bodyEn).toBe('Saved message');
  expect(legacy.action).toEqual({ type: 'request', subjectId: 'request_1' });
  expect(legacy.read).toBe(false);
  const malformed = notificationInboxItem({ titleEn: {}, read: 'false', createdAt: 'not a date' }, 'malformed');
  expect(malformed.titleEn).toBe('Notification details unavailable');
  expect(malformed.createdAt).toBe('');
  expect(malformed.read).toBe(true);
});