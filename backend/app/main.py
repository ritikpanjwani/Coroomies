import os
import logging
from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.docs import get_swagger_ui_html
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.config import (
    ALLOW_CLOUDFLARE_TUNNELS,
    CORS_ORIGINS,
    CSP_POLICY,
    DEV_MODE_OVERRIDDEN,
    HSTS_ENABLED,
    HSTS_INCLUDE_SUBDOMAINS,
    HSTS_MAX_AGE,
    IS_PRODUCTION,
    RATE_LIMIT_FAIL_CLOSED,
)
from app.emailer import smtp_configured
from app.logging_utils import log_exception
from app.rate_limit import _limiter

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logging.getLogger("psycopg.pool").setLevel(logging.WARNING)

logger = logging.getLogger("coroomies")


def _format_validation_errors(errors) -> str:
    parts = []
    for err in errors:
        if err.get("type") == "json_invalid":
            parts.append("Request body is not valid JSON")
            continue
        loc = [str(p) for p in err.get("loc", ()) if p != "body"]
        field = loc[-1] if loc else "input"
        msg = err.get("msg", "Invalid value")
        # Strip pydantic's noisy prefix when it's a custom ValueError message.
        if msg.startswith("Value error, "):
            msg = msg[len("Value error, "):]
        elif msg.startswith("Input should be a valid"):
            msg = f"{field}: {msg}"
        parts.append(f"{field}: {msg}" if not msg.startswith(field) else msg)
    return "; ".join(parts)


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(RequestValidationError)
    async def validation_handler(request: Request, exc: RequestValidationError):
        return JSONResponse(
            status_code=422,
            content={"detail": _format_validation_errors(exc.errors())},
        )

    @app.exception_handler(Exception)
    async def unhandled_handler(request: Request, exc: Exception):
        log_exception(logger, f"Unhandled error on {request.method} {request.url.path}", exc)
        return JSONResponse(
            status_code=500,
            content={"detail": "Something went wrong on our side. Please try again."},
        )

from app.Routers.profile import router as profile_router
from app.Routers.auth import router as auth_router
from app.Routers.matches import router as matches_router
from app.Routers.expenses import router as expenses_router
from app.Routers.requests import router as requests_router
from app.Routers.listings import router as listings_router
from app.Routers.shared_expenses import router as shared_expenses_router
from app.Routers.messages import router as messages_router
from app.Routers.notifications import router as notifications_router
from app.Routers.groups import router as groups_router
from app.Routers.chores import router as chores_router
from app.Routers.rules import router as rules_router
from app.Routers.reliability import router as reliability_router
from app.Routers.vacancies import router as vacancies_router
from app.Routers.assistant import router as assistant_router
from app.Routers.team_ups import router as team_ups_router
from app.Routers.settings import router as settings_router
from app.database import close_pool, get_connection
from app.Routers.chores import start_reminder_loop

app = FastAPI(
    title="CoRoomies API",
    docs_url=None,
    redoc_url=None if IS_PRODUCTION else "/redoc",
    openapi_url=None if IS_PRODUCTION else "/openapi.json",
)

register_error_handlers(app)


@app.get("/docs", include_in_schema=False)
async def custom_swagger_ui_html():
    if IS_PRODUCTION:
        raise HTTPException(status_code=404, detail="Not Found")
    return get_swagger_ui_html(
        openapi_url="/openapi.json",
        title="CoRoomies API - Swagger UI",
        swagger_js_url="/static/swagger/swagger-ui-bundle.min.js",
        swagger_css_url="/static/swagger/swagger-ui.min.css",
        swagger_favicon_url="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🏠</text></svg>",
    )


@app.get("/", include_in_schema=False)
def root():
    return {
        "status": "ok",
        "service": "CoRoomies Backend API",
        "message": "The backend API is running.",
        "docs_url": None if IS_PRODUCTION else "/docs",
        "health_url": "/health",
    }


@app.get("/health", include_in_schema=False)
def health():
    return {"status": "ok"}


@app.get("/health/ready", include_in_schema=False)
def health_ready():
    # 1. Database readiness check
    try:
        connection = get_connection()
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
                cursor.fetchone()
        finally:
            connection.close()
    except Exception as exc:
        logger.warning("Health readiness check failed on DB (%s)", type(exc).__name__)
        return JSONResponse(status_code=503, content={"status": "not ready", "detail": "database unavailable"})

    # 2. Redis readiness check when rate limiter is configured to fail closed
    if RATE_LIMIT_FAIL_CLOSED and not _limiter.is_distributed:
        logger.warning("Health readiness check failed: Redis rate limiter is required but not connected")
        return JSONResponse(status_code=503, content={"status": "not ready", "detail": "rate limiter unavailable"})

    return {"status": "ready"}


_reminder_stop_event = None


@app.on_event("startup")
def _start_background_tasks():
    global _reminder_stop_event
    if DEV_MODE_OVERRIDDEN:
        logger.warning("DEV_MODE was requested but is disabled in production")
    if IS_PRODUCTION and not smtp_configured():
        logger.warning(
            "SMTP is not configured; password reset and email-change "
            "messages will not be delivered"
        )
    logger.info("Starting CoRoomies API (environment=%s)", "production" if IS_PRODUCTION else "development")
    _reminder_stop_event = start_reminder_loop()


@app.on_event("shutdown")
def _stop_background_tasks():
    if _reminder_stop_event is not None:
        _reminder_stop_event.set()
    close_pool()


cors_options = {
    "allow_origins": list(CORS_ORIGINS),
    "allow_credentials": True,
    "allow_methods": ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    "allow_headers": ["Authorization", "Content-Type", "Accept", "Origin", "X-Requested-With"],
    "max_age": 600,
}
if ALLOW_CLOUDFLARE_TUNNELS:
    # Development only: quick-tunnel hostnames change on every restart.
    cors_options["allow_origin_regex"] = r"^https://[a-zA-Z0-9-]+\.trycloudflare\.com$"
    cors_options["allow_headers"] = ["*"]

app.add_middleware(CORSMiddleware, **cors_options)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    response.headers.setdefault(
        "Permissions-Policy",
        "camera=(self), microphone=(), geolocation=(), payment=()",
    )
    response.headers.setdefault("Cross-Origin-Opener-Policy", "same-origin")
    if request.url.path in ("/docs", "/redoc", "/openapi.json"):
        swagger_csp = (
            "default-src 'self'; "
            "img-src 'self' data: https://fastapi.tiangolo.com; "
            "style-src 'self' 'unsafe-inline'; "
            "script-src 'self' 'unsafe-inline'; "
            "connect-src 'self'"
        )
        response.headers["Content-Security-Policy"] = swagger_csp
    else:
        response.headers.setdefault("Content-Security-Policy", CSP_POLICY)
    if HSTS_ENABLED:
        hsts = f"max-age={HSTS_MAX_AGE}"
        if HSTS_INCLUDE_SUBDOMAINS:
            hsts += "; includeSubDomains"
        response.headers.setdefault("Strict-Transport-Security", hsts)
    return response


app.include_router(auth_router)
app.include_router(profile_router)
app.include_router(matches_router)
app.include_router(expenses_router)
app.include_router(requests_router)
app.include_router(listings_router)
app.include_router(shared_expenses_router)
app.include_router(messages_router)
app.include_router(notifications_router)
app.include_router(groups_router)
app.include_router(chores_router)
app.include_router(rules_router)
app.include_router(reliability_router)
app.include_router(vacancies_router)
app.include_router(assistant_router)
app.include_router(team_ups_router)
app.include_router(settings_router)

uploads_dir = os.path.join(os.path.dirname(__file__), "uploads")
os.makedirs(uploads_dir, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=uploads_dir), name="uploads")

static_dir = os.path.join(os.path.dirname(__file__), "static")
os.makedirs(static_dir, exist_ok=True)
app.mount("/static", StaticFiles(directory=static_dir), name="static")
