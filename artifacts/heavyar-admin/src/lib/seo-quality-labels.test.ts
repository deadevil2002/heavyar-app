import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { SeoIssue } from '../../../heavyar-mobile/worker/src/seo-types';
import { defaultSeoConfig, SEO_REGISTRY } from '../../../heavyar-mobile/worker/src/seo';
import { localizeSeoIssue } from './seo-quality-labels';

describe('SEO quality-check localization', () => {
  const config = defaultSeoConfig();

  it('turns indexed page paths into a professional English page and field label', () => {
    const issue: SeoIssue = {
      severity: 'info',
      code: 'social_image_missing',
      path: '$.pages[0].ogImage',
      messageEn: 'No social sharing image is configured',
      messageAr: 'لم يتم إعداد صورة للمشاركة',
    };

    assert.deepEqual(localizeSeoIssue(issue, config, SEO_REGISTRY, 'en'), {
      context: 'Home page',
      field: 'Social sharing image',
      message: 'Social sharing image has not been configured.',
      technicalPath: '$.pages[0].ogImage',
      code: 'social_image_missing',
    });
  });

  it('turns keyed page paths and locale fields into professional Arabic labels', () => {
    const issue: SeoIssue = {
      severity: 'warning',
      code: 'title_long',
      path: '$.pages.equipment.title.ar-SA',
      messageEn: 'Page title may be too long',
      messageAr: 'قد يكون عنوان الصفحة طويلاً',
    };
    const result = localizeSeoIssue(issue, config, SEO_REGISTRY, 'ar');

    assert.equal(result.context, 'صفحة المعدات');
    assert.equal(result.field, 'عنوان الصفحة — العربية');
    assert.equal(result.message, 'قد يكون العنوان أطول من الموصى به لنتائج البحث.');
  });

  it('hides validation paths from the primary message while retaining technical details', () => {
    const issue: SeoIssue = {
      severity: 'error',
      code: 'invalid_config',
      path: '$',
      messageEn: 'Invalid SEO configuration at $.organization.publicEmail: invalid email',
      messageAr: 'إعدادات تحسين البحث غير صالحة',
    };
    const result = localizeSeoIssue(issue, config, SEO_REGISTRY, 'ar');

    assert.equal(result.context, 'بيانات المنظمة');
    assert.equal(result.field, 'البريد الإلكتروني العام');
    assert.equal(result.message, 'أدخل عنوان بريد إلكتروني صحيحًا.');
    assert.equal(result.technicalPath, '$.organization.publicEmail');
    assert.equal(result.message.includes('$.'), false);
  });

  it('maps non-page validation scopes and dynamic length limits', () => {
    const issue: SeoIssue = {
      severity: 'error',
      code: 'invalid_config',
      path: '$',
      messageEn: 'Invalid SEO configuration at $.global.siteName: maximum length is 100',
      messageAr: 'إعدادات تحسين البحث غير صالحة',
    };
    const result = localizeSeoIssue(issue, config, SEO_REGISTRY, 'en');

    assert.equal(result.context, 'Global settings');
    assert.equal(result.field, 'Site name');
    assert.equal(result.message, 'Text must not exceed 100 characters.');
  });
});