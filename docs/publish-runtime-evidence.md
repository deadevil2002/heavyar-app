# Publish runtime evidence

## Scope

The current automated publish profile mounts the real Add Equipment React
screen in a host React/JSDOM fixture. React Native hosts are inert test hosts and
upload/listing network operations are controlled mocks. Durations use the local
JavaScript monotonic clock.

This evidence can validate client stage ordering, bounded instrumentation,
render behavior, error selection, and cleanup/retry policy. It is not Android
or physical-device evidence and does not measure native frame presentation,
radio/network latency, Worker execution, Firestore, or Cloudinary production
latency. No emulator, ADB, Android SDK, KVM, arm64 device, or native profiler was
available for this evidence.

## Instrumented stages

- `publish.total`: Publish press through the first committed React outcome.
- `publish.media_validation`: synchronous client validation.
- `publish.image_uploads`: aggregate bounded upload batch.
- `publish.image_read_validate_upload`: one uploader-owned item operation,
  including local read, validation, and upload. It is not network-only.
- `publish.create_listing`: client wait for listing creation.
- `publish.success_ui_visible` / `publish.error_ui_visible`: first committed
  React outcome; not proof that a native frame was presented.
- `publish.js_event_loop`: thresholded JavaScript timer drift.
- `publish.render`: renders while publishing state is active.

Labels are static and the bounded local buffer accepts no URLs, local URIs,
public IDs, request payloads, tokens, user data, or arbitrary error strings.

## Controlled mounted-fixture sample

One focused test run produced:

| Outcome | Publishing renders | Total | Item read/validate/upload | Upload batch | Create listing | React outcome | Event-loop lag |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Success | 1 | 8.69 ms | 7 ms controlled fixture value | 4.13 ms | 0.73 ms | 3.41 ms | 0 events at or above 5 ms |
| Definitive listing rejection | 1 | 8.98 ms | 7 ms controlled fixture value | 4.36 ms | 0.25 ms, failed | 3.87 ms, failed | 0 events at or above 5 ms |

These small numbers are fixture execution times, not performance targets or
production capacity evidence. Repeated runs may differ.

## Ambiguous create outcome and manual retry risk

Once `createListing` has been submitted, a timeout, lost response, 5xx, or
session transition can leave the client unable to know whether the listing
committed. The current create contract generates a new listing ID for a new
manual submission and has no client idempotency key. A manual retry can
therefore create a duplicate if the first request committed.

The client preserves the established safety boundary:

- It does not automatically retry an unconfirmed create.
- It does not delete uploaded media that may be attached to a committed listing.
- It does not report success or claim that the listing did or did not commit.
- It tells the user to check My Equipment and warns that retrying may duplicate.
- Absence from My Equipment is not treated as proof of no commit because
  propagation, refresh, or eventual visibility may be delayed.

Adding backend idempotency is outside this focused UX/instrumentation change.