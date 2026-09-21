import { describe, expect, it } from 'vitest';
import { safePublishErrorMessage } from '../services/errorMessages';
import { MutationError, publishFailureStage, supportCodeFromError } from '../services/mutationError';

describe('publish stage error UX', () => {
  it.each([
    ['upload', 'Image upload failed.', 'فشل رفع الصور.'],
    ['listing', 'Listing could not be published.', 'تعذر نشر الإعلان.'],
    [
      'confirmation',
      'Publishing result could not be confirmed. Check My Equipment before retrying. Retrying may create a duplicate listing, and a delayed listing may still appear later.',
      'تعذر تأكيد نتيجة النشر. تحقق من «معداتي» قبل إعادة المحاولة. قد تؤدي إعادة المحاولة إلى إنشاء إعلان مكرر، وقد يظهر الإعلان المتأخر لاحقًا.',
    ],
  ] as const)('uses safe bilingual %s copy and keeps the request ID', (stage, en, ar) => {
    const privateError = {
      message: 'private upstream URL and token',
      cause: new MutationError('PRIVATE_INTERNAL_CODE', 502, 'A3CBCDCE46'),
    };
    expect(safePublishErrorMessage(privateError, 'en', stage)).toBe(`${en}\nSupport code: A3CBCDCE46`);
    expect(safePublishErrorMessage(privateError, 'ar', stage)).toBe(`${ar}\nرمز الدعم: A3CBCDCE46`);
    expect(safePublishErrorMessage(privateError, 'en', stage)).not.toContain('private');
    expect(supportCodeFromError(privateError)).toBe('A3CBCDCE46');
  });

  it('rejects unsafe nested support values', () => {
    expect(safePublishErrorMessage({ cause: { supportCode: 'https://private.example/token' } }, 'en', 'upload'))
      .toBe('Image upload failed.');
  });

  it('warns that a manual retry can duplicate an unconfirmed create', () => {
    const en = safePublishErrorMessage({ supportCode: 'A3CBCDCE46' }, 'en', 'confirmation');
    const ar = safePublishErrorMessage({ supportCode: 'A3CBCDCE46' }, 'ar', 'confirmation');
    expect(en).toContain('Retrying may create a duplicate listing');
    expect(en).toContain('a delayed listing may still appear later');
    expect(ar).toContain('إعلان مكرر');
    expect(ar).toContain('يظهر الإعلان المتأخر لاحقًا');
    expect(en).toContain('Support code: A3CBCDCE46');
    expect(ar).toContain('رمز الدعم: A3CBCDCE46');
  });

  it('keeps a nested Worker request ID authoritative over a client wrapper', () => {
    const wrapped = {
      supportCode: 'CLIENT-UPLOAD-FAILED',
      cause: { supportCode: 'A3CBCDCE46', message: 'private upstream detail' },
    };
    expect(supportCodeFromError(wrapped)).toBe('A3CBCDCE46');
    expect(safePublishErrorMessage(wrapped, 'en', 'upload'))
      .toBe('Image upload failed.\nSupport code: A3CBCDCE46');
  });

  it.each([
    [{ code: 'UPLOAD_FAILED', status: 502 }, false, false, 'upload'],
    [{ code: 'INVALID_LISTING', status: 400 }, true, false, 'listing'],
    [{ code: 'NETWORK_TIMEOUT', status: 0 }, true, false, 'confirmation'],
    [{ code: 'NETWORK_UNAVAILABLE', status: 0 }, true, false, 'confirmation'],
    [{ code: 'AUTH_SESSION_CHANGED', status: 401 }, true, false, 'confirmation'],
    [{ code: 'INTERNAL_ERROR', status: 500 }, true, false, 'confirmation'],
    [{ code: 'REQUEST_TIMEOUT', status: 408 }, true, false, 'confirmation'],
  ] as const)('classifies a publish failure without inventing success', (error, submitted, committed, stage) => {
    expect(publishFailureStage(error, submitted, committed)).toBe(stage);
  });
});