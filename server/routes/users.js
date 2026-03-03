const express = require("express");
const router = express.Router();
const User = require("../models/User");
const Group = require("../models/Group");
const { protect } = require("../middleware/authMiddleware");

// --- נתיבים ציבוריים ---

// Login (מקומי - לא בשימוש ב-SSO מלא, אבל נשאר לתמיכה לאחור)
router.post("/login", async (req, res) => {
    try {
        const { username } = req.body;
        // כאן ה-username יכול להיות מייל או שם משתמש, תלוי איך נרשמו
        const user = await User.findOne({ username });

        if (!user) return res.status(404).json({ message: "User not found" });

        user.lastLogin = new Date().toISOString();
        if (user.isActive === false) {
            user.isActive = true;
        }

        const updatedUser = await user.save();
        res.json(updatedUser);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// --- נתיבים מוגנים ---
router.use(protect);

// Get All Users
router.get("/", async (req, res) => {
    try {
        const users = await User.find();
        res.json(users);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// === Create New User (Pre-provisioning) ===
router.post("/", async (req, res) => {
    try {
        // האדמין שולח את פרטי המשתמש
        // username = ID ארגוני (או מייל במצב מקומי)
        // displayName = שם מלא
        const { username, email, displayName, groups, isActive } = req.body;

        // בדיקה אם קיים
        const existingUser = await User.findOne({
            $or: [{ username }, { email }],
        });

        if (existingUser) {
            return res
                .status(400)
                .json({ message: "User already exists (username or email)" });
        }

        const newUser = new User({
            username,
            email,
            displayName: displayName || username, // ברירת מחדל
            groups: groups || [],
            isActive: isActive !== undefined ? isActive : true,
            vacationBalance: 18, // ברירת מחדל
        });

        const savedUser = await newUser.save();

        // סנכרון קבוצות: הוספת המשתמש החדש לקבוצות שבחר
        if (groups && groups.length > 0) {
            const groupIds = groups.map((g) => g.groupId);
            // עדכון הקבוצות להוסיף את ה-ID של המשתמש החדש
            await Group.updateMany(
                {
                    $or: [
                        { id: { $in: groupIds } },
                        { _id: { $in: groupIds } }, // תמיכה גם ב-ObjectId
                    ],
                },
                { $addToSet: { members: savedUser._id } },
            );
        }

        res.status(201).json(savedUser);
    } catch (err) {
        console.error("Create user error:", err);
        res.status(400).json({ message: err.message });
    }
});

// Update User (כולל סנכרון קבוצות)
router.put("/:id", async (req, res) => {
    try {
        // שליפת המשתמש הישן כדי לדעת אילו קבוצות השתנו
        const oldUser = await User.findById(req.params.id);
        if (!oldUser)
            return res.status(404).json({ message: "User not found" });

        // עדכון המשתמש
        // שימוש ב-req.body מעדכן את כל השדות שנשלחו (username, displayName, groups וכו')
        const updatedUser = await User.findByIdAndUpdate(
            req.params.id,
            { $set: req.body },
            { new: true },
        );

        // לוגיקת סנכרון קבוצות (מסובכת כי צריך להסיר מישנות ולהוסיף לחדשות)
        if (req.body.groups) {
            const oldGroupIds = oldUser.groups.map((g) => g.groupId);
            const newGroupIds = updatedUser.groups.map((g) => g.groupId);

            // 1. קבוצות שהמשתמש הוסר מהן
            const groupsToRemove = oldGroupIds.filter(
                (id) => !newGroupIds.includes(id),
            );
            if (groupsToRemove.length > 0) {
                await Group.updateMany(
                    {
                        $or: [
                            { id: { $in: groupsToRemove } },
                            { _id: { $in: groupsToRemove } },
                        ],
                    },
                    { $pull: { members: updatedUser._id } },
                );
            }

            // 2. קבוצות שהמשתמש נוסף אליהן
            const groupsToAdd = newGroupIds.filter(
                (id) => !oldGroupIds.includes(id),
            );
            if (groupsToAdd.length > 0) {
                await Group.updateMany(
                    {
                        $or: [
                            { id: { $in: groupsToAdd } },
                            { _id: { $in: groupsToAdd } },
                        ],
                    },
                    { $addToSet: { members: updatedUser._id } },
                );
            }
        }

        res.json(updatedUser);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

// Delete User
router.delete("/:id", async (req, res) => {
    try {
        const userToDelete = await User.findById(req.params.id);

        const superAdminName = process.env.SUPER_ADMIN_USERNAME;

        // הגנה על מחיקת סופר-אדמין (לפי שם משתמש או ID)
        if (userToDelete && userToDelete.username === superAdminName) {
            return res
                .status(403)
                .json({ message: "Cannot delete Super Admin" });
        }

        await User.findByIdAndDelete(req.params.id);

        // הסרת המשתמש מכל הקבוצות שהוא היה בהן
        await Group.updateMany(
            { members: req.params.id },
            { $pull: { members: req.params.id } },
        );

        res.json({ message: "User deleted" });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Reorder users in group
router.put("/reorder/group", async (req, res) => {
    try {
        const { groupId, updates } = req.body;
        const promises = updates.map((update) => {
            return User.updateOne(
                { _id: update.userId, "groups.groupId": groupId },
                { $set: { "groups.$.order": update.order } },
            );
        });

        await Promise.all(promises);
        res.json({ message: "Order updated" });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
