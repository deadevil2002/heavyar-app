# Heavyar SEO CMS and search visibility foundation

## Scope and audit

The authoritative implementation is the existing `heavyar-api` Cloudflare Worker
and Heavyar Admin. The Express API artifact is not the production SEO backend.
No public website source, route, DNS record, Cloudflare Pages deployment, robots
file, sitemap, favicon, OG tag, payment activation, or native build is changed.
The `early-access` registry entry is preparation only, not feature activation.

The repository had no public SEO CMS, canonical registry, sitemap generator,
hreflang model, JSON-LD model, or crawler-policy system. Admin's static HTML
already contains private-site metadata, including `noindex,nofollow,noarchive`,
OG/X text, and a favicon. Its existing robots file permits crawling; that is not
an instruction to index Admin. Those files remain unchanged and are not a source
for future public-site metadata. Existing business/financial configuration is
separate and is not copied into SEO or changed by this feature.

## Ownership and persistence

- `seoSettings/state`: revision, draft pointer, current-publication pointer, and
  version summaries. Missing state means revision zero and **no publication**.
- `seoVersions/{id}`: typed config plus version number, status, created/updated
  actor and timestamp, publication actor and timestamp, reason, source-version ID.
- Each change atomically commits the state, affected versions, and the existing
  `adminAudit` record. Firestore `currentDocument.updateTime` / `exists:false`
  preconditions prevent concurrent changes and duplicate creations.
- One editable draft exists at a time. Draft editing cannot alter published
  content. Publishing archives the previous publication and points at the
  validated draft. Historical published content and publication attribution are
  preserved. Republish copies an old published/archived configuration into a
  **new** published version; it never edits that source's content.
- Republish preserves any existing draft. That draft does not silently acquire
  the republished content; staff must review its source and current revision.
- Maximum 100 version summaries and 100 KiB of configuration per version.
  Capacity exhaustion explicitly blocks creation rather than pruning history.
  A later archival design must preserve history and concurrency guarantees.
- Drafts are created explicitly in Admin. Initial deployment does not publish
  defaults or create test content in production.

## Typed configuration

Global fields cover site name, localized/default site names, SEO and social
titles/descriptions, OG/X images, the canonical origin, language/default locale,
and separate ICO, PNG, 192px, 512px, apple-touch-icon and social image references.
References are nullable public HTTPS URLs, never fabricated public asset URLs.
The suggested future social asset size is 1200×630; this phase generates none.

Each of the nine registry pages has localized/default titles, descriptions and
H1 headings; canonical paths; a three-state robots control; sitemap inclusion,
optional priority and change frequency; OG/X overrides; hreflang; and schema
type selections. Machine identifiers are transport identifiers, not UI labels.
Editorial topics are internal content guidance, not public meta-keywords.

Organization fields are explicit public identity: name, alternate name, logo,
URL, public contact email, registration identifier and sameAs/social links. No
private staff/profile contact details are inferred or copied.

MobileApplication has an inactive-by-default switch, Android/iOS store URLs,
category, matching operating systems and localized pricing description. No store
links are seeded. Inactive application fields are excluded from public output.
Store URLs must have the correct store hostname and application-ID shape;
owners remain responsible for confirming that the actual public app exists and
that any pricing description is accurate. No ratings, reviews or offers exist
in the model.

FAQ items have stable IDs, a registered page, bilingual question/answer, an
enabled flag and ordering. Only enabled, translated, visibly renderable FAQ
content is resolved publicly. Typed schemas are limited to Organization,
WebSite, MobileApplication, FAQPage and BreadcrumbList. There is no raw script,
raw JSON-LD or HTML editor. Schema fields are constructed from validated data.

## Languages, canonicals, resolution and checks

- Supported locale identifiers are `ar-SA` and `en`. Defaults must belong to the
  configured supported set; unknown locales and duplicate entries are errors.
- Intended origin is strictly `https://heavyar.com`. External canonical domains
  and alternate origins are not enabled by this foundation.
- Registry: home, about, equipment, drivers, help, privacy, terms,
  account-deletion, early-access. Arabic home is `/`; English home is `/en/`.
  Other paths are `/<key>` and `/en/<key>`, without trailing slash.
- An absolute canonical is accepted only on the intended origin and normalized
  to the correct registered path. Query/fragment, credentials, unsafe scheme,
  encoded traversal, protocol-relative, backslash, private and arbitrary paths
  are rejected. Registry uniqueness prevents canonical duplication.
- Text resolution is locale override → same field's `default` → corresponding
  global locale → global `default` → safe translated application text.
  Social fields fall back to resolved page SEO only after global social values;
  headings fall back to the resolved page title. Missing translations never
  display translation keys. Enabled FAQ requires actual content in every
  supported language rather than substituting unrelated fallback copy.
- Hreflang uses supported locales only, plus x-default at the configured default
  locale's canonical. This is data for later distinct HTML pages, not a
  client-side language toggle implementation.
- Robots values are `index,follow`, `noindex,follow`, `noindex,nofollow`.
  Noindex plus sitemap inclusion is an error. Internal/Admin/API paths cannot
  enter the registry. Defaults are conservative: noindex and excluded sitemap.
- Crawler controls are mainstream indexing, Googlebot, Bingbot and
  OAI-SearchBot. Child allowances cannot contradict the disabled master switch.
  They govern future public-site output only, never infrastructure. A later
  renderer must not block essential CSS/JS/image rendering assets.
- Sitemap data includes language, canonical, inclusion and publication timestamp.
  `lastmod` is the last configuration publication (a conservative configuration
  timestamp), not a claim that the website's visible content changed. The later
  build must combine it with real page-content changes and avoid false dates.
- Quality checks return error/warning/info objects, not a vanity score. Unsafe
  structure/URLs are errors; missing/long metadata, duplicates and important
  noindex pages are guidance. Missing social assets are informational. A warning
  does not by itself block publication.
- Clear identity, useful crawlable content, accurate structured data, language
  alternates and consistent canonicals support discoverability. They do not
  guarantee ranking, indexing, AI citation or ChatGPT mentions.

## API contract

All Admin routes require authenticated, verified, active staff. Their responses
remain private/non-cacheable through the existing Worker response policy.

| Method and path | Input / behavior |
| --- | --- |
| `GET /api/admin/seo` | State, current draft/publication, registry, server defaults, effective permissions |
| `GET /api/admin/seo/version?id=<id>` | Authorized history read; ID must exist in state |
| `POST /api/admin/seo/preview` | Either `{config}` or `{versionId}`; resolved pages and quality issues; invalid config yields error issues and no resolved pages; no persistence |
| `POST /api/admin/seo` | Commands below; returns the full refreshed Admin view |
| `GET` / `HEAD /api/seo/published` | Only the current publication; no version selection and no write methods |

Every write command requires integer `expectedRevision` and a 3–1000-character
reason. Commands:

```json
{"action":"create","expectedRevision":0,"reason":"Prepare reviewed bilingual SEO"}
{"action":"edit","expectedRevision":1,"versionId":"<draft-id>","reason":"Update approved copy","config":"<typed SeoConfig object>"}
{"action":"publish","expectedRevision":2,"versionId":"<draft-id>","reason":"Approve public configuration"}
{"action":"republish","expectedRevision":3,"versionId":"<historical-id>","reason":"Restore reviewed configuration"}
```

The example `config` marker represents an object, not a string accepted by the
API. Create can optionally specify `sourceVersionId`. Actors, timestamps,
publication status and pointers cannot be supplied by clients. Stale revisions
return 412; an atomic-storage conflict returns 409; outages fail explicitly,
not as empty defaults or successful writes.

The public response is an explicit allowlist: public global identity/assets,
organization, enabled mobile application, crawler policy, resolved localized
pages, schema-version number and current publication ID/number/timestamp.
It excludes drafts, disabled FAQ/application data, internal notes, editorial
topics, version history and all creation/update/publication actors.

No publication returns `404 SEO_NOT_PUBLISHED` with `no-store`. Unavailable or
invalid stored content returns 503, never a draft/default fallback. Published
responses have content-derived weak SHA-256 ETag, support conditional 304 and
HEAD, and use `public, max-age=60, s-maxage=300, must-revalidate`. Public browser
reads allow `Access-Control-Allow-Origin: *`; the endpoint itself has
`X-Robots-Tag: noindex, nofollow`. Query parameters are rejected so no caller can
select a draft or historical version through this endpoint.

## Permissions and audits

| Existing staff role | Read / preview / history | Create / edit draft | Publish / republish |
| --- | --- | --- | --- |
| owner, super_admin | Yes | Yes | Yes |
| marketing | Yes | Yes | No |
| admin, auditor | Yes | No | No |
| support, moderator, verification, payouts, finance, operations | No | No | No |

The Worker is authoritative; Admin navigation/disabled controls are only a UI
reflection. New dedicated `seo.read`, `seo.edit`, `seo.publish` permissions do
not reuse broad marketing or general configuration permissions.

Existing append-only `adminAudit` receives `seo_draft_created`,
`seo_draft_edited`, `seo_published`, and `seo_republished`. Each includes the
authenticated actor, version target, reason, timestamp, state before/after and
changed scopes. Page scopes retain before/after canonical, robots and schema
settings; crawler, organization, application, FAQ and editorial changes also
have scope diffs. Audit and content writes succeed or fail together.

## Future website integration — intentionally not implemented here

1. Fetch and validate the **published-only** contract at build/server-render time.
   Pin one publication for a whole build. Abort on outage/no publication instead
   of inventing hard-coded metadata. Account for the documented cache TTL.
2. Create the approved Arabic/English routes only when authorized. Render title,
   description, canonical, robots, OG/X and language alternates in initial HTML
   or static output; client-side switching alone is not search-visible parity.
3. Render the matching H1 and real enabled FAQ content. Emit only schemas that
   describe content actually visible on that page. Serialize JSON-LD safely
   (escape `<` as `\\u003c`), not by interpolating arbitrary script strings.
4. Generate robots and sitemap from the same pinned publication, without
   blocking render assets or publishing private routes. Use actual meaningful
   page-content timestamps when the future site has its own content history.
5. Finalize real brand assets, public store availability, structured-data
   accuracy and provider/search-engine validation. Make no visibility promises.
6. Deploy the website, sitemap, robots and public metadata only in that later,
   explicitly authorized phase. No commercial terms or commission data are
   changed by this SEO CMS.

## Release verification — 2026-09-18

- 302 Worker tests and 53 Admin tests passed. Worker, mobile and Admin TypeScript
  checks passed, as did the Admin production build.
- Browser QA exercised draft creation, editing, bilingual FAQ, publication,
  historical inspection and non-destructive republishing through the UI.
  English LTR and Arabic RTL passed Global/Pages/Crawlers/History checks at
  1920×1080, 1440×900, 1366×768, 1024×768, 768×1024 and 390×844 without horizontal
  page overflow. Publish dialogs were checked on desktop and Arabic mobile.
- Browser QA used the real SEO engine with isolated in-memory persistence and
  an explicit owner-session fixture. No production SEO or financial writes were
  made. Public-before-first-publish behavior is covered by automated API tests;
  the browser run verified the post-publication public response.
- Privacy/dataflow scan: zero findings. SAST reported four pre-existing public
  Firebase configuration identifiers, not new SEO source findings. Dependency
  audit reported 0 critical, 58 high, 46 moderate and 8 low advisories in the
  unchanged dependency baseline. Dependency upgrades are not part of this
  feature release; these advisories remain unresolved.
- Before deployment, production Firestore returned `429 RESOURCE_EXHAUSTED`
  while Firebase authentication and Worker health succeeded. This blocked the
  existing Admin session and commercial read endpoints. Isolated QA does not
  establish production data availability or a successful post-release commercial
  fingerprint comparison. No billing, quota or authorization changes were made.