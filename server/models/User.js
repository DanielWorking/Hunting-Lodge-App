const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
    {
        username: { type: String, required: true, unique: true },
        // ... שאר השדות הקיימים (password, isActive, groups, etc...) נשארים ללא שינוי ...

        // הוספת השדה הזה:
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
