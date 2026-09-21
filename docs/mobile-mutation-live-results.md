# Mobile mutation live results

## Release measured

- Existing Worker: `heavyar-api`
- Confirmed deployed version: `9ee6d45d-f128-423f-989a-11a9f18bf5d4`
- Measurement: one controlled production run using the Provider and Driver Store Review roles
- No password, token, email address, profile value, signed tail URL, or user identifier was recorded.

## Provider result

The request reproduced the current Add Equipment form payload, including its
currency compatibility fields and one real temporary image.

| Step | HTTP | Duration | Request ID | Result |
| --- | ---: | ---: | --- | --- |
| Prior hidden diagnostic cleanup | 200 | 5,365 ms | `B801F8125F` | deleted |
| Image upload | 200 | 2,755 ms | `2F794C7AD4` | asset created |
| Exact form listing create | 201 | 4,953 ms | `8530DEDD8E` | created, `visibility=hidden` |
| New listing cleanup | 200 | 1,844 ms | `9E74E23988` | deleted |
| New media cleanup | 200 | 1,661 ms | `D7F60909BD` | deleted |

Before deployment, the same exact form payload uploaded successfully in
8,670 ms but listing creation returned HTTP 400 in 1,636 ms with the canonical
server error `Unsupported listing field`. The disposable media was deleted.
The root cause was the Add form sending `nativeCurrency`,
`nativePricePerDay`, and `displayCurrency` while the create endpoint rejected
those compatibility fields. The released endpoint accepts but does not trust
them; country configuration remains authoritative.

After deployment, the exact form request succeeded and remained independently
hidden as required. Both the older hidden diagnostic listing and the new
listing/media were deleted. No disposable Provider fixture remains from this
measurement.

## Driver result

The script read the current profile, changed only `availabilityStatus`, and
restored its exact original value after the successful save.

| Step | HTTP | Duration | Request ID | Result |
| --- | ---: | ---: | --- | --- |
| Profile read | 200 | 949 ms | `2948C638E4` | current profile obtained |
| Reversible save | 200 | 2,830 ms | `ABD9BE032B` | saved |
| Original-value restore | 200 | 2,297 ms | `D0E7272C5E` | restored |

Before deployment, the same Review role profile save returned HTTP 403 in
5,072 ms with `Driver profile unavailable for this account`. After deployment,
both save and restoration returned HTTP 200. The Review account remains
excluded from public Driver discovery; only its private owner-edit path was
opened.

## Correlation and structured metrics

Every measured Worker response supplied a safe server-generated request ID,
including upload, create, save, restore, and cleanup responses.

A tail session was requested through the dedicated Heavyar Cloudflare
credential and the existing `heavyar-api` account-scoped tail endpoint. The
cleanup path closed the socket and issued the tail-session DELETE, but its
WebSocket connection was not available. No signed WebSocket URL or
authorization material was printed or persisted.

Because the live tail transport was unavailable, the following server-log-only
fields are explicitly **unavailable for this run**:

- Firestore read/write/request counts and failing operation
- Cloudinary upstream duration/status from the structured Worker record
- CAS result
- quota circuit checked/blocked/exhausted state

They are not inferred from fixture tests or HTTP wall latency. There were no
HTTP 429, 503, or mutation errors in the after-deployment run, but that does not
substitute for the unavailable quota/CAS log fields.

## Reproduction

The guarded, reversible runner is:

`scripts/load/reproduce-review-mutations.mjs`

It requires `HEAVYAR_RUN_MUTATION_QA=1`, uses configured credentials without
printing them, records only sanitized HTTP evidence and request IDs, restores
the Driver field, and cleans created listing/media in `finally`.

## Native-file-shape adapter matrix

This bounded production matrix used the installed React Native FormData
serialization shape and the exact current mobile upload, listing sanitizer, and
Worker client services. A Node/undici adapter resolved the synthetic `file://`
and `content://` references to authentic JPEG and PNG fixture bytes.

This is explicitly **not native Android, OkHttp, Hermes, emulator, or physical
device evidence**. It validates the contract up to a clearly labelled transport
seam without claiming that Node transport is the Android transport.

Before uploading, the runner:

- verified the pinned account through the read-only profile-status endpoint as
  an enabled Store Review account;
- verified the current Worker source invariant that Store Review creates use
  `visibility=hidden` and Store Review updates cannot make a listing visible;
- pinned the authenticated UID for upload, create, and cleanup; and
- generated a new non-personal marker used only for that run.

Every successful create returned `accountPurpose=store_review`,
`visibility=hidden`, and its exact new marker before cleanup was allowed.

| Case | Stage | HTTP | Duration | Request ID | Error code |
| --- | --- | ---: | ---: | --- | --- |
| 1 JPEG, file URI | upload 1 | 200 | 4,733 ms | `231EE5A8A6` | none |
| 1 JPEG, file URI | create | 201 | 2,813 ms | `28CDF2DB6F` | none |
| 2 JPEG, mixed URIs | upload 1 | 200 | 3,972 ms | `7FDC0DE4DE` | none |
| 2 JPEG, mixed URIs | upload 2 | 200 | 5,938 ms | `CED63BC9F6` | none |
| 2 JPEG, mixed URIs | create | 201 | 2,826 ms | `17E1C33F23` | none |
| 4 JPEG, mixed URIs | upload 1 | 200 | 4,266 ms | `CB9761A4DD` | none |
| 4 JPEG, mixed URIs | upload 2 | 200 | 6,368 ms | `D6B22AC0DB` | none |
| 4 JPEG, mixed URIs | upload 3 | 200 | 2,216 ms | `0C745A742A` | none |
| 4 JPEG, mixed URIs | upload 4 | 200 | 5,971 ms | `1ED25A9D77` | none |
| 4 JPEG, mixed URIs | create | 201 | 2,898 ms | `EDF6FAA6F5` | none |
| 1 PNG, content URI | upload 1 | 200 | 2,326 ms | `56FEF3B1B0` | none |
| 1 PNG, content URI | create | 201 | 5,466 ms | `2270B2C277` | none |
| 2 PNG, mixed URIs | upload 1 | 200 | 3,412 ms | `85D9CDDBE6` | none |
| 2 PNG, mixed URIs | upload 2 | 200 | 4,496 ms | `19DC5D5B31` | none |
| 2 PNG, mixed URIs | create | 201 | 2,793 ms | `0B6D1C1F0A` | none |
| 4 PNG, mixed URIs | upload 1 | 200 | 2,460 ms | `DB09B17A17` | none |
| 4 PNG, mixed URIs | upload 2 | 200 | 4,671 ms | `7ABCA0DC6A` | none |
| 4 PNG, mixed URIs | upload 3 | 200 | 2,919 ms | `2BB1BD7E98` | none |
| 4 PNG, mixed URIs | upload 4 | 200 | 3,787 ms | `C352EE3F55` | none |
| 4 PNG, mixed URIs | create | 201 | 3,049 ms | `2B24CF60BA` | none |

End-to-end upload-plus-create wall times were 7,550 ms, 8,779 ms,
15,246 ms, 7,797 ms, 7,297 ms, and 11,514 ms respectively. The optional
per-image callback reported only `{ index, durationMs }`; it did not expose a
URI, URL, public ID, account identifier, or credential.

All six acknowledged hidden listings and all 14 acknowledged matrix media
objects were deleted. Cleanup selected only IDs returned by the same newly
generated run. No old incident record or pre-existing listing/media was
modified.

An authenticated read-only reconciliation of those six exact returned listing
IDs then produced `404 EQUIPMENT_NOT_FOUND` for every case. The correlation
request IDs were `3185CF4868`, `08941287D9`, `A3E6BE1437`, `7D542CD7B4`,
`E95620FDEE`, and `1EC9E4CB8F`. This check did not enumerate, update, or delete
any older listing or incident record.

An initial four-JPEG attempt encountered the existing per-minute quota before
listing submission: one upload returned HTTP 429 with request ID
`4D4BE9C1B1` and canonical `REQUEST_FAILED`, while its concurrent sibling
returned HTTP 200 with request ID `F562E1160E`. The current mobile service
waited for both operations and deleted that acknowledged sibling; no listing
create was sent and the marker was not retried. The matrix then resumed only
after a fresh quota window. This aborted attempt is reported rather than hidden,
and is not treated as Android evidence or as an explanation of the old physical
device incident.

The guarded runner is `scripts/native-publish-contract.mjs` outside the
canonical application tree. It is dry-run by default and requires an explicit
log-storage/live-write acknowledgement for production execution.