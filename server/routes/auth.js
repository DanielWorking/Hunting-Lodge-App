const express = require("express");
const router = express.Router();
const { Issuer } = require("openid-client");
const User = require("../models/User");

let client;

// אתחול ה-Client של ה-SSO (מתבצע פעם אחת בעליית השרת)
async function initializeOidcClient() {
    if (client) return client;

    try {
        const issuer = await Issuer.discover(process.env.SSO_ISSUER_URL);
        console.log("Discovered issuer:", issuer.issuer);

        client = new issuer.Client({
            client_id: process.env.SSO_CLIENT_ID,
            client_secret: process.env.SSO_CLIENT_SECRET,
            redirect_uris: [`${process.env.BASE_URL}/api/auth/callback`],
            response_types: ["code"],
        });
        return client;
    } catch (err) {
        console.error("Failed to discover OIDC issuer:", err);
        // לא עוצרים את השרת כדי לאפשר עבודה גם אם ה-SSO למטה, אבל הלוגין ייכשל
    }
}

// קריאה לפונקציה בעת טעינת הקובץ
initializeOidcClient();

// 1. נתיב התחברות - מפנה את המשתמש ל-SSO
router.get("/login", async (req, res) => {
    if (!client) await initializeOidcClient();

    // יצירת URL להתחברות
    const authorizationUrl = client.authorizationUrl({
        scope: "openid profile email", // המידע שאנו מבקשים
        // nonce: '...' // אופציונלי, הספרייה מייצרת אוטומטית אם לא תספק
    });

    res.redirect(authorizationUrl);
});

// 2. נתיב Callback - ה-SSO מחזיר את המשתמש לכאן עם code
router.get("/callback", async (req, res) => {
    if (!client) await initializeOidcClient();

    try {
        const params = client.callbackParams(req);
        // החלפת ה-Code ב-Token (קורה ב-Backend - מאובטח!)
        const tokenSet = await client.callback(
            `${process.env.BASE_URL}/api/auth/callback`,
            params
        );

        // קבלת פרטי המשתמש באמצעות ה-Token
        const userInfo = await client.userinfo(tokenSet.access_token);

        // לוג לצורך דיבאג - תראה את כל המפתחות שה-SSO מחזיר
        console.log("User Info received from SSO:", userInfo);

        // חילוץ נתונים (מותאם לסטנדרט, ייתכן שתצטרך להתאים מפתחות לפי הלוג למעלה)
        const email = userInfo.email;
        const name = userInfo.name || userInfo.given_name || "No Name";
        const ssoId = userInfo.sub;

        if (!email) {
            return res
                .status(400)
                .send("Error: No email provided by SSO provider");
        }

        // חיפוש או יצירת משתמש ב-DB
        let user = await User.findOne({ email });

        if (!user) {
            // משתמש חדש - נוצר כ-GUEST
            user = new User({
                email,
                name,
                ssoId,
                role: "guest", // ממתין לאישור אדמין
            });
            await user.save();
            console.log("New user created via SSO:", email);
        } else {
            // משתמש קיים - נעדכן לו את ה-SSO ID אם חסר
            if (!user.ssoId) {
                user.ssoId = ssoId;
                await user.save();
            }
        }

        // שמירת המזהה ב-Session (העוגייה)
        req.session.userId = user._id;

        // הפניה חזרה לדף הבית של ה-Frontend
        // בסביבת פיתוח ה-Frontend רץ בפורט אחר (למשל 5173), בייצור זה אותו דומיין
        // נניח כאן שאנחנו מפנים ל-Root של השרת שיגיש את הריאקט, או לכתובת ההארד-קודד של הקליינט
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

// 3. בדיקת משתמש מחובר (עבור ה-Frontend)
router.get("/me", async (req, res) => {
    if (!req.session || !req.session.userId) {
        return res.status(401).json({ user: null });
    }

    try {
        const user = await User.findById(req.session.userId).select(
            "-password"
        ); // לא מחזירים סיסמה
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

// 4. התנתקות
router.post("/logout", (req, res) => {
    req.session = null; // מחיקת העוגייה
    res.json({ message: "Logged out successfully" });
});

module.exports = router;
