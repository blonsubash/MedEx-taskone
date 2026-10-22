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

Codex assisted with the phase breakdown, initial application scaffold, tooling configuration, and setup verification.

## Setup verification

Verified a clean `npm ci`, linting, standalone type checking, the production build, and development-page rendering in a browser. Vitest starts successfully with an empty suite.

Next.js supports ESLint 10, but some bundled plugins still declare older peer ranges; npm can report peer dependency warnings during installation. Linting was verified with this configuration; see the [Next.js ESLint documentation](https://nextjs.org/docs/app/api-reference/config/eslint).

## Dependency audit

At setup, `npm audit --omit=dev` reported zero vulnerabilities. The full audit reports five high-severity entries along one development-only dependency chain: `eslint-config-next` -> `@next/eslint-plugin-next` -> `fast-glob` -> `micromatch` -> `braces`.

The underlying [braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) currently lists no patched version. Keep this finding visible and recheck when updating dependencies. The suggested automatic fix downgrades the Next.js lint configuration to an older major, so it was not applied.
