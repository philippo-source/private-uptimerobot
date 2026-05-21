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

1. Create a Postgres database named `uptimerobot`, or run `docker compose up -d postgres`.
2. Copy `.env.example` to `.env` and adjust `DB_PROVIDER`, database URL, `SUPPORT_EMAIL`, and SMTP values.
3. Use `DB_PROVIDER=postgres` with `DATABASE_URL`, or `DB_PROVIDER=mongodb` with `DATABASE_URL_MONGO`.
4. Install dependencies with `npm install`.
5. Run migrations with `npm run db:migrate`. For MongoDB this creates the needed indexes.
6. Start both apps with `npm run dev`.

The frontend runs on `http://localhost:5173`; the backend runs on `http://localhost:4000`.
