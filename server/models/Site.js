const mongoose = require("mongoose");

const SiteSchema = new mongoose.Schema({
    title: { type: String, required: true },
    url: { type: String, required: true },
    imageUrl: { type: String },
    description: { type: String },
    isFavorite: { type: Boolean, default: false },
    groupId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Group",
        required: true,
    },
    createdAt: { type: Date, default: Date.now },
    // isTacti: { type: Boolean, default: false }, <--- נמחק
    tag: { type: String, default: "General" },
});

module.exports = mongoose.model("Site", SiteSchema);
