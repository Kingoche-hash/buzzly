import { env } from '../config/env.js';

// In tests, texts are kept here instead of being sent.
export const testSmsOutbox = [];

// Twilio's web API. Real texts cost money, and a free trial can only text numbers you verified yourself.
const sendWithTwilio = async ({ to, body }) => {
  const { twilioAccountSid, twilioAuthToken, twilioFrom } = env.sms;

  if (!twilioAccountSid || !twilioAuthToken || !twilioFrom) {
    throw new Error('Texts are not set up: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM are required');
  }

  const params = new URLSearchParams({ To: to, Body: body });

  if (twilioFrom.startsWith('MG')) params.set('MessagingServiceSid', twilioFrom);
  else params.set('From', twilioFrom);

  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${twilioAccountSid}:${twilioAuthToken}`).toString('base64')}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: params,
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Twilio answered ${response.status}: ${detail.slice(0, 200)}`);
  }
};

export const sendSms = async (message) => {
  if (env.sms.provider === 'twilio') return sendWithTwilio(message);

  if (env.sms.provider === 'memory') {
    testSmsOutbox.push({ channel: 'sms', ...message });
    return undefined;
  }

  // "console": print it in the server terminal (for development).
  console.log(`\n[text to ${message.to}] ${message.body}\n`);
  return undefined;
};
