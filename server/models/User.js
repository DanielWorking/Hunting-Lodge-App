const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
    {
        username: { type: String, required: true, unique: true },
        displayName: { type: String },
        email: { type: String, required: true, unique: true },
        groups: [
            {
                groupId: { type: String },
                role: { type: String, enum: ["member", "shift_manager"] },
            },
        ],
        isActive: { type: Boolean, default: true },
        lastLogin: { type: String },
        vacationBalance: { type: Number, default: 18 },

        // רשימת טלפונים מועדפים
        favoritePhones: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Phone",
            },
        ],
    },
    { timestamps: true },
);

module.exports = mongoose.model("User", UserSchema);
