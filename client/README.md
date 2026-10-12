# Hunting Lodge App — Client

React single-page application for the Hunting Lodge App. It is part of the root npm workspace. See the [root README](../README.md) for full-stack setup, environment configuration, and deployment.

## 🛠 Stack

- **React 19** + **Vite 7** + **TypeScript**
- **Material UI v7** (+ Icons) with Emotion, light/dark themes
- **React Router v7** with lazy-loaded, role-guarded routes
- **Axios** API client with cookie sessions and silent refresh
- **Tiptap v3** rich-text editor (shift reports)
- **date-fns** for dates
- **Vitest** + Testing Library (jsdom) for tests

## 🚀 Getting Started

Install dependencies from the **repo root** (workspaces share a single lockfile):

```bash
npm install
cp env/client/.env.nonprod.example env/client/.env.nonprod
```

Then run the client alone, or together with the API:

```bash
npm run dev --workspace=client   # client only → http://localhost:5173
npm run dev                      # client + server (from repo root)
```

The Vite dev server proxies `/api` to `http://localhost:5000`, so the API server must be running for anything past the login page.

## 📜 Scripts

Run these from `client/`, or from the root with `--workspace=client`:

| Script            | Description                                         |
| :---------------- | :-------------------------------------------------- |
| `npm run dev`     | Start the Vite dev server with HMR                  |
| `npm run build`   | Type-check (`tsc -b`) and build to `client/dist/`   |
| `npm run preview` | Serve the production build on port `4173`           |
| `npm run lint`    | Run ESLint                                          |
| `npm test`        | Run the Vitest suite once                           |

## ⚙️ Environment Variables

Vite loads env files from **`../env/client/`** (`envDir`), not from `client/`. All values are public and baked into the bundle at build time.

Vite loads `.env.<mode>` only for the **active mode**. The default scripts run in Vite's built-in modes (`development` for `dev`, `production` for `build`), so they **do not** load `.env.nonprod` or `.env.prod`. In that case the app derives its environment from the mode (`production` → `prod`, anything else → `nonprod`) and uses the defaults below. To use a specific env file, pass the mode explicitly:

```bash
npx vite --mode nonprod          # dev server with env/client/.env.nonprod
npx vite build --mode preprod    # build with env/client/.env.preprod
```

`VITE_*` variables set in the shell are also picked up. The Docker build uses this to pass `VITE_APP_ENV` and `VITE_API_URL` as build args.

| Variable                 | Description                                              | Default                       |
| :----------------------- | :------------------------------------------------------- | :---------------------------- |
| `VITE_APP_ENV`           | `nonprod` / `preprod` / `prod`                           | `nonprod`                     |
| `VITE_API_URL`           | API base URL, either a relative path or an absolute URL  | `/api`                        |
| `VITE_ENABLE_DEBUG_LOGS` | Verbose client logging                                   | `true` in nonprod             |
| `VITE_APP_VERSION`       | Version shown in the UI                                  | `client/package.json` version |

Values are validated in `src/config/apiConfig.ts` and exposed as a frozen, typed object from `src/config/env.ts`. Import from there; don't read `import.meta.env` directly.

> `vite.config.ts` always injects `VITE_APP_VERSION` from `package.json`, so bump the package version to change the displayed version.

## 📁 Structure

```
src/
├── main.tsx            # Provider tree: Router → User → Data → Notification → ColorMode
├── App.tsx             # Routes, lazy pages, ProtectedRoute / ShiftManagerRoute / AdminRoute
├── api/                # Axios instance (apiClient.ts) + per-resource API modules
├── config/             # Typed, validated env config
├── context/            # UserContext, DataContext, NotificationContext, ThemeContext
├── pages/              # Route-level pages
├── components/         # Shared components, dialogs, and feature subfolders
│   ├── admin/  phones/  settings/  modals/
├── theme/              # MUI theme (light/dark)
├── types/              # Shared TypeScript types
└── test/               # Vitest specs + setup.ts
```

### Routes

| Path              | Page                 | Access         |
| :---------------- | :------------------- | :------------- |
| `/login`          | `LoginPage`          | Public         |
| `/auth/callback`  | `SSOCallback`        | Public (OIDC redirect target) |
| `/guest`          | `GuestPage`          | Signed-in user with no groups |
| `/`               | `SitesPage`          | Authenticated  |
| `/phones`         | `PhonesPage`         | Authenticated  |
| `/schedule`       | `ShiftSchedulePage`  | Authenticated  |
| `/reports`        | `ShiftReportPage`    | Authenticated  |
| `/group-settings` | `GroupSettingsPage`  | Shift Manager  |
| `/admin/users`    | `AdminPage`          | Administrator  |
| `*`               | `NotFoundPage`       | —              |

Pages are loaded with `React.lazy`, and route guards show a loader while the session is being restored.

## 🔐 API Client & Auth

`src/api/apiClient.ts` exports a shared Axios instance that:

- uses `VITE_API_URL` as its base URL and sends credentials (`withCredentials`), relying on the server's httpOnly session cookie;
- on a `401`, calls `POST /auth/refresh` once (shared across concurrent requests) and retries the original request. If the refresh returns `401`/`403`, it clears the stored session keys;
- deduplicates identical in-flight `GET` requests.

UI-only state (selected group, user ID, per-user theme preference) is kept in `localStorage`. The session token itself is held in the server-set httpOnly cookie, not in `localStorage`.

## 📦 Build Output

The production build splits vendor code into separate chunks: `vendor-react`, `vendor-mui-core`, `vendor-mui-icons`, `vendor-emotion`, `vendor-tiptap`, `vendor-axios` and `vendor-date-fns`. Output goes to `dist/assets/{js,css,...}`. The Express server serves `client/dist` in production (`STATIC_FILES_PATH`).

## 🧪 Testing

Tests live in `src/test/` and run under jsdom with `@testing-library/jest-dom` matchers (`src/test/setup.ts`). They run serially (`fileParallelism: false`).

```bash
npm test --workspace=client
```

Coverage includes pages and dialogs, contexts, the API config, accessibility and heading structure, and request deduplication.
