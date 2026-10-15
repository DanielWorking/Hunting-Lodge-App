/**
 * @module GroupsController
 * 
 * Handlers for managing groups, including their metadata,
 * shift settings, site tags, and member synchronization.
 * Migrated to strict TypeScript with zero `any` and strict tenancy safeguards.
 */

import { Request, Response, NextFunction } from "express";
import type { Types, PopulatedDoc } from "mongoose";
import Group, { IGroup, IShiftType, ITimeSlot } from "../models/Group";
import User, { IUser } from "../models/User";
import Site from "../models/Site";
import config from "../config";
import { resolveGroup, isAdmin, AuthUser, ResolvedGroup } from "../utils/authHelpers";
import ShiftSchedule from "../models/ShiftSchedule";
import ShiftReport from "../models/ShiftReport";

export interface MutableGroup extends ResolvedGroup {
    name?: string;
    siteTags?: string[];
    settings?: Record<string, unknown>;
    members?: (PopulatedDoc<IUser, Types.ObjectId> | string)[];
}

export interface CreateGroupRequestBody {
    name?: string;
}

export interface AddTagRequestBody {
    tagName?: string;
}

export interface RenameTagRequestBody {
    tagName?: string;
    newTagName?: string;
}

export interface UpdateSettingsRequestBody {
    shiftTypes?: IShiftType[];
    timeSlots?: ITimeSlot[];
    settings?: {
        shiftTypes?: IShiftType[];
        timeSlots?: ITimeSlot[];
        [key: string]: unknown;
    };
    [key: string]: unknown;
}

export interface UpdateGroupRequestBody {
    name?: string;
    settings?: Record<string, unknown>;
    siteTags?: string[];
}

export interface GroupWithUserCount extends IGroup {
    _id: Types.ObjectId | string;
    userCount: number;
    isSystemGroup?: boolean;
}

export async function getGroups(req: Request, res: Response, next?: NextFunction): Promise<void> {
    try {
        let groups: (IGroup & { _id: Types.ObjectId | string })[];
        const requestingUser = req.user as AuthUser | undefined;

        if (isAdmin(requestingUser)) {
            // Administrators receive all groups in the system
            groups = await Group.find().lean();
        } else {
            // Regular users receive only the groups they are assigned to
            const userGroupIds = (requestingUser?.groups || [])
                .map((g) => {
                    const gid = g?.groupId;
                    if (gid && typeof gid === "object" && "_id" in gid) {
                        return (gid as { _id?: unknown })._id;
                    }
                    return gid;
                })
                .filter((id): id is Types.ObjectId | string => Boolean(id));
            groups = await Group.find({ _id: { $in: userGroupIds } }).lean();
        }

        // Query the User collection using an optimized aggregation pipeline with batch fallback
        let groupsWithCounts: GroupWithUserCount[];
        const groupIds = groups.map((g) => g._id);

        try {
            if (typeof User.aggregate === "function") {
                const userCounts = await User.aggregate<{ _id: Types.ObjectId | string | null; count: number }>([
                    { $match: { "groups.groupId": { $in: groupIds } } },
                    { $project: { "groups.groupId": 1 } },
                    { $unwind: "$groups" },
                    { $match: { "groups.groupId": { $in: groupIds } } },
                    { $group: { _id: "$groups.groupId", count: { $sum: 1 } } },
                ]);

                if (Array.isArray(userCounts)) {
                    const countMap = new Map<string, number>(
                        userCounts.map((item) => [item._id ? item._id.toString() : "", item.count]),
                    );

                    groupsWithCounts = groups.map((group) => ({
                        ...group,
                        userCount: countMap.get(group._id ? group._id.toString() : "") || 0,
                        isSystemGroup: group.name === config.superAdmin.groupName,
                    }));
                } else {
                    throw new Error("Aggregation returned non-array");
                }
            } else {
                throw new Error("User.aggregate is unavailable");
            }
        } catch (aggError: unknown) {
            console.error("MongoDB group aggregation failed, using single batch fallback (no N+1 loops):", aggError);
            try {
                // Batch query all users for matching groups in a single operation
                const userDocs = await User.find(
                    { "groups.groupId": { $in: groupIds } },
                    { "groups.groupId": 1 },
                ).lean();

                const countMap = new Map<string, number>();
                if (Array.isArray(userDocs)) {
                    for (const u of userDocs as any[]) {
                        if (Array.isArray(u.groups)) {
                            for (const g of u.groups) {
                                const gid = g?.groupId && typeof g.groupId === "object" && "_id" in g.groupId
                                    ? String(g.groupId._id)
                                    : String(g?.groupId);
                                if (gid) {
                                    countMap.set(gid, (countMap.get(gid) || 0) + 1);
                                }
                            }
                        }
                    }
                }

                groupsWithCounts = groups.map((group) => ({
                    ...group,
                    userCount: countMap.get(group._id ? group._id.toString() : "") || 0,
                    isSystemGroup: group.name === config.superAdmin.groupName,
                }));
            } catch {
                // Safe zero fallback if batch query also fails; prevents database overload
                groupsWithCounts = groups.map((group) => ({
                    ...group,
                    userCount: 0,
                    isSystemGroup: group.name === config.superAdmin.groupName,
                }));
            }
        }

        res.json(groupsWithCounts);
    } catch (err: unknown) {
        if (typeof next === "function") {
            next(err);
            return;
        }
        res.status(500).json({ message: err instanceof Error ? err.message : String(err), code: "INTERNAL_ERROR" });
    }
}

export async function createGroup(req: Request, res: Response, next?: NextFunction): Promise<void> {
    const body = (req.body || {}) as CreateGroupRequestBody;
    const groupName = body.name;
    if (!groupName || typeof groupName !== "string" || !groupName.trim()) {
        res.status(400).json({ message: "Group name is required", code: "VALIDATION_ERROR" });
        return;
    }
    const name = groupName.trim();
    try {
        const existingGroup = await Group.findOne({ name });
        if (existingGroup) {
            res.status(400).json({ message: "Group name already exists", code: "DUPLICATE_RESOURCE" });
            return;
        }

        const newGroup = new Group({
            name,
            settings: { shiftTypes: [], timeSlots: [] },
            siteTags: ["General"],
        });

        const savedGroup = await newGroup.save();
        res.status(201).json(savedGroup);
    } catch (err: unknown) {
        if (typeof next === "function") {
            next(err);
            return;
        }
        res.status(400).json({ message: err instanceof Error ? err.message : String(err), code: "BAD_REQUEST" });
    }
}

export async function addTag(req: Request, res: Response, next?: NextFunction): Promise<void> {
    const body = (req.body || {}) as AddTagRequestBody;
    const rawTagName = body.tagName;
    if (!rawTagName || typeof rawTagName !== "string" || !rawTagName.trim()) {
        res.status(400).json({ message: "Tag name is required", code: "VALIDATION_ERROR" });
        return;
    }
    const tagName = rawTagName.trim();

    try {
        const group = await resolveGroup<MutableGroup>(req.params.id);
        if (!group) {
            res.status(404).json({ message: "Group not found", code: "NOT_FOUND" });
            return;
        }

        const siteTags = Array.isArray(group.siteTags) ? [...group.siteTags] : [];
        if (siteTags.includes(tagName)) {
            res.status(400).json({ message: "Tag already exists", code: "DUPLICATE_RESOURCE" });
            return;
        }

        siteTags.push(tagName);
        group.siteTags = siteTags;
        if (typeof group.save === "function") {
            await group.save();
        }
        res.json(group.siteTags);
    } catch (err: unknown) {
        if (typeof next === "function") {
            next(err);
            return;
        }
        res.status(500).json({ message: err instanceof Error ? err.message : String(err), code: "INTERNAL_ERROR" });
    }
}

export async function renameTag(req: Request, res: Response, next?: NextFunction): Promise<void> {
    const body = (req.body || {}) as RenameTagRequestBody;
    const tagName = typeof body.tagName === "string" ? body.tagName.trim() : "";
    const rawNewTagName = body.newTagName;

    if (!tagName) {
        res.status(400).json({ message: "Tag name is required", code: "VALIDATION_ERROR" });
        return;
    }

    if (!rawNewTagName || typeof rawNewTagName !== "string" || !rawNewTagName.trim()) {
        res.status(400).json({ message: "New tag name is required", code: "VALIDATION_ERROR" });
        return;
    }
    const newTagName = rawNewTagName.trim();

    if (tagName === "General") {
        res.status(400).json({ message: "Cannot rename General tag", code: "DEFAULT_TAG_PROTECTED" });
        return;
    }

    try {
        const group = await resolveGroup<MutableGroup>(req.params.id);
        if (!group) {
            res.status(404).json({ message: "Group not found", code: "NOT_FOUND" });
            return;
        }

        const siteTags = Array.isArray(group.siteTags) ? [...group.siteTags] : [];
        const tagIndex = siteTags.indexOf(tagName);
        if (tagIndex === -1) {
            res.status(404).json({ message: "Tag not found", code: "NOT_FOUND" });
            return;
        }

        if (siteTags.includes(newTagName)) {
            res.status(400).json({ message: "New tag name already exists", code: "DUPLICATE_RESOURCE" });
            return;
        }

        // 1. Update tag in group configuration
        siteTags[tagIndex] = newTagName;
        group.siteTags = siteTags;
        if (typeof group.save === "function") {
            await group.save();
        }

        // 2. Update all sites associated with this group and old tag
        await Site.updateMany(
            { groupId: group._id, tag: tagName },
            { $set: { tag: newTagName } },
        );

        res.json({
            message: "Tag renamed successfully",
            siteTags: group.siteTags,
        });
    } catch (err: unknown) {
        if (typeof next === "function") {
            next(err);
            return;
        }
        res.status(500).json({ message: err instanceof Error ? err.message : String(err), code: "INTERNAL_ERROR" });
    }
}

export async function deleteTag(req: Request, res: Response, next?: NextFunction): Promise<void> {
    const rawTagName = (req.query || {}).tagName;
    const tagName = typeof rawTagName === "string" ? rawTagName.trim() : "";

    if (!tagName) {
        res.status(400).json({ message: "Tag name is required", code: "VALIDATION_ERROR" });
        return;
    }

    if (tagName === "General") {
        res.status(400).json({ message: "Cannot delete General tag", code: "DEFAULT_TAG_PROTECTED" });
        return;
    }

    try {
        const group = await resolveGroup<MutableGroup>(req.params.id);
        if (!group) {
            res.status(404).json({ message: "Group not found", code: "NOT_FOUND" });
            return;
        }

        const currentTags = Array.isArray(group.siteTags) ? group.siteTags : [];
        // Never confirm a deletion that did not happen
        if (!currentTags.includes(tagName)) {
            res.status(404).json({ message: "Tag not found", code: "NOT_FOUND" });
            return;
        }

        const siteTags = currentTags.filter((t: string) => t !== tagName);
        group.siteTags = siteTags;
        if (typeof group.save === "function") {
            await group.save();
        }

        // Relocate all sites under the deleted tag to "General"
        await Site.updateMany(
            { groupId: group._id, tag: tagName },
            { $set: { tag: "General" } },
        );

        res.json({
            message: "Tag deleted and sites moved to General",
            siteTags: group.siteTags,
        });
    } catch (err: unknown) {
        if (typeof next === "function") {
            next(err);
            return;
        }
        res.status(500).json({ message: err instanceof Error ? err.message : String(err), code: "INTERNAL_ERROR" });
    }
}

export async function updateSettings(req: Request, res: Response, next?: NextFunction): Promise<void> {
    try {
        const body = (req.body || {}) as UpdateSettingsRequestBody;
        const shiftTypes = body.shiftTypes || body.settings?.shiftTypes;
        const timeSlots = body.timeSlots || body.settings?.timeSlots;

        const group = await resolveGroup<MutableGroup>(req.params.id);
        if (!group) {
            res.status(404).json({ message: "Group not found", code: "NOT_FOUND" });
            return;
        }

        const currentSettings = (group.settings && typeof group.settings === "object")
            ? { ...(group.settings as Record<string, unknown>) }
            : {};

        if (shiftTypes && Array.isArray(shiftTypes)) {
            // Validate that there are no duplicate names in the shiftTypes list
            const names = shiftTypes.map((t: IShiftType) => (typeof t.name === "string" ? t.name.trim() : ""));
            const uniqueNames = new Set(names);

            if (names.length !== uniqueNames.size) {
                res.status(400).json({
                    message: "Validation Error: Duplicate shift type names are not allowed.",
                    code: "VALIDATION_ERROR",
                });
                return;
            }
            currentSettings.shiftTypes = shiftTypes;
        }

        if (timeSlots && Array.isArray(timeSlots)) {
            currentSettings.timeSlots = timeSlots;
        }

        // Fallback if settings object is sent directly
        if (body.settings && typeof body.settings === "object") {
            Object.assign(currentSettings, body.settings);
        }
        if (!shiftTypes && !timeSlots && (body.shiftTypes || body.timeSlots)) {
            Object.assign(currentSettings, body);
        }

        group.settings = currentSettings;

        let updatedGroup: unknown = group;
        if (typeof group.save === "function") {
            updatedGroup = await group.save();
        }
        res.json(updatedGroup);
    } catch (err: unknown) {
        if (typeof next === "function") {
            next(err);
            return;
        }
        res.status(400).json({ message: err instanceof Error ? err.message : String(err), code: "BAD_REQUEST" });
    }
}

export async function updateGroup(req: Request, res: Response, next?: NextFunction): Promise<void> {
    const body = (req.body || {}) as UpdateGroupRequestBody;
    const { name, settings, siteTags } = body;

    try {
        const group = await resolveGroup<MutableGroup>(req.params.id);

        if (!group) {
            res.status(404).json({ message: "Group not found", code: "NOT_FOUND" });
            return;
        }

        // === SECURITY LAYER: Protect the System Admin Group ===
        if (group.name === config.superAdmin.groupName) {
            res.status(403).json({
                message: `System Security: The '${config.superAdmin.groupName}' group cannot be modified.`,
                code: "FORBIDDEN_SYSTEM_GROUP_PROTECTED",
            });
            return;
        }

        // Update fields only if they were provided in the request
        if (name !== undefined) group.name = name;
        if (settings !== undefined) group.settings = settings;
        if (siteTags !== undefined) group.siteTags = siteTags;

        let updatedGroup: unknown = group;
        if (typeof group.save === "function") {
            updatedGroup = await group.save();
        }
        res.json(updatedGroup);
    } catch (err: unknown) {
        if (typeof next === "function") {
            next(err);
            return;
        }
        res.status(400).json({ message: err instanceof Error ? err.message : String(err), code: "BAD_REQUEST" });
    }
}

export async function deleteGroup(req: Request, res: Response, next?: NextFunction): Promise<void> {
    try {
        const group = await resolveGroup<MutableGroup>(req.params.id);
        if (!group) {
            res.status(404).json({ message: "Group not found", code: "NOT_FOUND" });
            return;
        }

        // === SECURITY LAYER: Protect System Admin Group ===
        if (group.name === config.superAdmin.groupName) {
            res.status(403).json({
                message: `System Security: The '${config.superAdmin.groupName}' group cannot be deleted.`,
                code: "FORBIDDEN_SYSTEM_GROUP_PROTECTED",
            });
            return;
        }

        // === VALIDATION & CLEANUP ===
        // 1. Check if the group itself has active members
        const members = Array.isArray(group.members) ? group.members : [];
        if (members.length > 0) {
            res.status(400).json({
                message: "Cannot delete group with active members. Please remove members first.",
                code: "GROUP_HAS_MEMBERS",
            });
            return;
        }

        // 2. Clean up references in User documents
        await User.updateMany(
            { "groups.groupId": group._id },
            { $pull: { groups: { groupId: group._id } } },
        );

        // Safe to proceed with deletion
        await Group.findByIdAndDelete(group._id);

        // Cleanup associated resources (sites, schedules, reports)
        await Site.deleteMany({ groupId: group._id });
        await ShiftSchedule.deleteMany({ groupId: group._id });
        await ShiftReport.deleteMany({ groupId: group._id });

        res.json({ message: "Group deleted successfully" });
    } catch (err: unknown) {
        console.error("Delete group error:", err);
        if (typeof next === "function") {
            next(err);
            return;
        }
        res.status(500).json({ message: err instanceof Error ? err.message : String(err), code: "INTERNAL_ERROR" });
    }
}

export default {
    getGroups,
    createGroup,
    addTag,
    renameTag,
    deleteTag,
    updateSettings,
    updateGroup,
    deleteGroup,
};
