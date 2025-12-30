const express = require("express");
const router = express.Router();
const Phone = require("../models/Phone");
const { protect } = require("../middleware/authMiddleware");

router.use(protect);

// Get All (פתוח לכולם, אבל דורש login עקרונית)
router.get("/", async (req, res) => {
    // אם אתה רוצה שגם אורחים לא רשומים יוכלו לראות, תמחק את השורה הבאה:
    if (!req.user) return res.status(401).json({ message: "Login required" });

    try {
        const phones = await Phone.find().sort({ name: 1 });
        res.json(phones);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Create
router.post("/", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });

    const phone = new Phone(req.body);
    try {
        const newPhone = await phone.save();
        res.status(201).json(newPhone);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

// Update
router.put("/:id", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });

    try {
        const updatedPhone = await Phone.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true }
        );
        res.json(updatedPhone);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

// Delete
router.delete("/:id", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });

    try {
        await Phone.findByIdAndDelete(req.params.id);
        res.json({ message: "Phone deleted" });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
