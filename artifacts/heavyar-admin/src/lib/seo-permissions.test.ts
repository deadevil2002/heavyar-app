import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { hasPermission, permissionsForRole } from './permissions';
import { hasPermission as workerPermission, STAFF_ROLES } from '../../../heavyar-mobile/worker/src/completion';

describe('SEO permission boundaries', () => {
  it('keeps all existing staff SEO permissions exactly aligned with the authoritative Worker', () => {
    for (const role of STAFF_ROLES) for (const permission of ['seo.read', 'seo.edit', 'seo.publish'] as const) {
      assert.equal(hasPermission(role, permission), workerPermission(role, permission), `${role}: ${permission}`);
    }
  });
  it('allows only owner and super-admin to publish', () => {
    assert.deepEqual(STAFF_ROLES.filter(role => hasPermission(role, 'seo.publish')), ['owner', 'super_admin']);
  });
  it('allows marketing drafts but not publication', () => {
    assert.equal(hasPermission('marketing', 'seo.read'), true);
    assert.equal(hasPermission('marketing', 'seo.edit'), true);
    assert.equal(hasPermission('marketing', 'seo.publish'), false);
  });
  it('keeps admin and auditor read-only', () => {
    for (const role of ['admin', 'auditor']) {
      assert.equal(hasPermission(role, 'seo.read'), true);
      assert.equal(hasPermission(role, 'seo.edit'), false);
      assert.equal(hasPermission(role, 'seo.publish'), false);
    }
  });
  it('denies non-SEO staff and unknown roles', () => {
    for (const role of ['support', 'moderator', 'verification', 'payouts', 'finance', 'operations', 'customer', undefined]) {
      for (const permission of ['seo.read', 'seo.edit', 'seo.publish'] as const) assert.equal(hasPermission(role, permission), false);
    }
  });
  it('does not give marketing financial privileges or leak mutable role arrays', () => {
    assert.equal(hasPermission('marketing', 'fees.manage'), false);
    const permissions = permissionsForRole('marketing');
    permissions.push('seo.publish');
    assert.equal(hasPermission('marketing', 'seo.publish'), false);
  });
});