import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');
const source = (path: string) => readFileSync(resolve(root, path), 'utf8');

describe('provider business-document review boundary', () => {
  it('keeps email authentication and government identity paths independent', () => {
    const auth = source('contexts/AuthContext.tsx');
    const release = source('constants/releaseCapabilities.ts');
    const regulatory = source('worker/src/regulatory.ts');
    expect(auth).toContain('sendEmailVerification');
    expect(release).toContain("return platform !== 'ios'");
    expect(release).toContain('PROVIDER_DOCUMENT_REVIEW_UI_ENABLED');
    expect(regulatory).toContain('capabilities.CAN_RECEIVE_PAYOUT = false');
    expect(regulatory).toContain("PAYMENT_PROVIDER_KYC_REQUIRED");
  });

  it('binds upload state to UID, cancels stale work, and supports correction', () => {
    const component = source('components/ProviderDocumentVerification.tsx');
    expect(source('app/verification.tsx')).toContain('key={providerDocumentUid}');
    expect(component).toContain('generation.current += 1');
    expect(component).toContain('controller.current?.abort()');
    expect(component).toContain('resubmissionOf');
    expect(component).toContain('Correct and resubmit');
    expect(component).toContain('Reviewed by HEAVYAR');
    expect(component).toContain('تمت المراجعة بواسطة هيفيار');
  });

  it('keeps private media and storage keys server-authoritative', () => {
    const worker = source('worker/src/index.ts');
    const rules = source('firestore.rules');
    expect(worker).toContain("providerDocumentPublicId(env.CLOUDINARY_FOLDER || 'heavyar'");
    expect(worker).toContain("type: 'authenticated'");
    expect(worker).toContain("transformation: 'fl_force_strip'");
    expect(worker).not.toContain('secure_url: privateMedia');
    expect(rules).toMatch(/match \/regulatoryDocuments\/\{documentId\}[\s\S]*?allow read, write: if false;/);
  });

  it('limits the UI to providers/drivers and preserves Arabic/English disclosures', () => {
    const screen = source('app/verification.tsx');
    const component = source('components/ProviderDocumentVerification.tsx');
    expect(screen).toContain("['provider', 'driver'].includes(user.role)");
    expect(component).toContain('هذه مراجعة يدوية من هيفيار');
    expect(component).toContain('not government identity verification or payment KYC');
  });
});
