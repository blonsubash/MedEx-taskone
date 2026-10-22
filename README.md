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

Codex assisted with the phase breakdown, initial application scaffold, tooling configuration, setup verification, mock endpoint tests, catalog normalization and their tests.

I used Codex to speed up setup and implementation, explore edge cases in the supplied data, and draft targeted tests. The goal was to work efficiently within the exercise’s time limit while keeping each change small, verifiable, and understandable.

## Setup verification

Initial setup verified a clean `npm ci` and development-page rendering in a browser.

Passes 112 tests (16 mock route-handler tests, 33 catalog normalization tests, and 63 pricing tests), linting, standalone type checking, and the production build. HTTP checks confirmed exact fixture responses, the default delay, forced failures, successful retries, invalid delay handling, and unsupported-method responses.

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

The fixture is imported only by the mock API module (and its tests). A `server-only` boundary prevents accidental imports into client components. Components will fetch these endpoints when browsing is implemented.

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
