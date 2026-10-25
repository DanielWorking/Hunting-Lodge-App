/**
 * @module VisibilityAndLogoutTests
 *
 * - A member's vacation balance is visible only to the member and to Shift Managers of their group.
 * - Email and last login are visible only to the member and to Administrators.
 * - Logout also revokes the OIDC refresh token at the identity provider.
 */

import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import type { Request, Response } from "express";
import { Issuer } from "openid-client";

import config from "../config";
import ssoConfig from "../config/sso";
import Group from "../models/Group";
import User from "../models/User";
import * as usersController from "../controllers/usersController";
import * as authController from "../controllers/authController";
import { clearGroupCache } from "../utils/authHelpers";

interface MockRes {
    statusCode: number;
    body: unknown;
    status: (code: number) => MockRes;
    json: (data: unknown) => MockRes;
    clearCookie: () => MockRes;
    cookie: (name: string, value: string) => MockRes;
    cookies: Record<string, string>;
}

function createMockRes(): MockRes {
    return {
        statusCode: 200,
        body: null,
        status(code: number) {
            this.statusCode = code;
            return this;
        },
        json(data: unknown) {
            this.body = data;
            return this;
        },
        clearCookie() {
            return this;
        },
        cookies: {},
        cookie(name: string, value: string) {
            this.cookies[name] = value;
            return this;
        },
    };
}

const restores: Array<() => void> = [];
function patch(target: unknown, key: string, value: unknown): void {
    const holder = target as Record<string, unknown>;
    const original = holder[key];
    holder[key] = value;
    restores.push(() => {
        holder[key] = original;
    });
}
afterEach(() => {
    while (restores.length > 0) restores.pop()?.();
    clearGroupCache();
});

const newId = (): string => new mongoose.Types.ObjectId().toString();

describe("GET /users?groupId: per-requester field visibility", () => {
    const groupId = newId();
    const self = { _id: newId(), username: "me", email: "me@example.com", lastLogin: "2026-10-13", vacationBalance: 7, groups: [{ groupId, role: "member" }] };
    const colleague = { _id: newId(), username: "colleague", email: "colleague@example.com", lastLogin: "2026-10-12", vacationBalance: 3, groups: [{ groupId, role: "member" }] };

    async function listAs(requester: Record<string, unknown>): Promise<Record<string, Record<string, unknown>>> {
        patch(Group, "findById", async () => ({ _id: groupId, name: `vis-${groupId}` }));
        patch(User, "find", async () => [self, colleague]);
        const res = createMockRes();
        await usersController.getUsers({ query: { groupId }, user: requester } as unknown as Request, res as unknown as Response, () => {});
        assert.equal(res.statusCode, 200);
        return Object.fromEntries((res.body as Array<Record<string, unknown>>).map((u) => [String(u.username), u]));
    }

    it("a regular member sees their own contact details but no balance at all, their own included", async () => {
        const users = await listAs(self);
        assert.equal("vacationBalance" in users.me, false, "only Shift Managers see balances");
        assert.equal(users.me.email, "me@example.com");
        assert.equal("vacationBalance" in users.colleague, false);
        assert.equal("email" in users.colleague, false);
        assert.equal("lastLogin" in users.colleague, false);
        assert.equal(users.colleague.username, "colleague", "the rest of the profile stays visible");
    });

    it("the group's Shift Manager sees members' balances but not their email or last login", async () => {
        const users = await listAs({ _id: newId(), username: "mgr", groups: [{ groupId, role: "shift_manager" }] });
        assert.equal(users.colleague.vacationBalance, 3);
        assert.equal("email" in users.colleague, false);
        assert.equal("lastLogin" in users.colleague, false);
    });

    it("a Shift Manager sees their own balance in the members list of the group they manage", async () => {
        const manager = { ...self, groups: [{ groupId, role: "shift_manager" }] };
        const users = await listAs(manager);
        assert.equal(users.me.vacationBalance, 7);
    });

    it("an Administrator who is not the group's Shift Manager sees email and last login but no balance", async () => {
        const users = await listAs({ _id: newId(), username: config.superAdmin.username, groups: [{ groupId, role: "member" }] });
        assert.equal(users.colleague.email, "colleague@example.com");
        assert.equal(users.colleague.lastLogin, "2026-10-12");
        assert.equal("vacationBalance" in users.colleague, false);
    });
});

describe("POST /auth/logout: refresh token revocation at the identity provider", () => {
    function mockProvider(revoke: (token: string, hint?: string) => Promise<void>): void {
        authController.resetClientCache();
        restores.push(() => authController.resetClientCache());
        patch(Issuer, "discover", async () => ({
            Client: class {
                revoke = revoke;
                endSessionUrl(): string {
                    return "https://idp.example.com/logout";
                }
            },
        }));
        patch(User, "updateOne", async () => ({ matchedCount: 0 }));
        patch(console, "warn", () => {});
    }

    it("revokes the refresh token sent in the refresh cookie", async () => {
        const revoked: Array<[string, string | undefined]> = [];
        mockProvider(async (token, hint) => {
            revoked.push([token, hint]);
        });
        const res = createMockRes();

        await authController.logout(
            { headers: {}, cookies: { [ssoConfig.refreshCookieName]: authController.sealRefreshToken("refresh-token-123", { _id: newId(), tokenVersion: 0 }) } } as unknown as Request,
            res as unknown as Response,
            () => {},
        );

        assert.equal(res.statusCode, 200);
        assert.deepEqual(revoked, [["refresh-token-123", "refresh_token"]]);
    });

    it("still logs out when the provider refuses the revocation", async () => {
        mockProvider(async () => {
            throw new Error("revocation_endpoint must be configured on the issuer");
        });
        const res = createMockRes();

        await authController.logout(
            { headers: {}, cookies: { [ssoConfig.refreshCookieName]: authController.sealRefreshToken("refresh-token-123", { _id: newId(), tokenVersion: 0 }) } } as unknown as Request,
            res as unknown as Response,
            () => {},
        );

        assert.equal(res.statusCode, 200);
        assert.equal((res.body as Record<string, unknown>).success, true);
    });
});

describe("POST /auth/refresh: the refresh cookie is bound to its session", () => {
    const userId = newId();

    function mockRefresh(user: Record<string, unknown> | null, claims: Record<string, unknown> = { sub: "auth0|alice" }) {
        const calls: string[] = [];
        authController.resetClientCache();
        restores.push(() => authController.resetClientCache());
        patch(Issuer, "discover", async () => ({
            Client: class {
                refresh = async (refreshToken: string) => {
                    calls.push(refreshToken);
                    return { access_token: "a", id_token: "id", refresh_token: "rotated-refresh", expires_in: 3600, claims: () => claims };
                };
            },
        }));
        patch(User, "findById", async () => user);
        patch(console, "error", () => {});
        return calls;
    }

    async function refreshWith(cookie: string): Promise<MockRes> {
        const res = createMockRes();
        await authController.refreshToken({ cookies: { [ssoConfig.refreshCookieName]: cookie } } as unknown as Request, res as unknown as Response);
        return res;
    }

    const alice = { _id: userId, username: "alice", email: "alice@example.com", isActive: true, tokenVersion: 2, ssoSubject: "auth0|alice" };

    it("renews the session for the bound user and re-seals the rotated refresh token", async () => {
        const calls = mockRefresh(alice);

        const res = await refreshWith(authController.sealRefreshToken("refresh-1", { _id: userId, tokenVersion: 2 }));

        assert.equal(res.statusCode, 200);
        assert.deepEqual(calls, ["refresh-1"]);
        assert.ok(res.cookies[ssoConfig.sessionCookieName], "a new session cookie is issued");
        const resealed = res.cookies[ssoConfig.refreshCookieName];
        assert.notEqual(resealed, "rotated-refresh", "the provider token is never stored unsealed");
        const reuse = mockRefresh(alice);
        await refreshWith(resealed);
        assert.deepEqual(reuse, ["rotated-refresh"]);
    });

    it("rejects an unsigned or tampered cookie without calling the identity provider", async () => {
        const calls = mockRefresh(alice);

        const res = await refreshWith("raw-provider-refresh-token");

        assert.equal(res.statusCode, 401);
        assert.equal((res.body as Record<string, unknown>).code, "REFRESH_FAILED");
        assert.deepEqual(calls, []);
    });

    it("rejects a refresh cookie from a session that was logged out (tokenVersion moved on)", async () => {
        const calls = mockRefresh({ ...alice, tokenVersion: 3 });

        const res = await refreshWith(authController.sealRefreshToken("refresh-1", { _id: userId, tokenVersion: 2 }));

        assert.equal(res.statusCode, 401);
        assert.equal((res.body as Record<string, unknown>).code, "REFRESH_FAILED");
        assert.deepEqual(calls, [], "a revoked session must not reach the provider");
    });

    it("rejects a renewal whose identity token belongs to another provider account", async () => {
        mockRefresh(alice, { sub: "auth0|mallory" });

        const res = await refreshWith(authController.sealRefreshToken("refresh-1", { _id: userId, tokenVersion: 2 }));

        assert.equal(res.statusCode, 401);
        assert.equal(res.cookies[ssoConfig.sessionCookieName], undefined, "no session may be issued");
    });
});
