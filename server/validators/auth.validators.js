import { z } from 'zod';
import { PHONE_PATTERN, normalizePhone } from '../utils/contact.js';

const emailField = z.string().trim().toLowerCase().email('Invalid email address');

const phoneField = z
  .string()
  .trim()
  .transform(normalizePhone)
  .refine((value) => PHONE_PATTERN.test(value), 'Enter the phone number with its country code, like +37060012345');

// Whatever the person typed to find their account: an email address or a phone number.
const identifierField = z
  .string()
  .trim()
  .min(3, 'Enter your email or phone number')
  .max(254, 'That is too long')
  .transform((value) => (value.includes('@') ? value.toLowerCase() : normalizePhone(value)));

const passwordField = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be at most 72 characters')
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/[0-9]/, 'Password must contain a number');

const codeField = z.string().trim().regex(/^\d{6}$/, 'The code has 6 digits');

const exactlyOneContact = (value) => Boolean(value.email) !== Boolean(value.phone);
const oneContactMessage = { message: 'Use either an email address or a phone number', path: ['email'] };

export const registerSchema = z
  .object({
    username: z
      .string()
      .trim()
      .min(3, 'Username must be at least 3 characters')
      .max(30, 'Username must be at most 30 characters')
      .regex(/^[a-zA-Z0-9_]+$/, 'Username may only contain letters, numbers and underscores'),
    email: emailField.optional(),
    phone: phoneField.optional(),
    password: passwordField,
  })
  .refine(exactlyOneContact, oneContactMessage);

// "identifier" is an email or a phone number. Older versions of the website sent "email".
export const loginSchema = z
  .object({
    identifier: identifierField.optional(),
    email: identifierField.optional(),
    password: z.string().min(1, 'Password is required'),
  })
  .refine((value) => Boolean(value.identifier || value.email), {
    message: 'Enter your email or phone number',
    path: ['identifier'],
  })
  .transform((value) => ({ identifier: value.identifier || value.email, password: value.password }));

export const verifySchema = z.object({ identifier: identifierField, code: codeField });

export const identifierSchema = z.object({ identifier: identifierField });

export const changeContactSchema = z
  .object({
    identifier: identifierField,
    password: z.string().min(1, 'Password is required'),
    email: emailField.optional(),
    phone: phoneField.optional(),
  })
  .refine(exactlyOneContact, oneContactMessage);

export const resetSchema = z.object({
  identifier: identifierField,
  code: codeField,
  newPassword: passwordField,
});
