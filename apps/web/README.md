# OpenFind web

Next.js App Router foundation for OpenFind. Google sign-in and a protected placeholder dashboard are implemented but need real Google/Neon setup and testing. Device registration, reports and finding are not implemented. See `src/auth/README.md` for setup and security limitations.

## Requirements

Use Node 24 LTS (at least 24.3) and the root-pinned pnpm version. From the repository root:

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm --filter @openfind/web dev
```

The development server listens on port 3000. Visit `/` for the landing page or `/api/health` for the JSON liveness response. The latter only confirms that this route responds; it does not check a database, authentication provider or finding network.

Production build and local start:

```bash
corepack pnpm --filter @openfind/web build
corepack pnpm --filter @openfind/web start
```

The production start command requires the build output from the prior command. Local development origin allowlisting includes Arena preview hosts; it is not an access-control or production CORS policy.

## Deploy to Vercel

No Vercel project is linked or deployed yet. To deploy after connecting your account:

1. Put this monorepo in a Git provider supported by Vercel and import it as a Vercel project.
2. Set the project **Root Directory** to `apps/web`. Enable access to files outside the root directory if your Vercel monorepo settings require it, so the root workspace and lockfile are available.
3. Use the detected Next.js framework. Keep the repository's `pnpm-lock.yaml` and pinned pnpm version available to the build; select a supported Node 24 runtime if prompted.
4. Deploy and verify `/` and `/api/health` on the resulting deployment URL. If install/build discovery differs in your account, check Vercel's current monorepo documentation and build logs before adding overrides.

No environment variables are required for the static landing page and liveness endpoint. Google authentication and the database require the server-only environment variables described in `src/auth/README.md`. Configure separate secrets for Development, Preview and Production; never commit them or expose them to browser bundles.

A successful Vercel deployment does not imply that finding, security or production readiness has been implemented. The workspace currently has an unresolved high-severity dependency advisory; see the root README.
