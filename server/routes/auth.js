const express = require("express");
const router = express.Router();
const User = require("../models/User");

// משתנים לשמירת הקונפיגורציה בזיכרון (במקום ב-Class)
let openIdConfig = null;

// פונקציית עזר לטעינת הספרייה (שעובדת ב-ESM) בתוך סביבת CommonJS
async function getOpenIdClient() {
    // טעינה דינמית של הספרייה
    const openid = await import("openid-client");
    return openid;
}

// פונקציית אתחול - מגלה את הגדרות השרת (Discovery)
async function initializeAuth() {
    if (openIdConfig) return openIdConfig;

    try {
        const { discovery } = await getOpenIdClient();

        const issuerUrl = new URL(process.env.SSO_ISSUER_URL);
        const clientId = process.env.SSO_CLIENT_ID;
        const clientSecret = process.env.SSO_CLIENT_SECRET;

        // 1. גילוי הגדרות השרת (Discovery)
        const serverConfig = await discovery(issuerUrl, clientId, clientSecret);

        console.log(
            "✅ SSO Discovery successful:",
            serverConfig.serverMetadata().issuer
        );

        // שמירת הקונפיגורציה לשימוש חוזר
        openIdConfig = {
            serverConfig,
            clientId,
            clientSecret,
            redirectUri: `${process.env.BASE_URL}/api/auth/callback`,
        };

        return openIdConfig;
    } catch (err) {
        console.error("❌ Failed to initialize OpenID Client:", err);
        return null;
    }
}

// אתחול ראשוני בעליית השרת
initializeAuth();

// === 1. נתיב התחברות (Login) ===
router.get("/login", async (req, res) => {
    const config = await initializeAuth();
    if (!config) return res.status(500).send("SSO Service Unavailable");

    const { buildAuthorizationUrl } = await getOpenIdClient();

    // בניית ה-URL להפניה
    const authorizationUrl = buildAuthorizationUrl(config.serverConfig, {
        client_id: config.clientId,
        redirect_uri: config.redirectUri,
        scope: "openid profile email",
        response_type: "code",
    });

    res.redirect(authorizationUrl.href);
});

// === 2. נתיב Callback ===
router.get("/callback", async (req, res) => {
    const config = await initializeAuth();
    if (!config) return res.status(500).send("SSO Service Unavailable");

    const { processAuthorizationCodeOpenIDResponse, allowInsecureRequests } =
        await getOpenIdClient();

    try {
        const currentUrl = new URL(`${process.env.BASE_URL}${req.originalUrl}`);

        // הערה: בסביבת פיתוח (http) צריך לאפשר בקשות לא מאובטחות, בייצור ה-SSO דורש https
        if (process.env.NODE_ENV !== "production") {
            allowInsecureRequests(config.serverConfig);
        }

        // החלפת ה-Code ב-Token וקבלת המידע
        // בגרסה 6 הפונקציה הזו עושה הכל: ולידציה, החלפת טוקן ופענוח ה-ID Token
        const tokenSet = await processAuthorizationCodeOpenIDResponse(
            config.serverConfig,
            {
                client_id: config.clientId,
                client_secret: config.clientSecret,
            },
            currentUrl
        );

        // שליפת ה-Claims (המידע על המשתמש) מתוך ה-Token
        const claims = tokenSet.claims();
        console.log("User Info received:", claims);

        const email = claims.email;
        const name = claims.name || claims.given_name || "No Name";
        const ssoId = claims.sub;

        if (!email) {
            return res
                .status(400)
                .send("Error: No email provided by SSO provider");
        }

        // === לוגיקה עסקית (DB) - זהה לקוד המקורי שלך ===
        let user = await User.findOne({ email });

        if (!user) {
            user = new User({
                email,
                name,
                ssoId,
                role: "guest",
            });
            await user.save();
            console.log("New user created via SSO:", email);
        } else {
            if (!user.ssoId) {
                user.ssoId = ssoId;
                await user.save();
            }
        }

        req.session.userId = user._id;

        const clientUrl =
            process.env.NODE_ENV === "production"
                ? "/"
                : "http://localhost:5173";
        res.redirect(clientUrl);
    } catch (err) {
        console.error("SSO Callback Error:", err);
        res.status(500).send("Authentication failed");
    }
});

// === 3. נתיב בדיקת משתמש (נשאר ללא שינוי) ===
router.get("/me", async (req, res) => {
    if (!req.session || !req.session.userId) {
        return res.status(401).json({ user: null });
    }

    try {
        const user = await User.findById(req.session.userId).select(
            "-password"
        );
        if (!user) {
            req.session = null;
            return res.status(401).json({ user: null });
        }
        res.json({ user });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server error" });
    }
});

// === 4. התנתקות ===
router.post("/logout", (req, res) => {
    req.session = null;
    res.json({ message: "Logged out successfully" });
});

module.exports = router;
