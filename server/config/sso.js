/**
 * @module SSOConfig
 *
 * Configuration for Single Sign-On (SSO) authentication.
 * Values are primarily loaded from environment variables to maintain security.
 * This configuration is used by the authentication service to interact with
 * the OpenID Connect (OIDC) provider.
 */

require("dotenv").config();

/**
 * SSO Configuration object.
 *
 * @type {Object}
 * @property {string} issuerUrl    - The base URL of the identity provider (e.g., Auth0, Okta).
 * @property {string} clientId     - The unique identifier for this application in the identity provider.
 * @property {string} clientSecret - The secret key used for server-to-server communication with the IDP.
 * @property {string} redirectUri  - The URL where the IDP redirects the user after successful login.
 * @property {string} scope        - The requested permissions (standard OIDC scopes: openid, profile, email).
 */
module.exports = {
    issuerUrl: process.env.SSO_ISSUER_URL,
    clientId: process.env.SSO_CLIENT_ID,
    clientSecret: process.env.SSO_CLIENT_SECRET,
    redirectUri: process.env.SSO_REDIRECT_URI,
    scope: "openid profile email",
};
