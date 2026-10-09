import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('Early Access selection state is declared before loading/error render branches', () => {
  const source = readFileSync('artifacts/heavyar-admin/src/pages/early-access/index.tsx', 'utf8');
  const selection = source.indexOf('const [selectedIds, setSelectedIds] = useState');
  assert.ok(selection > -1);
  assert.ok(selection < source.indexOf('if (isLoading)'));
  assert.ok(selection < source.indexOf('if (error || !configData)'));
});

test('subscriber actions expose Delete, preserve Unsubscribe, and hide anonymization terminology', () => {
  const source = readFileSync('artifacts/heavyar-admin/src/pages/early-access/subscribers-tab.tsx', 'utf8');
  assert.match(source, /t\('حذف', 'Delete'\)/);
  assert.match(source, /t\('إلغاء الاشتراك', 'Unsubscribe'\)/);
  assert.match(source, /t\('حذف المشترك\؟', 'Delete subscriber\?'\)/);
  assert.match(source, /سيتم إزالة بيانات هذا المشترك من قائمة الوصول المبكر/);
  assert.match(source, /تم حذف المشترك/);
  assert.match(source, /Subscriber deleted/);
  assert.match(source, /Trash2/);
  assert.doesNotMatch(source, /مجهول/);
  assert.doesNotMatch(source, /Anonymize/);
  assert.doesNotMatch(source, /value="anonymized"/);
});

test('subscriber delete uses the canonical action and clears selection only after success', () => {
  const page = readFileSync('artifacts/heavyar-admin/src/pages/early-access/subscribers-tab.tsx', 'utf8');
  const api = readFileSync('artifacts/heavyar-admin/src/lib/early-access.ts', 'utf8');
  assert.match(page, /action: 'delete'/);
  assert.match(page, /useSubscriberAction\([\s\S]*removeSelectedSubscriber/);
  assert.match(page, /onError:[\s\S]*userErrorMessage/);
  assert.match(api, /action: 'unsubscribe' \| 'delete'/);
  assert.match(api, /setQueriesData<PaginatedResponse<Subscriber>>/);
  assert.match(api, /invalidateQueries\(\{ queryKey: \['early-access', 'subscribers'\], refetchType: 'none' \}\)/);
  assert.match(api, /refetchQueries\([\s\S]*throwOnError: true/);
});
