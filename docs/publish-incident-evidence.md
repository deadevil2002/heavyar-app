# Publish incident evidence: A3CBCDCE46

## Scope

This is a sanitized, read-only production incident record. The investigation
used only the app-scoped Heavyar Cloudflare credential and did not reproduce the
request, modify production, deploy, query user records, or inspect request
bodies, credentials, personal data, or image URLs.

## Confirmed production identity

- Canonical Git revision supplied for the tested Android build:
  `70f7cf88c45f37604245606aaf1c650e7a57ae96`
- Active Worker: `heavyar-api`
- Active Worker version:
  `dc171edd-9d0b-496f-9fc5-7c430fce625a` (version 97, 100% traffic)
- Active deployment:
  `5a8f87ee-1e6a-4e33-8fff-1e25ae339814`
- Deployment creation time: `2026-09-21T09:15:41.808051Z`
- Downloaded deployed module SHA-256:
  `6a597df6b3c1208a551cb070e502c3ab3a8508abf9710de6d2822dd71ac9708a`

Cloudflare identifies the version as an upload but does not record a Git SHA in
its version metadata. The Cloudflare API evidence therefore does not
independently prove the Git-to-bundle association.

## Exact findings

`A3CBCDCE46` is a dynamically generated ten-character Worker request/support
correlation ID. It is not a canonical error code.

The exact route, method, HTTP status, canonical error code, exception class,
failing stage, durations, Firestore request/read/write counts, CAS outcome, and
quota outcome are not recoverable for this request. In the equipment publishing
flow, the support ID could have come from either `POST /cloudinary/upload` or
`POST /api/listings`; available evidence does not distinguish the two.

It is also unknown whether any image upload completed, whether a listing
committed, whether media became orphaned, or whether a post-commit response was
lost. The exact root cause remains unknown and must not be inferred from the
client-visible support ID.

## Why the trace is unavailable

The scoped token successfully read Worker settings, deployments, versions,
downloaded script content, observability telemetry, active tails, and Logpush
job inventory. This rules out a read-permission failure.

At investigation time:

- the Worker had no observability configuration;
- Worker Logpush was disabled;
- there were no Tail Worker consumers or active tails;
- there were no `workers_trace_events` Logpush jobs;
- an exact telemetry search for `A3CBCDCE46` over September 14–21 returned zero
  events; and
- a service-scoped search for `heavyar-api` around the incident returned zero
  events and no fields.

The request occurred within Cloudflare's documented Workers Logs retention
window (three days on Free and seven days on Paid). The missing trace is
therefore attributable to logs not being stored, not retention expiry.

## Data-correlation boundary

The support ID is not persisted in Firestore or Cloudinary records. Without a
logged route, precise request timestamp, authenticated subject, listing ID, or
media identifier, a production data scan would be broad and non-causal and
could expose personal data or image URLs. No Firestore or Cloudinary records
were queried. Commit and upload correlation remain unavailable.

## Privacy-preserving Workers Logs activation

The initial incident trace made no configuration change. After explicit
authorization, the following script-level configuration was enabled for
permanent storage of the Worker's explicitly sanitized `console.log` mutation
events:

```json
{
  "observability": {
    "enabled": true,
    "head_sampling_rate": 1,
    "logs": {
      "enabled": true,
      "head_sampling_rate": 1,
      "invocation_logs": false,
      "persist": true
    },
    "traces": {
      "enabled": false,
      "persist": false
    },
    "issues": {
      "enabled": false
    },
    "redact_query_string": true
  }
}
```

This body was applied as a partial `PATCH` to
`/accounts/{account_id}/workers/scripts/heavyar-api/script-settings`, not a
script upload. `invocation_logs: false` suppresses Cloudflare's automatic
request/response invocation entries while retaining custom `console.log`
events. Custom logs do not require invocation logs to be enabled. Disabling
invocation logs, disabling traces and Issues, and redacting query strings avoids
unnecessary automatic URL/request metadata while preserving the sanitized
application events at a 100% sample rate.

The post-patch comparison confirmed the active deployment/version and module
fingerprint were unchanged. Bindings, secrets, runtime settings, schedules,
workers.dev state, domains, Logpush state, and tail consumers were preserved;
the only setting change was observability. Secrets and binding values were not
printed or stored in this document.

Before activation, the downloaded deployed bundle was audited for every
`console.log`, `console.info`, `console.warn`, `console.error`, and
`console.debug` call. It contained one console call: the structured diagnostic
event for important mutations and public equipment search. Its fields are fixed
diagnostics (request ID, method, pathname, status, durations, bounded Firestore
counters and canonical failure status, upstream status, CAS, and quota state).
It does not log request bodies, query strings, headers, authentication material,
user identifiers, image URLs, or raw exception/error text.

## Safe ingestion verification

One unauthenticated `POST /api/listings` request with an empty JSON object
verified storage. Authentication failed before body processing or any
Firestore/upstream work, returning HTTP 401 and support code `4FA07AB181`.
An exact service-and-support-code telemetry query returned only these safe
fields:

- event: `important_mutation`
- method/path/status: `POST /api/listings`, 401
- duration: 0 ms
- Firestore reads/writes/requests/duration: 0/0/0/0 ms
- upstream duration: 0 ms
- CAS: `not_used`
- quota: not checked, not blocked, not exhausted

The stored event timestamp was 251 ms after the request began. The first
telemetry query was issued approximately 28.5 seconds later and found the event
immediately, completing in approximately 0.6 seconds. This establishes an
ingestion upper bound of approximately 29 seconds for this check; it does not
establish the exact lower-bound ingestion latency.

Workers Logs retention is plan-bounded and is not an audit archive. At full
sampling, stored volume and cost scale with the number of emitted custom log
events. Queries should filter first by service and exact sanitized `requestId`,
then validate route, method, status, error code, stage, durations, Firestore
counts, CAS, and quota fields without returning request bodies or user data.
