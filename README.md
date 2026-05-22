# UptimeRobot Clone

A small UptimeRobot-style monitor dashboard with a React/Vite frontend, Node/Express backend, and Postgres or MongoDB persistence.

## Features

- HTTP/HTTPS monitors with a default 1 minute interval.
- Per-monitor interval editing, pause/resume, and delete.
- Background checks from one server location.
- Min, max, and average response times per monitor.
- Incident creation and resolution, with a dedicated incidents page.
- Email alert to `SUPPORT_EMAIL` when a monitor transitions down.

## Authentication

The application features an optional global login screen to protect your dashboard and API. 
To enable authentication, simply set the following environment variables in your `.env` file (or Vercel project settings):

- `APP_PASSWORD`: The password required to log in.
- `APP_USERNAME`: (Optional) The username required to log in.

If these variables are omitted, the application will bypass authentication entirely and remain open to the public.

## Email Alerts

Set these values in `.env` to enable email sending:

- `SUPPORT_EMAIL`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER` and `SMTP_PASS` when your provider requires auth
- `SMTP_EMAIL` and `SMTP_PASSWORD` are also accepted as aliases
- `SMTP_FROM`

Use the `Test email` button on a monitor detail page to verify SMTP.

## Setup

1. Choose a database:
   - Local Postgres: create a database named `uptimerobot`, or run `docker compose up -d postgres`.
   - Hosted Postgres: use the connection string from your provider in `DATABASE_URL`.
   - Hosted MongoDB: use a MongoDB Atlas or compatible connection string in `DATABASE_URL_MONGO`.
2. Copy `.env.example` to `.env` and adjust `DB_PROVIDER`, database URL, `SUPPORT_EMAIL`, and SMTP values.
3. Use `DB_PROVIDER=postgres` with `DATABASE_URL`, or `DB_PROVIDER=mongodb` with `DATABASE_URL_MONGO`.
4. Install dependencies with `npm install`.
5. Run migrations with `npm run db:migrate`. For MongoDB this creates the needed indexes.
6. Start both apps with `npm run dev`.

The frontend runs on `http://localhost:5173`; the backend runs on `http://localhost:4000`.

## Deployment

The project is fully pre-configured and optimized to run entirely on **Vercel** as a serverless monorepo (both the Vite React frontend and Node.js Express API).

### Deploying to Vercel

1. **Link Project to Vercel**: Connect this monorepo directory to Vercel. Vercel will automatically read the root `vercel.json` file and use the preset configuration.
2. **Build Configuration**: Vercel handles the monorepo workspace builds using the config defined in `vercel.json`:
   - **Build Command**: `npm run build --workspace client`
   - **Output Directory**: `client/dist`
   - **API Routes**: `/api/*` paths are automatically routed to the serverless function `/api/index.js` which wraps the Express API.
3. **Environment Variables**: Add your production variables in the Vercel project settings:
   - `DB_PROVIDER`: `mongodb` or `postgres`
   - `DATABASE_URL` (for Postgres) or `DATABASE_URL_MONGO` (for MongoDB)
   - `APP_PASSWORD`: (Optional) Your dashboard login password
   - `APP_USERNAME`: (Optional) Your dashboard login username
   - `SUPPORT_EMAIL`: Your alerts recipient email address
   - `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` (to enable email down alerts)
   - `CRON_SECRET`: (Optional) A secure secret token of your choosing to protect the checks execution endpoint.

### Vercel Preview Authentication (Important)

By default, Vercel enables **Vercel Authentication** for Preview Deployments. This means if you visit a preview URL (e.g., `https://your-app-123xyz.vercel.app`), you will see a white screen asking you to "Log in with Vercel" instead of your UptimeRobot clone login screen.

- To access your app without this barrier, use your main **Production URL** (e.g., `https://your-app.vercel.app`).
- If you want Preview Deployments to be publicly accessible, go to your Vercel Project Dashboard -> **Settings** -> **Deployment Protection** and disable or configure **Vercel Authentication**.

### Configuring Background Monitor Checks (Cron)

Because Vercel Serverless Functions are stateless and ephemeral, memory-based loops (`setInterval`) do not run continuously in production. Instead, a serverless-friendly cron mechanism is provided:

- **Checks Endpoint**: A stateless check runner is exposed at `/api/cron`.
- **Set Up External Cron**: If you are on the Vercel Hobby (Free) plan, Vercel only allows running cron jobs once a day, which is not enough for an uptime monitor. Instead, you should use a free external service like [cron-job.org](https://cron-job.org/) to trigger checks:
  - Create a free account on cron-job.org.
  - Create a new cron job that pings `https://your-domain.vercel.app/api/cron` every minute.
  - If you configured a `CRON_SECRET` in your Vercel project, make sure to add an HTTP Header in your cron-job.org settings: `Authorization: Bearer YOUR_CRON_SECRET`.
- **Set Up Vercel Cron (Pro Plan)**: If you are on a paid Vercel Pro plan, you can schedule checks to run automatically every minute by adding a `crons` definition in your `vercel.json`:
  ```json
  {
    "crons": [
      {
        "path": "/api/cron",
        "schedule": "* * * * *"
      }
    ]
  }
  ```
- **Securing Cron**: If a `CRON_SECRET` environment variable is configured in Vercel, the endpoint will require an `Authorization` header containing `Bearer <CRON_SECRET>` to trigger the checks.

