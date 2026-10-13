// "+370 600-12345" and "00370 600 12345" both become "+37060012345".
export const normalizePhone = (value) => {
  let text = value.trim().replace(/[\s().-]/g, '');

  if (text.startsWith('00')) text = `+${text.slice(2)}`;

  return text;
};

export const isPhoneNumber = (value) => /^\+[1-9]\d{7,14}$/.test(normalizePhone(value));

// A partly hidden email or phone number: "al***@test.com" or "+370******45".
export const maskIdentifier = (identifier) => {
  if (identifier.includes('@')) {
    const [name, domain] = identifier.split('@');
    return `${name.slice(0, 2)}${'*'.repeat(Math.max(1, name.length - 2))}@${domain}`;
  }

  return `${identifier.slice(0, 4)}${'*'.repeat(Math.max(1, identifier.length - 6))}${identifier.slice(-2)}`;
};
