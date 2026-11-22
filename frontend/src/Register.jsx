import { useState } from "react";
import api from "./api";
import AuthLayout from "./components/auth/AuthLayout";
import { Input } from "./components/ui/Field";
import Button from "./components/ui/Button";
import { useToast } from "./components/Toast";
import { errorMessage } from "./utils/format";
import { validatePasswordStrength } from "./utils/validation";
import PasswordRequirements from "./components/auth/PasswordRequirements";
import { AlertIcon } from "./components/Icons";
import GoogleSignInButton from "./components/auth/GoogleSignInButton";

function Register({ onRegistered, onGoogleLogin, goToLogin }) {
    const [name, setName] = useState("");
    const [username, setUsername] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [errors, setErrors] = useState({});
    const [touched, setTouched] = useState({});
    const [loading, setLoading] = useState(false);
    const [googleCredential, setGoogleCredential] = useState("");
    const [linkPassword, setLinkPassword] = useState("");
    const [linkRequired, setLinkRequired] = useState(false);
    const toast = useToast();

    const validateField = (field, val, currentVals = {}) => {
        const v = typeof val === "string" ? val : "";
        switch (field) {
            case "name":
                if (!v.trim()) return "Please enter your name";
                if (v.trim().length > 100) return "Name must be 100 characters or fewer";
                return "";
            case "username":
                if (!v.trim()) return "Please choose a username";
                if (v.trim().length < 3) return "Username must be at least 3 characters";
                if (v.trim().length > 30) return "Username must be 30 characters or fewer";
                if (!/^[a-zA-Z0-9_]+$/.test(v.trim()))
                    return "Letters, numbers, and underscores only";
                return "";
            case "email":
                if (!v.trim()) return "Please enter your email";
                if (!/^\S+@\S+\.\S+$/.test(v.trim()))
                    return "Please enter a valid email address";
                return "";
            case "password":
                return validatePasswordStrength(v) || "";
            case "confirmPassword": {
                const pwd = currentVals.password !== undefined ? currentVals.password : password;
                if (!v) return "Please confirm your password";
                if (v !== pwd) return "Passwords do not match";
                return "";
            }
            default:
                return "";
        }
    };

    const handleBlur = (field) => {
        setTouched((prev) => ({ ...prev, [field]: true }));
        const currentVals = { name, username, email, password, confirmPassword };
        const err = validateField(field, currentVals[field], currentVals);
        setErrors((prev) => ({ ...prev, [field]: err }));
    };

    const handleChange = (field, value) => {
        if (field === "name") setName(value);
        else if (field === "username") setUsername(value);
        else if (field === "email") setEmail(value);
        else if (field === "password") setPassword(value);
        else if (field === "confirmPassword") setConfirmPassword(value);

        if (errors[field] || touched[field]) {
            const currentVals = { name, username, email, password, confirmPassword, [field]: value };
            const err = validateField(field, value, currentVals);
            setErrors((prev) => ({ ...prev, [field]: err, form: "" }));
        } else if (errors.form) {
            setErrors((prev) => ({ ...prev, form: "" }));
        }

        if (field === "password" && (touched.confirmPassword || errors.confirmPassword)) {
            const currentConfirm = confirmPassword;
            const confirmErr = currentConfirm && value !== currentConfirm ? "Passwords do not match" : "";
            setErrors((prev) => ({ ...prev, confirmPassword: confirmErr }));
        }
    };

    const handleRegister = async (e) => {
        if (e) e.preventDefault();
        if (loading) return;

        const currentVals = { name, username, email, password, confirmPassword };
        const nextErrors = {};
        ["name", "username", "email", "password", "confirmPassword"].forEach((f) => {
            const err = validateField(f, currentVals[f], currentVals);
            if (err) nextErrors[f] = err;
        });

        setTouched({
            name: true,
            username: true,
            email: true,
            password: true,
            confirmPassword: true,
        });
        setErrors(nextErrors);
        if (Object.keys(nextErrors).length > 0) return;

        try {
            setLoading(true);
            await api.post("/auth/register", {
                name: name.trim(),
                email: email.trim(),
                password,
                username: username.trim(),
            });

            toast.success("Account created successfully! Please log in.");
            onRegistered();
        } catch (err) {
            setErrors((prev) => ({
                ...prev,
                form: errorMessage(err, "Registration failed. Please check your information and try again."),
            }));
        } finally {
            setLoading(false);
        }
    };

    const handleGoogleCredential = async (credential) => {
        if (loading) return;
        setLoading(true);
        setGoogleCredential(credential);
        setErrors({});
        try {
            const response = await api.post("/auth/google", { credential });
            onGoogleLogin(response.data);
        } catch (err) {
            const detail = err.response?.data?.detail;
            if (err.response?.status === 409 && detail?.code === "account_link_required") {
                setLinkRequired(true);
                setErrors({ form: detail.message });
            } else {
                setErrors({ form: errorMessage(err, "Google sign-in failed. Please try again.") });
            }
        } finally {
            setLoading(false);
        }
    };

    const handleGoogleLink = async (e) => {
        e.preventDefault();
        if (!linkPassword || !googleCredential || loading) return;
        setLoading(true);
        try {
            const response = await api.post("/auth/google/link", {
                credential: googleCredential,
                password: linkPassword,
            });
            onGoogleLogin(response.data);
        } catch (err) {
            setErrors((prev) => ({ ...prev, form: errorMessage(err, "Could not link Google to this account.") }));
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthLayout title="Create your account" subtitle="Join CoRoomies and find your ideal roommate.">
            {errors.form && (
                <div
                    role="alert"
                    className="mb-4.5 flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50/90 dark:border-rose-900/50 dark:bg-rose-950/40 p-3.5 text-sm font-medium text-rose-700 dark:text-rose-300 animate-slide-up"
                >
                    <AlertIcon className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
                    <span>{errors.form}</span>
                </div>
            )}

            <form
                className="space-y-4"
                noValidate
                onSubmit={handleRegister}
            >
                <Input
                    id="reg-name"
                    label="Full name"
                    type="text"
                    autoCapitalize="words"
                    enterKeyHint="next"
                    placeholder="e.g. Alex Morgan"
                    autoComplete="name"
                    value={name}
                    error={errors.name}
                    disabled={loading}
                    onChange={(e) => handleChange("name", e.target.value)}
                    onBlur={() => handleBlur("name")}
                />

                <Input
                    id="reg-username"
                    label="Username"
                    type="text"
                    inputMode="text"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck="false"
                    enterKeyHint="next"
                    placeholder="Choose a username"
                    autoComplete="username"
                    value={username}
                    error={errors.username}
                    hint="Letters, numbers, and underscores only"
                    disabled={loading}
                    onChange={(e) => handleChange("username", e.target.value)}
                    onBlur={() => handleBlur("username")}
                />

                <Input
                    id="reg-email"
                    label="Email address"
                    type="email"
                    inputMode="email"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck="false"
                    enterKeyHint="next"
                    placeholder="you@example.com"
                    autoComplete="email"
                    value={email}
                    error={errors.email}
                    disabled={loading}
                    onChange={(e) => handleChange("email", e.target.value)}
                    onBlur={() => handleBlur("email")}
                />

                <div>
                    <Input
                        id="reg-password"
                        label="Password"
                        type="password"
                        enterKeyHint="next"
                        placeholder="Create a strong password"
                        autoComplete="new-password"
                        value={password}
                        error={errors.password}
                        showPasswordToggle={true}
                        disabled={loading}
                        onChange={(e) => handleChange("password", e.target.value)}
                        onBlur={() => handleBlur("password")}
                    />
                    {/* Live Password Requirements Checklist */}
                    {(password || touched.password) && (
                        <PasswordRequirements password={password} />
                    )}
                </div>

                <Input
                    id="reg-confirm"
                    label="Confirm password"
                    type="password"
                    enterKeyHint="done"
                    placeholder="Re-enter your password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    error={errors.confirmPassword}
                    showPasswordToggle={true}
                    disabled={loading}
                    onChange={(e) => handleChange("confirmPassword", e.target.value)}
                    onBlur={() => handleBlur("confirmPassword")}
                />

                <Button
                    type="submit"
                    size="lg"
                    fullWidth
                    loading={loading}
                    disabled={loading}
                    className="mt-2"
                >
                    {loading ? "Creating account..." : "Create account"}
                </Button>
            </form>

            <GoogleSignInButton onCredential={handleGoogleCredential} disabled={loading} />

            {linkRequired && (
                <form className="mt-4 space-y-3" onSubmit={handleGoogleLink}>
                    <Input
                        id="google-link-password"
                        label="Existing account password"
                        type="password"
                        autoComplete="current-password"
                        value={linkPassword}
                        disabled={loading}
                        onChange={(e) => setLinkPassword(e.target.value)}
                    />
                    <Button type="submit" size="lg" fullWidth loading={loading} disabled={loading || !linkPassword}>
                        Link Google account
                    </Button>
                </form>
            )}

            <div className="mt-6 flex items-center gap-3">
                <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
                <span className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                    Already registered?
                </span>
                <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
            </div>

            <Button
                variant="secondary"
                size="lg"
                fullWidth
                disabled={loading}
                className="mt-6"
                onClick={goToLogin}
            >
                Back to login
            </Button>
        </AuthLayout>
    );
}

export default Register;
