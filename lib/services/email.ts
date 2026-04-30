import "server-only";

const SENDGRID_MAIL_SEND_URL = "https://api.sendgrid.com/v3/mail/send";

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
  /** Unix timestamp for scheduled delivery. */
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

type SendGridAddress = {
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
  to: SendGridAddress[];
  cc?: SendGridAddress[];
  bcc?: SendGridAddress[];
  dynamic_template_data?: Record<string, unknown>;
};

type SendGridPayload = {
  personalizations: SendGridPersonalization[];
  from: SendGridAddress;
  reply_to?: SendGridAddress;
  subject?: string;
  content?: SendGridContent[];
  template_id?: string;
  attachments?: SendGridAttachment[];
  categories?: string[];
  custom_args?: Record<string, string>;
  headers?: Record<string, string>;
  send_at?: number;
};

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

type EmailConfig = {
  apiKey: string;
  from: SendGridAddress;
  replyTo?: SendGridAddress;
  mailSendUrl: string;
};

let cachedConfig: EmailConfig | null = null;

export class EmailService {
  static async send(message: EmailMessage): Promise<EmailSendResult> {
    const config = getEmailConfig();
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

  cachedConfig = {
    apiKey: required("SENDGRID_API_KEY"),
    from: readDefaultAddress("EMAIL_FROM", "EMAIL_FROM_NAME"),
    replyTo: readOptionalAddress("EMAIL_REPLY_TO", "EMAIL_REPLY_TO_NAME"),
    mailSendUrl: optional("SENDGRID_MAIL_SEND_URL") ?? SENDGRID_MAIL_SEND_URL,
  };

  return cachedConfig;
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

function readDefaultAddress(emailEnv: string, nameEnv: string): SendGridAddress {
  return normalizeAddress(
    {
      email: required(emailEnv),
      name: optional(nameEnv),
    },
    emailEnv,
  );
}

function readOptionalAddress(
  emailEnv: string,
  nameEnv: string,
): SendGridAddress | undefined {
  const email = optional(emailEnv);
  if (!email) return undefined;
  return normalizeAddress({ email, name: optional(nameEnv) }, emailEnv);
}

function toSendGridPayload(
  message: EmailMessage,
  config: EmailConfig,
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
): SendGridAddress[] {
  const values = Array.isArray(recipients) ? recipients : [recipients];
  if (values.length === 0) {
    throw new EmailSendError(`Email field "${fieldName}" requires at least one address.`, 400);
  }

  return values.map((value, index) =>
    normalizeAddress(value, `${fieldName}[${index}]`),
  );
}

function normalizeAddress(address: EmailAddress, fieldName: string): SendGridAddress {
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
