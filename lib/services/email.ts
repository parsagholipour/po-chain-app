import "server-only";

import nodemailer from "nodemailer";

const SENDGRID_MAIL_SEND_URL = "https://api.sendgrid.com/v3/mail/send";
const DEFAULT_SMTP_HOST = "localhost";
const DEFAULT_SMTP_PORT = 1025;
const DEFAULT_LOCAL_FROM = "no-reply@po-app.local";
const DEFAULT_LOCAL_FROM_NAME = "PO App";

export type EmailAddress =
  | string
  | {
      email: string;
      name?: string;
    };

export type EmailRecipients = EmailAddress | EmailAddress[];

export type EmailAttachment = {
  /** Base64-encoded attachment body, as expected by SendGrid. */
  content: string;
  filename: string;
  type?: string;
  disposition?: "attachment" | "inline";
  contentId?: string;
};

type EmailBase = {
  to: EmailRecipients;
  from?: EmailAddress;
  replyTo?: EmailAddress;
  cc?: EmailRecipients;
  bcc?: EmailRecipients;
  categories?: string[];
  customArgs?: Record<string, string>;
  headers?: Record<string, string>;
  attachments?: EmailAttachment[];
  /** Unix timestamp for scheduled delivery. SendGrid-only. */
  sendAt?: number;
};

type HtmlOrTextEmail =
  | {
      subject: string;
      html: string;
      text?: string;
      templateId?: never;
      dynamicTemplateData?: never;
    }
  | {
      subject: string;
      text: string;
      html?: string;
      templateId?: never;
      dynamicTemplateData?: never;
    };

type TemplateEmail = {
  templateId: string;
  dynamicTemplateData?: Record<string, unknown>;
  subject?: string;
  html?: never;
  text?: never;
};

export type EmailMessage = EmailBase & (HtmlOrTextEmail | TemplateEmail);

export type EmailSendResult = {
  ok: true;
  status: number;
  messageId?: string;
};

type NormalizedAddress = {
  email: string;
  name?: string;
};

type SendGridContent = {
  type: "text/plain" | "text/html";
  value: string;
};

type SendGridAttachment = {
  content: string;
  filename: string;
  type?: string;
  disposition?: "attachment" | "inline";
  content_id?: string;
};

type SendGridPersonalization = {
  to: NormalizedAddress[];
  cc?: NormalizedAddress[];
  bcc?: NormalizedAddress[];
  dynamic_template_data?: Record<string, unknown>;
};

type SendGridPayload = {
  personalizations: SendGridPersonalization[];
  from: NormalizedAddress;
  reply_to?: NormalizedAddress;
  subject?: string;
  content?: SendGridContent[];
  template_id?: string;
  attachments?: SendGridAttachment[];
  categories?: string[];
  custom_args?: Record<string, string>;
  headers?: Record<string, string>;
  send_at?: number;
};

type EmailTransportName = "sendgrid" | "smtp";

type SendGridEmailConfig = {
  transport: "sendgrid";
  apiKey: string;
  from: NormalizedAddress;
  replyTo?: NormalizedAddress;
  mailSendUrl: string;
};

type SmtpEmailConfig = {
  transport: "smtp";
  from: NormalizedAddress;
  replyTo?: NormalizedAddress;
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  password?: string;
};

type EmailConfig = SendGridEmailConfig | SmtpEmailConfig;

interface EmailTransport {
  send(message: EmailMessage, config: EmailConfig): Promise<EmailSendResult>;
}

export class EmailConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmailConfigurationError";
  }
}

export class EmailSendError extends Error {
  status: number;
  details?: unknown;

  constructor(message: string, status = 500, details?: unknown) {
    super(message);
    this.name = "EmailSendError";
    this.status = status;
    this.details = details;
  }
}

class SendGridEmailTransport implements EmailTransport {
  async send(message: EmailMessage, config: EmailConfig): Promise<EmailSendResult> {
    if (config.transport !== "sendgrid") {
      throw new EmailConfigurationError("SendGrid transport received SMTP config.");
    }

    const payload = toSendGridPayload(message, config);

    let response: Response;
    try {
      response = await fetch(config.mailSendUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
    } catch {
      throw new EmailSendError("Unable to reach SendGrid.", 502);
    }

    if (!response.ok) {
      const error = await readSendGridError(response);
      throw new EmailSendError(error.message, response.status, error.details);
    }

    return {
      ok: true,
      status: response.status,
      messageId: response.headers.get("x-message-id") ?? undefined,
    };
  }
}

class SmtpEmailTransport implements EmailTransport {
  async send(message: EmailMessage, config: EmailConfig): Promise<EmailSendResult> {
    if (config.transport !== "smtp") {
      throw new EmailConfigurationError("SMTP transport received SendGrid config.");
    }
    if ("templateId" in message && message.templateId) {
      throw new EmailSendError("SMTP email does not support SendGrid template ids.", 400);
    }
    if (message.sendAt) {
      throw new EmailSendError("SMTP email does not support scheduled delivery.", 400);
    }

    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth:
        config.user && config.password
          ? { user: config.user, pass: config.password }
          : undefined,
    });

    try {
      const info = await transporter.sendMail({
        from: formatAddress(message.from ? normalizeAddress(message.from, "from") : config.from),
        to: normalizeRecipients(message.to, "to").map(formatAddress),
        cc: message.cc ? normalizeRecipients(message.cc, "cc").map(formatAddress) : undefined,
        bcc: message.bcc ? normalizeRecipients(message.bcc, "bcc").map(formatAddress) : undefined,
        replyTo: message.replyTo
          ? formatAddress(normalizeAddress(message.replyTo, "replyTo"))
          : config.replyTo
            ? formatAddress(config.replyTo)
            : undefined,
        subject: message.subject,
        text: "text" in message ? message.text : undefined,
        html: "html" in message ? message.html : undefined,
        headers: message.headers,
        attachments: message.attachments?.map((attachment) => ({
          content: Buffer.from(attachment.content, "base64"),
          filename: attachment.filename,
          contentType: attachment.type,
          cid: attachment.contentId,
          contentDisposition: attachment.disposition,
        })),
      });

      return {
        ok: true,
        status: 202,
        messageId: info.messageId,
      };
    } catch (error) {
      throw new EmailSendError(
        error instanceof Error ? error.message : "Unable to send SMTP email.",
        502,
      );
    }
  }
}

let cachedConfig: EmailConfig | null = null;
const transports: Record<EmailTransportName, EmailTransport> = {
  sendgrid: new SendGridEmailTransport(),
  smtp: new SmtpEmailTransport(),
};

export class EmailService {
  static async send(message: EmailMessage): Promise<EmailSendResult> {
    const config = getEmailConfig();
    return transports[config.transport].send(message, config);
  }

  static isConfigured(): boolean {
    return isEmailConfigured();
  }
}

export function isEmailConfigured(): boolean {
  try {
    getEmailConfig();
    return true;
  } catch {
    return false;
  }
}

function getEmailConfig(): EmailConfig {
  if (cachedConfig) return cachedConfig;

  const transport = readTransport();
  const requireVerifiedSender = transport === "sendgrid";
  const from = readDefaultAddress("EMAIL_FROM", "EMAIL_FROM_NAME", {
    fallbackEmail: requireVerifiedSender ? undefined : DEFAULT_LOCAL_FROM,
    fallbackName: requireVerifiedSender ? undefined : DEFAULT_LOCAL_FROM_NAME,
  });
  const replyTo = readOptionalAddress("EMAIL_REPLY_TO", "EMAIL_REPLY_TO_NAME");

  if (transport === "sendgrid") {
    cachedConfig = {
      transport,
      apiKey: required("SENDGRID_API_KEY"),
      from,
      replyTo,
      mailSendUrl: optional("SENDGRID_MAIL_SEND_URL") ?? SENDGRID_MAIL_SEND_URL,
    };
    return cachedConfig;
  }

  cachedConfig = {
    transport,
    from,
    replyTo,
    host: optional("SMTP_HOST") ?? DEFAULT_SMTP_HOST,
    port: optionalInt("SMTP_PORT") ?? DEFAULT_SMTP_PORT,
    secure: optionalBoolean("SMTP_SECURE") ?? false,
    user: optional("SMTP_USER"),
    password: optional("SMTP_PASSWORD"),
  };
  return cachedConfig;
}

function readTransport(): EmailTransportName {
  const raw = optional("EMAIL_TRANSPORT")?.toLowerCase();
  if (!raw) return process.env.NODE_ENV === "production" ? "sendgrid" : "smtp";
  if (raw === "sendgrid" || raw === "smtp") return raw;
  throw new EmailConfigurationError("EMAIL_TRANSPORT must be either sendgrid or smtp.");
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new EmailConfigurationError(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

function optionalInt(name: string): number | undefined {
  const value = optional(name);
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new EmailConfigurationError(`${name} must be a positive integer.`);
  }
  return parsed;
}

function optionalBoolean(name: string): boolean | undefined {
  const value = optional(name);
  if (!value) return undefined;
  if (["1", "true", "yes"].includes(value.toLowerCase())) return true;
  if (["0", "false", "no"].includes(value.toLowerCase())) return false;
  throw new EmailConfigurationError(`${name} must be true or false.`);
}

function readDefaultAddress(
  emailEnv: string,
  nameEnv: string,
  fallback?: { fallbackEmail?: string; fallbackName?: string },
): NormalizedAddress {
  const email = optional(emailEnv) ?? fallback?.fallbackEmail;
  if (!email) {
    throw new EmailConfigurationError(`Missing required environment variable: ${emailEnv}`);
  }
  return normalizeAddress(
    {
      email,
      name: optional(nameEnv) ?? fallback?.fallbackName,
    },
    emailEnv,
  );
}

function readOptionalAddress(
  emailEnv: string,
  nameEnv: string,
): NormalizedAddress | undefined {
  const email = optional(emailEnv);
  if (!email) return undefined;
  return normalizeAddress({ email, name: optional(nameEnv) }, emailEnv);
}

function toSendGridPayload(
  message: EmailMessage,
  config: SendGridEmailConfig,
): SendGridPayload {
  const personalization: SendGridPersonalization = {
    to: normalizeRecipients(message.to, "to"),
  };

  const cc = message.cc ? normalizeRecipients(message.cc, "cc") : undefined;
  if (cc?.length) personalization.cc = cc;

  const bcc = message.bcc ? normalizeRecipients(message.bcc, "bcc") : undefined;
  if (bcc?.length) personalization.bcc = bcc;

  if ("dynamicTemplateData" in message && message.dynamicTemplateData) {
    personalization.dynamic_template_data = message.dynamicTemplateData;
  }

  const payload: SendGridPayload = {
    personalizations: [personalization],
    from: message.from ? normalizeAddress(message.from, "from") : config.from,
  };

  const replyTo = message.replyTo
    ? normalizeAddress(message.replyTo, "replyTo")
    : config.replyTo;
  if (replyTo) payload.reply_to = replyTo;

  if (message.subject) payload.subject = message.subject;
  if (message.categories?.length) payload.categories = message.categories;
  if (message.customArgs) payload.custom_args = message.customArgs;
  if (message.headers) payload.headers = message.headers;
  if (message.sendAt) payload.send_at = message.sendAt;
  if (message.attachments?.length) {
    payload.attachments = message.attachments.map((attachment) => ({
      content: attachment.content,
      filename: attachment.filename,
      type: attachment.type,
      disposition: attachment.disposition,
      content_id: attachment.contentId,
    }));
  }

  if ("templateId" in message && message.templateId) {
    payload.template_id = message.templateId;
    return payload;
  }

  const content: SendGridContent[] = [];
  if ("text" in message && message.text) {
    content.push({ type: "text/plain", value: message.text });
  }
  if ("html" in message && message.html) {
    content.push({ type: "text/html", value: message.html });
  }

  if (content.length === 0) {
    throw new EmailSendError("Email requires text, HTML, or a template id.", 400);
  }

  payload.content = content;
  return payload;
}

function normalizeRecipients(
  recipients: EmailRecipients,
  fieldName: string,
): NormalizedAddress[] {
  const values = Array.isArray(recipients) ? recipients : [recipients];
  if (values.length === 0) {
    throw new EmailSendError(`Email field "${fieldName}" requires at least one address.`, 400);
  }

  return values.map((value, index) =>
    normalizeAddress(value, `${fieldName}[${index}]`),
  );
}

function normalizeAddress(address: EmailAddress, fieldName: string): NormalizedAddress {
  if (typeof address === "string") {
    const email = address.trim();
    if (!email) {
      throw new EmailSendError(`Email field "${fieldName}" cannot be empty.`, 400);
    }
    return { email };
  }

  const email = address.email.trim();
  if (!email) {
    throw new EmailSendError(`Email field "${fieldName}.email" cannot be empty.`, 400);
  }

  const name = address.name?.trim();
  return name ? { email, name } : { email };
}

function formatAddress(address: NormalizedAddress) {
  return address.name ? { name: address.name, address: address.email } : address.email;
}

async function readSendGridError(response: Response) {
  const fallback = response.statusText || "SendGrid rejected the email request.";

  try {
    const details = (await response.json()) as {
      errors?: Array<{ message?: string; field?: string; help?: string }>;
    };
    const message = details.errors?.[0]?.message ?? fallback;
    return { message, details };
  } catch {
    return { message: fallback, details: undefined };
  }
}
