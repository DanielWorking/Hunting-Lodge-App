const express = require("express");
const router = express.Router();
const Phone = require("../models/Phone");
const User = require("../models/User"); // נצטרך את זה למועדפים
const { protect } = require("../middleware/authMiddleware");

router.use(protect);

// --- פונקציית עזר לבדיקת כפילות מספרים ---
async function checkDuplicateNumbers(numbers, excludeId = null) {
    // מחפש האם קיים מסמך כלשהו (שאינו המסמך הנוכחי) שמכיל אחד מהמספרים החדשים
    const query = {
        numbers: { $in: numbers },
    };
    if (excludeId) {
        query._id = { $ne: excludeId };
    }

    const existing = await Phone.findOne(query);
    if (existing) {
        // מצאנו טלפון קיים עם אחד המספרים. בוא נמצא איזה מספר בדיוק מתנגש כדי להחזיר הודעה ברורה
        const conflictNumber = numbers.find((n) =>
            existing.numbers.includes(n),
        );
        throw new Error(
            `The number ${conflictNumber} already exists in contact "${existing.name}"`,
        );
    }
}

// Get All
router.get("/", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Login required" });

    try {
        const phones = await Phone.find().sort({ name: 1 }).lean(); // lean() מחזיר אובייקט JS רגיל שקל לערוך

        // יצירת מפה של המועדפים של המשתמש הנוכחי
        // המרה למחרוזות כדי להשוות IDs בקלות
        const userFavorites = (req.user.favoritePhones || []).map((id) =>
            id.toString(),
        );

        // הוספת שדה isFavorite וירטואלי לתוצאות
        const phonesWithFavorites = phones.map((phone) => ({
            ...phone,
            isFavorite: userFavorites.includes(phone._id.toString()),
        }));

        res.json(phonesWithFavorites);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Create
router.post("/", async (req, res) => {
    try {
        // 1. בדיקת כפילות מספרים
        await checkDuplicateNumbers(req.body.numbers);

        const phone = new Phone(req.body);
        const newPhone = await phone.save();
        res.status(201).json(newPhone);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

// Update
router.put("/:id", async (req, res) => {
    try {
        // 1. בדיקת כפילות מספרים (מחריגים את ה-ID הנוכחי)
        if (req.body.numbers) {
            await checkDuplicateNumbers(req.body.numbers, req.params.id);
        }

        const updatedPhone = await Phone.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true, runValidators: true },
        );
        res.json(updatedPhone);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

// Toggle Favorite (New Route)
router.patch("/:id/favorite", async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        const phoneId = req.params.id;

        // בדיקה האם כבר במועדפים
        const index = user.favoritePhones.indexOf(phoneId);

        if (index === -1) {
            // הוספה
            user.favoritePhones.push(phoneId);
        } else {
            // הסרה
            user.favoritePhones.splice(index, 1);
        }

        await user.save();
        res.json({ favoritePhones: user.favoritePhones });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Delete
router.delete("/:id", async (req, res) => {
    try {
        await Phone.findByIdAndDelete(req.params.id);
        // אופציונלי: אפשר כאן לנקות את ה-ID הזה מכל המשתמשים, אבל זה לא קריטי (סתם תהיה הפניה מתה)
        res.json({ message: "Phone deleted" });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
