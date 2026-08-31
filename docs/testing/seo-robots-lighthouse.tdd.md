# TDD Evidence Report: Lighthouse SEO Score Optimization & Static robots.txt Routing

**Source Plan**: [`seo-optimization.plan.md`](file:///C:/Users/danie/.gemini/antigravity-cli/brain/f91d7174-f8b8-42ec-95ee-1bd9c8983703/seo-optimization.plan.md)  
**Execution Timestamp**: August 31, 2026  
**Status**: COMPLETE (All 63 test guarantees PASS, TypeScript client build PASS)  

---

## 1. User Journeys Tested

1. **User Journey 1 (Search Engine Discovery & Crawling Directives)**:
   - *As a web crawler / search engine bot*, I want to fetch `/robots.txt` from the root domain and receive a `text/plain` document defining crawling directives (`User-agent: *`, `Allow: /`, `Disallow: /api/`), so that indexing proceeds cleanly and private backend API paths are protected from public indexing.
2. **User Journey 2 (SPA Route Serving vs. Static Files)**:
   - *As an end user or crawler navigating client routes*, I want non-API page requests (e.g. `/sites`, `/phones`) to receive the Single Page Application `index.html` bundle with proper `<meta name="description">` metadata for SEO, while static files (e.g. `/robots.txt`, images, JS bundles) are served directly with appropriate Content-Type headers without falling back into the SPA loop.
3. **User Journey 3 (API 404 Isolation)**:
   - *As an API consumer*, I want non-existent `/api/*` endpoints to return structured JSON error payloads with HTTP 404 rather than returning the React SPA HTML template.

---

## 2. Test Execution & Evidence Summary

### TDD Cycle Evidence
- **RED Phase**: Ran `server/test/seo-routing.test.js` against the Express routing setup prior to creating `client/public/robots.txt`. The test failed with `AssertionError: Expected Content-Type to include 'text/plain', received 'text/html; charset=utf-8'`, proving the bug where crawlers requesting `/robots.txt` received the HTML single-page application fallback.
  - Checkpoint Commit: `4576f69` (`test: add reproducer for missing robots.txt static routing`)
- **GREEN Phase**:
  1. Added `<meta name="description" content="Hunting Lodge - A comprehensive full-stack management application designed for organizing operational groups, shifts, sites, and resource planning." />` in `<head>` of `client/index.html`.
  2. Created `client/public/robots.txt` with standard crawler directives.
  3. Structured `server/app.js` with `express.static` serving `/client/dist` before the wildcard SPA fallback route, with custom `setHeaders` cache policy for `robots.txt`.
  4. Executed `npm run build --workspace=client` verifying that Vite copies `/client/public/robots.txt` into `/client/dist/robots.txt`.
  5. Ran `npm test --workspace=server` verifying all 63 unit/integration tests passed.
  - Checkpoint Commit: `267e7a3` (`fix: add meta description and serve static robots.txt`)

### Test Specification Matrix

| # | What is Guaranteed | Test Target | Test Type | Result | Evidence Command |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | `GET /robots.txt` returns HTTP 200, `Content-Type: text/plain`, and valid directives (`User-agent: *`, `Allow: /`, `Disallow: /api/`) | `server/test/seo-routing.test.js` | Integration | PASS | `npm test --workspace=server` |
| 2 | SPA routes (e.g. `GET /sites`) return `text/html` with `<div id="root">` | `server/test/seo-routing.test.js` | Integration | PASS | `npm test --workspace=server` |
| 3 | Unmatched API routes (e.g. `GET /api/nonexistent`) return `application/json` 404 | `server/test/seo-routing.test.js` | Integration | PASS | `npm test --workspace=server` |
| 4 | Client SPA compiles with valid `<meta name="description">` in `dist/index.html` | `client/index.html` | Build Validation | PASS | `npm run build --workspace=client` |
| 5 | `dist/robots.txt` is copied from `public/robots.txt` during build | `client/dist/robots.txt` | Build Validation | PASS | `npm run build --workspace=client` |

---

## 3. Lighthouse SEO Impact

- **Meta Description**: Resolves the "Document does not have a meta description" audit failure.
- **Valid robots.txt**: Resolves the "robots.txt is not valid" audit failure (previously returned HTML markup).
- **Projected Lighthouse SEO Score**: **100/100**.
