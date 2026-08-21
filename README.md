# Hunting Lodge App

A comprehensive full-stack management application designed for organizing operational groups, shifts, sites, and resources. This project utilizes a modern **MERN stack** (MongoDB, Express, React, Node.js) with **TypeScript** and **SSO Authentication**.

## 🚀 Features

* **User Authentication:** Secure login via Single Sign-On (SSO) integration with OpenID Connect (OIDC).
* **Role-Based Access:** Protected routes and specific views for Guests, Users, Shift Managers, and System Administrators.
* **Site Management:** View and manage operational sites and direct links.
* **Phone Directory:** Manage and view phone details associated with the organization.
* **Shift Management:**
    * Interactive **Shift Schedule** planning and publishing.
    * Detailed **Shift Reports** submission and viewing.
* **Group Settings:** Configuration for different operational groups (shift types, time slots, notification recipients).
* **Admin Dashboard:** User management and administrative controls with system account protection.
* **Responsive UI:** Built with Material UI (MUI) for a seamless experience across devices.

## 🛠 Tech Stack

### Client (Frontend)
* **Framework:** React 19 (via Vite)
* **Language:** TypeScript
* **UI Library:** Material UI (@mui/material v7) + Emotion
* **State/Routing:** React Router Dom v7, Context API
* **HTTP Client:** Axios
* **Utilities:** date-fns (Date manipulation)

### Server (Backend)
* **Runtime:** Node.js
* **Framework:** Express v5
* **Database:** MongoDB (via Mongoose v9)
* **Authentication:** openid-client (SSO / OIDC)
* **Environment:** Dotenv + Centralized Config & Validation

---

## ⚙️ Environment Configuration (Dev vs. Prod)

The codebase has complete separation between **Development** and **Production** environments with zero code modifications needed when deploying.

### Quick Reference: Development vs. Production Variables

| Variable Name | Workspace | Purpose | Development Mode (Local / Auth0) | Production Mode (Enterprise / Cloud) | Required in Prod? |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `NODE_ENV` | Server | Specifies application runtime environment | `development` | `production` | **Yes** |
| `PORT` | Server | Express HTTP server listen port | `5000` | `5000` (or host-assigned port) | Optional (Default: 5000) |
| `MONGO_URI` | Server | MongoDB connection string | Local MongoDB / Dev cluster | Production MongoDB replica set URI | **Yes** |
| `SSO_ISSUER_URL` | Server | OpenID Connect (OIDC) Issuer Base URL | `https://dev-xxx.us.auth0.com` | `https://sso.corp.local` / Okta / Azure AD | **Yes** |
| `SSO_CLIENT_ID` | Server | SSO Client Application ID | Auth0 Dev App Client ID | Enterprise App Client ID | **Yes** |
| `SSO_CLIENT_SECRET`| Server | SSO Client Secret key | Auth0 Dev Client Secret | Enterprise App Secret | **Yes** |
| `SSO_REDIRECT_URI` | Server | OAuth2 redirect/callback URL | `http://localhost:5173/auth/callback` | `https://huntinglodge.corp.domain/auth/callback` | **Yes** |
| `SSO_IDENTIFIER_FIELD` | Server | Claim used for user matching | `email` (Dev / Auth0) | `username` (AD / Smartcard / SSO) | **Yes** |
| `SUPER_ADMIN_ID` | Server | Unique ID of system Super Admin | `10001` (or dev user ID) | Enterprise Active Directory User ID (e.g. `s991024`) | **Yes** |
| `SUPER_ADMIN_USERNAME` | Server | Display name for system Super Admin | `"Super Admin"` | `"Admin Full Name"` | Optional |
| `SUPER_ADMIN_EMAIL`| Server | Email for system Super Admin | `admin@dev.local` | `admin@organization.local` | Optional |
| `SUPER_ADMIN_GROUP_NAME` | Server | Identifier of the protected Admin group | `ADMINISTRATORS` | `ADMINISTRATORS` (or org admin group) | **Yes** |
| `CORS_ORIGIN` | Server | Allowed CORS origin | `http://localhost:5173` | `https://huntinglodge.corp.domain` | Recommended |
| `RATE_LIMIT_MAX` | Server | Max API requests per 15-min window | `10000` | `100` (Strict DDoS protection) | Optional (Default: 100) |
| `RATE_LIMIT_WINDOW_MS` | Server | Rate limit window in ms | `900000` (15 min) | `900000` (15 min) | Optional |
| `VITE_SUPER_ADMIN_ID` | Client | UI Admin check (matches server) | `10001` | Enterprise User ID (matches server `SUPER_ADMIN_ID`) | **Yes** |
| `VITE_SUPER_ADMIN_GROUP_NAME` | Client | UI Admin group check (matches server) | `ADMINISTRATORS` | `ADMINISTRATORS` (matches server) | **Yes** |
| `VITE_API_URL` | Client | Base URL for API calls | `/api` | `/api` or `https://api.huntinglodge.corp.domain/api` | Optional (Default: `/api`) |
| `VITE_ENABLE_EMAIL_REPORTS` | Client | Feature flag: email report UI | `false` | `false` (Set `true` when internal SMTP is configured) | Optional (Default: `false`) |

---

## 🚀 Running in Development

1. **Install dependencies in root:**
   ```bash
   npm install
   ```

2. **Configure Development Environment:**
   * Backend: Copy `server/.env.development.example` to `server/.env.development` and adjust credentials if needed:
     ```bash
     cp server/.env.development.example server/.env.development
     ```
   * Frontend: Copy `client/.env.development.example` to `client/.env.development`:
     ```bash
     cp client/.env.development.example client/.env.development
     ```

3. **Start Dev Servers (Frontend + Backend concurrently):**
   ```bash
   npm run dev
   ```
   * Client runs on: `http://localhost:5173`
   * Server runs on: `http://localhost:5000`

4. **(Optional) Seed Initial Dev Database:**
   ```bash
   npm run seed
   ```

---

## 🚢 Deploying to Production (3 Simple Steps)

1. **Configure Server Environment:**
   * Copy `server/.env.production.example` to `server/.env.production` (or `server/.env`) on the server:
     ```bash
     cp server/.env.production.example server/.env.production
     ```
   * Fill in your production values (`MONGO_URI`, `SSO_*`, `SUPER_ADMIN_*`).

2. **Configure Client Environment:**
   * Copy `client/.env.production.example` to `client/.env.production` (or `client/.env`) on the build machine:
     ```bash
     cp client/.env.production.example client/.env.production
     ```
   * Set `VITE_SUPER_ADMIN_ID` and `VITE_SUPER_ADMIN_GROUP_NAME` matching your server configuration.

3. **Build & Launch:**
   ```bash
   npm run build
   npm start
   ```

---

## 📜 License
This project is licensed under the ISC License.
