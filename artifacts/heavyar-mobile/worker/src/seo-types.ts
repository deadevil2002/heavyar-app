/** Shared SEO CMS contract. No scripts, arbitrary schema objects or private routes. */
export type SeoLocale = 'ar-SA' | 'en';
export type SeoText = { 'ar-SA': string; en: string; default: string };
export type SeoPageKey = 'home' | 'about' | 'equipment' | 'drivers' | 'help' | 'privacy' | 'terms' | 'account-deletion' | 'early-access';
export type SeoRobots = 'index,follow' | 'noindex,follow' | 'noindex,nofollow';
export type SeoSchema = 'Organization' | 'WebSite' | 'MobileApplication' | 'FAQPage' | 'BreadcrumbList';
export interface SeoPage {
  key: SeoPageKey;
  title: SeoText;
  description: SeoText;
  heading: SeoText;
  canonicalPaths: Record<SeoLocale, string>;
  robots: SeoRobots;
  sitemap: { include: boolean; priority: number | null; changeFrequency: '' | 'daily' | 'weekly' | 'monthly' | 'yearly' };
  ogTitle: SeoText;
  ogDescription: SeoText;
  ogImage: string | null;
  xTitle: SeoText;
  xDescription: SeoText;
  xImage: string | null;
  hreflang: boolean;
  schemas: SeoSchema[];
}
export interface SeoConfig {
  global: {
    siteName: string; siteNames: SeoText;
    title: SeoText; description: SeoText; socialTitle: SeoText; socialDescription: SeoText;
    ogImage: string | null; xImage: string | null; canonicalOrigin: string;
    defaultLanguage: SeoLocale; supportedLanguages: SeoLocale[]; defaultLocale: SeoLocale;
    assets: { faviconIco: string | null; faviconPng: string | null; icon192: string | null; icon512: string | null; appleTouchIcon: string | null; socialShare: string | null };
  };
  organization: { name: string; alternateName: string; logo: string | null; url: string; publicEmail: string; businessRegistration: string; sameAs: string[] };
  mobileApplication: {
    enabled: boolean; androidStoreUrl: string | null; iosStoreUrl: string | null;
    applicationCategory: 'BusinessApplication' | 'UtilitiesApplication' | 'TravelApplication';
    operatingSystems: ('Android' | 'iOS')[]; pricingDescription: SeoText;
  };
  crawlers: { mainstreamIndexing: boolean; googlebot: boolean; bingbot: boolean; oaiSearchBot: boolean };
  pages: SeoPage[];
  faqs: { id: string; question: SeoText; answer: SeoText; enabled: boolean; order: number; pageKey: SeoPageKey }[];
  editorialTopics: string[];
}
export interface SeoVersionSummary {
  id: string; version: number; status: 'draft' | 'published' | 'archived';
  createdAt: string; createdBy: string; updatedAt: string; updatedBy: string;
  publishedAt: string | null; publishedBy: string | null; reason: string; sourceVersionId: string | null;
}
export interface SeoVersion extends SeoVersionSummary { config: SeoConfig }
export interface SeoState {
  revision: number; currentPublishedId: string | null; draftId: string | null;
  versions: SeoVersionSummary[];
}
export interface SeoPermissions { canRead: boolean; canEdit: boolean; canPublish: boolean }
export interface SeoRegistryEntry { key: SeoPageKey; nameAr: string; nameEn: string; paths: Record<SeoLocale, string> }
export interface SeoAdminView {
  success: true; state: SeoState; draft: SeoVersion | null; published: SeoVersion | null;
  defaults: SeoConfig; registry: SeoRegistryEntry[]; permissions: SeoPermissions;
}
export interface SeoIssue {
  severity: 'error' | 'warning' | 'info'; code: string; path: string; messageEn: string; messageAr: string;
}
export interface SeoResolvedPage {
  key: SeoPageKey; locale: SeoLocale; title: string; description: string; heading: string;
  canonical: string; robots: SeoRobots;
  openGraph: { title: string; description: string; image: string | null; locale: string; siteName: string };
  twitter: { title: string; description: string; image: string | null; card: 'summary' | 'summary_large_image' };
  sitemap: { include: boolean; priority: number | null; changeFrequency: string; lastmod: string | null };
  alternates: { locale: SeoLocale | 'x-default'; href: string }[];
  structuredData: Record<string, unknown>[];
  faqs: { question: string; answer: string; order: number }[];
}
export interface SeoPreview {
  success: true; issues: SeoIssue[]; pages: SeoResolvedPage[];
}
export type SeoCommand =
  | { action: 'create'; expectedRevision: number; reason: string; sourceVersionId?: string }
  | { action: 'edit'; expectedRevision: number; versionId: string; reason: string; config: SeoConfig }
  | { action: 'publish'; expectedRevision: number; versionId: string; reason: string }
  | { action: 'republish'; expectedRevision: number; versionId: string; reason: string };
export interface SeoChange {
  state: SeoState;
  writes: SeoVersion[];
  audit: {
    action: 'seo_draft_created' | 'seo_draft_edited' | 'seo_published' | 'seo_republished';
    actorUid: string; at: string; versionId: string; reason: string;
    before: SeoState; after: SeoState;
    changes: { scope: string; before: unknown; after: unknown }[];
  };
}