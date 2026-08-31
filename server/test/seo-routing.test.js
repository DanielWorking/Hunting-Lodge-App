const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const app = require("../app");

describe("SEO & Static Routing Verification", () => {
    let server;
    let baseUrl;

    before(async () => {
        await new Promise((resolve) => {
            server = http.createServer(app);
            server.listen(0, "127.0.0.1", () => {
                const address = server.address();
                baseUrl = `http://127.0.0.1:${address.port}`;
                resolve();
            });
        });
    });

    after(async () => {
        await new Promise((resolve) => {
            if (server) {
                server.close(resolve);
            } else {
                resolve();
            }
        });
    });

    describe("GET /robots.txt Route Integrity", () => {
        it("should return status 200, Content-Type text/plain, and valid robots.txt directives", async () => {
            const res = await fetch(`${baseUrl}/robots.txt`);
            const contentType = res.headers.get("content-type") || "";
            const bodyText = await res.text();

            assert.equal(res.status, 200, `Expected status 200, received ${res.status}`);
            assert.ok(
                contentType.includes("text/plain"),
                `Expected Content-Type to include 'text/plain', received '${contentType}'`
            );
            assert.ok(
                bodyText.includes("User-agent: *"),
                `Expected robots.txt to include 'User-agent: *', received:\n${bodyText}`
            );
            assert.ok(
                bodyText.includes("Allow: /"),
                `Expected robots.txt to include 'Allow: /', received:\n${bodyText}`
            );
            assert.ok(
                bodyText.includes("Disallow: /api/"),
                `Expected robots.txt to include 'Disallow: /api/', received:\n${bodyText}`
            );
        });
    });

    describe("SPA Wildcard Fallback vs API Route Handling", () => {
        it("should return HTML single-page application for client page routes and deep nested links", async () => {
            for (const route of ["/", "/sites", "/admin/users", "/groups/123/edit"]) {
                const res = await fetch(`${baseUrl}${route}`);
                const contentType = res.headers.get("content-type") || "";
                const bodyText = await res.text();

                assert.equal(res.status, 200, `Failed for route: ${route}`);
                assert.ok(
                    contentType.includes("text/html"),
                    `Expected Content-Type for ${route} to include 'text/html', received '${contentType}'`
                );
                assert.ok(
                    bodyText.includes("<div id=\"root\"></div>") || bodyText.includes("<!doctype html>"),
                    `Expected HTML response for ${route}`
                );
            }
        });

        it("should not route unmatched /api/* requests to SPA HTML fallback", async () => {
            const res = await fetch(`${baseUrl}/api/nonexistent-route-endpoint`);
            const contentType = res.headers.get("content-type") || "";

            assert.equal(res.status, 404);
            assert.ok(
                contentType.includes("application/json"),
                `Expected API 404 to return application/json, received '${contentType}'`
            );
        });
    });
});
