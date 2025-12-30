const express = require("express");
const router = express.Router();
const User = require("../models/User");
const Group = require("../models/Group");
const { protect } = require("../middleware/authMiddleware");

// --- נתיבים ציבוריים (ללא הגנה) ---

// Login
router.post("/login", async (req, res) => {
    try {
        const { username } = req.body;
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

// --- נתיבים מוגנים (דורשים login) ---
router.use(protect);

// Get All
router.get("/", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });

    try {
        const users = await User.find();
        res.json(users);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Create User + Sync Groups
router.post("/", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });

    try {
        const user = new User(req.body);
        const newUser = await user.save();

        const groupIds = newUser.groups.map((g) => g.groupId);

        if (groupIds.length > 0) {
            await Group.updateMany(
                { _id: { $in: groupIds } },
                { $push: { members: newUser._id } }
            );
        }

        res.status(201).json(newUser);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

// Update User + Sync Groups (כולל הגנות ניהול עצמי)
router.put("/:id", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });

    // === הגנות: מניעת נעילה עצמית ===
    // אם המשתמש מנסה לעדכן את עצמו
    if (req.params.id === req.user._id.toString()) {
        // 1. הגנה מפני כיבוי עצמי (Deactivation)
        if (req.body.isActive === false) {
            return res
                .status(403)
                .json({ message: "You cannot deactivate your own account." });
        }

        // 2. הגנה מפני יציאה מקבוצת administrators
        // בודקים אם נשלח עדכון לרשימת הקבוצות
        if (req.body.groups) {
            // מוצאים את ה-ID של קבוצת האדמינים
            const adminGroup = await Group.findOne({
                name: { $regex: /^administrators$/i },
            });

            if (adminGroup) {
                const adminGroupId = adminGroup._id.toString();

                // האם המשתמש שמבצע את הפעולה הוא אדמין כרגע?
                const isCurrentlyAdmin = req.user.groups.some(
                    (g) => g.groupId.toString() === adminGroupId
                );

                if (isCurrentlyAdmin) {
                    // האם ברשימה החדשה שהוא שלח עדיין קיימת הקבוצה הזו?
                    const isStillAdmin = req.body.groups.some(
                        (g) => g.groupId === adminGroupId
                    );

                    if (!isStillAdmin) {
                        return res
                            .status(403)
                            .json({
                                message:
                                    "You cannot remove yourself from the administrators group.",
                            });
                    }
                }
            }
        }
    }
    // ===================================

    try {
        const updatedUser = await User.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true }
        );

        // סנכרון חברות בקבוצות (מחיקה מהישנות והוספה לחדשות)
        await Group.updateMany(
            { members: req.params.id },
            { $pull: { members: req.params.id } }
        );

        const groupIds = updatedUser.groups.map((g) => g.groupId);

        if (groupIds.length > 0) {
            await Group.updateMany(
                { _id: { $in: groupIds } },
                { $push: { members: updatedUser._id } }
            );
        }

        res.json(updatedUser);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

// עדכון ממוקד למנהל משמרת
router.patch("/:id/manager-update", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });

    // === הגנה: מניעת כיבוי עצמי ===
    if (req.params.id === req.user._id.toString()) {
        if (req.body.isActive === false) {
            return res
                .status(403)
                .json({ message: "You cannot deactivate your own account." });
        }
    }
    // ==============================

    try {
        const { isActive, vacationBalance } = req.body;
        const updateFields = {};

        if (isActive !== undefined) updateFields.isActive = isActive;
        if (vacationBalance !== undefined)
            updateFields.vacationBalance = vacationBalance;

        const user = await User.findByIdAndUpdate(
            req.params.id,
            { $set: updateFields },
            { new: true }
        );
        res.json(user);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

// Delete User
router.delete("/:id", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });

    try {
        const userToDelete = await User.findById(req.params.id);

        if (userToDelete && userToDelete.username === "Admin") {
            return res
                .status(403)
                .json({ message: "Cannot delete Super Admin" });
        }

        await User.findByIdAndDelete(req.params.id);

        await Group.updateMany(
            { members: req.params.id },
            { $pull: { members: req.params.id } }
        );

        res.json({ message: "User deleted" });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Reorder users
router.put("/reorder/group", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });

    try {
        const { groupId, updates } = req.body;
        const promises = updates.map((update) => {
            return User.updateOne(
                { _id: update.userId, "groups.groupId": groupId },
                { $set: { "groups.$.order": update.order } }
            );
        });

        await Promise.all(promises);
        res.json({ message: "Order updated successfully" });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
