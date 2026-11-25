import nodemailer from "nodemailer";
import { env, isProd } from "../config/env.ts";
import { logger } from "../lib/logger.ts";

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

/** Development fallback: prints the email (including links) to the API log. */
export class ConsoleMailer implements Mailer {
  async send(message: MailMessage) {
    logger.info({ to: message.to, subject: message.subject }, `Email (dev, not sent):\n\n${message.text}\n`);
  }
}

/** Collects messages in memory; used by tests to read reset links. */
export class MemoryMailer implements Mailer {
  readonly sent: MailMessage[] = [];
  async send(message: MailMessage) {
    this.sent.push(message);
  }
}

export class SmtpMailer implements Mailer {
  private transport;
  constructor(url: string) {
    this.transport = nodemailer.createTransport(url);
  }
  async send(message: MailMessage) {
    await this.transport.sendMail({ from: env.MAIL_FROM, ...message });
  }
}

export function createMailer(): Mailer {
  if (env.SMTP_URL) return new SmtpMailer(env.SMTP_URL);
  if (isProd) logger.warn("SMTP_URL is not set: password reset emails will only be logged.");
  return new ConsoleMailer();
}
