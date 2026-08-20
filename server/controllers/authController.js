/**
 * @module AuthController
 * 
 * Handles user authentication via OpenID Connect (OIDC).
 * Integrates with an external SSO provider to manage user logins,
 * automatic user provisioning, and session identification.
 */

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
 * Generates the authorization URL for the SSO provider.
 * The frontend uses this URL to redirect the user to the SSO login page.
 */
exports.getSsoUrl = async (req, res) => {
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
};

/**
 * Completes the SSO authentication flow using an authorization code.
 * Exchanges the code for tokens, retrieves user claims, and manages 
 * user synchronization with the local database.
 */
exports.login = async (req, res) => {
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
        const identifierMode = process.env.SSO_IDENTIFIER_FIELD || "email";
        console.log(`⚙️ Auth Mode: ${identifierMode}`);

        let dbUsername; // Unique identifier to be saved in the username field
        let dbDisplayName; // Name to be saved in the displayName field
        let dbEmail; // Email to be saved in the email field
        let searchCriteria; // DB search criteria

        // Full name display from SSO claims, with fallback to nickname or username
        dbDisplayName = claims.name || claims.nickname;
        dbEmail = claims.email || "";

        if (identifierMode === "username") {
            // --- Production / Organizational mode (Card / Smartcard / AD SSO) ---
            dbUsername = claims.preferred_username || claims.nickname || claims.sub;
            if (!dbDisplayName) {
                dbDisplayName = dbUsername;
            }
            if (!dbEmail && dbUsername) {
                dbEmail = `${dbUsername}@organization.local`;
            }
            searchCriteria = { username: dbUsername };
        } else {
            // --- Development / Home mode (Auth0 / Google OAuth2) ---
            dbUsername = claims.email || claims.preferred_username || claims.nickname || claims.sub;
            if (!dbDisplayName) {
                dbDisplayName = claims.name || claims.nickname || dbUsername;
            }
            searchCriteria = { email: claims.email || dbUsername };
        }

        console.log(`🔍 Searching user by:`, searchCriteria);

        // --- Business logic ---
        let user = await User.findOne(searchCriteria);

        if (user) {
            console.log(`✅ User found: ${user.username}`);
            if (!user.isActive) {
                user.isActive = true;
            }
            if (dbDisplayName && (!user.displayName || user.displayName === user.username)) {
                user.displayName = dbDisplayName;
            }
            if (dbEmail && !user.email) {
                user.email = dbEmail;
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
                email: dbEmail,
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
};
