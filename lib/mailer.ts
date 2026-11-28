import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import nodemailer from "nodemailer";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface SendResult {
  delivered: boolean;
  provider: "ses" | "smtp" | "console";
}

/**
 * Send an email via AWS SES, SMTP, or console fallback when credentials are missing.
 */
export async function sendEmail(msg: EmailMessage): Promise<SendResult> {
  const provider = (process.env.EMAIL_PROVIDER?.trim().toLowerCase() ||
    "console") as "ses" | "smtp" | "console";
  const fromEmail =
    process.env.FROM_EMAIL?.trim() || "alerts@floodloop.example";

  if (provider === "ses") {
    const region = process.env.AWS_REGION?.trim() || "ap-south-1";
    const hasAwsCreds = Boolean(
      process.env.AWS_ACCESS_KEY_ID ||
        process.env.AWS_PROFILE ||
        process.env.AWS_WEB_IDENTITY_TOKEN_FILE ||
        process.env.ECS_CONTAINER_CREDENTIALS_URI
    );
    if (!hasAwsCreds && !process.env.FORCE_SES) {
      console.info(
        `[Mailer:console-fallback] SES credentials missing. To=${msg.to} Subject="${msg.subject}"\n${msg.text}`
      );
      return { delivered: true, provider: "console" };
    }
    const ses = new SESClient({ region });
    await ses.send(
      new SendEmailCommand({
        Source: fromEmail,
        Destination: { ToAddresses: [msg.to] },
        Message: {
          Subject: { Data: msg.subject, Charset: "UTF-8" },
          Body: {
            Text: { Data: msg.text, Charset: "UTF-8" },
            Html: { Data: msg.html, Charset: "UTF-8" },
          },
        },
      })
    );
    return { delivered: true, provider: "ses" };
  }

  if (provider === "smtp") {
    const host = process.env.SMTP_HOST?.trim();
    const port = Number(process.env.SMTP_PORT || "587");
    const user = process.env.SMTP_USER?.trim();
    const pass = process.env.SMTP_PASS?.trim();
    if (!host || !user || !pass) {
      console.info(
        `[Mailer:console-fallback] SMTP credentials missing. To=${msg.to} Subject="${msg.subject}"\n${msg.text}`
      );
      return { delivered: true, provider: "console" };
    }
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
    await transporter.sendMail({
      from: fromEmail,
      to: msg.to,
      subject: msg.subject,
      text: msg.text,
      html: msg.html,
    });
    return { delivered: true, provider: "smtp" };
  }

  console.info(
    `[Mailer:console] To=${msg.to} Subject="${msg.subject}"\n${msg.text}`
  );
  return { delivered: true, provider: "console" };
}
