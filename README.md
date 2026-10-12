# Hunting Lodge App

A full-stack management application for organizing operational groups, shifts, sites, and resources. Built on the **MERN stack** (MongoDB, Express, React, Node.js) with **TypeScript** end-to-end and **SSO (OpenID Connect) authentication**, packaged as a single container for OpenShift / Kubernetes.

## 🚀 Features

- **SSO Authentication:** OpenID Connect login (Auth0 in dev, enterprise IdP in prod) with PKCE, httpOnly session cookies, and silent token refresh.
- **Role-Based Access:** Guest, User, Shift Manager, and System Administrator views with protected client routes and server-side authorization.
- **Sites:** Operational sites with descriptions, resource links, and per-user favorites.
- **Phone Directory:** Organizational/emergency phone entries with per-user favorite phones.
- **Shift Schedule:** Interactive weekly/monthly schedule planning and publishing.
- **Shift Reports:** Rich-text report editor (Tiptap) with automatic report generation per time slot via a scheduled worker.
- **Vacations:** Vacation request submission, Shift Manager approval workflow, and balance aggregation.
- **Group Settings:** Per-group members, shift types, time slots, notification recipients, and statistics.
- **Admin Dashboard:** User management with filtering, role/group assignment, and Super Admin protection.
- **UI:** Material UI with light/dark themes, "What's New" release notes, and accessibility-focused tests.

## 🛠 Tech Stack

### Client (`client/`)

- **Framework:** React 19 + Vite 7
- **Language:** TypeScript
- **UI:** Material UI v7 (+ Icons) with Emotion
- **Rich Text:** Tiptap v3
- **Routing / State:** React Router v7, Context API (`User`, `Data`, `Theme`, `Notification`)
- **HTTP:** Axios
- **Utilities:** date-fns
- **Testing:** Vitest + Testing Library (jsdom)

### Server (`server/`)

- **Runtime:** Node.js 24 (TypeScript via `tsx`)
- **Framework:** Express v5
- **Database:** MongoDB via Mongoose v9, migrations via `migrate-mongo`
- **Auth:** `openid-client` (OIDC) + `jsonwebtoken`
- **Validation:** Zod (environment + request payloads)
- **Security:** Helmet, CORS whitelist, `express-rate-limit`, input sanitization
- **Background Jobs:** `node-cron` (shift report generator)
- **Logging / Perf:** Morgan, compression, LRU response cache
- **Testing:** Node.js built-in test runner (`node --test`)

## 📁 Project Structure

```
hunting-lodge-app/
├── client/                 # React SPA (Vite)
│   └── src/{api,components,context,pages,theme,config,types,test}
├── server/                 # Express API
│   ├── index.ts            # Server entry point (DB connect, listen, graceful shutdown)
│   ├── app.ts              # Express app (middleware, routes, static SPA hosting)
│   └── src/
│       ├── config/         # Env loading/validation, DB, JWT, SSO, CORS
│       ├── controllers/  routes/  models/  middleware/
│       ├── services/       # cronJobs (shift report generator)
│       ├── migrations/     # migrate-mongo migrations + config
│       ├── scripts/        # seed scripts, standalone cron worker
│       └── test/
├── env/
│   ├── client/             # Vite env files (.env.<env>)
│   └── server/             # Server env files (.env.config.<env> / .env.secret.<env>)
├── k8s/                    # OpenShift/Kubernetes manifests
├── Dockerfile              # Multi-stage build (client + server → single image)
└── .gitlab-ci.yml          # CI/CD pipeline
```

The root `package.json` uses **npm workspaces** (`client`, `server`) with a single lockfile.

---

## ⚙️ Environment Configuration

The app supports three environments, selected by `APP_ENV` (falls back to `NODE_ENV`):

- **`nonprod`**: development and integration. Loose CORS, verbose logging, permissive rate limits.
- **`preprod`**: staging/QA, with production parity and strict validation.
- **`prod`**: live production, with a strict CORS whitelist, high pool limits, and suppressed stack traces.

### Server env file loading

Server variables live in `env/server/`. They are split into **non-sensitive config** and **secrets**, which map to a Kubernetes ConfigMap and Secret respectively. Files are loaded in this order; later files override earlier ones:

1. `env/server/.env` (base fallback)
2. `env/server/.env.config.<env>`: non-secret settings
3. `env/server/.env.secret.<env>`: credentials
4. `env/server/.env.<env>` (legacy single-file, still supported)
5. `env/server/.env.<env>.local`: local developer overrides

If `ENV_FILE` is set and points to an existing file, **only** that file is loaded. Variables already set in the process environment (e.g. injected by Kubernetes) beat `ENV_FILE` and the base `.env`. Files 2–5 are loaded with `override`, so their values win over the process environment. In containers, don't ship these files; inject everything through the ConfigMap/Secret instead.

In `preprod` and `prod`, the server **refuses to start** if any of these are missing or invalid: `MONGO_URI`, `JWT_SECRET` (≥ 32 chars), `SSO_ISSUER_URL` (https), `SSO_CLIENT_ID`, `SSO_CLIENT_SECRET`, `SSO_REDIRECT_URI` (https), `SUPER_ADMIN_ID`, `SUPER_ADMIN_GROUP_NAME`.

Only `.example` templates are committed. All real `.env*` files are git-ignored.

### Server variables

#### Runtime & Networking (`.env.config.<env>`)

| Variable            | Purpose                                                  | Nonprod                    | Prod                  | Default            |
| :------------------ | :------------------------------------------------------- | :------------------------- | :-------------------- | :----------------- |
| `APP_ENV`           | Target environment (`nonprod` / `preprod` / `prod`)      | `nonprod`                  | `prod`                | `nonprod`          |
| `NODE_ENV`          | Node runtime mode                                        | `development`              | `production`          | `development`      |
| `PORT`              | HTTP listen port                                         | `5000`                     | `5000`                | `5000`             |
| `TRUST_PROXY`       | Express `trust proxy` (hop count, boolean, or CIDR)      | `1`                        | `1`                   | `1`                |
| `STATIC_FILES_PATH` | Path to the built client SPA                             | _(unset)_                  | `/app/client/dist`    | `../client/dist`   |
| `ENV_FILE`          | Load env from this single file instead of the hierarchy  | _(unset)_                  | _(unset)_             | —                  |
| `LOG_FORMAT`        | Morgan log format                                        | `dev`                      | `combined`            | `dev` / `combined` |

#### Database (`MONGO_URI` in secrets, the rest in config)

| Variable                            | Purpose                             | Nonprod                                      | Prod                    | Default   |
| :---------------------------------- | :---------------------------------- | :------------------------------------------- | :---------------------- | :-------- |
| `MONGO_URI`                         | MongoDB connection string           | `mongodb://localhost:27017/hunting_lodge_nonprod` | Production replica set | local DB |
| `MONGO_AUTO_INDEX`                  | Build Mongoose indexes on startup   | `true`                                       | `false` (migrations)    | `false`   |
| `MONGO_MAX_POOL_SIZE`               | Max pool connections                | `20`                                         | `50`                    | `50`      |
| `MONGO_MIN_POOL_SIZE`               | Min idle pool connections           | `2`                                          | `10`                    | `10`      |
| `MONGO_SERVER_SELECTION_TIMEOUT_MS` | Server selection timeout            | `30000`                                      | `5000`                  | `5000`    |
| `MONGO_SOCKET_TIMEOUT_MS`           | Inactive socket timeout             | `45000`                                      | `45000`                 | `45000`   |
| `MONGO_HEARTBEAT_FREQUENCY_MS`      | SDAM heartbeat frequency            | `10000`                                      | `10000`                 | `10000`   |
| `MONGO_CONNECT_TIMEOUT_MS`          | Initial connect timeout             | `30000`                                      | `30000`                 | `30000`   |
| `MONGO_MAX_IDLE_TIME_MS`            | Idle time before socket reap        | `60000`                                      | `60000`                 | `60000`   |

#### SSO / OIDC

| Variable               | File   | Purpose                                     | Nonprod                               | Prod                                  | Default |
| :--------------------- | :----- | :------------------------------------------ | :------------------------------------ | :------------------------------------ | :------ |
| `SSO_ISSUER_URL`       | secret | OIDC issuer base URL                        | `https://dev-xxx.us.auth0.com`        | Enterprise IdP (https)                | —       |
| `SSO_CLIENT_ID`        | secret | OIDC client ID                              | Auth0 dev app                         | Enterprise app                        | —       |
| `SSO_CLIENT_SECRET`    | secret | OIDC client secret                          | Auth0 dev secret                      | Enterprise secret                     | —       |
| `SSO_REDIRECT_URI`     | secret | OAuth2 callback URL                         | `http://localhost:5173/auth/callback` | `https://<host>/auth/callback`        | —       |
| `SSO_IDENTIFIER_FIELD` | secret | Claim used to match users                   | `email`                               | `username` (AD / smartcard)           | `email` |
| `SSO_COOKIE_SECRET`    | secret | Secret for signing SSO state cookies        | dev secret                            | high-entropy secret                   | —       |
| `SSO_USE_PKCE`         | config | Enable PKCE in the auth code flow           | `true`                                | `true`                                | `true`  |
| `SSO_COOKIE_SECURE`    | config | Mark auth cookies `Secure`                  | `false`                               | `true`                                | env-based |
| `SSO_SAME_SITE`        | config | `SameSite` attribute for auth cookies       | `lax`                                 | `lax`                                 | `lax`   |

#### JWT Session

| Variable         | File   | Purpose                               | Default |
| :--------------- | :----- | :------------------------------------ | :------ |
| `JWT_SECRET`     | secret | Session token signing key (≥ 32 chars in preprod/prod) | dev fallback |
| `JWT_EXPIRES_IN` | config | Session token lifetime                | `7d`    |

#### Super Admin (secrets, never exposed to the client)

| Variable                 | Purpose                                   | Default          |
| :----------------------- | :---------------------------------------- | :--------------- |
| `SUPER_ADMIN_ID`         | Identity of the bootstrap Super Admin (matched against `SSO_IDENTIFIER_FIELD`) | `10001` |
| `SUPER_ADMIN_USERNAME`   | Display name                              | `Super Admin`    |
| `SUPER_ADMIN_EMAIL`      | Email                                     | _(empty)_        |
| `SUPER_ADMIN_GROUP_NAME` | Group that grants admin privileges        | `ADMINISTRATORS` |

#### Security & Rate Limiting (`.env.config.<env>`)

| Variable               | Purpose                                         | Nonprod                         | Prod                     | Default  |
| :--------------------- | :---------------------------------------------- | :------------------------------ | :----------------------- | :------- |
| `CORS_ORIGIN`          | Allowed origin(s), comma-separated              | route URL + `http://localhost:5173` | production route URL | allow-all in nonprod, deny in preprod/prod |
| `RATE_LIMIT_MAX`       | Max requests per IP per window                  | `10000`                         | `100`                    | `100`    |
| `RATE_LIMIT_WINDOW_MS` | Rate limit window (ms)                          | `900000`                        | `900000`                 | `900000` |

#### Background Jobs

| Variable                     | Purpose                                                              | Nonprod     | Prod           | Default        |
| :--------------------------- | :------------------------------------------------------------------- | :---------- | :------------- | :------------- |
| `SHIFT_REPORT_CRON_SCHEDULE` | Cron expression for the in-process shift report generator            | `* * * * *` | `*/10 * * * *` | `*/10 * * * *` |
| `ENABLE_IN_PROCESS_CRON`     | Set to `true` to run the generator inside the API process (dev only) | _(optional)_ | _(unset)_     | disabled       |

### Client variables (`env/client/.env.<env>`)

Vite reads these from `env/client/` (`envDir`). They are **public** and baked into the bundle at build time. Vite loads `.env.<env>` only when run with a matching `--mode`, e.g. `npx vite build --mode prod`. The default `dev`/`build` scripts use Vite's `development`/`production` modes and fall back to the defaults below. Shell-level `VITE_*` variables, such as the Docker build args, are always picked up.

| Variable                 | Purpose                                       | Nonprod  | Prod    | Default        |
| :----------------------- | :-------------------------------------------- | :------- | :------ | :------------- |
| `VITE_APP_ENV`           | Client environment (`nonprod`/`preprod`/`prod`) | `nonprod` | `prod` | `nonprod`     |
| `VITE_API_URL`           | API base URL (relative path or absolute URL)  | `/api`   | `/api`  | `/api`         |
| `VITE_ENABLE_DEBUG_LOGS` | Verbose client logging                        | `true`   | `false` | on in nonprod  |
| `VITE_APP_VERSION`       | UI version label                              | —        | —       | `client/package.json` version |

> Note: `vite.config.ts` always sets `VITE_APP_VERSION` from `client/package.json`, so to change the displayed version, bump that file.

---

## 🚀 Running in Development (Nonprod)

**Prerequisites:** Node.js 24+, npm, and a reachable MongoDB instance.

1. **Install dependencies (from the repo root):**

   ```bash
   npm install
   ```

2. **Create env files from the templates:**

   ```bash
   cp env/server/.env.config.nonprod.example env/server/.env.config.nonprod
   cp env/server/.env.secret.nonprod.example env/server/.env.secret.nonprod
   cp env/client/.env.nonprod.example        env/client/.env.nonprod
   ```

   Set `MONGO_URI`, the `SSO_*` credentials, and `SUPER_ADMIN_*` in `.env.secret.nonprod`. For local development, set `SSO_REDIRECT_URI=http://localhost:5173/auth/callback`. Personal overrides can go in `env/server/.env.nonprod.local`.

3. **Start client + server together:**

   ```bash
   npm run dev
   ```

   - Client: `http://localhost:5173` (Vite proxies `/api` → `http://localhost:5000`)
   - Server: `http://localhost:5000`

4. **Seed and migrate the database (optional):**

   `server/src/scripts/seed.ts` is git-ignored. Create it from the example first, or run the example directly:

   ```bash
   cp server/src/scripts/seed.example.ts server/src/scripts/seed.ts
   npm run seed          # Wipes and seeds the nonprod DB
   npm run seed:example  # Runs the committed example seed directly
   npm run migrate:up    # Applies pending migrations
   ```

   Seeding is blocked outside `nonprod` unless `--force-production` is passed. `seed.ts` also supports `--idempotent`, which skips seeding if the admin group or user already exists.

### Available root scripts

| Script                         | Description                                          |
| :----------------------------- | :--------------------------------------------------- |
| `npm run dev`                  | Run server (nodemon + tsx) and client (Vite) together |
| `npm run dev:seed`             | Same as `dev`, plus run the seed script              |
| `npm run client` / `server`    | Run a single workspace in dev mode                   |
| `npm run build`                | Build client (`tsc -b && vite build`) then server (`tsc`) |
| `npm start`                    | Start the server                                     |
| `npm test`                     | Run client (Vitest) and server (`node --test`) tests |
| `npm run test:client` / `test:server` | Run one test suite                            |
| `npm run seed` / `seed:example`| Seed the database                                    |
| `npm run cron:shift-report`    | Run the shift report generator once (standalone worker) |
| `npm run migrate:up` / `down` / `status` | Manage database migrations                 |

Workspace-only scripts: `npm run lint --workspace=client` and `npm run typecheck --workspace=server`.

---

## 🗄️ Database Migrations (`migrate-mongo`)

Index lifecycle, schema changes, and data backfills are managed with `migrate-mongo`. Applied migrations are recorded in MongoDB's `changelog` collection. The config (`server/src/migrations/migrate-mongo-config.ts`) resolves `MONGO_URI` using the same env file hierarchy as the server.

```bash
npm run migrate:up       # Apply all pending migrations
npm run migrate:down     # Roll back the most recent migration
npm run migrate:status   # Show migration status
npm run migrate:create --workspace=server -- <migration-name>   # New migration in server/src/migrations/
```

---

## ⏱️ Shift Report Generator

Shift reports are generated automatically for each group's time slots based on the active schedule (timezone `Asia/Jerusalem`). There are two ways to run the generator:

- **Production:** a dedicated Kubernetes **CronJob** (`k8s/cronjob.yaml`) runs the standalone worker (`src/scripts/runShiftReportCron.js`) every minute. The worker connects, generates reports, disconnects, and exits.
- **Local:** run it once with `npm run cron:shift-report`, or set `ENABLE_IN_PROCESS_CRON=true` to schedule it inside the API process on `SHIFT_REPORT_CRON_SCHEDULE`.

In-process scheduling is disabled by default so that multiple API replicas don't generate duplicate reports.

---

## 🚢 Deployment

### Option A: Standard Node.js Host

```bash
cp env/server/.env.config.prod.example env/server/.env.config.prod
cp env/server/.env.secret.prod.example env/server/.env.secret.prod
cp env/client/.env.prod.example        env/client/.env.prod
# fill in MONGO_URI, JWT_SECRET, SSO_*, SUPER_ADMIN_* (use preprod files for staging)

npm run build        # Build the SPA bundle and compile the server
npm run migrate:up   # Apply migrations / ensure indexes
npm start            # Launch the server (serves API + SPA)
```

### Option B: Container (Docker / OpenShift / Kubernetes)

The multi-stage [`Dockerfile`](Dockerfile) (base image `node:24-alpine`) builds the client and server. It then packages the compiled server (`/app/server`) and SPA (`/app/client/dist`) into a single image that:

- installs production dependencies only,
- runs as non-root UID `1001` with group-0 permissions (OpenShift **`restricted-v2`** SCC compatible),
- uses `dumb-init` as PID 1 for graceful `SIGTERM` handling,
- exposes port `5000`.

```bash
# Build
docker build \
  --build-arg VITE_APP_ENV=prod \
  --build-arg VITE_API_URL=/api \
  -t hunting-lodge-app:prod .

# Run locally
docker run -d -p 5000:5000 \
  --env-file env/server/.env.config.prod \
  --env-file env/server/.env.secret.prod \
  -e STATIC_FILES_PATH=/app/client/dist \
  --name hunting-lodge hunting-lodge-app:prod
```

#### Kubernetes / OpenShift manifests (`k8s/`)

| File                       | Contents                                                                 |
| :------------------------- | :----------------------------------------------------------------------- |
| `nonprod-deployment.yaml`  | Deployment, Service, Route, ConfigMap & Secret templates for nonprod      |
| `preprod-deployment.yaml`  | Staging manifest with production parity                                  |
| `prod-deployment.yaml`     | Production manifest (2+ replicas, pod anti-affinity, zero-downtime rolling updates) |
| `cronjob.yaml`             | Shift report generator CronJob                                           |
| `seed-job.yaml`            | One-off Job running `seed.js --idempotent`                               |

Placeholders like `<NAMESPACE>`, `<YOUR_NAMESPACE>`, and `<YOUR_DEPLOYMENT>` must be substituted before applying. The CI pipeline does this automatically for the deployment manifests.

#### CI/CD (`.gitlab-ci.yml`)

1. **`validate`**: `npm ci`, server and client tests, and a full build.
2. **`deploy`**: builds the image, pushes it to the OpenShift internal registry, applies `k8s/<env>-deployment.yaml`, pins the immutable image tag, and waits for the rollout.

Target environment is selected by branch:

| Trigger                         | Environment |
| :------------------------------ | :---------- |
| `main` branch or `v*` tag       | `prod`      |
| `release/*` branch              | `preprod`   |
| `development` branch            | `nonprod`   |
| Manual run with `ENVIRONMENT_INPUT` | as specified |

Required CI variables: `KUBECONFIG_DATA` (base64) and `OPENSHIFT_TOKEN`. Optional: `OPENSHIFT_REGISTRY`, `OPENSHIFT_SERVER`, `OPENSHIFT_USER`, `PROD_NAMESPACE`, `PREPROD_NAMESPACE`, `NONPROD_NAMESPACE`.

---

## 📮 API

- **Published Postman Docs:** [View API Documentation](https://documenter.getpostman.com/view/52098464/2sBYHQ12XM)

Authenticated requests use the httpOnly `hunting_token` session cookie set at login, or an `Authorization: Bearer <token>` header.

| Postman variable | Example                     | Description                            |
| :--------------- | :-------------------------- | :------------------------------------- |
| `baseUrl`        | `http://localhost:5000/api` | Base URL for API requests              |
| `authToken`      | `your_bearer_token`         | JWT obtained after SSO login           |

### Endpoints overview

- **Health probes:** `GET /healthz` (liveness), `GET /api/health` (readiness, checks DB), `GET /startup` and `/api/startup` (startup).
- **Auth (`/api/auth`):** `GET /sso-url`, `POST /login` (OIDC code exchange), `POST /refresh`, `POST /logout`, `GET /me`.
- **Users (`/api/users`):** listing, role and group updates, favorites, admin management.
- **Groups (`/api/groups`):** groups, members, shift types, time slots, notification recipients.
- **Schedules (`/api/schedules`):** schedule retrieval, editing, and publishing.
- **Reports (`/api/reports`):** shift report CRUD and queries.
- **Sites (`/api/sites`):** site CRUD and favorites.
- **Phones (`/api/phones`):** phone directory CRUD.
- **Vacations (`/api/vacations`):** submission, manager approval, and balance aggregation.

---

## 🧪 Testing

```bash
npm test              # all tests
npm run test:server   # server: node --test (config, controllers, migrations, SSO flow, security, health probes, ...)
npm run test:client   # client: Vitest + Testing Library (pages, dialogs, accessibility, contexts, ...)
```

---

## 📜 License

This project is licensed under the ISC License.
