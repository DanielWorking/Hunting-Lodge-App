import { useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";
import ThinkingLoader from "../components/ThinkingLoader";

export default function SSOCallback() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const processedRef = useRef(false); // למניעת ריצה כפולה (React 18 Strict Mode)

    useEffect(() => {
        const code = searchParams.get("code");
        const state = searchParams.get("state");

        // אם כבר הרצנו את הבדיקה או שאין קוד, עוצרים
        if (processedRef.current || !code) return;
        processedRef.current = true;

        const handleSSOLogin = async () => {
            try {
                // שלב 6 בתרשים: שליחת הקוד לשרת [cite: 26-27]
                const response = await axios.post("/api/auth/login", {
                    code,
                    state,
                });
                const user = response.data;

                if (user && (user._id || user.id)) {
                    // שמירת המזהה ב-localStorage (כמו ב-Login רגיל)
                    localStorage.setItem("hunting_userId", user._id || user.id);

                    // רענון מלא של האתר כדי ש-UserContext יקלוט את המשתמש החדש
                    window.location.href = "/";
                } else {
                    console.error("No user data returned");
                    navigate("/login?error=no_user_data");
                }
            } catch (error) {
                console.error("SSO Login failed:", error);
                navigate("/login?error=sso_failed");
            }
        };

        handleSSOLogin();
    }, [searchParams, navigate]);

    return <ThinkingLoader />;
}
