/**
 * @module PhonesController
 * 
 * Handlers for managing a shared contact directory.
 * Includes features for contact creation, duplicate number validation,
 * and user-specific favorite phone lists.
 * Migrated to strict TypeScript with zero `any` and type-safe query filters.
 */

import { Request, Response, NextFunction } from "express";
import { Types } from "mongoose";
import Phone, { IPhone, PhoneType } from "../models/Phone";
import User from "../models/User";
import { AuthUser } from "../utils/authHelpers";

function extractParamId(param: string | string[] | undefined): string {
    if (!param) return "";
    return Array.isArray(param) ? param[0] : param;
}

export interface CreatePhoneRequestBody {
    name?: string;
    numbers?: (string | number)[];
    type?: string;
    description?: string;
    [key: string]: unknown;
}

export interface UpdatePhoneRequestBody {
    name?: string;
    numbers?: (string | number)[];
    type?: string;
    description?: string;
    [key: string]: unknown;
}

export interface PhoneWithFavorite extends IPhone {
    _id: Types.ObjectId | string;
    isFavorite: boolean;
}

export interface PhoneDuplicateQueryFilter {
    numbers: { $in: string[] };
    _id?: { $ne: Types.ObjectId | string };
}

/**
 * Helper function to check for duplicate phone numbers across the collection.
 * 
 * Searches for any existing phone documents that contain any of the provided
 * numbers, optionally excluding a specific document ID (useful for updates).
 */
export async function checkDuplicateNumbers(numbers: string[], excludeId: string | null = null): Promise<void> {
    const query: PhoneDuplicateQueryFilter = {
        numbers: { $in: numbers },
    };
    if (excludeId) {
        query._id = { $ne: Types.ObjectId.isValid(excludeId) ? new Types.ObjectId(excludeId) : excludeId };
    }

    const existing = await Phone.findOne(query);
    if (existing) {
        const conflictNumber = numbers.find((n) => existing.numbers.includes(n));
        throw new Error(
            `The number ${conflictNumber || ""} already exists in contact "${existing.name}"`,
        );
    }
}

export async function getPhones(req: Request, res: Response, next?: NextFunction): Promise<void> {
    try {
        const phones = await Phone.find().sort({ name: 1 }).lean();
        const requestingUser = req.user;

        const userFavorites = (requestingUser?.favoritePhones || []).map((id: Types.ObjectId | string) =>
            id ? id.toString() : "",
        );

        const phonesWithFavorites: PhoneWithFavorite[] = phones.map((phone) => ({
            ...phone,
            isFavorite: userFavorites.includes(phone._id.toString()),
        }));

        res.json(phonesWithFavorites);
    } catch (err: unknown) {
        if (typeof next === "function") {
            next(err);
            return;
        }
        res.status(500).json({ message: err instanceof Error ? err.message : String(err) });
    }
}

export async function createPhone(req: Request, res: Response, next?: NextFunction): Promise<void> {
    try {
        const body = (req.body || {}) as CreatePhoneRequestBody;
        const { name, numbers, type, description } = body;

        if (!name || typeof name !== "string" || !name.trim()) {
            res.status(400).json({ message: "Contact name is required" });
            return;
        }
        if (!numbers || !Array.isArray(numbers) || numbers.length === 0) {
            res.status(400).json({ message: "At least one phone number is required" });
            return;
        }

        const cleanedNumbers: string[] = numbers.map((n) =>
            typeof n === "string" ? n.trim() : String(n),
        );

        // 1. Check for duplicate numbers across all contacts
        await checkDuplicateNumbers(cleanedNumbers);

        const phone = new Phone({
            name: name.trim(),
            numbers: cleanedNumbers,
            type: type as PhoneType,
            description: typeof description === "string" ? description.trim() : "",
        });
        const newPhone = await phone.save();
        res.status(201).json(newPhone);
    } catch (err: unknown) {
        if (typeof next === "function") {
            next(err);
            return;
        }
        res.status(400).json({ message: err instanceof Error ? err.message : String(err) });
    }
}

export async function updatePhone(req: Request, res: Response, next?: NextFunction): Promise<void> {
    try {
        const phoneId = extractParamId(req.params.id);
        const body = (req.body || {}) as UpdatePhoneRequestBody;
        const { name, numbers, type, description } = body;
        const updateData: Record<string, unknown> = {};

        if (name !== undefined) {
            if (typeof name !== "string" || !name.trim()) {
                res.status(400).json({ message: "Valid contact name is required" });
                return;
            }
            updateData.name = name.trim();
        }

        if (numbers !== undefined) {
            if (!Array.isArray(numbers) || numbers.length === 0) {
                res.status(400).json({ message: "At least one phone number is required" });
                return;
            }
            const cleanedNumbers: string[] = numbers.map((n) =>
                typeof n === "string" ? n.trim() : String(n),
            );
            // Check for duplicate numbers (excluding the current contact ID)
            await checkDuplicateNumbers(cleanedNumbers, phoneId);
            updateData.numbers = cleanedNumbers;
        }

        if (type !== undefined) {
            updateData.type = type;
        }

        if (description !== undefined) {
            updateData.description = typeof description === "string" ? description.trim() : description;
        }

        const updatedPhone = await Phone.findByIdAndUpdate(
            phoneId,
            { $set: updateData },
            { returnDocument: "after", runValidators: true },
        );
        if (!updatedPhone) {
            res.status(404).json({ message: "Phone contact not found" });
            return;
        }
        res.json(updatedPhone);
    } catch (err: unknown) {
        if (typeof next === "function") {
            next(err);
            return;
        }
        res.status(400).json({ message: err instanceof Error ? err.message : String(err) });
    }
}

export async function toggleFavorite(req: Request, res: Response, next?: NextFunction): Promise<void> {
    try {
        const requestingUser = req.user as AuthUser | undefined;
        const userId = requestingUser?._id || req.user?.id;
        const user = await User.findById(userId);
        if (!user) {
            res.status(404).json({ message: "User not found" });
            return;
        }

        const phoneId = extractParamId(req.params.id);
        const favoritePhones = (user.favoritePhones || []).map((id) => (id ? id.toString() : ""));

        const index = favoritePhones.indexOf(phoneId);
        if (index === -1) {
            user.favoritePhones.push(Types.ObjectId.isValid(phoneId) ? new Types.ObjectId(phoneId) : phoneId);
        } else {
            user.favoritePhones.splice(index, 1);
        }

        await user.save();
        res.json({ favoritePhones: user.favoritePhones });
    } catch (err: unknown) {
        if (typeof next === "function") {
            next(err);
            return;
        }
        res.status(500).json({ message: err instanceof Error ? err.message : String(err) });
    }
}

export async function deletePhone(req: Request, res: Response, next?: NextFunction): Promise<void> {
    try {
        const phoneId = extractParamId(req.params.id);
        const deletedPhone = await Phone.findByIdAndDelete(phoneId);
        if (!deletedPhone) {
            res.status(404).json({ message: "Phone contact not found" });
            return;
        }

        // Clean up dead references in user favorite phone lists
        await User.updateMany(
            { favoritePhones: phoneId },
            { $pull: { favoritePhones: phoneId } },
        );

        res.json({ message: "Phone deleted" });
    } catch (err: unknown) {
        if (typeof next === "function") {
            next(err);
            return;
        }
        res.status(500).json({ message: err instanceof Error ? err.message : String(err) });
    }
}

export default {
    checkDuplicateNumbers,
    getPhones,
    createPhone,
    updatePhone,
    toggleFavorite,
    deletePhone,
};
