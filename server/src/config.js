import dotenv from "dotenv";

dotenv.config({ path: new URL("../../.env", import.meta.url) });

export const config = {
  port: Number(process.env.PORT || 4000),
  dbProvider: (process.env.DB_PROVIDER || "postgres").toLowerCase(),
  databaseUrl:
    process.env.DATABASE_URL ||
    "postgres://postgres:postgres@localhost:5432/uptimerobot",
  databaseUrlMongo: process.env.DATABASE_URL_MONGO || "",
  supportEmail: process.env.SUPPORT_EMAIL || "",
  smtp: {
    host: process.env.SMTP_HOST || "",
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    user: process.env.SMTP_USER || process.env.SMTP_EMAIL || "",
    pass: process.env.SMTP_PASS || process.env.SMTP_PASSWORD || "",
    from: process.env.SMTP_FROM || "Uptime Monitor <alerts@example.com>"
  }
};
