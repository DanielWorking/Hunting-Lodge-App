/**
 * @module SSOCallback
 *
 * Handles the final stage of the SSO authentication flow (Step 6 to Step 9).
 * Processes the authorization code and state returned by the identity provider,
 * checks for IdP error responses, exchanges parameters with the backend,
 * and initializes the application session with smooth redirection.
 */

import { useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";
import { loginWithCode } from "../api/authApi";
import ThinkingLoader from "../components/ThinkingLoader";

/**
 * The SSO callback handler component.
 *
 * Renders a loading state while exchanging the authorization code for user data.
 * Persists the user's session and redirects to the application root upon success.
 *
 * @returns {JSX.Element} The rendered ThinkingLoader component.
 */
export default function SSOCallback() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();

    // Guard to prevent redundant authentication attempts in React 18 Strict Mode.
    const processedRef = useRef(false);

    useEffect(() => {
        // Step 6: Detect any error parameters sent back by the IdP
        const error = searchParams.get("error");
        const errorDescription = searchParams.get("error_description");

        if (error) {
            console.error("SSO Identity Provider returned an error:", error, errorDescription);
            const errorParam = errorDescription || error;
            navigate(`/login?error=${encodeURIComponent(errorParam)}`, { replace: true });
            return;
        }

        const code = searchParams.get("code");
        const state = searchParams.get("state");

        // Stop if the callback has already been processed or if the code is missing.
        if (processedRef.current) return;
        if (!code) {
            processedRef.current = true;
            navigate("/login?error=missing_code", { replace: true });
            return;
        }
        processedRef.current = true;

        /**
         * Step 7-9: Exchanges the authorization code and state for a user record on the server.
         * Performs a full page redirect on success to ensure global context
         * re-initialization with the new user state and httpOnly session cookies.
         */
        const handleSSOLogin = async (): Promise<void> => {
            try {
                const response = await loginWithCode({
                    code,
                    state,
                });
                const user = response.data.user;

                if (user && user._id) {
                    // Session persistence is managed exclusively via secure httpOnly cookies.
                    localStorage.setItem("hunting_userId", user._id);

                    // Login memberships carry plain group ids (the user is not populated)
                    const firstGroupId = user.groups?.[0]?.groupId;
                    if (firstGroupId) {
                        localStorage.setItem("hunting_groupId", firstGroupId);
                    }

                    // Force a full application reload to synchronize contexts and session cookies.
                    window.location.href = "/";
                } else {
                    console.error("No user data returned from authentication endpoint.");
                    navigate("/login?error=no_user_data", { replace: true });
                }
            } catch (error: unknown) {
                console.error("SSO Login failed during code exchange:", error);
                const errorMsg =
                    axios.isAxiosError(error) && error.response?.data?.message
                        ? String(error.response.data.message)
                        : "sso_failed";
                navigate(`/login?error=${encodeURIComponent(errorMsg)}`, { replace: true });
            }
        };

        void handleSSOLogin();
    }, [searchParams, navigate]);

    return <ThinkingLoader />;
}
