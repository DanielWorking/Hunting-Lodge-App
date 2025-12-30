const mongoose = require("mongoose");

const SiteSchema = new mongoose.Schema(
    {
        title: { type: String, required: true },
        url: { type: String, required: true },
        imageUrl: { type: String },
        description: { type: String },
        isFavorite: { type: Boolean, default: false },
        groupId: { type: String, required: true }, // חובה לשייך לקבוצה
        isTacti: { type: Boolean, default: false }, // שדה חדש כדי להבדיל בין אתר רגיל ל-Tacti
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model("Site", SiteSchema);
