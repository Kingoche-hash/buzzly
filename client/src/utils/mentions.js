// "@bob" at the start of the text or after a space. "mail@bob" is not a mention.
const PATTERN = /(^|[^A-Za-z0-9_])@([A-Za-z0-9_]{3,30})/g;

// Splits a message into pieces: plain text, and @mentions of people in the chat.
// `usernames` is a Set of lowercase usernames. Returns [{ text, mention: 'username' or null }].
export const splitMentions = (text, usernames) => {
  const pieces = [];
  const pattern = new RegExp(PATTERN.source, 'g');
  let last = 0;
  let match;

  while ((match = pattern.exec(text))) {
    const start = match.index + match[1].length;
    const end = start + 1 + match[2].length;

    if (!usernames.has(match[2].toLowerCase())) continue;

    if (start > last) pieces.push({ text: text.slice(last, start), mention: null });

    pieces.push({ text: text.slice(start, end), mention: match[2].toLowerCase() });
    last = end;
  }

  if (last < text.length) pieces.push({ text: text.slice(last), mention: null });

  return pieces;
};

// The "@name" being typed right before the cursor, or null. `start` is where the "@" is.
export const findMentionQuery = (text, cursor) => {
  const before = text.slice(0, cursor);
  const match = before.match(/(^|\s)@([A-Za-z0-9_]{0,30})$/);

  return match ? { query: match[2], start: before.length - match[2].length - 1 } : null;
};
