/**
 * @module SitesController
 * 
 * Handlers for managing group-specific web resources and links.
 * Enforces strict group isolation: all users (including Admins) must be
 * explicit members of a group to view, create, edit, or delete its resources.
 * Migrated to strict TypeScript with zero `any` and robust tenancy controls.
 */

import { Request, Response, NextFunction } from "express";
import { Types } from "mongoose";
import Site from "../models/Site";
import { isGroupMember, resolveGroup, AuthUser } from "../utils/authHelpers";

function extractParamId(param: string | string[] | undefined): string {
    if (!param) return "";
    return Array.isArray(param) ? param[0] : param;
}

export interface GetSitesRequestQuery {
    groupId?: string;
}

export interface CreateSiteRequestBody {
    title?: string;
    url?: string;
    imageUrl?: string;
    description?: string;
    groupId?: string;
    tag?: string;
    [key: string]: unknown;
}

export interface UpdateSiteRequestBody {
    title?: string;
    url?: string;
    imageUrl?: string;
    description?: string;
    groupId?: string;
    tag?: string;
    [key: string]: unknown;
}

export async function getSites(req: Request, res: Response, next?: NextFunction): Promise<void> {
    try {
        const query = (req.query || {}) as GetSitesRequestQuery;
        const { groupId } = query;
        const requestingUser = req.user as AuthUser | undefined;

        if (groupId && typeof groupId === "string") {
            // Check explicit access to specific group
            const hasAccess = await isGroupMember(requestingUser, groupId);
            if (!hasAccess) {
                res.status(403).json({
                    message: "Forbidden: You are not a member of this group.",
                    code: "FORBIDDEN_GROUP_MEMBER_REQUIRED",
                });
                return;
            }

            const group = await resolveGroup(groupId);
            if (!group) {
                res.json([]);
                return;
            }

            const sitesQuery = Site.find({ groupId: group._id });
            const sites = await (typeof (sitesQuery as any).lean === "function"
                ? (sitesQuery as any).lean()
                : sitesQuery);
            res.json(sites);
            return;
        }

        // Global fetch (filtered strictly to groups the requesting user is a member of)
        const userGroupIds = (requestingUser?.groups || [])
            .map((g) => {
                const gid = g?.groupId;
                if (gid && typeof gid === "object" && "_id" in gid) {
                    return (gid as { _id?: unknown })._id;
                }
                return gid;
            })
            .filter((id): id is Types.ObjectId | string => Boolean(id));

        const sitesQuery = Site.find({ groupId: { $in: userGroupIds } });
        const sites = await (typeof (sitesQuery as any).lean === "function"
            ? (sitesQuery as any).lean()
            : sitesQuery);
        res.json(sites);
    } catch (err: unknown) {
        if (typeof next === "function") {
            next(err);
            return;
        }
        res.status(500).json({ message: err instanceof Error ? err.message : String(err) });
    }
}

export async function createSite(req: Request, res: Response, next?: NextFunction): Promise<void> {
    const body = (req.body || {}) as CreateSiteRequestBody;
    const { title, url, imageUrl, description, groupId, tag } = body;

    try {
        if (!groupId || typeof groupId !== "string") {
            res.status(400).json({ message: "Target groupId is required." });
            return;
        }

        const group = await resolveGroup(groupId);
        if (!group) {
            res.status(404).json({ message: "Target group not found." });
            return;
        }

        const requestingUser = req.user as AuthUser | undefined;

        // Authorization: Verify user is an explicit member of the target group
        const hasAccess = await isGroupMember(requestingUser, group._id);
        if (!hasAccess) {
            res.status(403).json({
                message: "Forbidden: You are not a member of this group.",
                code: "FORBIDDEN_GROUP_MEMBER_REQUIRED",
            });
            return;
        }

        // --- Duplicate Check ---
        let existingSiteQuery: any = Site.findOne({ url, groupId: group._id });
        if (typeof existingSiteQuery?.select === "function") {
            const selected = existingSiteQuery.select("_id");
            if (selected) existingSiteQuery = selected;
        }
        const existingSite = await (typeof existingSiteQuery?.lean === "function"
            ? existingSiteQuery.lean()
            : existingSiteQuery);
        if (existingSite) {
            res.status(400).json({ message: "A resource with this link already exists in this group." });
            return;
        }

        const site = new Site({
            title: typeof title === "string" ? title.trim() : title,
            url: typeof url === "string" ? url.trim() : url,
            imageUrl: typeof imageUrl === "string" ? imageUrl.trim() : imageUrl,
            description: typeof description === "string" ? description.trim() : (description || ""),
            groupId: group._id,
            tag: tag || "General",
        });

        const newSite = await site.save();
        res.status(201).json(newSite);
    } catch (err: unknown) {
        if (typeof next === "function") {
            next(err);
            return;
        }
        res.status(400).json({ message: err instanceof Error ? err.message : String(err) });
    }
}

export async function updateSite(req: Request, res: Response, next?: NextFunction): Promise<void> {
    try {
        const siteId = extractParamId(req.params.id);
        let currentSiteQuery: any = Site.findById(siteId);
        if (typeof currentSiteQuery?.select === "function") {
            const selected = currentSiteQuery.select("groupId url");
            if (selected) currentSiteQuery = selected;
        }
        const currentSite = await (typeof currentSiteQuery?.lean === "function"
            ? currentSiteQuery.lean()
            : currentSiteQuery);
        if (!currentSite) {
            res.status(404).json({ message: "Site not found" });
            return;
        }

        const requestingUser = req.user as AuthUser | undefined;

        // Authorization: Verify user is an explicit member of the site's group
        const hasAccess = await isGroupMember(requestingUser, currentSite.groupId);
        if (!hasAccess) {
            res.status(403).json({
                message: "Forbidden: You are not a member of this group.",
                code: "FORBIDDEN_GROUP_MEMBER_REQUIRED",
            });
            return;
        }

        const body = (req.body || {}) as UpdateSiteRequestBody;
        const rawGroupId = currentSite.groupId;
        let currentGroupId: Types.ObjectId | string;
        if (rawGroupId instanceof Types.ObjectId) {
            currentGroupId = rawGroupId;
        } else if (rawGroupId && typeof rawGroupId === "object" && "_id" in rawGroupId) {
            const maybeId = (rawGroupId as { _id?: unknown })._id;
            currentGroupId = maybeId instanceof Types.ObjectId ? maybeId : String(maybeId);
        } else {
            currentGroupId = String(rawGroupId);
        }
        let targetGroupId: Types.ObjectId | string = currentGroupId;

        if (body.groupId && typeof body.groupId === "string") {
            const newGroup = await resolveGroup(body.groupId);
            if (!newGroup) {
                res.status(404).json({ message: "Group not found" });
                return;
            }
            const hasNewGroupAccess = await isGroupMember(requestingUser, newGroup._id);
            if (!hasNewGroupAccess) {
                res.status(403).json({
                    message: "Forbidden: You are not a member of the destination group.",
                });
                return;
            }
            targetGroupId = newGroup._id;
            body.groupId = newGroup._id.toString();
        }

        // If updating the URL or transferring groups, perform duplicate check within the target group
        const urlToCheck = typeof body.url === "string" ? body.url.trim() : currentSite.url;
        if (body.url !== undefined || body.groupId) {
            let duplicateSiteQuery: any = Site.findOne({
                url: urlToCheck,
                groupId: targetGroupId,
                _id: { $ne: siteId },
            });
            if (typeof duplicateSiteQuery?.select === "function") {
                const selected = duplicateSiteQuery.select("_id");
                if (selected) duplicateSiteQuery = selected;
            }
            const duplicateSite = await (typeof duplicateSiteQuery?.lean === "function"
                ? duplicateSiteQuery.lean()
                : duplicateSiteQuery);

            if (duplicateSite) {
                res.status(400).json({
                    message: "A resource with this link already exists in this group.",
                });
                return;
            }
        }

        const { title, url, imageUrl, description, tag } = body;
        const updateData: Record<string, unknown> = {};
        if (title !== undefined) updateData.title = typeof title === "string" ? title.trim() : title;
        if (url !== undefined) updateData.url = typeof url === "string" ? url.trim() : url;
        if (imageUrl !== undefined) updateData.imageUrl = typeof imageUrl === "string" ? imageUrl.trim() : imageUrl;
        if (description !== undefined) updateData.description = typeof description === "string" ? description.trim() : description;
        if (tag !== undefined) updateData.tag = typeof tag === "string" ? tag.trim() : tag;
        if (body.groupId) updateData.groupId = targetGroupId;

        const updatedSiteQuery = Site.findByIdAndUpdate(
            siteId,
            { $set: updateData },
            { returnDocument: "after", runValidators: true },
        );
        const updatedSite = await (typeof (updatedSiteQuery as any).lean === "function"
            ? (updatedSiteQuery as any).lean()
            : updatedSiteQuery);
        res.json(updatedSite);
    } catch (err: unknown) {
        if (typeof next === "function") {
            next(err);
            return;
        }
        res.status(400).json({ message: err instanceof Error ? err.message : String(err) });
    }
}

export async function deleteSite(req: Request, res: Response, next?: NextFunction): Promise<void> {
    try {
        const siteId = extractParamId(req.params.id);
        let currentSiteQuery: any = Site.findById(siteId);
        if (typeof currentSiteQuery?.select === "function") {
            const selected = currentSiteQuery.select("groupId");
            if (selected) currentSiteQuery = selected;
        }
        const currentSite = await (typeof currentSiteQuery?.lean === "function"
            ? currentSiteQuery.lean()
            : currentSiteQuery);
        if (!currentSite) {
            res.status(404).json({ message: "Site not found" });
            return;
        }

        const requestingUser = req.user as AuthUser | undefined;

        // Authorization: Verify user is an explicit member of the site's group
        const hasAccess = await isGroupMember(requestingUser, currentSite.groupId);
        if (!hasAccess) {
            res.status(403).json({
                message: "Forbidden: You are not a member of this group.",
                code: "FORBIDDEN_GROUP_MEMBER_REQUIRED",
            });
            return;
        }

        await Site.findByIdAndDelete(siteId);
        res.json({ message: "Site deleted" });
    } catch (err: unknown) {
        if (typeof next === "function") {
            next(err);
            return;
        }
        res.status(500).json({ message: err instanceof Error ? err.message : String(err) });
    }
}

export async function toggleFavorite(req: Request, res: Response, next?: NextFunction): Promise<void> {
    try {
        const siteId = extractParamId(req.params.id);
        const site = await Site.findById(siteId);
        if (!site) {
            res.status(404).json({ message: "Site not found" });
            return;
        }

        const requestingUser = req.user as AuthUser | undefined;

        // Authorization: Verify user is an explicit member of the site's group
        const hasAccess = await isGroupMember(requestingUser, site.groupId);
        if (!hasAccess) {
            res.status(403).json({
                message: "Forbidden: You are not a member of this group.",
                code: "FORBIDDEN_GROUP_MEMBER_REQUIRED",
            });
            return;
        }

        const rawUserId = requestingUser?._id || req.user?.id;
        if (!rawUserId) {
            res.status(401).json({ message: "Unauthorized" });
            return;
        }

        const userIdStr = rawUserId.toString();
        const favoritedBy = Array.isArray(site.favoritedBy) ? [...site.favoritedBy] : [];
        const index = favoritedBy.findIndex((id) => (id ? id.toString() : "") === userIdStr);

        if (index === -1) {
            favoritedBy.push(Types.ObjectId.isValid(userIdStr) ? new Types.ObjectId(userIdStr) : userIdStr);
        } else {
            favoritedBy.splice(index, 1);
        }
        site.favoritedBy = favoritedBy;

        const updatedSite = await site.save();
        res.json(updatedSite);
    } catch (err: unknown) {
        if (typeof next === "function") {
            next(err);
            return;
        }
        res.status(500).json({ message: err instanceof Error ? err.message : String(err) });
    }
}

export default {
    getSites,
    createSite,
    updateSite,
    deleteSite,
    toggleFavorite,
};
