const protect = (req, res, next) => {
    // בדיקה אם קיים session עם userId (שנוצר ע"י ה-SSO)
    if (req.session && req.session.userId) {
        return next();
    }

    // אם לא, מחזירים שגיאה 401
    return res
        .status(401)
        .json({ msg: "No active session, authorization denied" });
};

// ייצוא כאובייקט כדי ש-destructuring יעבוד בקבצים אחרים
// (const { protect } = require...)
module.exports = { protect };
