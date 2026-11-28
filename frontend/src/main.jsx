import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { initGlobalExtensionErrorFilter } from "./utils/extensionErrors";
import "./index.css";
import "./App.css";

// Suppress unhandled third-party browser extension noise
initGlobalExtensionErrorFilter();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);