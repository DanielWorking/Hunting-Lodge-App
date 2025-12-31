require("dotenv").config();

module.exports = {
    issuerUrl: process.env.SSO_ISSUER_URL,
    clientId: process.env.SSO_CLIENT_ID,
    clientSecret: process.env.SSO_CLIENT_SECRET,
    redirectUri: process.env.SSO_REDIRECT_URI,
    // הגדרת ה-Scope הנדרש (בדרך כלל openid profile email)
    scope: "openid profile email",
};
