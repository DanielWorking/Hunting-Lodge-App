/**
 * @module AuthRoutes
 * 
 * Routes for user authentication via OpenID Connect (OIDC).
 */

const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");

/**
 * GET /sso-url
 * 
 * Generates the authorization URL for the SSO provider.
 * The frontend uses this URL to redirect the user to the SSO login page.
 * 
 * @name getSsoUrl
 * @route {GET} /sso-url
 */
router.get("/sso-url", authController.getSsoUrl);

/**
 * POST /login
 * 
 * Completes the SSO authentication flow using an authorization code.
 * Exchanges the code for tokens, retrieves user claims, and manages 
 * user synchronization with the local database.
 * 
 * @name login
 * @route {POST} /login
 */
router.post("/login", authController.login);

module.exports = router;
