import User from '../models/User.js';

// "@bob" at the start of the text or after a space. "mail@bob" is not a mention.
const MENTION = /(?:^|[^A-Za-z0-9_])@([A-Za-z0-9_]{3,30})/g;
const MAX_MENTIONS = 10;

export const extractMentionNames = (text) => {
  const names = new Set();

  for (const match of text.matchAll(MENTION)) {
    names.add(match[1].toLowerCase());
    if (names.size >= MAX_MENTIONS) break;
  }

  return [...names];
};

// The members of a group that a message @mentions. Direct chats have no mentions.
export const resolveMentions = async (conversation, content) => {
  if (conversation.type !== 'group' || !content || !content.includes('@')) return [];

  const names = extractMentionNames(content);
  if (names.length === 0) return [];

  const members = await User.find({ _id: { $in: conversation.members }, deletedAt: null }).select('username');

  return members.filter((member) => names.includes(member.username.toLowerCase())).map((member) => member._id);
};
