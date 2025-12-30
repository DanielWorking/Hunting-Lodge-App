const auth = (req, res, next) => {
    // בדיקה אם קיים session עם userId
    if (req.session && req.session.userId) {
        return next();
    }

    // אם לא, מחזירים שגיאה
    return res
        .status(401)
        .json({ msg: "No active session, authorization denied" });
};

module.exports = auth;
