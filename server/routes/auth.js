/**
 * @module AuthRoutes
 * 
 * Handles user authentication via OpenID Connect (OIDC).
 * Integrates with an external SSO provider to manage user logins,
 * automatic user provisioning, and session identification.
 */

const express = require("express");
const router = express.Router();

// We import the entire library and extract the Issuer manually for testing
const openIdClient = require("openid-client");
const { Issuer } = openIdClient;

console.log("🔍 Checking openid-client version compatibility:");
console.log("Issuer exists?", !!Issuer); // If false, the version is incorrect

const User = require("../models/User");
const ssoConfig = require("../config/sso");

/** @type {Object | null} Cached OIDC client instance to avoid repeated discoveries. */
let client;

/**
 * Initializes or retrieves the cached OIDC client.
 * 
 * Performs dynamic discovery of the SSO issuer's configuration 
 * and instantiates a client with the project's credentials.
 * 
 * @returns {Promise<Object>} The initialized OIDC client instance.
 * @throws {Error} If issuer discovery or client initialization fails.
 */
async function getClient() {
    if (client) return client;

    console.log("🔄 Discovering SSO Issuer:", ssoConfig.issuerUrl);
    const issuer = await Issuer.discover(ssoConfig.issuerUrl);

    client = new issuer.Client({
        client_id: ssoConfig.clientId,
        client_secret: ssoConfig.clientSecret,
        redirect_uris: [ssoConfig.redirectUri],
        response_types: ["code"],
    });

    return client;
}

/**
 * GET /sso-url
 * 
 * Generates the authorization URL for the SSO provider.
 * The frontend uses this URL to redirect the user to the SSO login page.
 * 
 * @name getSsoUrl
 * @route {GET} /sso-url
 * @returns {Object} 200 - An object containing the generated SSO URL.
 * @returns {Error}  500 - Internal server error if URL generation fails.
 */
router.get("/sso-url", async (req, res) => {
    try {
        const ssoClient = await getClient();

        const url = ssoClient.authorizationUrl({
            scope: ssoConfig.scope,
            // state or nonce can be added here for increased security in the future
        });

        res.json({ url });
    } catch (error) {
        console.error("❌ Error generating SSO URL:", error);
        res.status(500).json({ message: "Failed to generate SSO URL" });
    }
});

/**
 * POST /login
 * 
 * Completes the SSO authentication flow using an authorization code.
 * Exchanges the code for tokens, retrieves user claims, and manages 
 * user synchronization with the local database.
 * 
 * @name login
 * @route {POST} /login
 * @bodyparam {string} code - The authorization code returned by the SSO provider.
 * @returns {Object} 200 - The authenticated User object.
 * @returns {Error}  400 - If the authorization code is missing.
 * @returns {Error}  401 - If SSO authentication or user synchronization fails.
 */
router.post("/login", async (req, res) => {
    try {
        const { code } = req.body;
        if (!code)
            return res
                .status(400)
                .json({ message: "Authorization code missing" });

        const ssoClient = await getClient();

        const tokenSet = await ssoClient.callback(
            ssoConfig.redirectUri,
            { code },
            {},
        );

        // Extract user details from the token
        const claims = tokenSet.claims();
        console.log("👤 SSO User Claims:", claims);

        // Read configuration from environment variables
        const identifierMode = process.env.SSO_IDENTIFIER_FIELD;
        console.log(`⚙️ Auth Mode: ${identifierMode}`);

        let dbUsername; // Unique identifier to be saved in the username field
        let dbDisplayName; // Name to be saved in the displayName field
        let searchCriteria; // DB search criteria

        dbUsername = claims.preferred_username;
        dbDisplayName = claims.name;

        if (identifierMode === "username") {
            // --- Organizational mode ---
            searchCriteria = { username: dbUsername };
        } else {
            // --- Development/Home mode (connection by email) ---
            searchCriteria = { email: claims.email };
        }

        console.log(`🔍 Searching user by:`, searchCriteria);

        // --- Business logic ---
        let user = await User.findOne(searchCriteria);

        if (user) {
            console.log(`✅ User found: ${user.username}`);
            if (!user.isActive) {
                user.isActive = true;
            }
            user.lastLogin = new Date().toISOString();

            await user.save();
        } else {
            console.log(
                `🆕 Creating new user: ${dbUsername} (${dbDisplayName})`,
            );
            user = new User({
                username: dbUsername,
                displayName: dbDisplayName,
                email: claims.email,
                isActive: true,
                groups: [],
                lastLogin: new Date().toISOString(),
            });
            await user.save();
        }

        res.json(user);
    } catch (error) {
        console.error("❌ SSO Login Error:", error);
        // Added full error message printing for debugging
        res.status(401).json({
            message: "SSO Authentication failed",
            error: error.message,
        });
    }
});

module.exports = router;
