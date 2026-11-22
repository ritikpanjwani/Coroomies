import process from 'node:process'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const COMMON_SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(self), microphone=(), geolocation=(), payment=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
}

function apiOriginFrom(url) {
  try {
    return new URL(url).origin
  } catch {
    return 'http://127.0.0.1:8000'
  }
}

function contentSecurityPolicy(apiOrigin, { dev }) {
  const scriptSrc = dev ? "'self' 'unsafe-inline' 'unsafe-eval'" : "'self'"
  const connectSrc = dev
    ? `'self' http://127.0.0.1:8000 http://localhost:8000 http://127.0.0.1:8001 http://localhost:8001 ${apiOrigin} https://*.trycloudflare.com ws: wss:`
    : `'self' ${apiOrigin}`
  const imgSrc = dev
    ? `'self' data: blob: http://127.0.0.1:8000 http://localhost:8000 ${apiOrigin} https://*.trycloudflare.com`
    : `'self' data: blob: ${apiOrigin}`
  const mediaSrc = dev
    ? `'self' data: blob: http://127.0.0.1:8000 http://localhost:8000 ${apiOrigin} https://*.trycloudflare.com`
    : `'self' data: blob: ${apiOrigin}`

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "frame-src https://accounts.google.com",
    "object-src 'none'",
    "form-action 'self'",
    `script-src ${scriptSrc} https://accounts.google.com`,
    "style-src 'self' 'unsafe-inline'",
    `img-src ${imgSrc}`,
    `media-src ${mediaSrc}`,
    "font-src 'self' data:",
    `connect-src ${connectSrc}`,
    "manifest-src 'self'",
  ].join('; ')
}

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const configuredApiUrl = (
    process.env.VITE_API_URL ||
    env.VITE_API_URL ||
    env['\uFEFFVITE_API_URL'] ||
    ''
  ).trim()
  const configuredGoogleClientId = (
    process.env.VITE_GOOGLE_CLIENT_ID ||
    env.VITE_GOOGLE_CLIENT_ID ||
    env['\uFEFFVITE_GOOGLE_CLIENT_ID'] ||
    ''
  ).trim()

  if (command === 'build') {
    let parsed = null
    try {
      parsed = new URL(configuredApiUrl)
    } catch {
      // Invalid/relative URL: parsed stays null.
    }

    const host = parsed?.hostname?.toLowerCase() ?? ''
    const isProductionSafe =
      parsed !== null &&
      parsed.protocol === 'https:' &&
      host !== 'localhost' &&
      host !== '127.0.0.1' &&
      host !== '::1' &&
      !host.endsWith('.trycloudflare.com')

    if (!isProductionSafe) {
      throw new Error(
        'Production build requires VITE_API_URL to be an absolute https:// ' +
          'API origin. Localhost, loopback, and Cloudflare Quick Tunnel ' +
          'URLs are not allowed.'
      )
    }
  }

  const apiOrigin = apiOriginFrom(configuredApiUrl || 'http://127.0.0.1:8000')
  const hsts = env.VITE_HSTS_ENABLED === 'true'
    ? { 'Strict-Transport-Security': 'max-age=31536000; includeSubDomains' }
    : {}

  return {
    define: {
      'import.meta.env.VITE_API_URL': JSON.stringify(apiOrigin),
      'import.meta.env.VITE_GOOGLE_CLIENT_ID': JSON.stringify(configuredGoogleClientId),
    },
    plugins: [react(), tailwindcss()],
    server: {
      host: '0.0.0.0',
      port: 5173,
      strictPort: true,
      allowedHosts: true,
      proxy: {
        '/auth': { target: 'http://127.0.0.1:8000', changeOrigin: true },
        '/profile': { target: 'http://127.0.0.1:8000', changeOrigin: true },
        '/matches': { target: 'http://127.0.0.1:8000', changeOrigin: true },
        '/expenses': { target: 'http://127.0.0.1:8000', changeOrigin: true },
        '/requests': { target: 'http://127.0.0.1:8000', changeOrigin: true },
        '/listings': { target: 'http://127.0.0.1:8000', changeOrigin: true },
        '/shared-expenses': { target: 'http://127.0.0.1:8000', changeOrigin: true },
        '/messages': { target: 'http://127.0.0.1:8000', changeOrigin: true },
        '/notifications': { target: 'http://127.0.0.1:8000', changeOrigin: true },
        '/groups': { target: 'http://127.0.0.1:8000', changeOrigin: true },
        '/chores': { target: 'http://127.0.0.1:8000', changeOrigin: true },
        '/rules': { target: 'http://127.0.0.1:8000', changeOrigin: true },
        '/reliability': { target: 'http://127.0.0.1:8000', changeOrigin: true },
        '/vacancies': { target: 'http://127.0.0.1:8000', changeOrigin: true },
        '/assistant': { target: 'http://127.0.0.1:8000', changeOrigin: true },
        '/team-ups': { target: 'http://127.0.0.1:8000', changeOrigin: true },
        '/settings': { target: 'http://127.0.0.1:8000', changeOrigin: true },
        '/uploads': { target: 'http://127.0.0.1:8000', changeOrigin: true },
        '/health': { target: 'http://127.0.0.1:8000', changeOrigin: true },
        '/docs': { target: 'http://127.0.0.1:8000', changeOrigin: true },
        '/openapi.json': { target: 'http://127.0.0.1:8000', changeOrigin: true },
        '/api': {
          target: 'http://127.0.0.1:8000',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ''),
        },
      },
      headers: {
        ...COMMON_SECURITY_HEADERS,
        ...hsts,
        'Content-Security-Policy': contentSecurityPolicy(apiOrigin, { dev: true }),
      },
    },
    preview: {
      headers: {
        ...COMMON_SECURITY_HEADERS,
        ...hsts,
        'Content-Security-Policy': contentSecurityPolicy(apiOrigin, { dev: false }),
      },
    },
  }
})
