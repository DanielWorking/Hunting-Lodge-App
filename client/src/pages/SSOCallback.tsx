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
        if (processedRef.current || !code) return;
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
                const data = response.data;
                const user = data.user || data;
                const token = data.token;

                if (user && user._id) {
                    // Session persistence is managed exclusively via secure httpOnly cookies.
                    localStorage.setItem("hunting_userId", user._id);

                    if (Array.isArray(user.groups) && user.groups.length > 0) {
                        const firstGroup = user.groups[0];
                        const gid = typeof firstGroup.groupId === "object" && firstGroup.groupId !== null
                            ? (firstGroup.groupId as { _id?: string; name?: string })._id || (firstGroup.groupId as { name?: string }).name
                            : firstGroup.groupId || (firstGroup as { name?: string }).name || (firstGroup as { groupName?: string }).groupName;
                        if (gid) {
                            localStorage.setItem("hunting_groupId", String(gid));
                        }
                    }

                    // Force a full application reload to synchronize contexts and session cookies.
                    window.location.href = "/";
                } else {
                    console.error("No user data returned from authentication endpoint.");
                    navigate("/login?error=no_user_data", { replace: true });
                }
            } catch (error: unknown) {
                console.error("SSO Login failed during code exchange:", error);
                const axiosErr = error as { response?: { data?: { message?: string } } };
                const errorMsg = axiosErr?.response?.data?.message || "sso_failed";
                navigate(`/login?error=${encodeURIComponent(errorMsg)}`, { replace: true });
            }
        };

        handleSSOLogin();
    }, [searchParams, navigate]);

    return <ThinkingLoader />;
}
