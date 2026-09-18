import type {
  SeoConfig,
  SeoIssue,
  SeoLocale,
  SeoPageKey,
  SeoRegistryEntry,
} from '../../../heavyar-mobile/worker/src/seo-types';

type AdminLanguage = 'ar' | 'en';

const pageLabels: Record<SeoPageKey, { ar: string; en: string }> = {
  home: { ar: 'الصفحة الرئيسية', en: 'Home page' },
  about: { ar: 'صفحة عن هيڤيار', en: 'About page' },
  equipment: { ar: 'صفحة المعدات', en: 'Equipment page' },
  drivers: { ar: 'صفحة السائقين', en: 'Drivers page' },
  help: { ar: 'صفحة المساعدة', en: 'Help page' },
  privacy: { ar: 'صفحة الخصوصية', en: 'Privacy page' },
  terms: { ar: 'صفحة الشروط', en: 'Terms page' },
  'account-deletion': { ar: 'صفحة حذف الحساب', en: 'Account deletion page' },
  'early-access': { ar: 'صفحة الوصول المبكر', en: 'Early access page' },
};

const scopeLabels: Record<string, { ar: string; en: string }> = {
  global: { ar: 'الإعدادات العامة', en: 'Global settings' },
  organization: { ar: 'بيانات المنظمة', en: 'Organization details' },
  mobileApplication: { ar: 'تطبيق الجوال', en: 'Mobile application' },
  crawlers: { ar: 'إعدادات برامج الزحف', en: 'Crawler settings' },
  pages: { ar: 'إعدادات الصفحات', en: 'Page settings' },
  faqs: { ar: 'الأسئلة الشائعة', en: 'Frequently asked questions' },
  editorialTopics: { ar: 'الموضوعات التحريرية', en: 'Editorial topics' },
};

const fieldLabels: Record<string, { ar: string; en: string }> = {
  title: { ar: 'عنوان الصفحة', en: 'Page title' },
  description: { ar: 'وصف الصفحة', en: 'Page description' },
  heading: { ar: 'العنوان الرئيسي', en: 'Main heading' },
  canonicalPaths: { ar: 'الرابط الأساسي', en: 'Canonical URL' },
  robots: { ar: 'إعدادات الفهرسة', en: 'Indexing settings' },
  sitemap: { ar: 'خريطة الموقع', en: 'Sitemap settings' },
  include: { ar: 'الإدراج في خريطة الموقع', en: 'Sitemap inclusion' },
  priority: { ar: 'أولوية خريطة الموقع', en: 'Sitemap priority' },
  changeFrequency: { ar: 'وتيرة التحديث', en: 'Update frequency' },
  ogTitle: { ar: 'عنوان المشاركة الاجتماعية', en: 'Social sharing title' },
  ogDescription: { ar: 'وصف المشاركة الاجتماعية', en: 'Social sharing description' },
  ogImage: { ar: 'صورة المشاركة الاجتماعية', en: 'Social sharing image' },
  xTitle: { ar: 'عنوان منصة X', en: 'X title' },
  xDescription: { ar: 'وصف منصة X', en: 'X description' },
  xImage: { ar: 'صورة منصة X', en: 'X image' },
  hreflang: { ar: 'روابط اللغات البديلة', en: 'Alternate-language links' },
  schemas: { ar: 'البيانات المنظمة', en: 'Structured data' },
  siteName: { ar: 'اسم الموقع', en: 'Site name' },
  siteNames: { ar: 'أسماء الموقع المترجمة', en: 'Localized site names' },
  socialTitle: { ar: 'العنوان الاجتماعي الافتراضي', en: 'Default social title' },
  socialDescription: { ar: 'الوصف الاجتماعي الافتراضي', en: 'Default social description' },
  canonicalOrigin: { ar: 'نطاق الموقع الأساسي', en: 'Canonical site origin' },
  defaultLanguage: { ar: 'اللغة الافتراضية', en: 'Default language' },
  supportedLanguages: { ar: 'اللغات المدعومة', en: 'Supported languages' },
  defaultLocale: { ar: 'الإعداد الإقليمي الافتراضي', en: 'Default locale' },
  assets: { ar: 'أصول العلامة التجارية', en: 'Brand assets' },
  socialShare: { ar: 'صورة المشاركة الافتراضية', en: 'Default sharing image' },
  faviconIco: { ar: 'أيقونة المتصفح', en: 'Browser icon' },
  faviconPng: { ar: 'أيقونة المتصفح PNG', en: 'PNG browser icon' },
  icon192: { ar: 'أيقونة 192 بكسل', en: '192 px icon' },
  icon512: { ar: 'أيقونة 512 بكسل', en: '512 px icon' },
  appleTouchIcon: { ar: 'أيقونة أجهزة Apple', en: 'Apple touch icon' },
  name: { ar: 'الاسم', en: 'Name' },
  alternateName: { ar: 'الاسم البديل', en: 'Alternate name' },
  logo: { ar: 'الشعار', en: 'Logo' },
  url: { ar: 'الرابط', en: 'URL' },
  publicEmail: { ar: 'البريد الإلكتروني العام', en: 'Public email' },
  businessRegistration: { ar: 'معرّف التسجيل التجاري', en: 'Business registration identifier' },
  sameAs: { ar: 'روابط الحسابات الرسمية', en: 'Official profile links' },
  enabled: { ar: 'حالة التفعيل', en: 'Enabled status' },
  androidStoreUrl: { ar: 'رابط Google Play', en: 'Google Play URL' },
  iosStoreUrl: { ar: 'رابط App Store', en: 'App Store URL' },
  applicationCategory: { ar: 'فئة التطبيق', en: 'Application category' },
  operatingSystems: { ar: 'أنظمة التشغيل', en: 'Operating systems' },
  pricingDescription: { ar: 'وصف التسعير', en: 'Pricing description' },
  mainstreamIndexing: { ar: 'فهرسة محركات البحث الرئيسية', en: 'Mainstream search indexing' },
  googlebot: { ar: 'برنامج Googlebot', en: 'Googlebot access' },
  bingbot: { ar: 'برنامج Bingbot', en: 'Bingbot access' },
  oaiSearchBot: { ar: 'برنامج OAI-SearchBot', en: 'OAI-SearchBot access' },
  question: { ar: 'السؤال', en: 'Question' },
  answer: { ar: 'الإجابة', en: 'Answer' },
  order: { ar: 'ترتيب العرض', en: 'Display order' },
  pageKey: { ar: 'الصفحة المرتبطة', en: 'Assigned page' },
  key: { ar: 'معرّف الصفحة', en: 'Page identifier' },
};

const localeLabels: Record<SeoLocale | 'default', { ar: string; en: string }> = {
  'ar-SA': { ar: 'العربية', en: 'Arabic' },
  en: { ar: 'الإنجليزية', en: 'English' },
  default: { ar: 'الافتراضية', en: 'Default' },
};

const issueMessages: Record<string, { ar: string; en: string }> = {
  title_missing: { ar: 'لم يتم إعداد عنوان؛ سيُستخدم عنوان التطبيق الاحتياطي الآمن.', en: 'A title has not been configured; the safe application fallback will be used.' },
  title_long: { ar: 'قد يكون العنوان أطول من الموصى به لنتائج البحث.', en: 'The title may be longer than recommended for search results.' },
  description_missing: { ar: 'لم يتم إعداد وصف؛ سيُستخدم الوصف المترجم الاحتياطي الآمن.', en: 'A description has not been configured; the safe translated fallback will be used.' },
  description_long: { ar: 'قد يكون الوصف أطول من الموصى به لنتائج البحث.', en: 'The description may be longer than recommended for search results.' },
  locale_title_override_missing: { ar: 'يُستخدم العنوان الاحتياطي لهذه اللغة.', en: 'The fallback title is being used for this language.' },
  social_image_missing: { ar: 'لم يتم إعداد صورة المشاركة.', en: 'Social sharing image has not been configured.' },
  important_page_noindex: { ar: 'هذه الصفحة العامة المهمة غير مهيأة للفهرسة.', en: 'This important public page is not configured for indexing.' },
  crawler_blocks_indexed_page: { ar: 'الصفحة مهيأة للفهرسة، لكن وصول محركات البحث الرئيسية معطّل.', en: 'The page is indexable, but mainstream search crawler access is disabled.' },
};

const validationMessages: Record<string, { ar: string; en: string }> = {
  'expected object': { ar: 'يجب إدخال مجموعة صحيحة من الإعدادات.', en: 'A valid settings group is required.' },
  'expected array': { ar: 'يجب إدخال قائمة صحيحة.', en: 'A valid list is required.' },
  'expected boolean': { ar: 'يجب اختيار حالة تفعيل صحيحة.', en: 'A valid enabled or disabled value is required.' },
  'expected string': { ar: 'يجب إدخال نص صحيح.', en: 'A valid text value is required.' },
  'unknown field': { ar: 'هذا الحقل غير مدعوم.', en: 'This field is not supported.' },
  'missing field': { ar: 'هذا الحقل مطلوب.', en: 'This field is required.' },
  'must not be empty': { ar: 'هذا الحقل مطلوب ولا يمكن تركه فارغًا.', en: 'This field is required and cannot be empty.' },
  'unsupported value': { ar: 'القيمة المحددة غير مدعومة.', en: 'The selected value is not supported.' },
  'malformed URL': { ar: 'أدخل رابطًا صحيحًا.', en: 'Enter a valid URL.' },
  'invalid email': { ar: 'أدخل عنوان بريد إلكتروني صحيحًا.', en: 'Enter a valid email address.' },
  'HTML is forbidden': { ar: 'لا يمكن أن يحتوي هذا الحقل على HTML.', en: 'HTML is not allowed in this field.' },
};

function segments(path: string): string[] {
  return path
    .replace(/^\$\.?/, '')
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter(Boolean);
}

function pageKeyForPath(pathParts: string[], config: SeoConfig): SeoPageKey | undefined {
  if (pathParts[0] !== 'pages' || !pathParts[1]) return undefined;
  if (/^\d+$/.test(pathParts[1])) return config.pages[Number(pathParts[1])]?.key;
  return config.pages.find((page) => page.key === pathParts[1])?.key;
}

function localized(value: { ar: string; en: string }, language: AdminLanguage): string {
  return value[language];
}

function extractValidation(message: string): { path?: string; reason?: string } {
  const match = message.match(/Invalid SEO configuration at (\$[^:]*):\s*(.+)$/);
  return match ? { path: match[1], reason: match[2] } : {};
}

export interface LocalizedSeoIssue {
  context: string;
  field: string | null;
  message: string;
  technicalPath: string;
  code: string;
}

export function localizeSeoIssue(
  issue: SeoIssue,
  config: SeoConfig,
  registry: SeoRegistryEntry[],
  language: AdminLanguage,
): LocalizedSeoIssue {
  const validation = issue.code === 'invalid_config' ? extractValidation(issue.messageEn) : {};
  const technicalPath = validation.path || issue.path;
  const pathParts = segments(technicalPath);
  const pageKey = pageKeyForPath(pathParts, config);

  let context: string;
  if (pageKey) {
    const fallback = registry.find((entry) => entry.key === pageKey);
    context = pageLabels[pageKey]
      ? localized(pageLabels[pageKey], language)
      : language === 'ar' ? `صفحة ${fallback?.nameAr || pageKey}` : `${fallback?.nameEn || pageKey} page`;
  } else {
    const scope = scopeLabels[pathParts[0]];
    context = scope ? localized(scope, language) : language === 'ar' ? 'إعدادات تحسين الظهور' : 'SEO settings';
  }

  const fieldPart = [...pathParts].reverse().find((part) => fieldLabels[part]);
  let field = fieldPart ? localized(fieldLabels[fieldPart], language) : null;
  const localePart = pathParts.find((part) => part in localeLabels) as SeoLocale | 'default' | undefined;
  if (field && localePart) {
    const locale = localized(localeLabels[localePart], language);
    field = language === 'ar' ? `${field} — ${locale}` : `${locale} ${field.toLocaleLowerCase()}`;
  }

  let message = issueMessages[issue.code]?.[language]
    || (language === 'ar' ? issue.messageAr : issue.messageEn);
  if (issue.code === 'invalid_config') {
    const exact = validation.reason ? validationMessages[validation.reason] : undefined;
    const maximum = validation.reason?.match(/^maximum length is (\d+)$/);
    message = exact?.[language]
      || (maximum
        ? language === 'ar'
          ? `يجب ألا يتجاوز النص ${maximum[1]} حرفًا.`
          : `Text must not exceed ${maximum[1]} characters.`
        : language === 'ar' ? 'تحقق من القيمة المدخلة في هذا الحقل.' : 'Review the value entered in this field.');
  }

  return { context, field, message, technicalPath, code: issue.code };
}