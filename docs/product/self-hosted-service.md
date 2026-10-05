# Run the standalone account API

The standalone service serves the built application and account API without Vite. Browser login and guest-reader integration follow in the next child PR; this unit delivers API/operator capability, not those browser journeys. It supports closed, operator-created accounts, isolated private workspaces and explicitly reviewed unlisted reading links. It does not deploy the application or establish permission to distribute artwork.

## Quick path

Use the existing Node.js 22.12+ environment and installed dependencies:

```sh
npm run build
npm run build:server
npm run account:create -- "<account-name>"
npm start
```

Replace quoted placeholders with actual values. Account creation asks for a hidden password on a terminal; noninteractive use accepts one password line through stdin, never a password argument. Do not put real passwords in shell history, source files or command-line arguments. Registration is not exposed through HTTP.

The default service listens on `127.0.0.1:8080`. The built research reader remains available at that address. The existing browser workspace does not yet sign into the account API: use a trusted same-origin API client for this unit, or the existing Vite workspace for local-only authoring. Browser sign-in and guest reading follow next. Account storage uses the separate `self-hosted-v1` directory under the operator's local application-data directory. Existing local/Vite projects are not imported or exposed automatically.

## Operator settings

| Setting | Purpose |
| --- | --- |
| `PORT` | Loopback port, 1024–65535; default 8080. |
| `MOTION_MANGA_ACCOUNT_DATA` | Dedicated private data root, outside frontend, source/public build-input and generated server-build trees (canonical paths checked); use the same setting for account creation and startup. |
| `PUBLIC_ORIGIN` | Exact canonical origin. Default is the loopback HTTP origin. An HTTPS value supports an operator-managed TLS reverse proxy; it does not deploy or configure one. |
| `MOTION_MANGA_OWNER_MAX_PROJECTS` | Provisional per-owner original limit; default 100, bounded operator maximum 1000. |
| `MOTION_MANGA_OWNER_MAX_BYTES` | Per-owner total stored-byte budget; default 256 MiB, bounded operator maximum 4 GiB. Counts jobs, masks and editable state too. |
| `MOTION_MANGA_MODEL_PROJECT` | Optional approved project containing the already-audited offline model environments and assets. No assets are installed or downloaded. |

Example syntax: `MOTION_MANGA_MODEL_PROJECT="<approved-model-project>" npm start`. All placeholders must be replaced before execution. Behind an HTTPS proxy, preserve the configured Host and Origin and strip `Forwarded` and `X-Forwarded-*` headers: the application does not trust client/proxy identity claims. Its listener remains loopback-only.

Build output includes compiled server JavaScript, source-only renderer kernels and Python adapters. TypeScript and Vite are build tools, not production runtime requirements. Existing Sharp is a runtime dependency; installed FFmpeg is still required for rendering. Models are optional and remain outside the build output.

## Security and sharing boundary

- Passwords use asynchronous native scrypt with random salts and bounded work. Sessions use random opaque tokens stored only as hashes; cookie flags, server expiry, logout, same-origin checks and session CSRF protect private changes. Login admission and attempts are bounded. This is not a security certification.
- Storage admission counts stored files and in-flight reservations before mutations; the inventory traversal is capped at 10,000 entries. Conservative render/model leases remain held until the owned worker exits. Two concurrent guest media responses are allowed; individual derivatives remain bounded to 32 MiB. These are provisional closed-pilot limits, not an Internet-ready abuse-resistance claim. Nothing is silently deleted to satisfy a quota.
- Authenticated identity selects every private project, draft, mask, job, chapter and snapshot root. Stores are cached per owner; render/model heavy-job admission is shared across accounts.
- Sharing requires **both** visual review and a separate content-permission acknowledgment. The acknowledgment, timestamp, exact snapshot revision and optional plain-text attribution are recorded. Account ownership is not content ownership; the acknowledgment is not independent legal verification.
- A guest link exposes only a sanitized reading manifest and reviewed poster/video derivatives. Originals, editable drafts, masks, jobs and account APIs remain private.
- A raw guest token is returned only when the API creates or replaces a link. Retain it then; its hash cannot reconstruct a lost link. Replacement rotates the token and rejects older URLs. Withdrawal rejects all future manifest/media requests, but cannot recall copies already downloaded. Withdrawing the underlying local snapshot also blocks its guest links.

## Verification and release gates

`npm test` includes native two-owner/anonymous API boundaries, actual encoded synthetic derivatives, permission acknowledgments and a compiled-entry journey. This branch does not claim the following browser UI proof. `npm run typecheck`, `npm run lint`, `npm run build` and `npm run build:server` verify the shipped code/build boundaries.

Live Internet deployment, operational TLS/security review, reporting and retention policy, real-art public rights, corpus selection, physical-device acceptance and research-quality claims remain release gates. No public hosting, data migration, legal clearance or universal model-quality guarantee is implied.

## API contract

`GET /api/runtime` reports account mode. `GET /api/auth/session` returns the current user and in-memory CSRF token, or null values. `POST /api/auth/login` accepts username/password JSON from the exact configured Origin with `X-Motion-Manga-Local: 1`; it issues an opaque HttpOnly cookie. Private requests require that cookie, and mutations also require the returned `X-Motion-Manga-CSRF` token and exact Origin. `POST /api/auth/logout` revokes the session. No public registration endpoint exists.

The existing `/api/local-projects` paths are scoped to the authenticated owner. `POST /api/shares` requires `snapshotId`, `expectedSnapshotRevision`, `reviewed: true`, `rightsConfirmed: true` and optional `attribution`; it returns the new token once. `PUT /api/shares/:id` additionally requires `expectedRevision`, rotates the token and invalidates old links. `DELETE /api/shares/:id` withdraws all token revisions. Anonymous access is limited to `GET /api/read/:token` and its `/pages/:index/poster|video` derivatives. The returned `/read/:token` browser path is reserved for the next UI integration; use the manifest/media APIs in this unit.
