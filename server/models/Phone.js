const mongoose = require("mongoose");

const PhoneSchema = new mongoose.Schema(
    {
        name: { type: String, required: true },
        numbers: {
            type: [String],
            required: true,
            validate: [
                (val) => val.length > 0,
                "Must have at least one phone number",
            ],
        },
        type: {
            type: String,
            enum: ["Black", "Red", "Mobile", "Landline"],
            required: true,
        },
        description: { type: String },
        // isFavorite: { type: Boolean, default: false } // <--- שורה זו נמחקה
    },
    {
        timestamps: true,
    },
);

// מניעת כפילויות של שם וסוג זהה.
// (למשל: לא יכול להיות פעמיים "Office" מסוג "Red", אבל יכול להיות "Office" מסוג "Black")
PhoneSchema.index({ name: 1, type: 1 }, { unique: true });

module.exports = mongoose.model("Phone", PhoneSchema);
