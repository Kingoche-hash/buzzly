import { env } from '../config/env.js';
import { CODE_MINUTES } from './otp.service.js';

// The autumn colours of the app.
const palette = { page: '#251b15', card: '#34261d', text: '#f6ece0', muted: '#b39a7f', accent: '#c2601f' };

const escapeHtml = (text) =>
  String(text).replace(
    /[&<>"']/g,
    (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]
  );

const appUrl = () => env.clientUrls.find((url) => url.startsWith('https://')) || env.clientUrl;

const layout = (heading, body) => `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:${palette.page};font-family:Arial,Helvetica,sans-serif;color:${palette.text};">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellspacing="0" cellpadding="0" style="max-width:480px;background:${palette.card};border-radius:16px;padding:32px;">
            <tr>
              <td>
                <p style="margin:0 0 4px;font-size:28px;">🐝</p>
                <h1 style="margin:0 0 16px;font-size:22px;color:${palette.text};">${heading}</h1>
                ${body}
                <p style="margin:24px 0 0;font-size:12px;color:${palette.muted};">Buzzly · chat, share and connect</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

const codeBox = (code) =>
  `<p style="margin:16px 0;padding:16px;background:${palette.page};border-radius:12px;text-align:center;font-size:34px;letter-spacing:10px;font-weight:bold;color:${palette.accent};">${code}</p>`;

const paragraph = (text) => `<p style="margin:0 0 8px;line-height:1.5;">${text}</p>`;
const smallPrint = (text) => `<p style="margin:0;line-height:1.5;font-size:13px;color:${palette.muted};">${text}</p>`;

export const verificationEmail = ({ name, code }) => ({
  subject: `Your Buzzly code: ${code}`,
  html: layout(
    'Confirm your account',
    `${paragraph(`Hi ${escapeHtml(name)}, welcome to Buzzly! Enter this code to confirm your account:`)}${codeBox(code)}${smallPrint(
      `The code expires in ${CODE_MINUTES} minutes. If you did not create an account, you can safely ignore this email.`
    )}`
  ),
  text: `Hi ${name},\n\nWelcome to Buzzly! Your confirmation code is ${code}.\nIt expires in ${CODE_MINUTES} minutes. If you did not create an account, you can safely ignore this email.\n`,
});

export const resetEmail = ({ name, code }) => ({
  subject: `Reset your Buzzly password: ${code}`,
  html: layout(
    'Reset your password',
    `${paragraph(`Hi ${escapeHtml(name)}, use this code to choose a new password:`)}${codeBox(code)}${smallPrint(
      `The code expires in ${CODE_MINUTES} minutes. If you did not ask for this, you can ignore this email. Your password stays the same.`
    )}`
  ),
  text: `Hi ${name},\n\nYour password reset code is ${code}.\nIt expires in ${CODE_MINUTES} minutes. If you did not ask for this, you can ignore this email.\n`,
});

export const welcomeEmail = ({ name }) => {
  const url = appUrl();

  return {
    subject: 'Welcome to Buzzly 🐝',
    html: layout(
      `Welcome, ${escapeHtml(name)}!`,
      `${paragraph('Your account is confirmed, and you are all set. Here is what you can do:')}
      <ul style="margin:8px 0 16px;padding-left:20px;line-height:1.8;">
        <li>Chat in real time with friends and in groups</li>
        <li>Share photos, post to the feed and add stories</li>
        <li>Make the app yours with seasonal themes and wallpapers</li>
      </ul>
      <p style="margin:0 0 8px;"><a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 24px;background:${palette.accent};color:#ffffff;text-decoration:none;border-radius:10px;font-weight:bold;">Open Buzzly</a></p>
      ${smallPrint('Have fun, and be kind to each other.')}`
    ),
    text: `Welcome to Buzzly, ${name}!\n\nYour account is confirmed, and you are all set. Chat in real time, share photos, post to the feed and add stories.\n\nOpen Buzzly: ${url}\n\nHave fun, and be kind to each other.\n`,
  };
};
