const path = require("node:path");
const fs = require("node:fs");

const backendDir = path.join(__dirname, "backend");

// Resolve python binary path dynamically across Windows and Linux environments
const winPython = path.join(backendDir, "venv", "Scripts", "python.exe");
const nixPython = path.join(backendDir, "venv", "bin", "python");
const pythonScript = fs.existsSync(winPython)
    ? winPython
    : fs.existsSync(nixPython)
    ? nixPython
    : "python";

// Production process definition.
//
// - Secrets are NOT stored here. Provide them through the host environment or
//   backend/.env with restricted permissions (see DEPLOYMENT.md).
// - Keep a single worker: the login/reset rate limiter is in-memory. Use a
//   shared store before increasing --workers.
// - The API binds to loopback only; put a TLS-terminating reverse proxy in
//   front of it.
// - Do not start this alongside the development ecosystem.config.cjs on the
//   same host (both use the name "coroomies-backend").
module.exports = {
    apps: [
        {
            name: "coroomies-backend",
            script: pythonScript,
            args: [
                "-m",
                "uvicorn",
                "app.main:app",
                "--host",
                "127.0.0.1",
                "--port",
                "8000",
                "--workers",
                "1",
                "--proxy-headers",
                "--forwarded-allow-ips",
                "127.0.0.1",
            ].join(" "),
            cwd: backendDir,
            autorestart: true,
            max_restarts: 20,
            restart_delay: 3000,
            max_memory_restart: "400M",
            kill_timeout: 5000,
            time: true,
            env: {
                ENVIRONMENT: "production",
                PYTHONUNBUFFERED: "1",
            },
        },
    ],
};
