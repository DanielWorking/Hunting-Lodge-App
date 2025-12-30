const express = require("express");
const router = express.Router();
const { Issuer, generators } = require("openid-client"); // שים לב: ייבוא רגיל ופשוט
const User = require("../models/User");

let client;

// פונקציה שמבטיחה שה-Client מאותחל לפני שמשתמשים בו
async function getOidcClient() {
    if (client) return client; // אם כבר אותחל, תחזיר אותו

    try {
        // גילוי הגדרות השרת (כמו במדריך הארגוני שלך)
        const issuer = await Issuer.discover(process.env.SSO_ISSUER_URL);
        console.log("✅ Discovered issuer:", issuer.issuer);

        client = new issuer.Client({
            client_id: process.env.SSO_CLIENT_ID,
            client_secret: process.env.SSO_CLIENT_SECRET,
            redirect_uris: [`${process.env.BASE_URL}/api/auth/callback`],
            response_types: ["code"],
        });

        return client;
    } catch (err) {
        console.error("❌ Failed to discover OIDC issuer:", err.message);
        throw err; // זורקים שגיאה כדי שהפונקציה הקוראת תדע שנכשלנו
    }
}

// ניסיון אתחול ראשוני ברקע (לא חובה לחכות לו)
getOidcClient().catch(() =>
    console.log("Waiting for first request to retry discovery...")
);

// 1. נתיב התחברות
router.get("/login", async (req, res) => {
    try {
        const oidcClient = await getOidcClient();

        // יצירת מזהים לאבטחה (כמו במדריך: State ו-Nonce)
        const code_verifier = generators.codeVerifier();
        const code_challenge = generators.codeChallenge(code_verifier);
        const state = generators.state();
        const nonce = generators.nonce();

        // שמירה ב-Session לשימוש בחזור
        req.session.code_verifier = code_verifier;
        req.session.state = state;
        req.session.nonce = nonce;

        const authorizationUrl = oidcClient.authorizationUrl({
            scope: "openid profile email",
            code_challenge,
            code_challenge_method: "S256",
            state,
            nonce,
        });

        res.redirect(authorizationUrl);
    } catch (err) {
        console.error("Login Error:", err);
        res.status(500).send("SSO Login Error: " + err.message);
    }
});

// 2. נתיב Callback (כמו במדריך: "Step 3: Obtain a token set")
router.get("/callback", async (req, res) => {
    try {
        const oidcClient = await getOidcClient();

        // שליפת הפרמטרים מה-Session לבדיקה
        const params = oidcClient.callbackParams(req);
        const { code_verifier, state, nonce } = req.session;

        if (!code_verifier || !state) {
            return res.status(400).send("Session expired or invalid state");
        }

        // החלפת ה-Code ב-Token (בדיוק כמו במדריך הארגוני: client.callback)
        const tokenSet = await oidcClient.callback(
            `${process.env.BASE_URL}/api/auth/callback`,
            params,
            { code_verifier, state, nonce }
        );

        console.log("✅ Authentication successful!");

        // ניקוי ה-Session
        req.session.code_verifier = null;
        req.session.state = null;
        req.session.nonce = null;

        // שליפת פרטי המשתמש (Claims)
        const userInfo = tokenSet.claims();
        const email = userInfo.email;
        const name = userInfo.name || userInfo.given_name || "No Name";
        const ssoId = userInfo.sub;

        if (!email) {
            return res.status(400).send("Error: No email provided by SSO");
        }

        // === לוגיקה עסקית (חיפוש/יצירת משתמש) ===
        let user = await User.findOne({ email });

        if (!user) {
            user = new User({ email, name, ssoId, role: "guest" });
            await user.save();
            console.log("New user created:", email);
        } else if (!user.ssoId) {
            user.ssoId = ssoId;
            await user.save();
        }

        req.session.userId = user._id;

        const clientUrl =
            process.env.NODE_ENV === "production"
                ? "/"
                : "http://localhost:5173";
        res.redirect(clientUrl);
    } catch (err) {
        console.error("SSO Callback Error:", err);
        res.status(500).send("Authentication failed: " + err.message);
    }
});

// 3. בדיקת משתמש (ללא שינוי)
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
        res.status(500).json({ error: "Server error" });
    }
});

// 4. התנתקות
router.post("/logout", (req, res) => {
    req.session = null;
    res.json({ message: "Logged out successfully" });
});

module.exports = router;
