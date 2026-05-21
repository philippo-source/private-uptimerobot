# UptimeRobot Clone

A small UptimeRobot-style monitor dashboard with a React/Vite frontend, Node/Express backend, and Postgres or MongoDB persistence.

## Features

- HTTP/HTTPS monitors with a default 1 minute interval.
- Per-monitor interval editing, pause/resume, and delete.
- Background checks from one server location.
- Min, max, and average response times per monitor.
- Incident creation and resolution, with a dedicated incidents page.
- Email alert to `SUPPORT_EMAIL` when a monitor transitions down.

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

For local development, running Postgres with Docker is the simplest option. For deployment, use a hosted database instead, either hosted Postgres or hosted MongoDB. Set the matching `DB_PROVIDER` and database URL in your production environment variables.

With a hosted database, the frontend can be deployed to serverless/static hosts like Vercel for free. Configure the frontend host to build the `client` app and publish `client/dist`, then set `VITE_API_URL` to the public URL of the backend API.

The current backend is an Express server with a background monitor worker, so it should run on a Node host that supports long-running processes. If you convert the API and checks to serverless functions or scheduled jobs, the whole project can be adapted to a fully serverless setup.
