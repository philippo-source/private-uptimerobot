# UptimeRobot Clone

A small UptimeRobot-style monitor dashboard with a React/Vite frontend, Node/Express backend, and Postgres persistence.

## Features

- HTTP/HTTPS monitors with a default 1 minute interval.
- Per-monitor interval editing, pause/resume, and delete.
- Background checks from one server location.
- Min, max, and average response times per monitor.
- Incident creation and resolution, with a dedicated incidents page.
- Email alert to `SUPPORT_EMAIL` when a monitor transitions down.

## Setup

1. Create a Postgres database named `uptimerobot`, or run `docker compose up -d postgres`.
2. Copy `.env.example` to `.env` and adjust `DATABASE_URL`, `SUPPORT_EMAIL`, and SMTP values.
3. Install dependencies with `npm install`.
4. Run migrations with `npm run db:migrate`.
5. Start both apps with `npm run dev`.

The frontend runs on `http://localhost:5173`; the backend runs on `http://localhost:4000`.
