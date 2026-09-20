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