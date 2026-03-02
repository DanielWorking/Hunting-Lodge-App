const express = require("express");
const router = express.Router();

// אנחנו מייבאים את כל הספרייה ומחלצים את Issuer ידנית לבדיקה
const openIdClient = require("openid-client");
const { Issuer } = openIdClient;

console.log("🔍 Checking openid-client version compatibility:");
console.log("Issuer exists?", !!Issuer); // אם זה false, הגרסה לא נכונה

const User = require("../models/User");
const ssoConfig = require("../config/sso");

let client;

// פונקציית עזר לאתחול ה-Client (כי Discover היא פעולה אסינכרונית)
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

// 1. נתיב לקבלת כתובת ההתחברות (הפרונטנד יפנה לכאן)
router.get("/sso-url", async (req, res) => {
    try {
        const ssoClient = await getClient();

        const url = ssoClient.authorizationUrl({
            scope: ssoConfig.scope,
            // כאן אפשר להוסיף state או nonce לאבטחה מוגברת בעתיד
        });

        res.json({ url });
    } catch (error) {
        console.error("❌ Error generating SSO URL:", error);
        res.status(500).json({ message: "Failed to generate SSO URL" });
    }
});

// 2. נתיב ה-Login הראשי
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

        // שליפת פרטי המשתמש מתוך ה-Token
        const claims = tokenSet.claims();
        console.log("👤 SSO User Claims:", claims);

        const email = claims.email;

        // קריאת הקונפיגורציה מה-ENV (ברירת מחדל: email)
        const identifierMode = process.env.SSO_IDENTIFIER_FIELD || "email";
        console.log(`⚙️ Auth Mode: ${identifierMode}`);

        let ssoUsername;
        let searchCriteria;

        if (identifierMode === "username") {
            // --- מצב ארגוני (חיבור לפי שם משתמש) ---
            ssoUsername = claims.preferred_username;

            if (!ssoUsername) {
                return res.status(400).json({
                    message:
                        "SSO profile is missing 'preferred_username'. Please contact support.",
                });
            }

            // חיפוש מדויק לפי שם משתמש בלבד
            searchCriteria = { username: ssoUsername };
        } else {
            // --- מצב פיתוח/ביתי (חיבור לפי מייל) ---
            // במצב הזה שם המשתמש הוא המייל עצמו
            ssoUsername = email;

            // חיפוש לפי מייל
            searchCriteria = { email: email };
        }

        console.log(`🔍 Searching user by:`, searchCriteria);

        // --- לוגיקה עסקית ---
        let user = await User.findOne(searchCriteria);

        if (user) {
            console.log(`✅ User found: ${user.username}`);
            if (!user.isActive) {
                user.isActive = true;
            }
            user.lastLogin = new Date().toISOString();
            await user.save();
        } else {
            console.log(`🆕 Creating new Guest user: ${ssoUsername}`);
            user = new User({
                username: ssoUsername,
                email: email,
                isActive: true,
                groups: [],
                lastLogin: new Date().toISOString(),
                vacationBalance: 0,
            });
            await user.save();
        }

        res.json(user);
    } catch (error) {
        console.error("❌ SSO Login Error:", error);
        // הוספתי הדפסה של הודעת השגיאה המלאה לדיבוג
        res.status(401).json({
            message: "SSO Authentication failed",
            error: error.message,
        });
    }
});
module.exports = router;
