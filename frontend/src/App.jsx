import { lazy, Suspense, useEffect, useState } from "react";
import Login from "./login";
import Spinner from "./components/ui/Spinner";
import { ToastProvider } from "./components/Toast";
import ErrorBoundary from "./components/ui/ErrorBoundary";

const Register = lazy(() => import("./Register"));
const ForgotPassword = lazy(() => import("./ForgotPassword"));
const Dashboard = lazy(() => import("./Dashboard"));

function App() {
  const [loggedIn, setLoggedIn] = useState(
    localStorage.getItem("access_token") !== null
  );

  // Capture and preserve living group invitations from URL parameters across auth
  useEffect(() => {
    try {
      const searchParams = new URLSearchParams(window.location.search);
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#\/?/, ""));
      const code =
        searchParams.get("join") ||
        searchParams.get("code") ||
        searchParams.get("invite") ||
        hashParams.get("join") ||
        hashParams.get("code") ||
        hashParams.get("invite");

      if (code) {
        const cleanCode = code.trim().toUpperCase();
        localStorage.setItem("coroomies_join_code", cleanCode);
        sessionStorage.setItem("coroomies_join_code", cleanCode);
      }
    } catch {
      // URL parsing fallback
    }
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem("theme");
    if (saved === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, []);

  const [view, setView] = useState("login"); // "login" | "register" | "forgot"

  return (
    <ToastProvider>
      <ErrorBoundary>
        <Suspense
          fallback={
            <div className="flex min-h-screen items-center justify-center">
              <Spinner size="lg" />
            </div>
          }
        >
          {loggedIn ? (
            <Dashboard />
          ) : view === "register" ? (
            <Register
              onRegistered={() => setView("login")}
              goToLogin={() => setView("login")}
            />
          ) : view === "forgot" ? (
            <ForgotPassword
              goToLogin={() => setView("login")}
            />
          ) : (
            <Login
              onLogin={() => setLoggedIn(true)}
              goToRegister={() => setView("register")}
              goToForgot={() => setView("forgot")}
            />
          )}
        </Suspense>
      </ErrorBoundary>
    </ToastProvider>
  );
}

export default App;
