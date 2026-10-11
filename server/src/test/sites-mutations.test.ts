import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import type { Request, Response } from "express";

import Site from "../models/Site";
import Group from "../models/Group";
import * as sitesController from "../controllers/sitesController";

interface MockRes {
    statusCode: number;
    jsonData: unknown;
    status: (code: number) => MockRes;
    json: (data: unknown) => void;
}

function createMockRes(): MockRes {
    const res: MockRes = {
        statusCode: 200,
        jsonData: null,
        status(code: number) {
            this.statusCode = code;
            return this;
        },
        json(data: unknown) {
            this.jsonData = data;
        },
    };
    return res;
}

const siteHolder = Site as unknown as Record<string, unknown>;
const groupHolder = Group as unknown as Record<string, unknown>;

const originals = {
    siteFindById: siteHolder.findById,
    siteFindOne: siteHolder.findOne,
    siteFindByIdAndUpdate: siteHolder.findByIdAndUpdate,
    siteFindByIdAndDelete: siteHolder.findByIdAndDelete,
    siteFindOneAndUpdate: siteHolder.findOneAndUpdate,
    groupFindById: groupHolder.findById,
};

afterEach(() => {
    siteHolder.findById = originals.siteFindById;
    siteHolder.findOne = originals.siteFindOne;
    siteHolder.findByIdAndUpdate = originals.siteFindByIdAndUpdate;
    siteHolder.findByIdAndDelete = originals.siteFindByIdAndDelete;
    siteHolder.findOneAndUpdate = originals.siteFindOneAndUpdate;
    groupHolder.findById = originals.groupFindById;
});

const siteId = new mongoose.Types.ObjectId().toString();
const groupId = new mongoose.Types.ObjectId().toString();
const userId = new mongoose.Types.ObjectId();

function memberRequest(body: Record<string, unknown> = {}): Request {
    return {
        user: { _id: userId, groups: [{ groupId }] },
        params: { id: siteId },
        body,
    } as unknown as Request;
}

function stubGroupMembership(): void {
    groupHolder.findById = async () => ({ _id: groupId });
}

describe("sitesController mutations only report success for real persistence", () => {
    it("updateSite responds 404 and no site body when the update matches no document", async () => {
        stubGroupMembership();
        siteHolder.findById = async () => ({ _id: siteId, groupId, url: "https://a.example" });
        siteHolder.findOne = async () => null;
        siteHolder.findByIdAndUpdate = async () => null;

        const res = createMockRes();
        await sitesController.updateSite(memberRequest({ title: "Renamed" }), res as unknown as Response);

        assert.equal(res.statusCode, 404);
        assert.deepEqual(res.jsonData, { message: "Site not found" });
    });

    it("updateSite responds 200 with the updated document when one is written", async () => {
        stubGroupMembership();
        siteHolder.findById = async () => ({ _id: siteId, groupId, url: "https://a.example" });
        siteHolder.findOne = async () => null;
        siteHolder.findByIdAndUpdate = async () => ({ _id: siteId, title: "Renamed" });

        const res = createMockRes();
        await sitesController.updateSite(memberRequest({ title: "Renamed" }), res as unknown as Response);

        assert.equal(res.statusCode, 200);
        assert.deepEqual(res.jsonData, { _id: siteId, title: "Renamed" });
    });

    it("deleteSite responds 404 when no document was deleted", async () => {
        stubGroupMembership();
        siteHolder.findById = async () => ({ _id: siteId, groupId });
        siteHolder.findByIdAndDelete = async () => null;

        const res = createMockRes();
        await sitesController.deleteSite(memberRequest(), res as unknown as Response);

        assert.equal(res.statusCode, 404);
        assert.deepEqual(res.jsonData, { message: "Site not found" });
    });

    it("deleteSite responds 200 with a confirmation only when a document was deleted", async () => {
        stubGroupMembership();
        siteHolder.findById = async () => ({ _id: siteId, groupId });
        siteHolder.findByIdAndDelete = async () => ({ _id: siteId });

        const res = createMockRes();
        await sitesController.deleteSite(memberRequest(), res as unknown as Response);

        assert.equal(res.statusCode, 200);
        assert.deepEqual(res.jsonData, { message: "Site deleted" });
    });

    it("toggleFavorite persists with one atomic pipeline update and returns the stored document", async () => {
        stubGroupMembership();
        siteHolder.findById = () => ({
            select: () => ({ lean: async () => ({ _id: siteId, groupId }) }),
        });

        let captured: { filter: unknown; update: unknown; options: Record<string, unknown> } | null = null;
        siteHolder.findOneAndUpdate = async (
            filter: unknown,
            update: unknown,
            options: Record<string, unknown>,
        ) => {
            captured = { filter, update, options };
            return { _id: siteId, favoritedBy: [userId] };
        };

        const res = createMockRes();
        await sitesController.toggleFavorite(memberRequest(), res as unknown as Response);

        assert.equal(res.statusCode, 200);
        assert.ok(captured, "findOneAndUpdate must be called");
        const write = captured as { filter: unknown; update: unknown; options: Record<string, unknown> };
        assert.ok(Array.isArray(write.update), "update must be an aggregation pipeline so the toggle is one write");
        assert.equal(write.options.returnDocument, "after", "the updated document must be returned");
        assert.equal(
            write.options.updatePipeline,
            true,
            "Mongoose requires updatePipeline for an aggregation-pipeline update",
        );
        assert.ok(JSON.stringify(write.update).includes("$cond"), "pipeline must decide add or remove server-side");
        assert.ok(JSON.stringify(write.update).includes(userId.toHexString()), "pipeline must reference the requesting user");
        assert.deepEqual(res.jsonData, { _id: siteId, favoritedBy: [userId] });
    });

    it("toggleFavorite responds 404 when the atomic update matches no site", async () => {
        stubGroupMembership();
        siteHolder.findById = () => ({
            select: () => ({ lean: async () => ({ _id: siteId, groupId }) }),
        });
        siteHolder.findOneAndUpdate = async () => null;

        const res = createMockRes();
        await sitesController.toggleFavorite(memberRequest(), res as unknown as Response);

        assert.equal(res.statusCode, 404);
        assert.deepEqual(res.jsonData, { message: "Site not found" });
    });
});
