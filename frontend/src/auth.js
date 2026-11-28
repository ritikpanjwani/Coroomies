export function saveToken(token) {
    localStorage.setItem("access_token", token);
}

export function getToken() {
    return localStorage.getItem("access_token");
}

export function removeToken() {
    localStorage.removeItem("access_token");
    if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("coroomies:logout"));
    }
}

export function logout() {
    localStorage.removeItem("access_token");
    localStorage.removeItem("user_id");
    localStorage.removeItem("user_name");
    localStorage.removeItem("user_username");
    localStorage.removeItem("user_avatar");
    if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("coroomies:logout"));
    }
}
//Stores the JWT in the browser so the user stays authenticated while using the app.