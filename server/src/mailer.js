import nodemailer from "nodemailer";
import { config } from "./config.js";

let transporter;

function getTransporter() {
  if (!config.smtp.host || !config.supportEmail) {
    return null;
  }

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: config.smtp.user
        ? { user: config.smtp.user, pass: config.smtp.pass }
        : undefined
    });
  }

  return transporter;
}

export async function sendDownAlert({ monitor, incident }) {
  const mailer = getTransporter();
  if (!mailer) {
    console.warn("SMTP or SUPPORT_EMAIL not configured; skipping alert email.");
    return false;
  }

  await mailer.sendMail({
    to: config.supportEmail,
    from: config.smtp.from,
    subject: `[DOWN] ${monitor.name}`,
    text: [
      `${monitor.name} is down.`,
      "",
      `URL: ${monitor.url}`,
      `Root cause: ${incident.root_cause}`,
      incident.status_code ? `HTTP status: ${incident.status_code}` : null,
      incident.error ? `Error: ${incident.error}` : null,
      `Started: ${incident.started_at}`
    ]
      .filter(Boolean)
      .join("\n")
  });

  return true;
}
