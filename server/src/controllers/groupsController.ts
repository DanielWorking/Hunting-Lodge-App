/**
 * @module GroupsController
 * 
 * Handlers for managing groups, including their metadata,
 * shift settings, site tags, and member synchronization.
 * Migrated to strict TypeScript with zero `any` and strict tenancy safeguards.
 */

import { Request, Response, NextFunction } from "express";
import mongoose, { Types, PopulatedDoc } from "mongoose";
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
    id?: string;
}

export interface AddTagRequestBody {
    tagName?: string;
}

export interface RenameTagRequestBody {
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

        // Query the User collection using an optimized aggregation pipeline (with fallback for unit test mocks)
        let groupsWithCounts: GroupWithUserCount[];
        if (mongoose.connection && mongoose.connection.readyState === 1 && typeof User.aggregate === "function") {
            try {
                const groupIds = groups.map((g) => g._id);
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
                    }));
                } else {
                    throw new Error("Aggregation returned non-array");
                }
            } catch {
                groupsWithCounts = await Promise.all(
                    groups.map(async (group) => {
                        const realCount = await User.countDocuments({
                            "groups.groupId": group._id,
                        });
                        return {
                            ...group,
                            userCount: realCount,
                        };
                    }),
                );
            }
        } else {
            groupsWithCounts = await Promise.all(
                groups.map(async (group) => {
                    const realCount = await User.countDocuments({
                        "groups.groupId": group._id,
                    });
                    return {
                        ...group,
                        userCount: realCount,
                    };
                }),
            );
        }

        res.json(groupsWithCounts);
    } catch (err: unknown) {
        if (typeof next === "function") {
            next(err);
            return;
        }
        res.status(500).json({ message: err instanceof Error ? err.message : String(err) });
    }
}

export async function createGroup(req: Request, res: Response, next?: NextFunction): Promise<void> {
    const body = (req.body || {}) as CreateGroupRequestBody;
    const groupName = body.name || body.id;
    if (!groupName || typeof groupName !== "string" || !groupName.trim()) {
        res.status(400).json({ message: "Group name is required" });
        return;
    }
    const name = groupName.trim();
    try {
        const existingGroup = await Group.findOne({ name });
        if (existingGroup) {
            res.status(400).json({ message: "Group name already exists" });
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
        res.status(400).json({ message: err instanceof Error ? err.message : String(err) });
    }
}

export async function addTag(req: Request, res: Response, next?: NextFunction): Promise<void> {
    const body = (req.body || {}) as AddTagRequestBody;
    const rawTagName = body.tagName;
    if (!rawTagName || typeof rawTagName !== "string" || !rawTagName.trim()) {
        res.status(400).json({ message: "Tag name is required" });
        return;
    }
    const tagName = rawTagName.trim();

    try {
        const group = await resolveGroup<MutableGroup>(req.params.id);
        if (!group) {
            res.status(404).json({ message: "Group not found" });
            return;
        }

        const siteTags = Array.isArray(group.siteTags) ? [...group.siteTags] : [];
        if (siteTags.includes(tagName)) {
            res.status(400).json({ message: "Tag already exists" });
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
        res.status(500).json({ message: err instanceof Error ? err.message : String(err) });
    }
}

export async function renameTag(req: Request, res: Response, next?: NextFunction): Promise<void> {
    const rawTagName = req.params.tagName;
    const tagName = (Array.isArray(rawTagName) ? rawTagName[0] : rawTagName) || "";
    const body = (req.body || {}) as RenameTagRequestBody;
    const rawNewTagName = body.newTagName;

    if (!rawNewTagName || typeof rawNewTagName !== "string" || !rawNewTagName.trim()) {
        res.status(400).json({ message: "New tag name is required" });
        return;
    }
    const newTagName = rawNewTagName.trim();

    if (tagName === "General") {
        res.status(400).json({ message: "Cannot rename General tag" });
        return;
    }

    try {
        const group = await resolveGroup<MutableGroup>(req.params.id);
        if (!group) {
            res.status(404).json({ message: "Group not found" });
            return;
        }

        const siteTags = Array.isArray(group.siteTags) ? [...group.siteTags] : [];
        const tagIndex = siteTags.indexOf(tagName);
        if (tagIndex === -1) {
            res.status(404).json({ message: "Tag not found" });
            return;
        }

        if (siteTags.includes(newTagName)) {
            res.status(400).json({ message: "New tag name already exists" });
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
        res.status(500).json({ message: err instanceof Error ? err.message : String(err) });
    }
}

export async function deleteTag(req: Request, res: Response, next?: NextFunction): Promise<void> {
    const rawTagName = req.params.tagName;
    const tagName = (Array.isArray(rawTagName) ? rawTagName[0] : rawTagName) || "";

    if (tagName === "General") {
        res.status(400).json({ message: "Cannot delete General tag" });
        return;
    }

    try {
        const group = await resolveGroup<MutableGroup>(req.params.id);
        if (!group) {
            res.status(404).json({ message: "Group not found" });
            return;
        }

        const siteTags = Array.isArray(group.siteTags) ? group.siteTags.filter((t: string) => t !== tagName) : [];
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
        res.status(500).json({ message: err instanceof Error ? err.message : String(err) });
    }
}

export async function updateSettings(req: Request, res: Response, next?: NextFunction): Promise<void> {
    try {
        const body = (req.body || {}) as UpdateSettingsRequestBody;
        const shiftTypes = body.shiftTypes || body.settings?.shiftTypes;
        const timeSlots = body.timeSlots || body.settings?.timeSlots;

        const group = await resolveGroup<MutableGroup>(req.params.id);
        if (!group) {
            res.status(404).json({ message: "Group not found" });
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
        res.status(400).json({ message: err instanceof Error ? err.message : String(err) });
    }
}

export async function updateGroup(req: Request, res: Response, next?: NextFunction): Promise<void> {
    const body = (req.body || {}) as UpdateGroupRequestBody;
    const { name, settings, siteTags } = body;

    try {
        const group = await resolveGroup<MutableGroup>(req.params.id);

        if (!group) {
            res.status(404).json({ message: "Group not found" });
            return;
        }

        // === SECURITY LAYER: Protect the System Admin Group ===
        if (group.name === config.superAdmin.groupName) {
            res.status(403).json({
                message: `System Security: The '${config.superAdmin.groupName}' group cannot be modified.`,
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
        res.status(400).json({ message: err instanceof Error ? err.message : String(err) });
    }
}

export async function deleteGroup(req: Request, res: Response, next?: NextFunction): Promise<void> {
    try {
        const group = await resolveGroup<MutableGroup>(req.params.id);
        if (!group) {
            res.status(404).json({ message: "Group not found" });
            return;
        }

        // === SECURITY LAYER: Protect System Admin Group ===
        if (group.name === config.superAdmin.groupName) {
            res.status(403).json({
                message: `System Security: The '${config.superAdmin.groupName}' group cannot be deleted.`,
            });
            return;
        }

        // === VALIDATION & CLEANUP ===
        // 1. Check if the group itself has active members
        const members = Array.isArray(group.members) ? group.members : [];
        if (members.length > 0) {
            res.status(400).json({
                message: "Cannot delete group with active members. Please remove members first.",
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
        res.status(500).json({ message: err instanceof Error ? err.message : String(err) });
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
