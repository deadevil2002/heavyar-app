import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { describe, it } from 'node:test';
import { QueryClient } from '@tanstack/react-query';
import { SafeApiError, safeErrorCode, userErrorMessage } from './error-messages';
import { invitationId, cancellationPayload } from './invitation-contract';
import { accountRefreshKeys, invitationRefreshKeys, refreshQueries, adminActionPolicy, actionSuccessMessage } from './admin-feedback';

const source = (path: string) => readFileSync(`artifacts/heavyar-admin/src/${path}`, 'utf8');

describe('canonical bilingual Admin errors', () => {
  for (const code of [
    'EMAIL_VERIFICATION_REQUIRED', 'INVITATION_INVALID', 'INVITATION_REASON_REQUIRED',
    'INVITATION_ALREADY_CANCELLED', 'INVITATION_ALREADY_ACCEPTED', 'INVITATION_EXPIRED',
    'INVITATION_CONFLICT', 'INVITATION_DELIVERY_UNAVAILABLE', 'INVITATION_RESEND_COOLDOWN',
    'PERMISSION_DENIED', 'INVALID_CREDENTIALS', 'UNAUTHENTICATED',
  ]) {
    it(`localizes ${code} without leaking backend diagnostics`, () => {
      const error = new SafeApiError({ errorCode: code, error: 'Internal secret traceback Firebase 403' }, 400);
      for (const language of ['ar', 'en']) {
        const text = userErrorMessage(error, language);
        assert.ok(text.length > 10);
        assert.doesNotMatch(text, /Firebase|traceback|403|Internal|INVITATION_|VERIFICATION_|PERMISSION_/);
        assert.notEqual(text, userErrorMessage('UNKNOWN', language));
      }
      assert.notEqual(userErrorMessage(error, 'ar'), userErrorMessage(error, 'en'));
    });
  }
  it('distinguishes the administrative actor from marketplace email policy', () => {
    const error = new SafeApiError({ errorCode: 'EMAIL_VERIFICATION_REQUIRED', verificationSubject: 'actor' }, 403);
    assert.equal(error.code, 'ADMIN_EMAIL_VERIFICATION_REQUIRED');
    assert.match(userErrorMessage(error, 'en'), /admin account/);
    assert.equal(userErrorMessage(error, 'ar'), 'يجب توثيق بريد حسابك الإداري قبل تنفيذ هذا الإجراء.');
  });
  it('maps Firebase credentials, permissions, session and rate-limit errors', () => {
    for (const code of ['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found']) {
      assert.equal(safeErrorCode({ code }), 'INVALID_CREDENTIALS');
    }
    assert.equal(safeErrorCode({ code: 'permission-denied' }), 'PERMISSION_DENIED');
    assert.equal(safeErrorCode({ code: 'auth/user-token-expired' }), 'UNAUTHENTICATED');
    assert.equal(safeErrorCode({ code: 'auth/too-many-requests' }), 'RATE_LIMITED');
  });
  it('never exposes unknown strings, objects, stacks, or malicious property names', () => {
    for (const value of ['FirebaseError: auth/custom Stack at secret.ts:1', 'toString', '__proto__', '<script>private</script>', { error: { code: 'private' } }, new Error('worker internals'), null]) {
      assert.equal(userErrorMessage(value, 'en'), userErrorMessage('UNKNOWN', 'en'));
      assert.equal(userErrorMessage(value, 'ar'), userErrorMessage('UNKNOWN', 'ar'));
    }
  });
  it('supports exact legacy aliases but never fuzzy message classification', () => {
    assert.equal(safeErrorCode(new Error('Forbidden: EMAIL_VERIFICATION_REQUIRED')), 'EMAIL_VERIFICATION_REQUIRED');
    assert.equal(safeErrorCode(new Error('Invalid invitation cancellation')), 'INVITATION_INVALID');
    assert.equal(safeErrorCode(new Error('secret email already expired stack trace')), 'UNKNOWN');
  });
  it('stores only safe UX in transport Error.message while retaining canonical code and status', () => {
    const error = new SafeApiError({ errorCode: 'INVITATION_EXPIRED', message: 'unsafe stack' }, 409);
    assert.equal(error.status, 409);
    assert.equal(error.code, 'INVITATION_EXPIRED');
    assert.equal(error.message, userErrorMessage(error, 'en'));
    assert.doesNotMatch(error.message, /unsafe|409/);
  });
});

describe('staff cancellation frontend/Worker contract', () => {
  const hash = 'A'.repeat(43);
  it('preserves canonical, encoded and UUID-style legacy Firestore IDs without decoding identity', () => {
    for (const id of [`invite:${hash}`, `invite%3A${hash}`, `invite%253A${hash}`, 'legacy-record', 'heavyar-super-admin-00000000-0000-4000-8000-000000000001']) {
      assert.equal(invitationId(id), id);
      assert.deepEqual(cancellationPayload({ id, reason: '  Access no longer needed  ' }), { id, reason: 'Access no longer needed' });
    }
  });
  it('rejects wrong IDs and empty/oversized reasons before making a request', () => {
    for (const id of ['', '  ', '.', '..', '__reserved__', `invite:${hash}/child`, 'bad\\path', 'bad\u0000id', 'a'.repeat(1501), 'ع'.repeat(751)]) {
      assert.throws(() => cancellationPayload({ id, reason: 'Valid reason' }), { code: 'INVITATION_INVALID' });
    }
    for (const reason of ['', '  ', 'ab', 'a'.repeat(1001)]) {
      assert.throws(() => cancellationPayload({ id: `invite:${hash}`, reason }), { code: 'INVITATION_REASON_REQUIRED' });
    }
  });
  it('does not send email delivery status, resend identifiers, or actor spoofing fields', () => {
    assert.deepEqual(Object.keys(cancellationPayload({ id: `invite%3A${hash}`, reason: 'سبب الإلغاء' })), ['id', 'reason']);
  });
  it('keeps stable cancellation input, pending guard, idempotent feedback and state checks', () => {
    const staff = source('pages/staff.tsx');
    assert.match(staff, /<Textarea autoFocus value=\{reason\}/);
    assert.match(staff, /result\?\.idempotent/);
    assert.match(staff, /!cancelInvite\.isPending && !revokeStaff\.isPending/);
    assert.match(source('pages/accept-invite.tsx'), /invitation\.status !== 'pending'/);
    const operations = source('lib/operations.ts');
    assert.match(operations, /JSON\.stringify\(cancellationPayload\(data\)\)/);
    assert.match(operations, /fetchAuthenticatedPublic\('\/api\/staff\/invitations\/accept'/);
  });
});

describe('live sync and reason policy regressions', () => {
  for (const [name, keys] of [['invitation', invitationRefreshKeys], ['account', accountRefreshKeys]] as const) {
    it(`invalidates every ${name} list, detail and audit query`, async () => {
      const client = new QueryClient();
      for (const key of keys) client.setQueryData([key, 'test-id'], { value: 'before' });
      client.setQueryData(['unrelated'], { value: 'keep' });
      await refreshQueries(client, keys);
      for (const key of keys) assert.equal(client.getQueryState([key, 'test-id'])?.isInvalidated, true, key);
      assert.equal(client.getQueryState(['unrelated'])?.isInvalidated, false);
      assert.ok(keys.includes('audit'));
      assert.ok(keys.includes('detail'));
      client.clear();
    });
  }
  it('wires cancel/resend/accept refresh even after stale state errors', () => {
    const operations = source('lib/operations.ts');
    for (const name of ['useCancelStaffInvitation', 'useResendStaffInvitation', 'useAcceptStaffInvitation']) {
      const body = operations.split(`export function ${name}()`)[1].split('\nexport function ')[0];
      assert.match(body, /onSettled: \(\) => refreshQueries\(queryClient, invitationRefreshKeys\)/);
    }
  });
  it('refreshes verification and terminal deletion results, not just the queued request', () => {
    assert.match(source('lib/auth.tsx'), /getIdToken\(true\)/);
    assert.match(source('lib/auth.tsx'), /await queryClient\.invalidateQueries\(\{ queryKey: \['adminSession'\] \}\)/);
    const api = source('lib/api.ts');
    assert.match(api, /onSettled: \(\) => refreshQueries\(queryClient, accountRefreshKeys\)/);
    assert.match(api, /\[id, status\]/);
    assert.match(api, /'completed', 'partially_completed', 'failed'/);
  });
  it('preserves confirmation-only approval/show, optional hide, required rejection/suspension', () => {
    for (const action of ['approve_listing', 'unhide_equipment', 'show_equipment', 'rereview_listing']) assert.equal(adminActionPolicy(action), 'confirmation');
    assert.equal(adminActionPolicy('hide_equipment'), 'optional');
    for (const action of ['reject_listing', 'suspend_listing', 'cancel_invitation']) assert.equal(adminActionPolicy(action), 'required');
    assert.equal(actionSuccessMessage('approve_listing', 'ar'), 'تم اعتماد المعدة.');
    assert.equal(actionSuccessMessage('hide_equipment', 'en'), 'Equipment hidden.');
  });
  it('keeps dialog component identity stable while typing and guards endpoint requests too', () => {
    const hook = source('hooks/use-admin-action.tsx');
    assert.ok(hook.indexOf('function AdminActionDialog') < hook.indexOf('export function useAdminAction'));
    assert.match(hook, /pending=\{pending\}/);
    assert.match(hook, /setPending\(true\)/);
    assert.match(hook, /description: userErrorMessage\(err, language\)/);
  });
  it('uses Firebase verification and forced token refresh without inventing authority', () => {
    const panel = source('pages/verify-email.tsx');
    assert.match(panel, /await sendEmailVerification\(current\)/);
    assert.match(panel, /await reload\(current\)/);
    assert.match(panel, /await refreshClaims\(\)/);
    assert.doesNotMatch(panel, /setRole|customToken|adminRole\s*=/);
  });
  it('does not interpolate raw server or Firebase errors in pages or hooks', () => {
    for (const folder of ['pages', 'pages/users-components', 'hooks']) {
      for (const file of readdirSync(`artifacts/heavyar-admin/src/${folder}`).filter(file => /\.tsx?$/.test(file) && !file.endsWith('.test.ts'))) {
        assert.doesNotMatch(source(`${folder}/${file}`), /description:\s*(?:err|error)\.message|\{(?:err|error|action\.error|authError|countriesError)\.message\}/, file);
      }
    }
  });
});