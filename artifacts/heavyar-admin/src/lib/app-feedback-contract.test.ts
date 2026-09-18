import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('session verification errors offer the existing verification flow before the generic error screen', () => {
  const app = source('../App.tsx');
  assert.ok(app.includes('function AdminRouter()'));
  assert.ok(app.includes("'ADMIN_EMAIL_VERIFICATION_REQUIRED', 'EMAIL_VERIFICATION_REQUIRED'"));
  assert.ok(app.indexOf('if (verificationRequired)') < app.indexOf('if (error)'));
  assert.ok(app.includes('<VerifyAdminEmail />'));
  assert.ok(app.includes('userErrorMessage(error, language)'));
});

test('exports and render fallbacks never display raw error internals', () => {
  const exports = source('../components/export-controls.tsx');
  const boundary = source('../components/error-boundary.tsx');
  assert.ok(exports.includes('userErrorMessage(error, language)'));
  assert.ok(!exports.includes('error.message'));
  assert.ok(!boundary.includes('{error.message'));
  assert.ok(!boundary.includes('<pre'));
});