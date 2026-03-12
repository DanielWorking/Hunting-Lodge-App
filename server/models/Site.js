const mongoose = require("mongoose");

const SiteSchema = new mongoose.Schema({
    title: { type: String, required: true },
    url: { type: String, required: true },
    imageUrl: { type: String },
    description: { type: String },
    favoritedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    groupId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Group",
        required: true,
    },
    createdAt: { type: Date, default: Date.now },
    tag: { type: String, default: "General" },
});

module.exports = mongoose.model("Site", SiteSchema);
