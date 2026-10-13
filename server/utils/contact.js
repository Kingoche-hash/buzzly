// Helpers for the two ways to sign up: an email address or a phone number.

export const normalizeEmail = (value) => value.trim().toLowerCase();

// "+370 600-12345", "00370600 12345" and "(+370) 600 12345" all become "+37060012345".
export const normalizePhone = (value) => {
  let text = value.trim().replace(/[\s().-]/g, '');

  if (text.startsWith('00')) text = `+${text.slice(2)}`;

  return text;
};

// International format: a plus sign, a country code that does not start with 0, 8 to 15 digits in total.
export const PHONE_PATTERN = /^\+[1-9]\d{7,14}$/;

// Whatever the person typed to find their account.
export const parseIdentifier = (identifier) =>
  identifier.includes('@')
    ? { field: 'email', value: normalizeEmail(identifier), channel: 'email' }
    : { field: 'phone', value: normalizePhone(identifier), channel: 'sms' };
