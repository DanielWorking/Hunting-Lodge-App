/**
 * @module PhonesController
 * 
 * Handlers for managing a shared contact directory.
 * Includes features for contact creation, duplicate number validation,
 * and user-specific favorite phone lists.
 */

import { Request, Response, NextFunction } from "express";
import { Types } from "mongoose";
import Phone, { IPhone, PhoneType } from "../models/Phone";
import User from "../models/User";
import { AuthUser } from "../utils/authHelpers";
import { invalidateUserCache } from "../middleware/authMiddleware";

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

export interface DuplicateNumberConflict {
    number: string;
    contactName: string;
}

/**
 * Helper function to find a duplicate phone number across the collection.
 *
 * Searches for any existing phone documents that contain any of the provided
 * numbers, optionally excluding a specific document ID (useful for updates).
 *
 * @returns The first conflicting number and the contact holding it, or null when all numbers are free.
 */
export async function findDuplicateNumber(
    numbers: string[],
    excludeId: string | null = null,
): Promise<DuplicateNumberConflict | null> {
    const query: PhoneDuplicateQueryFilter = {
        numbers: { $in: numbers },
    };
    if (excludeId) {
        query._id = { $ne: Types.ObjectId.isValid(excludeId) ? new Types.ObjectId(excludeId) : excludeId };
    }

    const existing = await Phone.findOne(query);
    if (!existing) {
        return null;
    }
    return {
        number: numbers.find((n) => existing.numbers.includes(n)) || "",
        contactName: existing.name,
    };
}

/**
 * A duplicate number is a client input conflict, never a server fault: answer 409 with a stable code.
 */
function sendDuplicateNumberConflict(res: Response, conflict: DuplicateNumberConflict): void {
    res.status(409).json({
        message: `The number ${conflict.number} already exists in contact "${conflict.contactName}"`,
        code: "DUPLICATE_PHONE_NUMBER",
    });
}

export async function getPhones(req: Request, res: Response, next?: NextFunction): Promise<void> {
    try {
        const phones = await Phone.find().sort({ name: 1 }).lean();
        const requestingUser = req.user;

        const userFavorites = new Set<string>(
            (requestingUser?.favoritePhones || []).map((id: Types.ObjectId | string) => (id ? id.toString() : "")),
        );

        const phonesWithFavorites: PhoneWithFavorite[] = phones.map((phone) => ({
            ...phone,
            isFavorite: userFavorites.has(phone._id.toString()),
        }));

        res.json(phonesWithFavorites);
    } catch (err: unknown) {
        if (typeof next === "function") {
            next(err);
            return;
        }
        res.status(500).json({ message: err instanceof Error ? err.message : String(err), code: "INTERNAL_ERROR" });
    }
}

export async function createPhone(req: Request, res: Response, next?: NextFunction): Promise<void> {
    try {
        const body = (req.body || {}) as CreatePhoneRequestBody;
        const { name, numbers, type, description } = body;

        if (!name || typeof name !== "string" || !name.trim()) {
            res.status(400).json({ message: "Contact name is required", code: "VALIDATION_ERROR" });
            return;
        }
        if (!numbers || !Array.isArray(numbers) || numbers.length === 0) {
            res.status(400).json({ message: "At least one phone number is required", code: "VALIDATION_ERROR" });
            return;
        }

        const cleanedNumbers: string[] = numbers.map((n) =>
            typeof n === "string" ? n.trim() : String(n),
        );

        // 1. Check for duplicate numbers across all contacts
        const conflict = await findDuplicateNumber(cleanedNumbers);
        if (conflict) {
            sendDuplicateNumberConflict(res, conflict);
            return;
        }

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
        res.status(400).json({ message: err instanceof Error ? err.message : String(err), code: "BAD_REQUEST" });
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
                res.status(400).json({ message: "Valid contact name is required", code: "VALIDATION_ERROR" });
                return;
            }
            updateData.name = name.trim();
        }

        if (numbers !== undefined) {
            if (!Array.isArray(numbers) || numbers.length === 0) {
                res.status(400).json({ message: "At least one phone number is required", code: "VALIDATION_ERROR" });
                return;
            }
            const cleanedNumbers: string[] = numbers.map((n) =>
                typeof n === "string" ? n.trim() : String(n),
            );
            // Check for duplicate numbers (excluding the current contact ID)
            const conflict = await findDuplicateNumber(cleanedNumbers, phoneId);
            if (conflict) {
                sendDuplicateNumberConflict(res, conflict);
                return;
            }
            updateData.numbers = cleanedNumbers;
        }

        if (type !== undefined) {
            updateData.type = type;
        }

        if (description !== undefined) {
            updateData.description = typeof description === "string" ? description.trim() : description;
        }

        const updatedPhoneQuery = Phone.findByIdAndUpdate(
            phoneId,
            { $set: updateData },
            { returnDocument: "after", runValidators: true },
        );
        const updatedPhone = await (typeof (updatedPhoneQuery as any).lean === "function"
            ? (updatedPhoneQuery as any).lean()
            : updatedPhoneQuery);
        if (!updatedPhone) {
            res.status(404).json({ message: "Phone contact not found", code: "NOT_FOUND" });
            return;
        }
        res.json(updatedPhone);
    } catch (err: unknown) {
        if (typeof next === "function") {
            next(err);
            return;
        }
        res.status(400).json({ message: err instanceof Error ? err.message : String(err), code: "BAD_REQUEST" });
    }
}

export async function toggleFavorite(req: Request, res: Response, next?: NextFunction): Promise<void> {
    try {
        const requestingUser = req.user as AuthUser | undefined;
        const userId = requestingUser?._id;
        if (!userId) {
            res.status(401).json({ message: "Unauthorized", code: "UNAUTHORIZED" });
            return;
        }

        const phoneId = extractParamId(req.params.id);
        const phoneObjId = Types.ObjectId.isValid(phoneId) ? new Types.ObjectId(phoneId) : phoneId;

        // Atomic conditional pull if already favorited. Removal never requires the contact to
        // still exist, so a stale reference to a deleted contact can always be cleared.
        const pulled = await User.findOneAndUpdate(
            { _id: userId, favoritePhones: phoneObjId },
            { $pull: { favoritePhones: phoneObjId } },
            { returnDocument: "after", select: "favoritePhones" }
        );

        if (pulled) {
            invalidateUserCache(userId.toString());
            res.json({ favoritePhones: pulled.favoritePhones || [] });
            return;
        }

        // Adding requires the contact to exist, otherwise the user would keep a phantom reference
        const phoneExists = await Phone.exists({ _id: phoneObjId });
        if (!phoneExists) {
            res.status(404).json({ message: "Phone contact not found", code: "NOT_FOUND" });
            return;
        }

        // Atomic addToSet if not favorited
        const added = await User.findByIdAndUpdate(
            userId,
            { $addToSet: { favoritePhones: phoneObjId } },
            { returnDocument: "after", select: "favoritePhones" }
        );

        if (!added) {
            res.status(404).json({ message: "User not found", code: "NOT_FOUND" });
            return;
        }

        invalidateUserCache(userId.toString());
        res.json({ favoritePhones: added.favoritePhones || [] });
    } catch (err: unknown) {
        if (typeof next === "function") {
            next(err);
            return;
        }
        res.status(500).json({ message: err instanceof Error ? err.message : String(err), code: "INTERNAL_ERROR" });
    }
}

export async function deletePhone(req: Request, res: Response, next?: NextFunction): Promise<void> {
    try {
        const phoneId = extractParamId(req.params.id);
        const deletedPhone = await Phone.findByIdAndDelete(phoneId);
        if (!deletedPhone) {
            res.status(404).json({ message: "Phone contact not found", code: "NOT_FOUND" });
            return;
        }

        // Clean up dead references in user favorite phone lists
        await User.updateMany(
            { favoritePhones: phoneId },
            { $pull: { favoritePhones: phoneId } },
        );
        invalidateUserCache();

        res.json({ message: "Phone deleted" });
    } catch (err: unknown) {
        if (typeof next === "function") {
            next(err);
            return;
        }
        res.status(500).json({ message: err instanceof Error ? err.message : String(err), code: "INTERNAL_ERROR" });
    }
}
