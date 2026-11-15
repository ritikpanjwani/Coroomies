module.exports = {
    apps: [
        {
            name: "coroomies-backend",
            script: "D:\\CoRoomies project\\backend\\venv\\Scripts\\python.exe",
            args: "-m uvicorn app.main:app --host 127.0.0.1 --port 8000",
            cwd: "D:\\CoRoomies project\\backend",
            autorestart: true,
            max_restarts: 20,
            restart_delay: 3000,
        },
        {
            name: "coroomies-frontend",
            script: "node",
            args: "node_modules/vite/bin/vite.js",
            cwd: "D:\\CoRoomies project\\frontend",
            autorestart: true,
            max_restarts: 20,
            restart_delay: 3000,
        },
        {
            name: "tunnel-backend",
            script: "C:\\CloudFlared\\cloudflared.exe.exe",
            args: "tunnel --protocol http2 --url http://localhost:8000",
            autorestart: true,
            max_restarts: 50,
            restart_delay: 5000,
        },
        {
            name: "tunnel-frontend",
            script: "C:\\CloudFlared\\cloudflared.exe.exe",
            args: "tunnel --protocol http2 --url http://localhost:5173",
            autorestart: true,
            max_restarts: 50,
            restart_delay: 5000,
        },
    ],
};
