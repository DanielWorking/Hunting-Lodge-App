const express = require("express");
const router = express.Router();
const ShiftSchedule = require("../models/ShiftSchedule");
const User = require("../models/User");
const Group = require("../models/Group");

// ייבוא ה-Middleware החדש
const { protect } = require("../middleware/authMiddleware");

// שימוש ב-protect עבור כל הנתיבים בקובץ הזה
// (או שאפשר להוסיף אותו ספציפית לכל נתיב: router.get('/', protect, ...))
router.use(protect);

// 1. קבלת לוח ספציפי
router.get("/", async (req, res) => {
    try {
        const { groupId, date } = req.query;
        if (!groupId || !date)
            return res.status(400).json({ message: "Missing groupId or date" });

        const startDate = new Date(date);

        // --- בדיקת הרשאות (נקייה יותר) ---
        let isPrivileged = false;

        // req.user קיים בזכות ה-middleware!
        if (req.user) {
            const isAdmin = req.user.username === "Admin";

            const isShiftManager = req.user.groups.some(
                (g) =>
                    g.groupId.toString() === groupId &&
                    g.role === "shift_manager"
            );

            if (isAdmin || isShiftManager) {
                isPrivileged = true;
            }
        }
        // ----------------------------------

        let query = {
            groupId,
            startDate: startDate.toISOString(),
        };

        if (!isPrivileged) {
            query.isPublished = true;
        }

        const schedule = await ShiftSchedule.findOne(query);
        res.json(schedule);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// 2. שמירת לוח (ללא שינוי מהותי, רק הוספת הגנה שהמשתמש קיים)
router.put("/", async (req, res) => {
    // הגנה נוספת: רק משתמש רשום יכול לשמור
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });

    try {
        const { groupId, startDate, endDate, shifts } = req.body;

        // כאן אפשר להוסיף בדיקה ש-req.user הוא אכן מנהל בקבוצה הזו
        // אבל לצורך הפשטות נשאיר את הלוגיקה המקורית שעובדת

        const oldSchedule = await ShiftSchedule.findOne({ groupId, startDate });

        if (oldSchedule && oldSchedule.isPublished) {
            const group = await Group.findById(groupId);
            const vacationTypeIds = group.settings.shiftTypes
                .filter((t) => t.isVacation)
                .map((t) => String(t._id));

            for (const oldShift of oldSchedule.shifts) {
                if (oldShift.vacationDeducted) {
                    const stillExistsAsVacation = shifts.find(
                        (newShift) =>
                            newShift.userId === oldShift.userId &&
                            new Date(newShift.date).toISOString() ===
                                new Date(oldShift.date).toISOString() &&
                            vacationTypeIds.includes(
                                String(newShift.shiftTypeId)
                            )
                    );

                    if (!stillExistsAsVacation) {
                        console.log(
                            `♻️ Refunding vacation day to user ${oldShift.userId}`
                        );
                        await User.findByIdAndUpdate(oldShift.userId, {
                            $inc: { vacationBalance: 1 },
                        });
                    }
                }
            }

            shifts.forEach((newShift) => {
                const matchingOldShift = oldSchedule.shifts.find(
                    (old) =>
                        old.userId === newShift.userId &&
                        new Date(old.date).toISOString() ===
                            new Date(newShift.date).toISOString() &&
                        old.shiftTypeId === newShift.shiftTypeId
                );

                if (matchingOldShift && matchingOldShift.vacationDeducted) {
                    newShift.vacationDeducted = true;
                }
            });
        }

        const schedule = await ShiftSchedule.findOneAndUpdate(
            { groupId, startDate },
            { groupId, startDate, endDate, shifts },
            { new: true, upsert: true }
        );

        res.json(schedule);
    } catch (err) {
        console.error("Error saving schedule:", err);
        res.status(400).json({ message: err.message });
    }
});

// 3. פרסום לוח
router.post("/publish", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });

    try {
        const { scheduleId } = req.body;
        const schedule = await ShiftSchedule.findById(scheduleId);
        if (!schedule)
            return res.status(404).json({ message: "Schedule not found" });

        const group = await Group.findById(schedule.groupId);
        if (!group) return res.status(404).json({ message: "Group not found" });

        const vacationTypeIds = group.settings.shiftTypes
            .filter((t) => t.isVacation)
            .map((t) => String(t._id));

        let updatesCount = 0;

        if (vacationTypeIds.length > 0) {
            for (let i = 0; i < schedule.shifts.length; i++) {
                const shift = schedule.shifts[i];
                const shiftTypeIdStr = String(shift.shiftTypeId);

                if (
                    vacationTypeIds.includes(shiftTypeIdStr) &&
                    !shift.vacationDeducted
                ) {
                    await User.findByIdAndUpdate(shift.userId, {
                        $inc: { vacationBalance: -1 },
                    });
                    shift.vacationDeducted = true;
                    updatesCount++;
                }
            }
        }

        schedule.isPublished = true;
        schedule.markModified("shifts");
        await schedule.save();

        res.json(schedule);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// 4. קבלת כל הלוחות
router.get("/all", async (req, res) => {
    try {
        const { groupId } = req.query;
        let query = { groupId };

        // שימוש ב-req.user מהמידלוויר
        let isPrivileged = false;
        if (req.user) {
            const isAdmin = req.user.username === "Admin";
            const isShiftManager = req.user.groups.some(
                (g) =>
                    g.groupId.toString() === groupId &&
                    g.role === "shift_manager"
            );
            if (isAdmin || isShiftManager) isPrivileged = true;
        }

        if (!isPrivileged) {
            query.isPublished = true;
        }

        const schedules = await ShiftSchedule.find(query);
        res.json(schedules);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
