# CoRoomies — Production Deployment & Environment Variable Guide

**Target Architecture:**
- **Backend:** Render Web Service (FastAPI / Python 3.13)
- **Database:** Supabase PostgreSQL (Managed Relational DB)
- **Object Storage:** Supabase Storage (Private Media & Avatar Buckets)
- **Frontend:** Cloudflare Pages (React 19 / Vite SPA)
- **Cache / Limiter (Optional):** Upstash Redis (Serverless Redis)
- **Email (Optional):** Gmail SMTP or Transactional Provider (Resend / Brevo)

---

## 1. Quick Start: Minimum Viable Free Deployment (4 Variables Only)

You can launch CoRoomies **100% free with zero monthly cost** in under 10 minutes. Only **4 backend variables** and **1 frontend variable** are strictly required to start:

```ini
# Render Backend Minimum Variables:
DATABASE_URL=postgresql://postgres.[REF]:[PASS]@aws-0-[REGION].pooler.supabase.com:5432/postgres
JWT_SECRET_KEY=<random-32-char-string>
OTP_PEPPER_KEY=<random-32-char-string>
CORS_ORIGINS=https://coroomies.pages.dev

# Cloudflare Pages Frontend Variable:
VITE_API_URL=https://coroomies-api.onrender.com
```

All other integrations (Google Login, Redis, Supabase Storage, SMTP) can be added anytime without rebuilding the codebase!

---

## 2. Environment Variables Catalog & Categorization

### A. Backend Variables (Render)

| Variable Name | Category | Default / Fallback | Description & Security Impact |
| :--- | :---: | :---: | :--- |
| `DATABASE_URL` | **REQUIRED** | *None (Fatal)* | PostgreSQL connection string. App crashes on boot if missing. |
| `JWT_SECRET_KEY` | **REQUIRED** | *None (Fatal)* | Cryptographic key for signing session tokens. Must be $\ge 32$ chars in production. |
| `OTP_PEPPER_KEY` | **REQUIRED** | *None (Fatal)* | Pepper for hashing password-reset & verification codes. Must be $\ge 32$ chars. |
| `CORS_ORIGINS` | **REQUIRED** | *None (Fatal)* | Comma-separated list of trusted frontend HTTPS origins. No wildcards allowed. |
| `ENVIRONMENT` | **REQUIRED** | `production` | Enables production security mode, disables debug routes, enforces key lengths. |
| `DEV_MODE` | **REQUIRED** | `false` | Hard-disables printing reset OTPs to stdout/console. Always set to `false`. |
| `RATE_LIMIT_FAIL_CLOSED` | **RECOMMENDED** | `false` *(Initial)* | If `false`, falls back to in-memory rate limiting when Redis is absent. Prevents health check failures. |
| `REDIS_URL` | **OPTIONAL** | *In-memory limiting* | Connection URL for distributed rate limiting across multi-worker instances. |
| `GOOGLE_CLIENT_ID` | **OPTIONAL** | *Google button hidden*| Web Client ID for Google One-Tap / OAuth sign-in. |
| `SUPABASE_URL` | **OPTIONAL** | *Local disk fallback* | Supabase project URL for persistent cloud avatars and chat media. |
| `SUPABASE_SERVICE_ROLE_KEY` | **OPTIONAL** | *None* | Private server key for bucket access. **Never expose to frontend!** |
| `SUPABASE_CHAT_BUCKET` | **OPTIONAL** | `chat-media` | Private storage bucket name for chat images, audio, and videos. |
| `SUPABASE_AVATAR_BUCKET` | **OPTIONAL** | `profile-avatars` | Private storage bucket name for user profile photos. |
| `SUPABASE_GROUP_AVATAR_BUCKET` | **OPTIONAL** | `group-avatars` | Private storage bucket name for living group icons. |
| `SMTP_HOST` | **OPTIONAL** | *Email disabled* | Hostname for outbound emails (e.g. `smtp.gmail.com`). |
| `SMTP_PORT` | **OPTIONAL** | `587` | Outbound mail port (587 for STARTTLS). |
| `SMTP_USER` | **OPTIONAL** | *None* | Authenticated SMTP username / email address. |
| `SMTP_PASS` | **OPTIONAL** | *None* | SMTP password or 16-character App Password. |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | **OPTIONAL** | `1440` (24h) | Lifetime of user session access tokens in minutes. |
| `DB_POOL_MIN_SIZE` | **OPTIONAL** | `1` | Minimum persistent database connections in pool. |
| `DB_POOL_MAX_SIZE` | **OPTIONAL** | `10` | Maximum connections in pool. Default of 10 matches Supabase free tier limits. |
| `DB_POOL_TIMEOUT_SECONDS` | **OPTIONAL** | `5.0` | Timeout before rejecting pool acquisition if saturated. |
| `APP_TIMEZONE` | **OPTIONAL** | `UTC` | Server timestamp timezone (e.g. `Asia/Kolkata`). |
| `LOG_LEVEL` | **OPTIONAL** | `INFO` | Application log verbosity (`DEBUG`, `INFO`, `WARNING`, `ERROR`). |
| `TRUSTED_PROXIES` | **UNNECESSARY** | Handled by Render | Forwarded client IPs are managed via Uvicorn `--proxy-headers`. |
| `CORS_ALLOW_TUNNELS` | **UNNECESSARY** | `false` | Used only for local Cloudflare Quick Tunnels. Automatically disabled in prod. |

---

### B. Frontend Variables (Cloudflare Pages)

| Variable Name | Category | Description |
| :--- | :---: | :--- |
| `VITE_API_URL` | **REQUIRED** | Public HTTPS origin of your backend (e.g. `https://coroomies-api.onrender.com`). Production build fails if missing or set to localhost. |
| `VITE_GOOGLE_CLIENT_ID` | **OPTIONAL** | Google OAuth Client ID matching the backend. Required only if using Google login. |
| `VITE_HSTS_ENABLED` | **UNNECESSARY** | Local preview flag. Cloudflare Pages edge headers handle HSTS via `_headers`. |

---

## 3. Exact Instructions: Where to Obtain Every Secret

### 1. Database Credentials (Supabase PostgreSQL)
1. Go to [database.new](https://database.new) and create a free project.
2. Navigate to **Project Settings** (gear icon) $\to$ **Database**.
3. Under **Connection parameters**, select **Connection string** $\to$ **URI**.
4. Choose **Session Pooler** (Port `5432`):
   ```
   postgresql://postgres.[PROJECT-REF]:[YOUR-PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres
   ```
   > [!IMPORTANT]
   > Use port `5432` (Session mode), **not** port `6543` (Transaction mode). Alembic database migrations require transaction DDL support which requires Session mode.

---

### 2. Random Secret Keys (`JWT_SECRET_KEY` & `OTP_PEPPER_KEY`)
Run this in PowerShell or bash to generate cryptographically secure 64-character hex strings:

```powershell
# In PowerShell:
python -c "import secrets; print('JWT_SECRET_KEY=' + secrets.token_hex(32)); print('OTP_PEPPER_KEY=' + secrets.token_hex(32))"
```

Copy each string and paste it into Render. **Never reuse these across environments.**

---

### 3. Object Storage Credentials (Supabase Storage)
*(Optional — enable when you want user avatars and chat media to persist forever)*
1. In your Supabase Project dashboard, go to **Storage** $\to$ **New Bucket**:
   - Create bucket: `chat-media` (Private)
   - Create bucket: `profile-avatars` (Private)
   - Create bucket: `group-avatars` (Private)
2. Go to **Project Settings** $\to$ **API**:
   - Copy **Project URL** $\to$ `SUPABASE_URL` (e.g. `https://xyzproject.supabase.co`)
   - Copy **`service_role` secret key** (revealed under Project API keys) $\to$ `SUPABASE_SERVICE_ROLE_KEY`
   > [!CAUTION]
   > The `service_role` key bypasses Row Level Security. **Never** put this key in Cloudflare Pages or frontend `.env` files. It belongs solely in Render.

---

### 4. Google OAuth Credentials (Google Cloud)
*(Optional — enable when you want users to log in with 1-click Google accounts)*
1. Go to [Google Cloud Console](https://console.cloud.google.com/) $\to$ **APIs & Services** $\to$ **Credentials**.
2. Click **Create Credentials** $\to$ **OAuth client ID**:
   - Application type: **Web application**
   - Name: `CoRoomies Web`
   - **Authorized JavaScript origins**:
     - `https://your-frontend.pages.dev` (Cloudflare Pages domain)
     - `https://coroomies.app` (if using custom domain)
   - **Authorized redirect URIs**:
     - `https://your-frontend.pages.dev`
3. Copy the **Client ID** (ends with `.apps.googleusercontent.com`).
4. Set:
   - Render Backend: `GOOGLE_CLIENT_ID`
   - Cloudflare Pages Frontend: `VITE_GOOGLE_CLIENT_ID`

---

### 5. Distributed Rate Limiter (Upstash Redis)
*(Optional — enable for multi-instance rate limiting or DDoS protection)*
1. Go to [Upstash Console](https://console.upstash.com/) (Free Tier: 10,000 commands/day).
2. Click **Create Database**:
   - Name: `coroomies-redis`
   - Type: Regional (choose region closest to Render)
3. Copy the **Redis Connect URL** (starts with `rediss://...`).
4. In Render:
   - Set `REDIS_URL=rediss://default:[PASSWORD]@[ENDPOINT]:6379`
   - Set `RATE_LIMIT_FAIL_CLOSED=true`

---

### 6. Outbound Email (Gmail SMTP / Free App Password)
*(Optional — enable when you want users to receive password reset & email change codes)*
1. Open your Google Account $\to$ **Security** $\to$ **2-Step Verification** (must be enabled).
2. At the bottom, click **App passwords**:
   - App name: `CoRoomies Render`
   - Click **Create** and copy the 16-character code (e.g. `abcd efgh ijkl mnop`).
3. In Render, set:
   - `SMTP_HOST=smtp.gmail.com`
   - `SMTP_PORT=587`
   - `SMTP_USER=your-email@gmail.com`
   - `SMTP_PASS=abcdefghijklmnop` (without spaces)

---

## 4. Services You Can Safely Skip for Initial Launch

| Service | Safe to Skip? | Effect on Application |
| :--- | :---: | :--- |
| **Upstash / Redis** | **YES** | App uses in-memory rate limiting. Perfect for single-instance free tiers. *Remember to leave `RATE_LIMIT_FAIL_CLOSED=false`.* |
| **Google OAuth** | **YES** | The Google button hides automatically. Standard email/password registration and login work 100%. |
| **Supabase Storage** | **YES** | Media/avatars are saved to Render local storage. (Files reset when Render sleeps or redeploys, but core features work). |
| **SMTP Outbound Email** | **YES** | System logs a warning on boot. Password resets and email changes won't dispatch emails, but account creation, flatmate matching, group chat, and expenses function normally. |

---

## 5. Render Free Tier Compatibility & Cost Analysis

### Cost Breakdown: $0 / month

| Provider | Service | Tier Specs | Cost |
| :--- | :--- | :--- | :---: |
| **Render** | Web Service (FastAPI) | 512 MB RAM, 0.1 vCPU, 750 free instance hrs/mo | **$0** |
| **Supabase** | PostgreSQL Database | 500 MB storage, 2 active projects, 60 direct conns | **$0** |
| **Supabase** | Storage Buckets | 1 GB storage, 2 GB bandwidth | **$0** |
| **Cloudflare** | Cloudflare Pages | Unlimited bandwidth, global CDN, automatic SSL | **$0** |
| **Upstash** | Redis Cache | 10,000 commands/day, 256 MB storage | **$0** |
| **Total** | | | **$0.00** |

### Render Free Tier Nuances & Best Practices
1. **Sleep / Inactivity:**
   - On the Free plan, Render spins down web services after 15 minutes of inactivity.
   - The first request after sleep experiences a **30 to 45 second cold start** while the container boots.
   - To keep it awake for demos or active testing, you can use a free uptime monitor (e.g., UptimeRobot or Cron-job.org) pinging `https://your-api.onrender.com/health` every 10 minutes.
2. **Memory Ceiling (512 MB):**
   - The default configuration uses `psycopg_pool` with `min_size=1, max_size=10`.
   - Backend memory consumption at idle is ~65 MB, leaving over 400 MB headroom.
3. **Health Check Configuration:**
   - Health check path is `/health/ready`.
   - When deploying without Redis, ensure `RATE_LIMIT_FAIL_CLOSED=false` so the health check passes immediately.

---

## 6. Step-by-Step Deployment Runbook

### Step 1: Database Setup on Supabase
1. Create a project at [supabase.com](https://supabase.com).
2. Save your database password securely.
3. Copy the **URI connection string** from **Project Settings** $\to$ **Database** (Session Pooler port `5432`).

---

### Step 2: Deploy Backend on Render
1. Log in to [render.com](https://render.com) and click **New +** $\to$ **Blueprint** (or **Web Service**).
2. Connect your GitHub repository (`CoRoomies project`).
3. Render will read `render.yaml` automatically:
   - **Name:** `coroomies-api`
   - **Environment:** `Python`
   - **Plan:** `Free`
   - **Build Command:** `cd backend && python -m pip install -r requirements.txt`
   - **Start Command:** `cd backend && python -m alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port $PORT --proxy-headers --forwarded-allow-ips "*"`
   - **Health Check Path:** `/health/ready`
4. When prompted for environment variables, fill in:
   - `DATABASE_URL`: *(Your Supabase connection string from Step 1)*
   - `JWT_SECRET_KEY`: *(Generated 32+ character hex string)*
   - `OTP_PEPPER_KEY`: *(Generated 32+ character hex string)*
   - `CORS_ORIGINS`: `https://coroomies.pages.dev` *(Replace with your Cloudflare domain)*
   - `RATE_LIMIT_FAIL_CLOSED`: `false`
5. Click **Apply / Deploy**.
6. Render will install dependencies, run `alembic upgrade head` to build all database tables, verify `/health/ready`, and publish your service URL:
   `https://coroomies-api.onrender.com`

---

### Step 3: Deploy Frontend on Cloudflare Pages
1. Log in to the [Cloudflare Dashboard](https://dash.cloudflare.com/) $\to$ **Workers & Pages** $\to$ **Create application** $\to$ **Pages** $\to$ **Connect to Git**.
2. Select your `CoRoomies` repository.
3. Configure build settings:
   - **Framework preset:** `Vite`
   - **Root directory:** `frontend`
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
4. Under **Environment variables**, add:
   - `VITE_API_URL`: `https://coroomies-api.onrender.com` *(Your Render backend URL from Step 2)*
   - `VITE_GOOGLE_CLIENT_ID`: *(Optional — Google Client ID if using Google OAuth)*
5. Click **Save and Deploy**.
6. Cloudflare builds the React app, applies `_headers` (security & CSP) and `_redirects` (SPA routing), and assigns you a URL:
   `https://coroomies.pages.dev`

---

### Step 4: Final Domain & CORS Alignment
1. Copy your exact Cloudflare Pages URL (e.g. `https://coroomies.pages.dev`).
2. Go back to **Render** $\to$ `coroomies-api` $\to$ **Environment**:
   - Ensure `CORS_ORIGINS` exactly matches your Cloudflare Pages URL (no trailing slash).
3. If using Google OAuth:
   - Go to Google Cloud Console and add `https://coroomies.pages.dev` to **Authorized JavaScript origins**.

---

## 7. Troubleshooting & Common Deployment Pitfalls

### Issue 1: Render Health Check Fails (`503 Service Unavailable`)
- **Cause:** `RATE_LIMIT_FAIL_CLOSED` is set to `true`, but `REDIS_URL` is empty or unreachable.
- **Fix:** In Render environment settings, change `RATE_LIMIT_FAIL_CLOSED` to `false` and trigger a manual redeploy.

### Issue 2: Frontend Build Fails on Cloudflare Pages (`Error: Production build requires VITE_API_URL...`)
- **Cause:** `VITE_API_URL` is missing, has trailing spaces, or points to `localhost`.
- **Fix:** Set `VITE_API_URL=https://your-api.onrender.com` in Cloudflare Pages $\to$ Settings $\to$ Environment Variables, and retry the build.

### Issue 3: SPA Deep Links Return 404 on Page Refresh (e.g. `/flatmates`, `/rooms`)
- **Cause:** Web server is attempting to resolve client routes as static files on the server.
- **Fix:** Verified present. CoRoomies includes `frontend/public/_redirects` (`/* /index.html 200`), which instructs Cloudflare Pages to route all paths to `index.html`.

### Issue 4: Google OAuth Popup Closes Immediately or Errors (`Origin mismatch`)
- **Cause:** The current frontend domain (`.pages.dev`) is not listed in Google Cloud Console.
- **Fix:** Add your Cloudflare domain to Google Cloud Console $\to$ Credentials $\to$ Authorized JavaScript Origins.

### Issue 5: Supabase Connection Timeout (`psycopg.OperationalError`)
- **Cause:** Using Direct Connection on an IPv4-only network where Supabase direct host has IPv6 routing issues.
- **Fix:** Switch your `DATABASE_URL` to the **Session Pooler** string (`...pooler.supabase.com:5432/postgres`), which supports universal IPv4/IPv6 pooling.

---

### Ready to Deploy
With `render.yaml` configured with automated migrations and fail-safe defaults, CoRoomies is completely deployment-ready.
