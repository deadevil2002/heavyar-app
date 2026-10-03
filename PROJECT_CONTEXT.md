# HEAVYAR Project Context

Canonical stable architecture for `deadevil2002/heavyar-app`. Paths are relative to the repository root. Release procedures belong in `DEPLOYMENT.md`; volatile status belongs in `CURRENT_STATE.md`.

## Product

HEAVYAR is an Arabic-first GCC marketplace for heavy-equipment discovery, rental requests, equipment providers, and driver/transport operations.

| Role | Capabilities confirmed in code |
|---|---|
| Guest | Public marketplace browsing where the market is enabled; authentication is required for protected actions. |
| Customer | Rent equipment, find/request drivers, manage customer requests, profile, verification, notifications, settings, deletion. |
| Provider | Manage equipment and provider requests, find/request drivers, profile, verification, notifications, settings, deletion. |
| Driver | Manage driver profile and driver requests, profile, verification, notifications, settings, deletion. |

Capability source: `artifacts/heavyar-mobile/services/roleCapabilities.ts`.

## Mobile stack

Versions come from `artifacts/heavyar-mobile/package.json` in the current working tree.

| Component | Version |
|---|---|
| Expo | `~54.0.37` |
| React | `19.1.0` |
| React Native | `0.81.5` |
| Expo Router | `~6.0.24` |
| Tamagui / `@tamagui/config` | `2.7.7` |
| Reanimated | `~4.1.7` |
| Firebase JS SDK | `^12.11.0` |
| TanStack React Query | `^5.83.0` |
| `expo-image` | `~3.0.11` |
| `expo-notifications` | `~0.32.17` |
| Gesture Handler | `~2.28.0` |
| Safe Area Context | `~5.6.0` |
| React Native SVG | `15.12.1` |
| Zustand | `^5.0.2` |

## Application identity

Source: `artifacts/heavyar-mobile/app.json` and `services/firebaseConfigResolver.ts`.

| Identifier | Value |
|---|---|
| Expo name / slug | `Heavyar` / `heavyar` |
| Android package | `com.heavyar.app` |
| iOS bundle ID | `com.heavyar.app` |
| Expo project ID | `57eb8d63-5541-479e-b81b-89733b8068e5` |
| Firebase project ID | `heavyar-app` |
| URL scheme | `heavyar` |
| Production mobile API | `https://heavyar-api.heavyar-official.workers.dev` |

## Architecture

- The Expo/React Native client lives in `artifacts/heavyar-mobile`.
- Firebase Auth owns identity and persists the native session through AsyncStorage. Firestore stores application records and is accessed by the client only where rules allow.
- The Cloudflare Worker in `artifacts/heavyar-mobile/worker` is the authoritative API/security boundary for account provisioning, canonical account state, public discovery, mutations, payments, notifications, verification, Admin operations, and signed Cloudinary operations.
- Cloudinary media operations go through authenticated Worker endpoints; the client validates returned Cloudinary URLs.
- Push uses Expo push tokens registered with the Worker. Firebase Auth tokens authorize API calls.
- The Vite Admin is in `artifacts/heavyar-admin`; it is a separate UI over the Heavyar Worker/Firebase architecture.
- Website serving is a separate boundary. This worktree contains the `heavyar-web` proxy Worker source, whose upstream is `heavyar-website.pages.dev`; it is not the canonical website content repository.

### Mobile data ownership

- Mutations and security-sensitive reads remain Worker-authoritative. The mobile client must not direct-write payment state or bypass Worker validation.
- Equipment-request lists and details reconcile through bounded Firestore realtime listeners after Worker mutations commit canonical documents.
- Public discovery is a UID/filter/country-scoped React Query flow over the Worker projection, with explicit stale windows, cancellation, and targeted invalidation.
- Rental V2 request rendering consumes immutable request/equipment/commercial snapshots. It never falls back to current listing pricing or hydrates current listings for normal V2 rows.
- Account-bound asynchronous work captures the UID and is cancelled or ignored after logout/account switch. Cached request-detail snapshots are UI acceleration only, never authorization, mutation, payment, or settlement authority.
- Requests code may be prewarmed after authenticated Home becomes usable. Prewarming imports code only and must not mount screens, read data, or create listeners.

The complete domain contract is in `docs/mobile-data-flow.md`.

## Authentication and language

Authentication is a two-stage process:

1. Firebase establishes identity.
2. `contexts/AuthContext.tsx` resolves the Heavyar profile plus `/api/account/profile-status`.
3. The app publishes the canonical role/account state.

Firebase identity alone does not mean the Heavyar account is ready. Current account states are `authenticated_complete`, `provisioning_incomplete`, `restricted`, `deletion_requested`, and `suspended`. Explicit `signing_in`, `resolving_session`, `signing_out`, and initialization transitions prevent Guest UI from rendering while canonical state is unresolved.

Arabic is the default. `contexts/LanguageContext.tsx` persists `ar`/`en` in AsyncStorage, drives RTL/LTR through `I18nManager` on native, and sets HTML `dir`/`lang` on web.

## Roles and Store Review

Role checks are centralized in `services/roleCapabilities.ts` and reinforced by route/action checks. `accountPurpose: store_review` is intentionally non-public/restricted: it is excluded from public driver discovery, cannot create driver requests, and receives restricted request sections. Do not treat Store Review behavior as ordinary Production-user behavior.

## Marketplace and equipment

- Public discovery uses Worker search, React Query, enabled-market configuration, pagination, bounded timeouts, and role-aware cancellation (`contexts/DiscoveryContext.tsx`).
- Public equipment must be active, visible, and moderation-approved (`services/publicDiscovery.ts`).
- Providers own and manage listings. Listing lifecycle supports archive or delete; archive preserves rental history where required (`services/listingContracts.ts`).
- Equipment has availability data, moderation status, country/native currency, and optional Rental V2 hourly/daily minor-unit pricing.

## Driver system

The authoritative discovery rule is `worker/src/driver-eligibility.ts`. A driver is discoverable only when:

- the driver profile exists and `active === true`;
- moderation is `approved`;
- the account exists, has role `driver`, is not Store Review, and is not restricted/inactive/security-suspended;
- email is verified when the active policy requires verification before driver activation;
- the matching country market is enabled and marketplace-available.

`availabilityStatus: offline` and unverified trust are deliberately not baseline blockers. Search filters may still filter availability.

Driver-request states are `open → accepted/declined/closed`; `accepted → closed` (`worker/src/completion.ts`).

## Rental and request lifecycle

Equipment request transitions are defined in `services/requestTransitions.ts`:

- `pending → accepted | rejected | cancelled`
- `accepted → in_progress | cancelled`
- `in_progress → completion_requested`
- `completion_requested → completed`
- `completed`, `rejected`, and `cancelled` are terminal.

Provider actions accept/reject/start/request completion; the customer confirms completion. Cancellation is limited to pending/accepted.

Rental V2 supports hourly, daily, and open-ended modes with immutable pricing snapshots, minor-unit arithmetic, currency decimals/timezone, live estimates, and final server snapshots. Historical V1 `fixed_days` remains supported. Runtime decoders reject malformed V2 money rather than repricing old rentals from current listings (`services/rentalV2.ts`).

## Notifications

- Categories: rental, payment, verification, complaint, security.
- The Worker supplies inbox pages and authoritative unread counts; read operations reconcile monotonically to prevent stale responses from restoring unread state.
- Device registration/revocation is tied to the authenticated installation. Token refresh is subscribed globally.
- Deep links cover request, payment, verification, complaint/profile, profile, and inbox destinations (`services/notificationService.ts`).
- Remote Android push is not supported in Expo Go on the current Expo SDK; use a Development Build for real push validation.

## Verification

The Worker exposes identity, business, bank, manual-review, overall trust, regulatory-document, and verification-attempt contracts. Email verification is Firebase-authoritative, while Worker policy determines which operations require it. Provider regulatory documents include commercial registration, activity license, operating card, and ownership authorization (`services/verificationService.ts`).

## Payments

Payment creation/verification is Worker-authoritative and uses canonical request/quote/snapshot data with minor-unit validation and idempotency. Tap supports server-selected `TEST`/`LIVE` credentials and a server-only merchant ID; each payment persists its original environment so later verification and reconciliation cannot follow a changed Admin mode. The fail-safe/default is TEST. Moyasar and MyFatoorah are represented as capability entries without available adapters. Gateway availability also depends on Admin configuration and Worker secrets. Tap Marketplace/Split settlement remains **NOT VERIFIED / NOT ENABLED**. Never infer LIVE or Marketplace enablement merely from code or an environment variable name.

## Design system

- Approved direction: deep HEAVYAR navy/blue, construction yellow accents, rounded compact surfaces, subtle depth, Arabic-first RTL with English LTR.
- Tamagui tokens/themes/variants live in `tamagui.config.ts`; shared primitives are in `components/ui`.
- Reanimated supplies short motion and the approximately 1.34-second branded cold-launch animation in `components/HeavyarLaunchMotion.tsx`.
- The current Home is the working visual reference, but other routes require explicit visual-review status from `CURRENT_STATE.md`.

## Performance rules present in code

- `expo-image` memory/disk caching and recycling keys for equipment imagery.
- FlatList virtualization for inventory, requests, drivers, notifications, invoices, equipment, and chat.
- Lazy tab screens.
- React Query stale times, pagination, deduplication, cancellation, and bounded discovery timeouts.
- Reduced Motion handling in cold-launch animation.
- Avoid unnecessary dependencies and do not refresh/fetch public inventory for unresolved or disallowed roles.
- Push registration and other secondary startup work do not block canonical authentication readiness.
- Requests prewarms only its route/data-service code after Home settles; Driver-only UI and request-detail rental enrichment remain deferred until needed.
- Request Detail renders a UID/request-scoped ephemeral snapshot first when available, then replaces it with canonical realtime state.
