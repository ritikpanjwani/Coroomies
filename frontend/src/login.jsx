import { useState } from "react";
import api from "./api";
import { saveToken } from "./auth";
import AuthLayout from "./components/auth/AuthLayout";
import { Input } from "./components/ui/Field";
import Button from "./components/ui/Button";
import { useToast } from "./components/Toast";
import { errorMessage } from "./utils/format";
import { AlertIcon } from "./components/Icons";

function Login({ onLogin, goToRegister, goToForgot }) {
    const [identifier, setIdentifier] = useState("");
    const [password, setPassword] = useState("");
    const [errors, setErrors] = useState({});
    const [loading, setLoading] = useState(false);
    const toast = useToast();

    const handleLogin = async (e) => {
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

            saveToken(response.data.access_token);
            if (response.data.user?.id) {
                localStorage.setItem("user_id", String(response.data.user.id));
            }
            if (response.data.user?.name) {
                localStorage.setItem("user_name", response.data.user.name);
            }
            if (response.data.user?.username) {
                localStorage.setItem("user_username", response.data.user.username);
            }
            if (response.data.user?.avatar_url) {
                localStorage.setItem("user_avatar", response.data.user.avatar_url);
            } else {
                localStorage.removeItem("user_avatar");
            }
            toast.success(`Welcome back, ${response.data.user?.name || "friend"}!`);
            onLogin();
        } catch (err) {
            const status = err.response?.status;
            let msg = "Invalid username/email or password";
            if (status !== 401 && status !== 400) {
                msg = errorMessage(err, "Login failed. Please check your connection and try again.");
            }
            setErrors({
                form: msg,
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthLayout title="Welcome back" subtitle="Log in to manage your roommate life.">
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
                onSubmit={handleLogin}
            >
                <Input
                    id="login-identifier"
                    label="Email or username"
                    type="text"
                    inputMode="email"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck="false"
                    enterKeyHint="next"
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
                    id="login-password"
                    label="Password"
                    type="password"
                    enterKeyHint="go"
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

                <div className="flex justify-end pt-0.5">
                    <button
                        type="button"
                        onClick={goToForgot}
                        disabled={loading}
                        className="text-xs font-semibold text-brand-600 transition-colors hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300 py-1"
                    >
                        Forgot password?
                    </button>
                </div>

                <Button
                    type="submit"
                    size="lg"
                    fullWidth
                    loading={loading}
                    disabled={loading}
                    className="mt-2"
                >
                    {loading ? "Logging in..." : "Log in"}
                </Button>
            </form>

            <div className="mt-6 flex items-center gap-3">
                <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
                <span className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                    New to CoRoomies?
                </span>
                <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
            </div>

            <Button
                variant="secondary"
                size="lg"
                fullWidth
                disabled={loading}
                className="mt-6"
                onClick={goToRegister}
            >
                Create an account
            </Button>
        </AuthLayout>
    );
}

export default Login;
