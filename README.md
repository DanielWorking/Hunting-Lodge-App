# Hunting Lodge App

A comprehensive full-stack management application designed for organizing operational groups, shifts, sites, and resources. This project utilizes a modern **MERN stack** (MongoDB, Express, React, Node.js) with **TypeScript** and **SSO Authentication**.

## 🚀 Features

- **User Authentication:** Secure login via Single Sign-On (SSO) integration with OpenID Connect (OIDC).
- **Role-Based Access:** Protected routes and specific views for Guests, Users, Shift Managers, and System Administrators.
- **Site Management:** View and manage operational sites and direct links.
- **Phone Directory:** Manage and view phone details associated with the organization.
- **Shift Management:**
  - Interactive **Shift Schedule** planning and publishing.
  - Detailed **Shift Reports** submission and viewing.
- **Group Settings:** Configuration for different operational groups (shift types, time slots, notification recipients).
- **Admin Dashboard:** User management and administrative controls with system account protection.
- **Responsive UI:** Built with Material UI (MUI) for a seamless experience across devices.

## 🛠 Tech Stack

### Client (Frontend)

- **Framework:** React 19 (via Vite)
- **Language:** TypeScript
- **UI Library:** Material UI (@mui/material v7) + Emotion
- **State/Routing:** React Router Dom v7, Context API
- **HTTP Client:** Axios
- **Utilities:** date-fns (Date manipulation)

### Server (Backend)

- **Runtime:** Node.js
- **Framework:** Express v5
- **Database:** MongoDB (via Mongoose v9)
- **Authentication:** openid-client (SSO / OIDC)
- **Environment:** Dotenv + Centralized Config & Validation

---

## ⚙️ Environment Configuration (Dev vs. Prod)

The codebase has complete separation between **Development** and **Production** environments with zero code modifications needed when deploying.

### Quick Reference: Development vs. Production Variables

#### 1. Runtime & Server Networking
| Variable Name | Workspace | Purpose | Development Mode (Local / Auth0) | Production Mode (Enterprise / Cloud) | Required in Prod? |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `NODE_ENV` | Server | Specifies application runtime mode | `development` | `production` | **Yes** |
| `APP_ENV` | Server | Target application environment (`nonprod` / `preprod` / `prod`) | `nonprod` | `prod` (or `preprod`) | **Yes** |
| `PORT` | Server | Express HTTP server listen port | `5000` | `5000` (or host/container port) | Optional (Default: 5000) |
| `TRUST_PROXY` | Server | Reverse proxy hop count for IP rate limiting | `1` | `1` (or proxy count / subnet) | Optional (Default: 1) |
| `STATIC_FILES_PATH` | Server | Path to compiled client frontend assets | `../client/dist` (default) | `/app/client/dist` | Optional |
| `ENV_FILE` | Server | Custom path to load environment variables from | `.env.nonprod` | `/etc/secrets/.env` | Optional |

#### 2. Database Connection & Pool Tuning
| Variable Name | Workspace | Purpose | Development Mode (Local / Auth0) | Production Mode (Enterprise / Cloud) | Required in Prod? |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `MONGO_URI` | Server | MongoDB connection string | Local MongoDB / Dev Atlas | Production MongoDB replica set URI | **Yes** |
| `MONGO_AUTO_INDEX` | Server | Automatic index build on startup | `true` | `false` (handled via migrations) | Optional (Default: false) |
| `MONGO_MAX_POOL_SIZE` | Server | Maximum concurrent connections in pool | `10` | `50` | Optional (Default: 50) |
| `MONGO_MIN_POOL_SIZE` | Server | Minimum idle connections in pool | `2` | `10` | Optional (Default: 10) |
| `MONGO_SERVER_SELECTION_TIMEOUT_MS` | Server | Replica set discovery/selection timeout | `5000` | `5000` | Optional (Default: 5000) |
| `MONGO_SOCKET_TIMEOUT_MS` | Server | Inactive socket timeout | `45000` | `45000` | Optional (Default: 45000) |
| `MONGO_HEARTBEAT_FREQUENCY_MS` | Server | SDAM server monitor heartbeat frequency | `10000` | `10000` | Optional (Default: 10000) |
| `MONGO_CONNECT_TIMEOUT_MS` | Server | Initial TCP connection handshake timeout | `30000` | `30000` | Optional (Default: 30000) |
| `MONGO_MAX_IDLE_TIME_MS` | Server | Connection idle time before socket reap | `60000` | `60000` | Optional (Default: 60000) |

#### 3. Single Sign-On (SSO / OIDC)
| Variable Name | Workspace | Purpose | Development Mode (Local / Auth0) | Production Mode (Enterprise / Cloud) | Required in Prod? |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `SSO_ISSUER_URL` | Server | OpenID Connect (OIDC) Issuer Base URL | `https://dev-xxx.us.auth0.com` | `https://sso.corp.local` / Okta / Azure AD | **Yes** |
| `SSO_CLIENT_ID` | Server | SSO Client Application ID | Auth0 Dev App Client ID | Enterprise App Client ID | **Yes** |
| `SSO_CLIENT_SECRET` | Server | SSO Client Secret key | Auth0 Dev Client Secret | Enterprise App Secret | **Yes** |
| `SSO_REDIRECT_URI` | Server | OAuth2 redirect/callback URL | `http://localhost:5173/auth/callback` | `https://huntinglodge.corp.domain/auth/callback` | **Yes** |
| `SSO_IDENTIFIER_FIELD` | Server | Claim used for user identity matching | `email` (Dev / Auth0) | `username` (AD / Smartcard / SSO) | **Yes** |

#### 4. JWT Authentication
| Variable Name | Workspace | Purpose | Development Mode (Local / Auth0) | Production Mode (Enterprise / Cloud) | Required in Prod? |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `JWT_SECRET` | Server | High-entropy key for signing session tokens | Local dev secret | High-entropy secret (e.g. openssl rand) | **Yes** |
| `JWT_EXPIRES_IN` | Server | Session token validity duration | `7d` | `7d` | Optional (Default: 7d) |

#### 5. Super Admin Identity & Access (Server-Only Secrets)
| Variable Name | Workspace | Purpose | Development Mode (Local / Auth0) | Production Mode (Enterprise / Cloud) | Required in Prod? |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `SUPER_ADMIN_ID` | Server | Unique ID of system Super Admin (Never exposed to client) | `10001` (or local test ID) | Enterprise Active Directory User ID | **Yes** |
| `SUPER_ADMIN_USERNAME` | Server | Display name for system Super Admin | `"Super Admin"` | `"Production Super Admin"` | Optional |
| `SUPER_ADMIN_EMAIL` | Server | Email address for system Super Admin | `admin@example.com` | `admin@organization.local` | Optional |
| `SUPER_ADMIN_GROUP_NAME` | Server | Name of group granting Admin privileges (Server-only) | `ADMINISTRATORS` | `ADMINISTRATORS` (or org group) | **Yes** |

#### 6. Security & Rate Limiting
| Variable Name | Workspace | Purpose | Development Mode (Local / Auth0) | Production Mode (Enterprise / Cloud) | Required in Prod? |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `CORS_ORIGIN` | Server | Allowed CORS frontend origin | `http://localhost:5173` | `https://your-production-app-url.com` | Recommended |
| `RATE_LIMIT_MAX` | Server | Max API requests per IP in window | `10000` | `100` (Strict DDoS protection) | Optional (Default: 100) |
| `RATE_LIMIT_WINDOW_MS` | Server | Rate limit sliding window (ms) | `900000` (15 min) | `900000` (15 min) | Optional |

#### 7. Background Jobs & Observability
| Variable Name | Workspace | Purpose | Development Mode (Local / Auth0) | Production Mode (Enterprise / Cloud) | Required in Prod? |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `SHIFT_REPORT_CRON_SCHEDULE` | Server | Cron schedule for automated shift report generation | `* * * * *` | `* * * * *` | Optional (Default: `* * * * *`) |
| `LOG_FORMAT` | Server | Morgan HTTP access logger format | `dev` | `combined` | Optional (Default: dev / combined) |

#### 8. Client Application (Vite Frontend)
| Variable Name | Workspace | Purpose | Development Mode (Local / Auth0) | Production Mode (Enterprise / Cloud) | Required in Prod? |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `VITE_APP_VERSION` | Client | UI version override (defaults to package.json) | `1.0.0` (optional override) | `1.0.0` (optional override) | Optional |
| `VITE_API_URL` | Client | Base URL for API calls | `/api` | `/api` or full API URL | Optional (Default: `/api`) |


---

## 🚀 Running in Development (Nonprod)

1. **Install dependencies in root:**

   ```bash
   npm install
   ```

2. **Configure Nonprod Environment:**
   - Backend: Copy `env/server/.env.nonprod.example` to `env/server/.env.nonprod` (or `env/server/.env.nonprod.local`) and adjust credentials if needed:
     ```bash
     cp env/server/.env.nonprod.example env/server/.env.nonprod
     ```
   - Frontend: Copy `env/client/.env.nonprod.example` to `env/client/.env.nonprod`:
     ```bash
     cp env/client/.env.nonprod.example env/client/.env.nonprod
     ```

3. **Start Dev Servers (Frontend + Backend concurrently):**

   ```bash
   npm run dev
   ```

   - Client runs on: `http://localhost:5173`
   - Server runs on: `http://localhost:5000`

4. **(Optional) Seed Initial Dev Database or Run Migrations:**
   ```bash
   npm run seed       # Seeds development test data (resets dev DB)
   npm run migrate:up # Applies pending database migrations
   ```

---

## 🗄️ Database Migrations (`migrate-mongo`)

Database schema evolutions, index lifecycle, and data transformations are managed safely via `migrate-mongo`. Migration history is recorded in MongoDB's `changelog` collection. Connection strings are resolved automatically based on `APP_ENV` (`.env.nonprod`, `.env.preprod`, `.env.prod`).

### Available Commands:

- **Apply all pending migrations:**
  ```bash
  npm run migrate:up
  ```
- **Roll back the most recent migration:**
  ```bash
  npm run migrate:down
  ```
- **Check migration status:**
  ```bash
  npm run migrate:status
  ```
- **Create a new migration file:**
  ```bash
  npm run migrate:create <migration-name>
  ```
  _(Creates a new timestamped migration file in `server/migrations/`)_

---

## 🚢 Tri-Environment Deployment Architecture (Nonprod, Preprod, Prod)

The project supports three distinct online deployment environments:
- **`nonprod`**: Development and integration environment (allows local dev tooling, loose CORS for dev loopbacks).
- **`preprod`**: Staging and QA parity environment (mirrors production security, strict whitelists, separate staging database).
- **`prod`**: Live production environment (strict CORS whitelist with zero wildcard reflection, high pool limits, stack trace suppression).

### Option A: Standard Node.js Host

1. **Configure Server Environment:**
   - Copy `env/server/.env.prod.example` to `env/server/.env.prod` (or use `.env.preprod` for staging):
     ```bash
     cp env/server/.env.prod.example env/server/.env.prod
     ```
   - Fill in your production values (`MONGO_URI`, `JWT_SECRET`, `SSO_*`, `SUPER_ADMIN_*`).

2. **Configure Client Environment:**
   - Copy `env/client/.env.prod.example` to `env/client/.env.prod` (or `.env.preprod`):
     ```bash
     cp env/client/.env.prod.example env/client/.env.prod
     ```
   - Adjust `VITE_API_URL` if serving API from a separate domain.

3. **Build, Migrate & Launch:**
   ```bash
   npm run build       # Build React SPA bundle & TypeScript server
   npm run migrate:up  # Apply pending database migrations & ensure indexes
   npm start           # Launch server
   ```

---

### Option B: Containerized Deployment (Docker & OpenShift / Kubernetes)

The repository provides an enterprise-ready, multi-stage [`Dockerfile`](file:///Dockerfile) that compiles the React SPA and packages it alongside the Express backend into a single non-root container compliant with **OpenShift `restricted-v2` Security Context Constraints (SCC)**.

#### 1. Build Container Image

```bash
docker build -t hunting-lodge-app:latest .
```

_Optional build arguments for environment customization:_

```bash
docker build \
  --build-arg VITE_APP_ENV=prod \
  --build-arg VITE_API_URL=/api \
  --build-arg VITE_APP_VERSION=1.0.0 \
  -t hunting-lodge-app:prod .
```

#### 2. Run Container Locally (Testing)

```bash
docker run -d \
  -p 5000:5000 \
  --env-file env/server/.env.prod \
  --name hunting-lodge \
  hunting-lodge-app:prod
```

#### 3. Kubernetes / OpenShift Deployment Manifests

Tri-environment deployment manifests are located in `k8s/`:
- `k8s/nonprod-deployment.yaml`: Deployment, Service, Route, ConfigMap & Secret templates for nonprod.
- `k8s/preprod-deployment.yaml`: Staging & QA deployment manifest with production parity.
- `k8s/prod-deployment.yaml`: Production deployment manifest with high availability replicas and strict resource limits.

Continuous deployment automation across all 3 environments is defined in `.github/workflows/cd.yml`.

---

## 📮 API Documentation & Postman

The backend REST API can be tested and explored using Postman or any standard HTTP client.

### 🔗 Postman Documentation

- **Published Postman Docs:** [View API Documentation](https://documenter.getpostman.com/view/52098464/2sBYAsxrnC)

### 🔑 Environment Setup

Configure the following variables in your Postman environment:

| Variable    | Example / Default           | Description                                       |
| :---------- | :-------------------------- | :------------------------------------------------ |
| `baseUrl`   | `http://localhost:5000/api` | Base endpoint URL for all API requests            |
| `authToken` | `your_bearer_token`         | JWT authentication token obtained after SSO login |

### 📂 API Endpoints Overview

- **Authentication (`/api/auth`)**: SSO callback, session verification (`/api/auth/me`), and logout.
- **Users (`/api/users`)**: User listings, role updates, group assignments, and admin management.
- **Groups (`/api/groups`)**: Operational groups, shift types, time slots, and notification recipients.
- **Schedules (`/api/schedules`)**: Monthly/weekly shift schedule retrieval, editing, and publishing.
- **Reports (`/api/reports`)**: Shift report submission, incident logging, and querying.
- **Sites (`/api/sites`)**: Operational sites, descriptions, and resource links.
- **Phones (`/api/phones`)**: Emergency and organizational phone directory entries.

---

## 📜 License

This project is licensed under the ISC License.
