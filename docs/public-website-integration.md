# Heavyar public website integration

The canonical website remains the separate `deadevil2002/heavyar-website`
repository. Its existing Cloudflare Pages project is **heavyar-website**, connected
to `main` and `heavyar.com`. Do not create another Pages project or change DNS.

## Backend and Admin changes

- The exact public origin `https://heavyar.com` is accepted by the Worker CORS
  allowlist. Existing configured origins and authentication checks are preserved.
- Browser Early Access requests go directly to the authoritative Worker, not
  through a cross-zone Pages proxy. Cloudflare replaces client IP information on
  cross-zone Worker subrequests, which would combine users into one rate bucket.
- Existing Firebase-authenticated account deletion retains its original Worker
  endpoint, Bearer ID token and explicit confirmation requirement.
- SEO quality findings display bilingual page/field labels. Raw validation paths
  remain available only in expandable technical details.

## Website contract

The website serves Arabic `/` and English `/en/` with initial-HTML metadata from
`GET /api/seo/published`. It uses ETag revalidation, a short cache, a bounded fetch
timeout and last-known-good published metadata during temporary failures.
Only an explicit `SEO_NOT_PUBLISHED` response permits the audited website
baseline. Cold outages fail closed for indexing. It never publishes SEO data.

Early Access config is read once per page load, without polling. The form fails
closed, sends an explicit marketing-consent boolean, and never creates Firebase
accounts. Both registration and production campaign sending remain disabled
until separately authorized; this integration does not change either setting.

Original legal sources and deletion JavaScript must be preserved. The legacy
10% commercial language is outside the scope of this integration. Generated
equipment imagery is illustrative, not an advertised live listing.

## Release boundary

The website repository's `main` branch automatically publishes through the
existing Pages integration. Treat a push to that branch as a production release,
not merely a source backup. Release the matching Worker CORS change before
enabling registration. Verify the actual production initial HTML, legacy legal
URLs, authenticated deletion, icons, robots and sitemap after publication.

Owner authorization is still required to enable Early Access. Publishing this
website does not authorize campaign sending, live payments, native builds or
store submission.