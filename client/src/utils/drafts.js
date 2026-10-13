// Unsent text, saved in this browser. One draft per person and per chat,
// so another account on the same computer never sees it.
const key = (userId, conversationId) => `buzzly-draft:${userId}:${conversationId}`;

export const getDraft = (userId, conversationId) => {
  try {
    return localStorage.getItem(key(userId, conversationId)) || '';
  } catch {
    return '';
  }
};

// An empty text removes the draft.
export const saveDraft = (userId, conversationId, text) => {
  try {
    if (text.trim()) localStorage.setItem(key(userId, conversationId), text);
    else localStorage.removeItem(key(userId, conversationId));
  } catch {
    // Private windows may refuse storage. Drafts are a bonus.
  }
};
