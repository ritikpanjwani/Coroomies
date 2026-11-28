import { useState, useEffect, useRef } from "react";
import api from "./api";
import { saveToken } from "./auth";
import AuthLayout from "./components/auth/AuthLayout";
import { Input } from "./components/ui/Field";
import Button from "./components/ui/Button";
import { useToast } from "./components/Toast";
import { errorMessage } from "./utils/format";
import { AlertIcon, CheckCircleIcon } from "./components/Icons";
import GoogleSignInButton from "./components/auth/GoogleSignInButton";

function maskEmail(email) {
    if (!email || !email.includes("@")) return "***@***";
    const [local, domain] = email.trim().split("@");
    const maskedLocal =
        local.length <= 2
            ? `${local[0]}*`
            : `${local[0]}${"*".repeat(local.length - 2)}${local.slice(-1)}`;
    const domainParts = domain.split(".");
    if (domainParts.length >= 2) {
        const name = domainParts[0];
        const maskedDomain = name.length > 1 ? `${name[0]}${"*".repeat(name.length - 1)}` : name;
        return `${maskedLocal}@${maskedDomain}.${domainParts.slice(1).join(".")}`;
    }
    return `${maskedLocal}@${domain}`;
}

function Login({ onLogin, goToForgot }) {
    // Mode: "email" (enter email to receive OTP) | "otp" (enter 6-digit code)
    const [mode, setMode] = useState("email");
    const [email, setEmail] = useState("");
    const [otp, setOtp] = useState("");
    const [loading, setLoading] = useState(false);
    const [errors, setErrors] = useState({});
    const [resendCooldown, setResendCooldown] = useState(0);

    // Google OAuth & Account Linking state
    const [googleCredential, setGoogleCredential] = useState("");
    const [linkRequired, setLinkRequired] = useState(false);
    const [linkEmail, setLinkEmail] = useState("");
    const [linkMaskedEmail, setLinkMaskedEmail] = useState("");
    const [linkMode, setLinkMode] = useState("otp"); // "otp" | "password"
    const [linkPassword, setLinkPassword] = useState("");
    const [linkOtp, setLinkOtp] = useState("");
    const [linkOtpSent, setLinkOtpSent] = useState(false);
    const [linkCooldown, setLinkCooldown] = useState(0);
    const [linkSending, setLinkSending] = useState(false);
    const [linkVerifying, setLinkVerifying] = useState(false);

    // Legacy password fallback toggle
    const [showPasswordFallback, setShowPasswordFallback] = useState(false);
    const [identifier, setIdentifier] = useState("");
    const [password, setPassword] = useState("");

    const toast = useToast();
    const otpInputRef = useRef(null);
    const linkOtpInputRef = useRef(null);

    // Resend countdown timer for general login OTP
    useEffect(() => {
        if (resendCooldown <= 0) return;
        const timer = setInterval(() => {
            setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
        }, 1000);
        return () => clearInterval(timer);
    }, [resendCooldown]);

    // Resend countdown timer for account linking OTP
    useEffect(() => {
        if (linkCooldown <= 0) return;
        const timer = setInterval(() => {
            setLinkCooldown((prev) => (prev > 0 ? prev - 1 : 0));
        }, 1000);
        return () => clearInterval(timer);
    }, [linkCooldown]);

    // Auto-focus OTP input when entering "otp" mode
    useEffect(() => {
        if (mode === "otp" && otpInputRef.current) {
            otpInputRef.current.focus();
        }
    }, [mode]);

    // Auto-focus Link OTP input when link code is sent
    useEffect(() => {
        if (linkRequired && linkOtpSent && linkOtpInputRef.current) {
            linkOtpInputRef.current.focus();
        }
    }, [linkRequired, linkOtpSent]);

    const handleAuthSuccess = (data) => {
        saveToken(data.access_token);
        if (data.user?.id) {
            localStorage.setItem("user_id", String(data.user.id));
        }
        if (data.user?.name) {
            localStorage.setItem("user_name", data.user.name);
        }
        if (data.user?.username) {
            localStorage.setItem("user_username", data.user.username);
        }
        if (data.user?.avatar_url) {
            localStorage.setItem("user_avatar", data.user.avatar_url);
        } else {
            localStorage.removeItem("user_avatar");
        }

        const name = data.user?.name || "friend";
        if (data.is_new_user) {
            toast.success(`Welcome to CoRoomies, ${name}! Your account is ready.`);
        } else {
            toast.success(`Welcome back, ${name}!`);
        }
        onLogin();
    };

    // Stage 1: Send Login OTP via Email
    const handleSendOtp = async (e) => {
        if (e) e.preventDefault();
        if (loading) return;

        const cleanEmail = email.trim().toLowerCase();
        if (!cleanEmail) {
            setErrors({ email: "Please enter your email address" });
            return;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
            setErrors({ email: "Please enter a valid email address" });
            return;
        }

        try {
            setLoading(true);
            setErrors({});

            await api.post("/auth/otp/send", { email: cleanEmail });
            setMode("otp");
            setResendCooldown(60);

            toast.success(`Verification code sent to ${cleanEmail}`);
        } catch (err) {
            setErrors({
                form: errorMessage(err, "Failed to send verification code. Please try again."),
            });
        } finally {
            setLoading(false);
        }
    };

    // Stage 2: Verify Login OTP
    const handleVerifyOtp = async (e, overrideOtp) => {
        if (e) e.preventDefault();
        if (loading) return;

        const cleanOtp = (overrideOtp !== undefined ? overrideOtp : otp).trim();
        if (!cleanOtp || cleanOtp.length !== 6 || !/^\d{6}$/.test(cleanOtp)) {
            setErrors({ otp: "Please enter the 6-digit verification code" });
            return;
        }

        try {
            setLoading(true);
            setErrors({});
            const res = await api.post("/auth/otp/verify", {
                email: email.trim().toLowerCase(),
                otp: cleanOtp,
            });
            handleAuthSuccess(res.data);
        } catch (err) {
            setErrors({
                otp: errorMessage(err, "Invalid or expired verification code."),
                form: errorMessage(err, "Invalid or expired verification code. Please try again."),
            });
        } finally {
            setLoading(false);
        }
    };

    // Auto-verify when 6th digit is typed or pasted in login OTP
    const handleOtpChange = (e) => {
        const val = e.target.value.replace(/\D/g, "").slice(0, 6);
        setOtp(val);
        setErrors((prev) => ({ ...prev, otp: "", form: "" }));
        if (val.length === 6) {
            handleVerifyOtp(null, val);
        }
    };

    // Resend Login OTP
    const handleResendOtp = async () => {
        if (resendCooldown > 0 || loading) return;
        try {
            setLoading(true);
            setErrors({});
            const cleanEmail = email.trim().toLowerCase();
            await api.post("/auth/otp/send", { email: cleanEmail });
            setResendCooldown(60);
            toast.success("A new verification code has been sent!");
        } catch (err) {
            setErrors({
                form: errorMessage(err, "Could not resend verification code. Please wait and try again."),
            });
        } finally {
            setLoading(false);
        }
    };

    // Google Sign-In Handler
    const handleGoogleCredential = async (credential) => {
        if (loading) return;
        setLoading(true);
        setErrors({});
        setGoogleCredential(credential);
        setLinkRequired(false);
        try {
            const response = await api.post("/auth/google", { credential });
            handleAuthSuccess(response.data);
        } catch (err) {
            const detail = err.response?.data?.detail;
            if (err.response?.status === 409 && detail?.code === "account_link_required") {
                setLinkRequired(true);
                const targetEmail = detail.email || "";
                const masked = detail.masked_email || (targetEmail ? maskEmail(targetEmail) : "your email");
                setLinkEmail(targetEmail);
                setLinkMaskedEmail(masked);
                setLinkMode("otp");
                setLinkOtp("");
                setLinkOtpSent(false);
                setLinkPassword("");
                setErrors({});
            } else {
                setErrors({ form: errorMessage(err, "Google sign-in failed. Please try again.") });
            }
        } finally {
            setLoading(false);
        }
    };

    // Google Account Linking: Send OTP derived from server-verified Google identity
    const handleSendLinkOtp = async () => {
        if (linkSending) return;
        try {
            setLinkSending(true);
            setErrors({});

            let res;
            if (googleCredential) {
                res = await api.post("/auth/google/link-otp/send", { credential: googleCredential });
            } else if (linkEmail) {
                res = await api.post("/auth/otp/send", { email: linkEmail });
            } else {
                setErrors({ link: "Google session expired. Please sign in with Google again." });
                return;
            }

            setLinkOtpSent(true);
            setLinkCooldown(60);
            if (res.data?.masked_email) {
                setLinkMaskedEmail(res.data.masked_email);
            }
            if (res.data?.email) {
                setLinkEmail(res.data.email);
            }
            toast.success(`Verification code sent to ${res.data?.masked_email || linkMaskedEmail || "your email"}`);
        } catch (err) {
            setErrors({ link: errorMessage(err, "Could not send verification code. Please try again.") });
        } finally {
            setLinkSending(false);
        }
    };

    // Google Account Linking: Auto-verify when 6th digit entered
    const handleLinkOtpChange = (e) => {
        const val = e.target.value.replace(/\D/g, "").slice(0, 6);
        setLinkOtp(val);
        setErrors((prev) => ({ ...prev, link: "" }));
        if (val.length === 6) {
            handleGoogleLink(null, val);
        }
    };

    // Google Account Linking Submission (Password or OTP)
    const handleGoogleLink = async (e, overrideOtp) => {
        if (e) e.preventDefault();
        if (linkVerifying) return;

        const cleanOtp = (overrideOtp !== undefined ? overrideOtp : linkOtp).trim();
        const payload = { credential: googleCredential };
        if (linkMode === "password") {
            if (!linkPassword) {
                setErrors({ link: "Please enter your account password." });
                return;
            }
            payload.password = linkPassword;
        } else {
            if (!cleanOtp || cleanOtp.length !== 6 || !/^\d{6}$/.test(cleanOtp)) {
                setErrors({ link: "Please enter the 6-digit verification code." });
                return;
            }
            payload.otp = cleanOtp;
        }

        try {
            setLinkVerifying(true);
            setErrors({});
            const response = await api.post("/auth/google/link", payload);
            handleAuthSuccess(response.data);
        } catch (err) {
            setErrors({
                link: errorMessage(err, "Verification failed. Please check your credentials and try again."),
            });
        } finally {
            setLinkVerifying(false);
        }
    };

    // Legacy Password Login Handler
    const handleLegacyPasswordLogin = async (e) => {
        if (e) e.preventDefault();
        if (loading) return;

        const nextErrors = {};
        if (!identifier.trim()) {
            nextErrors.identifier = "Enter your email or username";
        }
        if (!password) {
            nextErrors.password = "Enter your password";
        }
        setErrors(nextErrors);
        if (Object.keys(nextErrors).length > 0) return;

        try {
            setLoading(true);
            const response = await api.post("/auth/login", {
                identifier: identifier.trim(),
                password,
            });
            handleAuthSuccess(response.data);
        } catch (err) {
            const status = err.response?.status;
            let msg = "Invalid username/email or password";
            if (status !== 401 && status !== 400) {
                msg = errorMessage(err, "Login failed. Please check your connection and try again.");
            }
            setErrors({ form: msg });
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthLayout
            title={
                linkRequired
                    ? "Link Google account"
                    : mode === "otp"
                    ? "Check your email"
                    : "Welcome to CoRoomies"
            }
            subtitle={
                linkRequired
                    ? `An account already exists for ${linkMaskedEmail || "your email"}. Verify to connect Google.`
                    : mode === "otp"
                    ? `We sent a 6-digit code to ${email}`
                    : "Sign in or create your account in seconds"
            }
        >
            {/* Top alert banner for error feedback */}
            {errors.form && (
                <div
                    role="alert"
                    className="mb-4 flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50/90 dark:border-rose-900/50 dark:bg-rose-950/40 p-3.5 text-sm font-medium text-rose-700 dark:text-rose-300 animate-slide-up"
                >
                    <AlertIcon className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
                    <span>{errors.form}</span>
                </div>
            )}



            {/* Streamlined Account Linking Interface */}
            {linkRequired ? (
                <div className="space-y-4 animate-slide-up">
                    <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 text-center dark:border-slate-800 dark:bg-slate-900/60">
                        <div className="mx-auto mb-1.5 flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-brand-600 dark:bg-brand-950/80 dark:text-brand-400">
                            <CheckCircleIcon className="h-5 w-5" />
                        </div>
                        <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
                            Destination Email: <strong className="text-slate-900 dark:text-slate-100">{linkMaskedEmail || "your email"}</strong>
                        </p>
                    </div>

                    {errors.link && (
                        <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-medium text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-300">
                            <AlertIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-500" />
                            <span>{errors.link}</span>
                        </div>
                    )}

                    {/* Method Selector Tabs */}
                    <div className="flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800 text-xs font-medium">
                        <button
                            type="button"
                            onClick={() => {
                                setLinkMode("otp");
                                setErrors((prev) => ({ ...prev, link: "" }));
                            }}
                            className={`flex-1 rounded-lg py-2 transition-colors ${
                                linkMode === "otp"
                                    ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100 font-semibold"
                                    : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
                            }`}
                        >
                            Email verification code
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setLinkMode("password");
                                setErrors((prev) => ({ ...prev, link: "" }));
                            }}
                            className={`flex-1 rounded-lg py-2 transition-colors ${
                                linkMode === "password"
                                    ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100 font-semibold"
                                    : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
                            }`}
                        >
                            Existing password
                        </button>
                    </div>

                    {linkMode === "otp" ? (
                        !linkOtpSent ? (
                            <div className="space-y-3 pt-1">
                                <Button
                                    type="button"
                                    size="lg"
                                    fullWidth
                                    loading={linkSending}
                                    onClick={handleSendLinkOtp}
                                >
                                    {linkSending ? `Sending code to ${linkMaskedEmail}...` : `Send code to ${linkMaskedEmail}`}
                                </Button>
                            </div>
                        ) : (
                            <form onSubmit={handleGoogleLink} className="space-y-4">
                                <div>
                                    <label
                                        htmlFor="link-otp-code"
                                        className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-2 text-center"
                                    >
                                        6-Digit Verification Code
                                    </label>
                                    <input
                                        ref={linkOtpInputRef}
                                        id="link-otp-code"
                                        type="text"
                                        inputMode="numeric"
                                        pattern="[0-9]*"
                                        maxLength={6}
                                        autoComplete="one-time-code"
                                        placeholder="••••••"
                                        value={linkOtp}
                                        disabled={linkVerifying}
                                        onChange={handleLinkOtpChange}
                                        className="w-full text-center font-mono text-2xl tracking-[0.45em] py-3.5 px-4 rounded-xl border border-slate-300 bg-white dark:bg-slate-950 dark:border-slate-700 text-slate-900 dark:text-slate-100 font-bold focus:outline-none focus:ring-2 focus:ring-brand-200 dark:focus:ring-brand-900/50"
                                    />
                                </div>

                                <Button
                                    type="submit"
                                    size="lg"
                                    fullWidth
                                    loading={linkVerifying}
                                    disabled={linkVerifying || linkOtp.length !== 6}
                                >
                                    {linkVerifying ? "Linking Google account..." : "Verify & Link Google"}
                                </Button>

                                <div className="flex items-center justify-center text-xs pt-1">
                                    {linkCooldown > 0 ? (
                                        <span className="text-slate-400 dark:text-slate-500 font-medium">
                                            Resend code in {linkCooldown}s
                                        </span>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={handleSendLinkOtp}
                                            disabled={linkSending}
                                            className="font-semibold text-brand-600 hover:text-brand-700 hover:underline dark:text-brand-400 dark:hover:text-brand-300 transition-colors"
                                        >
                                            {linkSending ? "Sending code..." : "Resend verification code"}
                                        </button>
                                    )}
                                </div>
                            </form>
                        )
                    ) : (
                        <form onSubmit={handleGoogleLink} className="space-y-4">
                            <Input
                                id="google-link-password"
                                label="Existing account password"
                                type="password"
                                placeholder="Enter your current password"
                                autoComplete="current-password"
                                value={linkPassword}
                                disabled={linkVerifying}
                                showPasswordToggle={true}
                                onChange={(e) => setLinkPassword(e.target.value)}
                            />

                            <Button
                                type="submit"
                                size="lg"
                                fullWidth
                                loading={linkVerifying}
                                disabled={linkVerifying || !linkPassword}
                            >
                                {linkVerifying ? "Linking with Password..." : "Link with Password"}
                            </Button>
                        </form>
                    )}

                    <div className="text-center pt-2">
                        <button
                            type="button"
                            onClick={() => {
                                setLinkRequired(false);
                                setLinkOtp("");
                                setLinkOtpSent(false);
                                setLinkPassword("");
                                setErrors({});
                            }}
                            className="text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                        >
                            Cancel and return to sign in
                        </button>
                    </div>
                </div>
            ) : mode === "otp" ? (
                /* Stage 2: Enter 6-digit OTP for Email Login */
                <div className="space-y-5 animate-slide-up">
                    <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/80 p-4 shadow-sm text-center">
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                            Enter the code sent to <strong className="text-slate-800 dark:text-slate-200 font-semibold">{email}</strong>
                        </p>
                        <button
                            type="button"
                            onClick={() => {
                                setMode("email");
                                setOtp("");
                                setErrors({});
                            }}
                            className="mt-1 text-xs font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300 inline-flex items-center gap-1"
                        >
                            Change email address
                        </button>
                    </div>

                    <form onSubmit={handleVerifyOtp} className="space-y-4">
                        <div>
                            <label
                                htmlFor="login-otp-code"
                                className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-2 text-center"
                            >
                                One-Time Verification Code
                            </label>
                            <input
                                ref={otpInputRef}
                                id="login-otp-code"
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                maxLength={6}
                                autoComplete="one-time-code"
                                placeholder="••••••"
                                value={otp}
                                disabled={loading}
                                onChange={handleOtpChange}
                                className={`w-full text-center font-mono text-2xl tracking-[0.45em] py-3.5 px-4 rounded-xl border bg-white dark:bg-slate-950 font-bold transition-all focus:outline-none focus:ring-2 ${
                                    errors.otp
                                        ? "border-rose-400 text-rose-600 focus:ring-rose-200 dark:border-rose-800 dark:focus:ring-rose-900/40"
                                        : "border-slate-300 text-slate-900 focus:border-brand-500 focus:ring-brand-200 dark:border-slate-700 dark:text-slate-100 dark:focus:ring-brand-900/50"
                                }`}
                            />
                            {errors.otp && (
                                <p className="mt-1.5 text-center text-xs font-medium text-rose-600 dark:text-rose-400">
                                    {errors.otp}
                                </p>
                            )}
                        </div>

                        <Button
                            type="submit"
                            size="lg"
                            fullWidth
                            loading={loading}
                            disabled={loading || otp.length !== 6}
                        >
                            {loading ? "Verifying..." : "Verify & Continue"}
                        </Button>
                    </form>

                    <div className="flex items-center justify-between pt-1 text-xs">
                        <button
                            type="button"
                            onClick={() => {
                                setMode("email");
                                setOtp("");
                                setErrors({});
                            }}
                            className="font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                        >
                            ← Back to email
                        </button>

                        <div>
                            {resendCooldown > 0 ? (
                                <span className="text-slate-400 dark:text-slate-500">
                                    Resend code in {resendCooldown}s
                                </span>
                            ) : (
                                <button
                                    type="button"
                                    onClick={handleResendOtp}
                                    disabled={loading}
                                    className="font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
                                >
                                    Resend code
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            ) : (
                /* Stage 1: Primary Passwordless Screen (Google + Email OTP) */
                <div className="space-y-4">
                    {/* Primary Option: Google OAuth */}
                    <div>
                        <GoogleSignInButton onCredential={handleGoogleCredential} disabled={loading} />
                    </div>

                    {/* Divider */}
                    <div className="relative flex items-center justify-center my-4">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-slate-200 dark:border-slate-800" />
                        </div>
                        <span className="relative bg-slate-50 px-3 text-xs font-medium uppercase tracking-wider text-slate-400 dark:bg-slate-900 dark:text-slate-500">
                            or continue with email
                        </span>
                    </div>

                    {/* Secondary Option: Email OTP */}
                    <form onSubmit={handleSendOtp} className="space-y-3" noValidate>
                        <Input
                            id="login-email"
                            label="Email address"
                            type="email"
                            inputMode="email"
                            autoCapitalize="none"
                            autoCorrect="off"
                            spellCheck="false"
                            autoFocus
                            placeholder="you@example.com"
                            autoComplete="email"
                            value={email}
                            error={errors.email}
                            disabled={loading}
                            onChange={(e) => {
                                setEmail(e.target.value);
                                setErrors((prev) => ({ ...prev, email: "", form: "" }));
                            }}
                        />

                        <Button
                            type="submit"
                            size="lg"
                            fullWidth
                            loading={loading}
                            disabled={loading}
                        >
                            {loading ? "Sending login code..." : "Continue with Email"}
                        </Button>
                    </form>

                    <p className="text-center text-[11px] leading-relaxed text-slate-400 dark:text-slate-500 pt-1">
                        By continuing, you agree to CoRoomies&apos; Terms of Service and Privacy Policy. New accounts are automatically created.
                    </p>

                    {/* Collapsible Legacy Password Login */}
                    <div className="mt-5 border-t border-slate-200/80 pt-4 text-center dark:border-slate-800/80">
                        <button
                            type="button"
                            onClick={() => setShowPasswordFallback((prev) => !prev)}
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
                        >
                            <span>{showPasswordFallback ? "Hide password login" : "Sign in with password instead"}</span>
                            <svg
                                className={`h-3 w-3 transform transition-transform ${showPasswordFallback ? "rotate-180" : ""}`}
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                            >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                        </button>

                        {showPasswordFallback && (
                            <form
                                onSubmit={handleLegacyPasswordLogin}
                                className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-white/70 p-4 text-left dark:border-slate-800 dark:bg-slate-900/70 animate-slide-up"
                                noValidate
                            >
                                <Input
                                    id="legacy-identifier"
                                    label="Email or username"
                                    type="text"
                                    placeholder="you@example.com · @username"
                                    autoComplete="username"
                                    value={identifier}
                                    error={errors.identifier}
                                    disabled={loading}
                                    onChange={(e) => {
                                        setIdentifier(e.target.value);
                                        setErrors((prev) => ({ ...prev, identifier: "", form: "" }));
                                    }}
                                />

                                <Input
                                    id="legacy-password"
                                    label="Password"
                                    type="password"
                                    placeholder="Enter your password"
                                    autoComplete="current-password"
                                    value={password}
                                    error={errors.password}
                                    disabled={loading}
                                    showPasswordToggle={true}
                                    onChange={(e) => {
                                        setPassword(e.target.value);
                                        setErrors((prev) => ({ ...prev, password: "", form: "" }));
                                    }}
                                />

                                <div className="flex justify-end">
                                    <button
                                        type="button"
                                        onClick={goToForgot}
                                        disabled={loading}
                                        className="text-xs font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300 py-1"
                                    >
                                        Forgot password?
                                    </button>
                                </div>

                                <Button
                                    type="submit"
                                    variant="secondary"
                                    size="md"
                                    fullWidth
                                    loading={loading}
                                    disabled={loading}
                                >
                                    Log in with password
                                </Button>
                            </form>
                        )}
                    </div>
                </div>
            )}
        </AuthLayout>
    );
}

export default Login;
