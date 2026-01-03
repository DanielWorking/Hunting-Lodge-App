const express = require("express");
const router = express.Router();

// --- שינוי כאן ---
// אנחנו מייבאים את כל הספרייה ומחלצים את Issuer ידנית לבדיקה
const openIdClient = require("openid-client");
const { Issuer } = openIdClient;

console.log("🔍 Checking openid-client version compatibility:");
console.log("Issuer exists?", !!Issuer); // אם זה false, הגרסה לא נכונה
// ----------------

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

        // === התיקון כאן ===
        // שינינו את הפרמטר השלישי ל-{} (אובייקט ריק)
        // כי לא שלחנו state בבקשה המקורית, אז אסור לנו לבקש מהספרייה לבדוק אותו
        const tokenSet = await ssoClient.callback(
            ssoConfig.redirectUri,
            { code },
            {}
        );
        // ==================

        // שליפת פרטי המשתמש מתוך ה-Token
        const claims = tokenSet.claims();
        console.log("👤 SSO User Claims:", claims);

        //TODO: make sure to change logic to get username insted of email
        // המשך הקוד נשאר זהה...
        const email = claims.email;
        const ssoUsername =
            claims.preferred_username || claims.email || claims.sub;

        if (!ssoUsername) {
            return res
                .status(400)
                .json({ message: "Could not identify user from SSO" });
        }

        // --- לוגיקה עסקית ---
        let user = await User.findOne({
            $or: [{ email: email }, { username: ssoUsername }],
        });

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
