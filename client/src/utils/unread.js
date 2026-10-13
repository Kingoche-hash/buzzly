// The first message from someone else that I have not read yet, and how many are unread.
// `unreadCount` is the number the chat list knows: it can be bigger than what is loaded on screen.
// Returns { id, count }, or null when everything is read.
export const findFirstUnread = (messages, myId, unreadCount = 0) => {
  const unread = messages.filter(
    (message) =>
      !message.system &&
      !message.deletedAt &&
      message.sender._id !== myId &&
      !(message.readBy || []).includes(myId)
  );

  if (unread.length === 0) return null;

  return { id: unread[0]._id, count: Math.max(unread.length, unreadCount) };
};
