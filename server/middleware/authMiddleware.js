const User = require("../models/User");

const protect = async (req, res, next) => {
    try {
        // 1. ניסיון לקרוא את ה-ID מה-Header
        // (ה-Frontend שולח את זה כעת בכל בקשה)
        const userId = req.headers["x-user-id"];

        if (userId) {
            // 2. בדיקה אם המשתמש קיים ב-DB
            const user = await User.findById(userId);
            if (user) {
                // 3. הצמדת המשתמש לבקשה
                // מעכשיו req.user זמין בכל פונקציה שתבוא אחרי זה
                req.user = user;
            }
        }

        // ממשיכים הלאה בכל מקרה (גם אם אין משתמש)
        // האחריות לחסום גישה היא של ה-Route עצמו אם req.user חסר
        next();
    } catch (error) {
        console.error("Auth Middleware Error:", error);
        // במקרה של שגיאה טכנית בבדיקה, אנחנו לא חוסמים אלא ממשיכים בלי משתמש
        next();
    }
};

module.exports = { protect };
