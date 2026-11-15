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

// Staging process definition.
// Secrets are NOT stored here. Provide them through host environment or backend/.env.
module.exports = {
    apps: [
        {
            name: "coroomies-staging-backend",
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
                "2",
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
                ENVIRONMENT: "staging",
                PYTHONUNBUFFERED: "1",
            },
        },
    ],
};
