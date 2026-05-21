# Vercel Deployment Rules & Learnings

This project is a monorepo containing a Vite React client and an Express Node.js server. When deploying to Vercel, the following architectural patterns and deployment learnings must be adhered to:

## 1. Monorepo & Serverless Routing
- **Routing API requests:** `/api/*` requests are routed to the serverless function `api/index.js` at the workspace root using the following `vercel.json` rewrites:
  ```json
  "rewrites": [
    {
      "source": "/api/(.*)",
      "destination": "/api/index.js"
    },
    {
      "source": "/((?!api/.*).*)",
      "destination": "/index.html"
    }
  ]
  ```
- **Entrypoint Separation:** 
  - To support both stateful local development (`app.listen()`) and serverless execution, the Express app setup must be defined in `server/src/app.js` and exported.
  - The local server starts via `server/src/index.js` (which calls `app.listen()` and initializes the stateful background worker).
  - The Vercel deployment imports `app` from `server/src/app.js` into the root-level `api/index.js` and exports it as a serverless function handler.

## 2. Serverless Database Initialization
- In a serverless function, database connections must be initialized dynamically on the first request rather than during a start-up hook.
- A request-level middleware (`ensureStoreInit`) in `server/src/app.js` ensures that `store.init()` has resolved before any routing occurs. Cold starts will invoke the initialization exactly once, while warm invocations reuse the established connection.

## 3. Serverless Monitor Checks (Cron)
- Stateful timers (`setInterval`) do not run persistently in a serverless environment (Vercel functions go idle and freeze between requests).
- Website monitoring checks are run on-demand via the `/api/cron` route, which invokes the `runCronChecks()` helper in `monitorWorker.js`.
- In production, configure a **Vercel Cron Job** or an external cron scheduler (e.g. Cron-Job.org) to hit the `/api/cron` endpoint every minute.
- To secure this endpoint, configure a `CRON_SECRET` environment variable and pass it in the `Authorization` header as `Bearer <CRON_SECRET>`.
