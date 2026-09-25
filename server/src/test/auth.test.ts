import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import app from '../../app';
import mongoose from 'mongoose';

// Mock mongoose to prevent actual DB connection during tests
vi.mock('mongoose', async (importOriginal) => {
    const actual = await importOriginal<typeof mongoose>();
    return {
        ...actual,
        connect: vi.fn().mockResolvedValue(true),
        connection: {
            ...actual.connection,
            on: vi.fn(),
            close: vi.fn(),
        },
    };
});

function getSetCookies(res: request.Response): string[] {
    const raw = res.header['set-cookie'];
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string') return [raw];
    return [];
}

describe('Auth API (TDD)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('GET /api/auth/login', () => {
        it('generates PKCE verifier and challenge (S256), state, and nonce, sets secure HTTP-only transient cookie, and redirects to IDP authorization URL', async () => {
            const res = await request(app).get('/api/auth/login');
            expect(res.status).toBe(302);
            expect(res.header['set-cookie']).toBeDefined();
            const setCookie = getSetCookies(res).find((c: string) => c.startsWith('hl_auth_transient='));
            expect(setCookie).toBeDefined();
            expect(setCookie).toMatch(/HttpOnly/);
            expect(setCookie).toMatch(/Secure/);

            // Check redirect URL for expected query parameters
            const location = res.header.location;
            expect(location).toContain('client_id=');
            expect(location).toContain('redirect_uri=');
            expect(location).toContain('scope=');
            expect(location).toContain('state=');
            expect(location).toContain('nonce=');
            expect(location).toContain('code_challenge=');
            expect(location).toContain('code_challenge_method=S256');
        });

        it('responds with JSON { url } if requested with query ?format=json', async () => {
            const res = await request(app).get('/api/auth/login?format=json');
            expect(res.status).toBe(200);
            expect(res.body.url).toBeDefined();
            expect(res.body.url).toContain('client_id=');
        });

        it('supports backward compatibility for GET /api/auth/sso-url returning { url }', async () => {
            const res = await request(app).get('/api/auth/sso-url');
            expect(res.status).toBe(200);
            expect(res.body.url).toBeDefined();
            expect(res.body.url).toContain('client_id=');
        });
    });

    describe('GET /api/auth/callback', () => {
        it('validates state matches transient cookie, exchanges code, extracts claims, finds/creates user, sets session cookie, clears transient cookie, and redirects to /', async () => {
            const mockTransientCookie = 'hl_auth_transient=' + encodeURIComponent(JSON.stringify({
                codeVerifier: 'mockVerifier123456789012345678901234567890',
                state: 'mockState123',
                nonce: 'mockNonce123'
            }));

            const res = await request(app)
                .get('/api/auth/callback?code=mockAuthCode&state=mockState123')
                .set('Cookie', mockTransientCookie);

            expect(res.status).toBe(302);
            expect(res.header.location).toBe('/');
            
            // Should set session cookie
            const sessionCookie = getSetCookies(res).find((c: string) => c.startsWith('hl_session='));
            expect(sessionCookie).toBeDefined();
            expect(sessionCookie).toMatch(/HttpOnly/);
            expect(sessionCookie).toMatch(/Secure/);

            // Should clear transient cookie
            const clearCookie = getSetCookies(res).find((c: string) => c.startsWith('hl_auth_transient=') && (c.includes('Max-Age=0') || c.includes('Expires=')));
            expect(clearCookie).toBeDefined();
        });
    });

    describe('Security Validations & CSRF Defense', () => {
        it('rejects callback with 400/401 when state parameter is missing', async () => {
            const mockTransientCookie = 'hl_auth_transient=' + encodeURIComponent(JSON.stringify({
                codeVerifier: 'mockVerifier123',
                state: 'mockState123',
                nonce: 'mockNonce123'
            }));

            const res = await request(app)
                .get('/api/auth/callback?code=mockAuthCode') // missing state
                .set('Cookie', mockTransientCookie);

            expect([400, 401]).toContain(res.status);
        });

        it('rejects callback with 400/401 when state parameter does not match transient cookie', async () => {
            const mockTransientCookie = 'hl_auth_transient=' + encodeURIComponent(JSON.stringify({
                codeVerifier: 'mockVerifier123',
                state: 'mockState123',
                nonce: 'mockNonce123'
            }));

            const res = await request(app)
                .get('/api/auth/callback?code=mockAuthCode&state=invalidState')
                .set('Cookie', mockTransientCookie);

            expect([400, 401]).toContain(res.status);
        });

        it('rejects callback with 400 when transient cookie is absent/expired', async () => {
            const res = await request(app)
                .get('/api/auth/callback?code=mockAuthCode&state=mockState123');
                // no cookie

            expect(res.status).toBe(400);
        });

        it('gracefully handles provider error query parameter without unhandled exceptions', async () => {
            const mockTransientCookie = 'hl_auth_transient=' + encodeURIComponent(JSON.stringify({
                codeVerifier: 'mockVerifier123',
                state: 'mockState123',
                nonce: 'mockNonce123'
            }));

            const res = await request(app)
                .get('/api/auth/callback?error=access_denied&error_description=User+denied+access&state=mockState123')
                .set('Cookie', mockTransientCookie);

            expect([400, 401, 302]).toContain(res.status); 
            expect(res.status).not.toBe(500);
        });
    });

    describe('GET /api/auth/me', () => {
        it('returns user profile when valid hl_session cookie is present', async () => {
            const res = await request(app)
                .get('/api/auth/me')
                .set('Cookie', 'hl_session=mockValidJwtToken');

            expect(res.status).toBe(200);
            expect(res.body.user).toBeDefined();
        });

        it('supports fallback Authorization: Bearer <token> header', async () => {
            const res = await request(app)
                .get('/api/auth/me')
                .set('Authorization', 'Bearer mockValidJwtToken');

            expect(res.status).toBe(200);
            expect(res.body.user).toBeDefined();
        });

        it('rejects with 401 Unauthorized when neither cookie nor token is provided', async () => {
            const res = await request(app).get('/api/auth/me');
            expect(res.status).toBe(401);
        });
    });

    describe('POST /api/auth/logout', () => {
        it('clears hl_session and hl_auth_transient cookies and returns message', async () => {
            const res = await request(app).post('/api/auth/logout');
            expect(res.status).toBe(200);
            expect(res.body.message).toBe('Logged out successfully');

            const clearSession = getSetCookies(res).find((c: string) => c.startsWith('hl_session=') && (c.includes('Max-Age=0') || c.includes('Expires=')));
            const clearTransient = getSetCookies(res).find((c: string) => c.startsWith('hl_auth_transient=') && (c.includes('Max-Age=0') || c.includes('Expires=')));

            expect(clearSession).toBeDefined();
            expect(clearTransient).toBeDefined();
        });

        it('revokes the token so subsequent requests with that token are rejected', async () => {
            const testToken = 'tokenToBeRevoked123';

            // Call logout with this token
            const logoutRes = await request(app)
                .post('/api/auth/logout')
                .set('Cookie', `hl_session=${testToken}`);
            expect(logoutRes.status).toBe(200);

            // Attempt to use the revoked token in GET /api/auth/me
            const meRes = await request(app)
                .get('/api/auth/me')
                .set('Cookie', `hl_session=${testToken}`);
            expect(meRes.status).toBe(401);
            expect(meRes.body.code).toBe('TOKEN_REVOKED');
        });
    });

    describe('POST /api/auth/login (Backward compatibility)', () => {
        it('allows existing SPA client to exchange { code, state } via POST, returning { user, token } and setting hl_session cookie', async () => {
            const mockTransientCookie = 'hl_auth_transient=' + encodeURIComponent(JSON.stringify({
                codeVerifier: 'mockVerifier123',
                state: 'mockState123',
                nonce: 'mockNonce123'
            }));

            const res = await request(app)
                .post('/api/auth/login')
                .set('Cookie', mockTransientCookie)
                .send({
                    code: 'mockAuthCode',
                    state: 'mockState123'
                });

            expect(res.status).toBe(200);
            expect(res.body.user).toBeDefined();
            expect(res.body.token).toBeDefined();

            const sessionCookie = getSetCookies(res).find((c: string) => c.startsWith('hl_session='));
            expect(sessionCookie).toBeDefined();
        });

        it('allows login even when email_verified is explicitly false (bypasses email verification requirement in all environments)', async () => {
            const mockTransientCookie = 'hl_auth_transient=' + encodeURIComponent(JSON.stringify({
                codeVerifier: 'mockVerifier123',
                state: 'mockState123',
                nonce: 'mockNonce123'
            }));

            const res = await request(app)
                .post('/api/auth/login')
                .set('Cookie', mockTransientCookie)
                .send({
                    code: 'mockUnverifiedAuthCode',
                    state: 'mockState123'
                });

            expect(res.status).toBe(200);
            expect(res.body.user).toBeDefined();
            expect(res.body.user.email).toBe('mockuser@example.com');
            expect(res.body.token).toBeDefined();
        });
    });
});
