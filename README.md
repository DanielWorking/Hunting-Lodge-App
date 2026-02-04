# Hunting Lodge App

A comprehensive full-stack management application designed for organizing operational groups, shifts, sites, and resources. This project utilizes a modern **MERN stack** (MongoDB, Express, React, Node.js) with **TypeScript** and **SSO Authentication**.

## 🚀 Features

* **User Authentication:** Secure login via Single Sign-On (SSO) integration with OpenID Connect.
* **Role-Based Access:** Protected routes and specific views for Guests, Users, and Admins.
* **Site Management:** View and manage operational sites.
* **Phone Directory:** Manage and view phone details associated with the organization.
* **Shift Management:** * Interactive **Shift Schedule** planning.
    * Detailed **Shift Reports** submission and viewing.
* **Group Settings:** Configuration for different operational groups.
* **Admin Dashboard:** User management and administrative controls.
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
* **Authentication:** openid-client (SSO)
* **Environment:** Dotenv

## 📂 Project Structure

```bash
├── client/          # Frontend application (Vite + React + TS)
│   ├── public/      # Static assets accessible directly (images, icons, favicon).
│   ├── src/
│   │   ├── components/  # Reusable UI components
│   │   ├── context/     # Global state (User, Theme, Notifications)
│   │   ├── pages/       # Application views/routes
│   │   └── theme/       # MUI Theme configuration
├── server/          # Backend API (Node.js + Express)
│   ├── config/          # Configuration files (SSO, DB)
│   ├── middleware/      # Custom Express middleware (e.g., authentication logic).
│   ├── models/          # Mongoose schemas (User, Site, Shift, etc.)
│   ├── routes/          # API endpoints
│   ├── .env             # Environment variables configuration (secrets, API keys, DB URI).
│   ├── index.js         # Main server entry point (App initialization, DB connection).
│   └── seed.js          # Database seeding script for populating initial data.
```

## 📖 API Documentation
The API for this project is documented using Postman. You can view the full list of endpoints, request examples, and expected responses here:

🔗 [View Postman API Documentation](https://daniel-reifer17-3583893.postman.co/workspace/0b8bf96d-e8ee-4217-8f44-f889e16733a0/collection/52098464-fd3b541a-ad9e-40a5-b809-78307b7eef83?action=share&source=copy-link&creator=52098464)

## ⚙️ Installation & Setup
### Prerequisites
* Node.js (v18+ recommended)
* MongoDB (Local instance or Atlas URI)
#### 1. Clone the repository
```
git clone [https://github.com/your-username/hunting-lodge-app.git]
cd hunting-lodge-app
```
#### 2. Backend Setup
Navigate to the server directory, install dependencies, and configure environment variables.
```
cd server
npm install
```
 **Environment Variables:** Create a .env file in the server directory based on .env.example:
```
# Server Config
PORT=5000
MONGO_URI=mongodb://localhost:27017/hunting_lodge_db

# SSO Configuration
SSO_ISSUER_URL=your_issuer_url
SSO_CLIENT_ID=your_client_id
SSO_CLIENT_SECRET=your_client_secret
SSO_REDIRECT_URI=http://localhost:5173/auth/callback
```
#### 3. Frontend Setup
Navigate to the client directory and install dependencies.
```
cd ../client
npm install
```

## 🏃‍♂️ Running the Application
To run the application locally, you need to start both the server and the client.
#### 1. Start the Backend Server:
```
cd server
npm run dev
# Server will run on http://localhost:5000
```
#### 2. Start the Frontend Client: Open a new terminal window:
```
cd client
npm run dev
# Client will run on http://localhost:5173 (or port assigned by Vite)
```

## 📜 License
This project is licensed under the ISC License.
