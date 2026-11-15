import { useState } from "react";
import api from "./api";
import AuthLayout from "./components/auth/AuthLayout";
import { Input } from "./components/ui/Field";
import Button from "./components/ui/Button";
import { useToast } from "./components/Toast";
import { errorMessage } from "./utils/format";
import { CheckCircleIcon, AlertIcon } from "./components/Icons";
import { validatePasswordStrength } from "./utils/validation";
import PasswordRequirements from "./components/auth/PasswordRequirements";

function ForgotPassword({ goToLogin }) {
    // 1 = Request OTP, 2 = Verify OTP, 3 = Set new password, 4 = Success
    const [step, setStep] = useState(1);
    const [identifier, setIdentifier] = useState("");
    const [otp, setOtp] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [errors, setErrors] = useState({});
    const [loading, setLoading] = useState(false);
    const [resendLoading, setResendLoading] = useState(false);
    const toast = useToast();

    // Stage 1: Request OTP
    const handleSendOtp = async () => {
        if (!identifier.trim()) {
            setErrors({ identifier: "Enter your email or username" });
            return;
        }
        try {
            setLoading(true);
            setErrors({});
            const res = await api.post("/auth/forgot-password", {
                identifier: identifier.trim(),
            });
            setStep(2);
            toast.success(res.data.message || "Reset code sent! Check your email.");
        } catch (err) {
            setErrors({
                form: errorMessage(err, "Could not send the code. Please try again."),
            });
        } finally {
            setLoading(false);
        }
    };

    // Stage 2: Resend OTP
    const handleResendOtp = async () => {
        try {
            setResendLoading(true);
            setErrors({});
            const res = await api.post("/auth/forgot-password", {
                identifier: identifier.trim(),
            });
            toast.success(res.data.message || "A new code has been sent.");
        } catch (err) {
            setErrors({
                form: errorMessage(err, "Could not resend code. Please try again."),
            });
        } finally {
            setResendLoading(false);
        }
    };

    // Stage 2: Verify OTP
    const handleVerifyOtp = async () => {
        const trimmedOtp = otp.trim();
        if (!trimmedOtp || trimmedOtp.length !== 6) {
            setErrors({ otp: "Please enter the 6-digit code" });
            return;
        }
        try {
            setLoading(true);
            setErrors({});
            await api.post("/auth/verify-otp", {
                identifier: identifier.trim(),
                otp: trimmedOtp,
            });
            setStep(3);
            toast.success("Code verified! Set your new password.");
        } catch (err) {
            setErrors({
                otp: errorMessage(err, "Invalid or expired verification code."),
                form: errorMessage(err, "Invalid or expired verification code."),
            });
        } finally {
            setLoading(false);
        }
    };

    // Stage 3: Set New Password
    const handleResetPassword = async () => {
        const nextErrors = {};
        const pwdError = validatePasswordStrength(newPassword);
        if (pwdError) nextErrors.newPassword = pwdError;
        if (confirmPassword !== newPassword)
            nextErrors.confirmPassword = "Passwords do not match";
        setErrors(nextErrors);
        if (Object.keys(nextErrors).length > 0) return;

        try {
            setLoading(true);
            await api.post("/auth/reset-password", {
                identifier: identifier.trim(),
                otp: otp.trim(),
                new_password: newPassword,
            });
            toast.success("Password reset! You can now log in.");
            setStep(4);
        } catch (err) {
            setErrors({
                form: errorMessage(err, "Could not reset password. Please try again."),
            });
        } finally {
            setLoading(false);
        }
    };

    const titles = {
        1: "Forgot your password?",
        2: "Enter verification code",
        3: "Set new password",
        4: "Password reset complete",
    };

    const subtitles = {
        1: "Enter your email or username and we'll send you a reset code.",
        2: "We sent a 6-digit code to your account. Enter it below to continue.",
        3: "Your code is verified. Now create a strong new password.",
        4: "Your password has been changed. You can now log in with your new credentials.",
    };

    return (
        <AuthLayout title={titles[step]} subtitle={subtitles[step]}>
            {/* Step progress indicator for Stages 1-3 */}
            {step < 4 && (
                <div className="mb-6 flex items-center justify-center gap-2">
                    <div
                        className={`h-1.5 w-12 rounded-full transition-all duration-300 ${
                            step >= 1 ? "bg-brand-600 dark:bg-brand-500" : "bg-slate-200 dark:bg-slate-700"
                        }`}
                    />
                    <div
                        className={`h-1.5 w-12 rounded-full transition-all duration-300 ${
                            step >= 2 ? "bg-brand-600 dark:bg-brand-500" : "bg-slate-200 dark:bg-slate-700"
                        }`}
                    />
                    <div
                        className={`h-1.5 w-12 rounded-full transition-all duration-300 ${
                            step >= 3 ? "bg-brand-600 dark:bg-brand-500" : "bg-slate-200 dark:bg-slate-700"
                        }`}
                    />
                </div>
            )}

            {errors.form && (
                <div
                    role="alert"
                    className="mb-4.5 flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50/90 dark:border-rose-900/50 dark:bg-rose-950/40 p-3.5 text-sm font-medium text-rose-700 dark:text-rose-300 animate-slide-up"
                >
                    <AlertIcon className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
                    <span>{errors.form}</span>
                </div>
            )}

            {/* Stage 1: Request OTP */}
            {step === 1 && (
                <form
                    className="space-y-4"
                    noValidate
                    onSubmit={(e) => {
                        e.preventDefault();
                        handleSendOtp();
                    }}
                >
                    <Input
                        id="fp-identifier"
                        label="Email or username"
                        type="text"
                        inputMode="email"
                        autoCapitalize="none"
                        autoCorrect="off"
                        enterKeyHint="go"
                        placeholder="you@example.com · @username"
                        value={identifier}
                        error={errors.identifier}
                        disabled={loading}
                        onChange={(e) => {
                            setIdentifier(e.target.value);
                            setErrors((prev) => ({ ...prev, identifier: "", form: "" }));
                        }}
                    />

                    <Button type="submit" size="lg" fullWidth loading={loading} disabled={loading} className="mt-2">
                        {loading ? "Sending code..." : "Send reset code"}
                    </Button>
                </form>
            )}

            {/* Stage 2: Verify OTP */}
            {step === 2 && (
                <form
                    className="space-y-4"
                    noValidate
                    onSubmit={(e) => {
                        e.preventDefault();
                        handleVerifyOtp();
                    }}
                >
                    <Input
                        id="fp-otp"
                        label="6-Digit Verification Code"
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={6}
                        enterKeyHint="go"
                        placeholder="000000"
                        className="text-center tracking-widest font-mono text-lg"
                        value={otp}
                        error={errors.otp}
                        hint="Check your inbox and spam folder for the code"
                        disabled={loading}
                        onChange={(e) => {
                            setOtp(e.target.value.replace(/\D/g, ""));
                            setErrors((prev) => ({ ...prev, otp: "", form: "" }));
                        }}
                    />

                    <Button type="submit" size="lg" fullWidth loading={loading} disabled={loading || otp.length < 6} className="mt-2">
                        {loading ? "Verifying..." : "Verify code"}
                    </Button>

                    <div className="flex items-center justify-between pt-2 text-xs">
                        <button
                            type="button"
                            disabled={resendLoading}
                            onClick={handleResendOtp}
                            className="font-medium text-brand-600 hover:text-brand-700 hover:underline disabled:opacity-50 dark:text-brand-400"
                        >
                            {resendLoading ? "Resending..." : "Didn't receive code? Resend"}
                        </button>

                        <button
                            type="button"
                            onClick={() => {
                                setStep(1);
                                setOtp("");
                                setErrors({});
                            }}
                            className="font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                        >
                            Change account
                        </button>
                    </div>
                </form>
            )}

            {/* Stage 3: Set New Password */}
            {step === 3 && (
                <form
                    className="space-y-4"
                    noValidate
                    onSubmit={(e) => {
                        e.preventDefault();
                        handleResetPassword();
                    }}
                >
                    <div>
                        <Input
                            id="fp-new-password"
                            label="New password"
                            type="password"
                            enterKeyHint="next"
                            placeholder="Create a strong password"
                            autoComplete="new-password"
                            value={newPassword}
                            error={errors.newPassword}
                            showPasswordToggle={true}
                            disabled={loading}
                            onChange={(e) => {
                                setNewPassword(e.target.value);
                                setErrors((prev) => ({ ...prev, newPassword: "", form: "" }));
                            }}
                        />
                        {newPassword && (
                            <PasswordRequirements password={newPassword} />
                        )}
                    </div>

                    <Input
                        id="fp-confirm"
                        label="Confirm new password"
                        type="password"
                        enterKeyHint="done"
                        placeholder="Re-enter your new password"
                        autoComplete="new-password"
                        value={confirmPassword}
                        error={errors.confirmPassword}
                        showPasswordToggle={true}
                        disabled={loading}
                        onChange={(e) => {
                            setConfirmPassword(e.target.value);
                            setErrors((prev) => ({ ...prev, confirmPassword: "", form: "" }));
                        }}
                    />

                    <Button type="submit" size="lg" fullWidth loading={loading} disabled={loading} className="mt-2">
                        {loading ? "Saving password..." : "Set new password"}
                    </Button>

                    <button
                        type="button"
                        onClick={() => {
                            setStep(2);
                            setNewPassword("");
                            setConfirmPassword("");
                            setErrors({});
                        }}
                        className="w-full text-center text-xs font-medium text-slate-500 transition-colors hover:text-brand-600 dark:text-slate-400 py-1"
                    >
                        Back to verification code
                    </button>
                </form>
            )}

            {/* Stage 4: Success Confirmation */}
            {step === 4 && (
                <div className="space-y-6 text-center">
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 ring-8 ring-emerald-50/60 dark:bg-emerald-950/40 dark:text-emerald-400 dark:ring-emerald-950/20">
                        <CheckCircleIcon className="h-9 w-9" />
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-300">
                        Your password has been successfully updated. All previous active sessions have been revoked for your security.
                    </div>

                    <Button size="lg" fullWidth onClick={goToLogin}>
                        Return to login
                    </Button>
                </div>
            )}

            {/* Back to login option (Steps 1-3) */}
            {step < 4 && (
                <>
                    <div className="mt-6 flex items-center gap-3">
                        <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
                        <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
                            Remembered it?
                        </span>
                        <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
                    </div>

                    <Button variant="secondary" size="lg" fullWidth className="mt-6" onClick={goToLogin}>
                        Back to login
                    </Button>
                </>
            )}
        </AuthLayout>
    );
}

export default ForgotPassword;
