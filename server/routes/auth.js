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

        // קריאת הקונפיגורציה מה-ENV
        const identifierMode = process.env.SSO_IDENTIFIER_FIELD;
        console.log(`⚙️ Auth Mode: ${identifierMode}`);

        let dbUsername; // מה נשמור בשדה username (המזהה הייחודי)
        let dbDisplayName; // מה נשמור בשדה displayName (לתצוגה)
        let searchCriteria; // לפי מה מחפשים ב-DB

        dbUsername = claims.name;
        dbDisplayName = claims.preferred_username;

        if (identifierMode === "username") {
            // --- מצב ארגוני  ---
            searchCriteria = { username: dbUsername };
        } else {
            // --- מצב פיתוח/ביתי (חיבור לפי מייל) ---
            searchCriteria = { email: claims.email };
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

            // // עדכון השם לתצוגה (למקרה שהשתנה ב-AD)
            // if (dbDisplayName && user.displayName !== dbDisplayName) {
            //     user.displayName = dbDisplayName;
            // }

            // // במצב ארגוני - מוודאים שהמייל עדכני
            // if (claims.email && user.email !== claims.email) {
            //     user.email = claims.email;
            // }

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
