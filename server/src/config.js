import dotenv from "dotenv";

dotenv.config({ path: new URL("../../.env", import.meta.url) });

export const config = {
  port: Number(process.env.PORT || 4000),
  databaseUrl:
    process.env.DATABASE_URL ||
    "postgres://postgres:postgres@localhost:5432/uptimerobot",
  supportEmail: process.env.SUPPORT_EMAIL || "",
  smtp: {
    host: process.env.SMTP_HOST || "",
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
    from: process.env.SMTP_FROM || "Uptime Monitor <alerts@example.com>"
  }
};
