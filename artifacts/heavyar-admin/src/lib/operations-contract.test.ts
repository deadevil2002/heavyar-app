import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { adminActionPayload, adminDetailEndpoint, adminExportEndpoint, adminListParams, normalizeGatewayRows, roleCanRenderAction } from './operations-contract';

describe('admin operations table contract', () => {
  it('maps UI search to the backend q filter and drops empty filters', () => {
    assert.deepEqual(adminListParams({ search: 'person@example.com', status: '', cursor: undefined }), { q: 'person@example.com' });
  });
  it('keeps export scope and active filters on the server endpoint', () => {
    assert.equal(adminExportEndpoint('requests', 'current_page', { search: 'HV-REQ-1', status: 'pending' }), '/exports/requests.xlsx?scope=current_page&q=HV-REQ-1&status=pending');
  });
  it('does not expose staff actions through a normal user role', () => {
    assert.equal(roleCanRenderAction('support', 'staff.manage'), false);
    assert.equal(roleCanRenderAction('owner', 'staff.manage'), true);
    assert.equal(roleCanRenderAction('owner', 'verification.manage'), true);
    assert.equal(roleCanRenderAction('owner', 'exports.read'), true);
  });
  it('uses the worker detail and action contracts for business configuration', () => {
    assert.equal(adminDetailEndpoint('heavyarConfig', 'business'), '/detail/heavyarConfig/business');
    assert.deepEqual(adminActionPayload('update_config', 'config', 'business', 'Update business settings', { supportEmail: 'ops@example.com' }), {
      action: 'update_config',
      targetType: 'config',
      targetId: 'business',
      reason: 'Update business settings',
      payload: { supportEmail: 'ops@example.com' },
    });
  });
  it('keeps manual security labels outside the react-hook-form label context', () => {
    const source = readFileSync('artifacts/heavyar-admin/src/pages/security.tsx', 'utf8');
    assert.equal(source.includes("<Label>{t('البريد الإلكتروني للمالك الجديد'"), true);
    assert.equal(source.includes("<FormLabel>{t('البريد الإلكتروني للمالك الجديد'"), false);
  });
  it('normalizes the live payment gateway response into renderable cards', () => {
    const gateways = [
      { provider: 'moyasar', configured: true, enabled: false, environment: 'test', methods: ['card'] },
      { provider: 'tap', configured: false, enabled: false, environment: 'test', methods: ['card'] },
      { provider: 'hyperpay', configured: false, enabled: false, environment: 'test', methods: ['card'] },
    ];
    assert.deepEqual(normalizeGatewayRows({ gateways, items: gateways }).map(row => ({
      id: row.id,
      provider: row.provider,
      supportedMethods: row.supportedMethods,
    })), [
      { id: 'moyasar', provider: 'moyasar', supportedMethods: ['card'] },
      { id: 'tap', provider: 'tap', supportedMethods: ['card'] },
      { id: 'hyperpay', provider: 'hyperpay', supportedMethods: ['card'] },
    ]);
  });
  it('keeps provider and driver account bulk deletion controls wired to canonical dialogs', () => {
    for (const page of ['providers.tsx', 'drivers.tsx']) {
      const source = readFileSync(`artifacts/heavyar-admin/src/pages/${page}`, 'utf8');
      assert.equal(source.includes('DeletionDialog'), true);
      assert.equal(source.includes('DeletionJobProgress'), true);
      assert.equal(source.includes('selectAllMatching'), true);
      assert.equal(source.includes('onSelectPage'), true);
      assert.equal(source.includes('Delete account'), true);
      assert.equal(source.includes('setDeletionOpen(true)'), true);
      assert.equal(source.includes('setSelectedIds(new Set(['), true);
    }
    const providers = readFileSync('artifacts/heavyar-admin/src/pages/providers.tsx', 'utf8');
    assert.equal(providers.includes('setSelectAllMatching(true)'), true);
    assert.equal(providers.includes('data.total > selectedIds.size'), true);
  });
  it('keeps invitation acceptance authenticated but outside the admin namespace', () => {
    const operations = readFileSync('artifacts/heavyar-admin/src/lib/operations.ts', 'utf8');
    const api = readFileSync('artifacts/heavyar-admin/src/lib/api.ts', 'utf8');
    assert.equal(operations.includes("fetchAuthenticatedPublic('/api/staff/invitations/accept'"), true);
    assert.equal(api.includes('Authorization'), true);
    assert.equal(operations.includes('/api/admin/staff/invitations/accept'), false);
  });
  it('covers reliability audit codes and canonical targets', () => {
    const source = readFileSync('artifacts/heavyar-admin/src/pages/audit.tsx', 'utf8');
    for (const code of ['campaign_create', 'countries_updated', 'email_verification_policy_updated', 'fx_provider_updated', 'ownership_transfer_cancelled', 'notification_retry', 'retention_cleanup', 'notificationDelivery', 'verificationAttempt']) {
      assert.equal(source.includes(code), true);
    }
  });
});