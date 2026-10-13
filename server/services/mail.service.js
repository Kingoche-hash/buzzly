import { env } from '../config/env.js';

// In tests, emails are kept here instead of being sent, so a test can read the code.
export const testOutbox = [];

// Brevo's web API (a normal HTTPS request, so it also works on hosts that block SMTP).
const sendWithBrevo = async ({ to, subject, html, text }) => {
  if (!env.mail.brevoApiKey || !env.mail.fromEmail) {
    throw new Error('Email is not set up: BREVO_API_KEY and MAIL_FROM_EMAIL are required');
  }

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': env.mail.brevoApiKey,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      sender: { name: env.mail.fromName, email: env.mail.fromEmail },
      to: [{ email: to }],
      subject,
      htmlContent: html,
      textContent: text,
    }),
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Brevo answered ${response.status}: ${detail.slice(0, 200)}`);
  }
};

export const sendEmail = async (message) => {
  if (env.mail.provider === 'brevo') return sendWithBrevo(message);

  if (env.mail.provider === 'memory') {
    testOutbox.push({ channel: 'email', ...message });
    return undefined;
  }

  // "console": print it in the server terminal (for development).
  console.log(`\n[email to ${message.to}] ${message.subject}\n${message.text}\n`);
  return undefined;
};
