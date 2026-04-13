/**
 * @module SSOCallback
 *
 * Handles the final stage of the SSO authentication flow.
 * Processes the authorization code and state returned by the identity provider,
 * exchanges them for user data, and initializes the application session.
 */

import { useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";
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
        const code = searchParams.get("code");
        const state = searchParams.get("state");

        // Stop if the callback has already been processed or if the code is missing.
        if (processedRef.current || !code) return;
        processedRef.current = true;

        /**
         * Exchanges the authorization code for a user record on the server.
         *
         * Performs a full page redirect on success to ensure global context
         * re-initialization with the new user state.
         */
        const handleSSOLogin = async () => {
            try {
                const response = await axios.post("/api/auth/login", {
                    code,
                    state,
                });
                const user = response.data;

                if (user && (user._id || user.id)) {
                    // Persist the user identifier for session persistence.
                    localStorage.setItem("hunting_userId", user._id || user.id);

                    // Force a full application reload to synchronize the UserContext.
                    window.location.href = "/";
                } else {
                    console.error("No user data returned from authentication endpoint.");
                    navigate("/login?error=no_user_data");
                }
            } catch (error) {
                console.error("SSO Login failed during code exchange:", error);
                navigate("/login?error=sso_failed");
            }
        };

        handleSSOLogin();
    }, [searchParams, navigate]);

    return <ThinkingLoader />;
}
