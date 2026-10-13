// The reactions people can choose from. They must match the list on the server.
export const REACTIONS = ['👍', '\u2764\uFE0F', '😂', '😮', '😢', '🙏'];

// [{ emoji, count, mine }], in the order the emojis were first used.
export const summarizeReactions = (reactions = [], myId) => {
  const byEmoji = new Map();

  for (const { user, emoji } of reactions) {
    const entry = byEmoji.get(emoji) || { emoji, count: 0, mine: false };

    entry.count += 1;
    if (user === myId) entry.mine = true;

    byEmoji.set(emoji, entry);
  }

  return [...byEmoji.values()];
};
