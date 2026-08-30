/**
 * @module PhonesController
 * 
 * Handlers for managing a shared contact directory.
 * Includes features for contact creation, duplicate number validation,
 * and user-specific favorite phone lists.
 */

const Phone = require("../models/Phone");
const User = require("../models/User"); // Needed for favorites management

/**
 * Helper function to check for duplicate phone numbers across the collection.
 * 
 * Searches for any existing phone documents that contain any of the provided
 * numbers, optionally excluding a specific document ID (useful for updates).
 * 
 * @param {string[]} numbers - Array of phone numbers to check for duplicates.
 * @param {string} [excludeId=null] - Optional MongoDB ObjectId to exclude from the search.
 * @throws {Error} If a duplicate number is found, with a message identifying the conflicting contact.
 */
async function checkDuplicateNumbers(numbers, excludeId = null) {
    // Search for any document (excluding current) that contains any of the new numbers
    const query = {
        numbers: { $in: numbers },
    };
    if (excludeId) {
        query._id = { $ne: excludeId };
    }

    const existing = await Phone.findOne(query);
    if (existing) {
        // Find exactly which number conflicts to provide a clear error message
        const conflictNumber = numbers.find((n) =>
            existing.numbers.includes(n),
        );
        throw new Error(
            `The number ${conflictNumber} already exists in contact "${existing.name}"`,
        );
    }
}

exports.getPhones = async (req, res) => {
    try {
        // Use lean() to return plain JS objects for easier dynamic manipulation
        const phones = await Phone.find().sort({ name: 1 }).lean();

        // Map the current user's favorite phone IDs for quick comparison
        const userFavorites = (req.user.favoritePhones || []).map((id) =>
            id.toString(),
        );

        // Add the virtual isFavorite field to the result objects
        const phonesWithFavorites = phones.map((phone) => ({
            ...phone,
            isFavorite: userFavorites.includes(phone._id.toString()),
        }));

        res.json(phonesWithFavorites);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

exports.createPhone = async (req, res) => {
    try {
        const { name, numbers, type, description } = req.body;
        if (!name || typeof name !== "string" || !name.trim()) {
            return res.status(400).json({ message: "Contact name is required" });
        }
        if (!numbers || !Array.isArray(numbers) || numbers.length === 0) {
            return res.status(400).json({ message: "At least one phone number is required" });
        }
        const cleanedNumbers = numbers.map((n) => (typeof n === "string" ? n.trim() : String(n)));

        // 1. Check for duplicate numbers across all contacts
        await checkDuplicateNumbers(cleanedNumbers);

        const phone = new Phone({
            name: name.trim(),
            numbers: cleanedNumbers,
            type,
            description: typeof description === "string" ? description.trim() : "",
        });
        const newPhone = await phone.save();
        res.status(201).json(newPhone);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
};

exports.updatePhone = async (req, res) => {
    try {
        const { name, numbers, type, description } = req.body;
        const updateData = {};

        if (name !== undefined) {
            if (typeof name !== "string" || !name.trim()) {
                return res.status(400).json({ message: "Valid contact name is required" });
            }
            updateData.name = name.trim();
        }

        if (numbers !== undefined) {
            if (!Array.isArray(numbers) || numbers.length === 0) {
                return res.status(400).json({ message: "At least one phone number is required" });
            }
            updateData.numbers = numbers.map((n) => (typeof n === "string" ? n.trim() : String(n)));
            // Check for duplicate numbers (excluding the current contact ID)
            await checkDuplicateNumbers(updateData.numbers, req.params.id);
        }

        if (type !== undefined) {
            updateData.type = type;
        }

        if (description !== undefined) {
            updateData.description = typeof description === "string" ? description.trim() : description;
        }

        const updatedPhone = await Phone.findByIdAndUpdate(
            req.params.id,
            { $set: updateData },
            { new: true, runValidators: true },
        );
        if (!updatedPhone) return res.status(404).json({ message: "Phone contact not found" });
        res.json(updatedPhone);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
};

exports.toggleFavorite = async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        const phoneId = req.params.id;

        // Check if the phone is already in the user's favorites list
        const index = user.favoritePhones.indexOf(phoneId);

        if (index === -1) {
            // Add to favorites
            user.favoritePhones.push(phoneId);
        } else {
            // Remove from favorites
            user.favoritePhones.splice(index, 1);
        }

        await user.save();
        res.json({ favoritePhones: user.favoritePhones });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

exports.deletePhone = async (req, res) => {
    try {
        const deletedPhone = await Phone.findByIdAndDelete(req.params.id);
        if (!deletedPhone) return res.status(404).json({ message: "Phone contact not found" });

        // Clean up dead references in user favorite phone lists
        await User.updateMany(
            { favoritePhones: req.params.id },
            { $pull: { favoritePhones: req.params.id } },
        );

        res.json({ message: "Phone deleted" });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};
