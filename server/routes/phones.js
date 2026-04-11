/**
 * @module PhoneRoutes
 * 
 * Provides API endpoints for managing a shared contact directory.
 * Includes features for contact creation, duplicate number validation,
 * and user-specific favorite phone lists.
 */

const express = require("express");
const router = express.Router();
const Phone = require("../models/Phone");
const User = require("../models/User"); // Needed for favorites management
const { protect } = require("../middleware/authMiddleware");

// Ensure all routes are protected by authentication
router.use(protect);

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

/**
 * GET /
 * 
 * Retrieves all phone contacts, sorted alphabetically by name.
 * Dynamically adds an `isFavorite` flag based on the current user's preferences.
 * 
 * @name getPhones
 * @route {GET} /
 * @authentication Requires valid JWT.
 * @returns {Array<Object>} 200 - List of phone contacts with virtual `isFavorite` field.
 * @returns {Error}  401 - If user is not authenticated.
 * @returns {Error}  500 - Internal server error.
 */
router.get("/", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Login required" });

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
});

/**
 * POST /
 * 
 * Creates a new phone contact entry.
 * Validates that the provided numbers do not already exist in the directory.
 * 
 * @name createPhone
 * @route {POST} /
 * @authentication Requires valid JWT.
 * @bodyparam {string} name - The contact name.
 * @bodyparam {string[]} numbers - List of unique phone numbers.
 * @bodyparam {string} type - Contact type (e.g., Mobile, Red, Black).
 * @returns {Object} 201 - The newly created Phone document.
 * @returns {Error}  400 - If validation fails or duplicate numbers are found.
 */
router.post("/", async (req, res) => {
    try {
        // 1. Check for duplicate numbers across all contacts
        await checkDuplicateNumbers(req.body.numbers);

        const phone = new Phone(req.body);
        const newPhone = await phone.save();
        res.status(201).json(newPhone);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

/**
 * PUT /:id
 * 
 * Updates an existing phone contact entry.
 * Ensures that updated numbers do not conflict with other existing contacts.
 * 
 * @name updatePhone
 * @route {PUT} /:id
 * @authentication Requires valid JWT.
 * @routeparam {string} id - The ObjectId of the contact to update.
 * @bodyparam {Object} - Updated contact fields.
 * @returns {Object} 200 - The updated Phone document.
 * @returns {Error}  400 - If validation fails or duplicate numbers are found.
 */
router.put("/:id", async (req, res) => {
    try {
        // 1. Check for duplicate numbers (excluding the current contact ID)
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

/**
 * PATCH /:id/favorite
 * 
 * Toggles the favorite status of a specific phone contact for the current user.
 * 
 * @name toggleFavorite
 * @route {PATCH} /:id/favorite
 * @authentication Requires valid JWT.
 * @routeparam {string} id - The ObjectId of the contact to toggle.
 * @returns {Object} 200 - The updated favoritePhones array for the user.
 * @returns {Error}  500 - Internal server error.
 */
router.patch("/:id/favorite", async (req, res) => {
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
});

/**
 * DELETE /:id
 * 
 * Removes a phone contact from the directory.
 * 
 * @name deletePhone
 * @route {DELETE} /:id
 * @authentication Requires valid JWT.
 * @routeparam {string} id - The ObjectId of the contact to delete.
 * @returns {Object} 200 - Success message.
 * @returns {Error}  500 - Internal server error.
 */
router.delete("/:id", async (req, res) => {
    try {
        await Phone.findByIdAndDelete(req.params.id);
        // Optional: Clean up dead references in user favorite lists if needed
        res.json({ message: "Phone deleted" });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
