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