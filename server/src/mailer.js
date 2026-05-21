import nodemailer from "nodemailer";
import { config } from "./config.js";

let transporter;

function maskSecret(value) {
  if (!value) return "";
  if (value.length <= 6) return "*".repeat(value.length);
  return `${value.slice(0, 3)}...${value.slice(-3)}`;
}

function logEmailEnv() {
  console.log("Email env before send:", {
    SUPPORT_EMAIL: config.supportEmail,
    SMTP_HOST: config.smtp.host,
    SMTP_PORT: config.smtp.port,
    SMTP_SECURE: config.smtp.secure,
    SMTP_FROM: config.smtp.from,
    SMTP_USER: maskSecret(config.smtp.user),
    SMTP_PASS: config.smtp.pass ? maskSecret(config.smtp.pass) : "",
    hasSmtpUser: Boolean(config.smtp.user),
    hasSmtpPass: Boolean(config.smtp.pass)
  });
}

export function emailConfigStatus() {
  const missing = [];
  if (!config.supportEmail) missing.push("SUPPORT_EMAIL");
  if (!config.smtp.host) missing.push("SMTP_HOST");
  if (!config.smtp.port) missing.push("SMTP_PORT");
  if (!config.smtp.from) missing.push("SMTP_FROM");
  if (config.smtp.user && !config.smtp.pass) missing.push("SMTP_PASS");

  return {
    enabled: missing.length === 0,
    missing
  };
}

function getTransporter() {
  if (!emailConfigStatus().enabled) {
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
    console.warn(
      `Email is not configured; missing ${emailConfigStatus().missing.join(", ")}.`
    );
    return false;
  }

  logEmailEnv();
  await mailer.sendMail({
    to: config.supportEmail,
    from: config.smtp.from,
    subject: `[DOWN] ${monitor.name}`,
    text: [
      `${monitor.name} is down.`,
      "",
      `URL: ${monitor.url}`,
      `Reason: ${incident.error || incident.root_cause || "Check failed"}`,
      incident.status_code ? `HTTP status: ${incident.status_code}` : null,
      incident.error ? `Error: ${incident.error}` : null,
      `Started: ${incident.started_at}`
    ]
      .filter(Boolean)
      .join("\n")
  });

  return true;
}

export async function sendTestEmail(monitor) {
  const mailer = getTransporter();
  if (!mailer) {
    const missing = emailConfigStatus().missing.join(", ");
    const error = new Error(`Email is not configured. Missing: ${missing}`);
    error.statusCode = 400;
    throw error;
  }

  logEmailEnv();
  await mailer.sendMail({
    to: config.supportEmail,
    from: config.smtp.from,
    subject: `[TEST] ${monitor.name}`,
    text: [
      "This is a test notification from your uptime monitor.",
      "",
      `Monitor: ${monitor.name}`,
      `URL: ${monitor.url}`,
      `Sent: ${new Date().toISOString()}`
    ].join("\n")
  });

  return true;
}
