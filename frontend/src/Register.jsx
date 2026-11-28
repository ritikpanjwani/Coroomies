import Login from "./login";

/**
 * Register wrapper component.
 *
 * CoRoomies has migrated to a unified passwordless authentication system.
 * Account registration and sign-in are unified on a single, modern auth page
 * where verified Google users and verified Email OTP users automatically have
 * their accounts created and signed in seamlessly.
 */
function Register({ onRegistered, onGoogleLogin, goToLogin }) {
    const handleAuth = (response) => {
        if (typeof onGoogleLogin === "function" && response?.access_token) {
            onGoogleLogin(response);
        } else if (typeof onRegistered === "function") {
            onRegistered();
        } else if (typeof goToLogin === "function") {
            goToLogin();
        }
    };

    return (
        <Login
            onLogin={handleAuth}
            goToRegister={goToLogin}
            goToForgot={goToLogin}
        />
    );
}

export default Register;
