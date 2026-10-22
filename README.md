# MedEx TaskOne

A frontend take-home exercise for browsing healthcare services

## Run locally

Use Node.js 22.21.0 (see `.nvmrc`) and npm. The project rejects unsupported Node versions during installation. From this directory:

```sh
npm ci
npm run dev
```

Open [localhost:3000](http://localhost:3000). If you use nvm, run `nvm use` first.

## Checks

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

For a production preview, run `npm start` after a successful build.
`npm run test:watch` starts Vitest in watch mode.

## Initial choices

- **Next.js App Router and TypeScript:** match the preferred stack in the brief, with strict type checking and an `@/` alias for source imports.
- **Plain CSS and system fonts:** keep the starting point small and avoid remote font requests or a component library before it is needed.
- **Colors:** sampled from [MedEx Nepal](https://medex.com.np/): heading purple `#6C009E`, navigation gradient `#A442A0` to `#4A0480`, navy `#223A66`, coral `#EE4525`, and pink `#F2295B`. Reusable CSS variables live in `src/app/globals.css`; muted text uses a darker neutral for readability.
- **ESLint:** use the Next.js Core Web Vitals and TypeScript configurations.
- **Vitest:** prepare a Node-based runner for the domain logic tests. A browser/component test environment can be added if needed later.
- **npm:** use one package manager and a lockfile for reproducible dependency installation.

## AI usage

Codex assisted with the phase breakdown, initial application scaffold, tooling configuration, setup verification, mock endpoint tests, catalog normalization, and their tests.

I used Codex to speed up setup and implementation, explore edge cases in the supplied data, and draft targeted tests. The goal was to work efficiently within the exercise’s time limit while keeping each change small, verifiable, and understandable.

## Setup verification

Initial setup verified a clean `npm ci` and development-page rendering in a browser.

Passes 237 tests (16 mock route-handler tests, 33 catalog normalization tests, 63 pricing tests, 56 URL/provider tests, 29 loading/results/card tests, 18 type/location filter tests, and 22 category/control tests), linting, standalone type checking, and the production build. HTTP checks confirmed exact fixture responses, the default delay, forced failures, successful retries, invalid delay handling, and unsupported-method responses.

Next.js supports ESLint 10, but some bundled plugins still declare older peer ranges; npm can report peer dependency warnings during installation. Linting was verified with this configuration; see the [Next.js ESLint documentation](https://nextjs.org/docs/app/api-reference/config/eslint).

## Dependency audit

At setup, `npm audit --omit=dev` reported zero vulnerabilities. The full audit reports five high-severity entries along one development-only dependency chain: `eslint-config-next` -> `@next/eslint-plugin-next` -> `fast-glob` -> `micromatch` -> `braces`.

The underlying [braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) currently lists no patched version. Keep this finding visible and recheck when updating dependencies. The suggested automatic fix downgrades the Next.js lint configuration to an older major, so it was not applied.

## Mock API

The original fixture is stored unchanged in `data/task1-service-explorer.json`. Next.js route handlers serve each collection separately:

| Endpoint                   | Response                            | Records |
| -------------------------- | ----------------------------------- | ------- |
| `GET /api/category/active` | Category array with nested children |
| `GET /api/providers`       | Provider array                      |
| `GET /api/service`         | Service array                       |

These endpoints preserve every source field and value, including inactive records, decimal strings, nulls, and inconsistent titles. Despite its name, `/api/category/active` returns the supplied category collection unchanged.

The fixture is imported only by the mock API module (and its tests). A `server-only` boundary prevents accidental imports into client components. The explorer fetches all three endpoints concurrently, then normalizes the complete catalog. It shows no partial provider results if a collection fails and offers a retry. Requests are aborted when the explorer unmounts.

### Latency and failure controls

Every request waits **400 ms** by default. The controls apply to that request only, so one endpoint can fail while the other two remain available:

- `?delay=1200` sets a 1,200 ms delay. Whole numbers from 0 through 5,000 are accepted; invalid values return HTTP 400 with an `INVALID_DELAY` error.
- `?fail=true` returns HTTP 503 with a `MOCK_API_FAILURE` error after the delay. Omit it on the next request to retry successfully.
- Combine them, for example `/api/service?delay=1200&fail=true`.

All success and error responses send `Cache-Control: no-store`, keeping retries and simulation controls predictable. Failure is deterministic rather than random.

With the development server running, try:

```sh
curl 'http://localhost:3000/api/category/active?delay=0'
curl 'http://localhost:3000/api/providers?delay=800'
curl -i 'http://localhost:3000/api/service?delay=1000&fail=true'
curl 'http://localhost:3000/api/service?delay=0'
```

Vitest exercises the actual route handlers with fake timers: exact response data, latency bounds, independent failures, retries, invalid delays, and cache headers

## Catalog normalization

`src/lib/catalog/types.ts` describes the raw API contracts and the UI models. The mock API fixture is checked against the raw contract at compile time. `normalizeCatalog` in `src/lib/catalog/normalize.ts` is a pure function that accepts all three endpoint collections; it does not fetch or import the fixture. It returns visible services and provider/category/subcategory maps keyed by IDs.

## Price calculations

`src/lib/pricing.ts` contains `calculatePrice`, `getServicePricing`, and `formatMoney`. These functions consume the normalized model.

## URL state

`src/lib/explorer-state.ts` defines the shared parser, serializer, and update rules. `src/components/explorer-state-provider.tsx`

| Parameter                 | Meaning                                                    | Default        |
| ------------------------- | ---------------------------------------------------------- | -------------- |
| `q`                       | Free-text search; whitespace is normalized, case preserved | Empty          |
| `type`                    | Repeated service type, e.g. `type=package&type=lab_test`   | All types      |
| `category`, `subcategory` | Category and child IDs                                     | None           |
| `provider`                | Repeated positive provider ID                              | All providers  |
| `city` or `country`       | City ID or positive country ID                             | All locations  |
| `currency`                | THB, NPR, or INR                                           | All currencies |
| `min`, `max`              | Non-negative decimal price bounds within that currency     | No bounds      |
| `home`                    | `true` requires home-test availability                     | False          |
| `sort`                    | `relevance`, `price-asc`, `price-desc`, or `rating`        | Relevance      |
| `page`                    | Positive safe integer                                      | 1              |

For example: `/?q=checkup&type=package&city=3d77683b-7047-4874-8b9c-6ab04accd89d&currency=THB&max=5000&sort=price-asc&page=2`.

## Provider results

The explorer displays **2,853 visible services across 64 providers**. There are 65 active provider records, but one has no visible services. Cards show each provider’s location, rating and review count, or “No ratings yet”. Each card initially renders at most three matching services; “View all N services” opens all matching services in an independently scrollable area inside that card, preserving its three-service preview height. The provider header and collapse control stay in place. “Show fewer services” collapses the card, and changing URL filters resets expanded cards.

Prices include the calculated service charge, show explicit currency codes, and strike through the original amount when a discount applies. Zero prices are labelled “Free”; missing or invalid prices say “Price unavailable”. Wellness services show “From” with the duration of the cheapest valid option. Optional home collection fees are shown separately from the service price.

## Type, location, and home-test filters

Service types are a multi-select: selecting Health package and Lab test includes either type. Leaving all types unchecked includes every type. Location selects one country or city by ID; choosing a country includes all its cities. Home test available requires the service’s availability flag, independent of its optional collection fee. These dimensions combine with AND and retain other URL filters.

Controls read directly from the URL. Each change creates a browser-history entry, resets the provider page to 1, and updates results without re-fetching the catalog. Reload, Back, and Forward restore both controls and matching results. Choose All locations or uncheck a selection to remove it.

Location options come from all active providers and remain stable while results narrow. Unknown location IDs from shared links remain selected as “Unavailable location” and can be cleared. Controls are disabled while the catalog loads.

## Categories and subcategories

Categories come from the active category endpoint’s normalized tree and follow the selected service types. Labels include their type so “Ultrasound · Health package” and “Ultrasound · Lab test” stay distinguishable; URLs use IDs. The subcategory control contains only the chosen parent’s active children. It is disabled until a parent with children is selected.

Changing or clearing the parent clears its child. Changing service types clears both category levels if the parent becomes incompatible, in the same URL update. Keeping a compatible type, or clearing all type selections, retains the chosen hierarchy.
