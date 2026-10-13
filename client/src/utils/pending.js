// The messages I am sending right now, or that could not be sent.
// Each is { tempId, content, replyTo, replyPreview, status: 'sending' | 'failed', error }.

export const updatePending = (list, tempId, patch) =>
  list.map((entry) => (entry.tempId === tempId ? { ...entry, ...patch } : entry));

export const removePending = (list, tempId) => list.filter((entry) => entry.tempId !== tempId);

// My message came back through the live line, so it was saved: the oldest message that is still
// being sent with the same text is done. A failed message is never matched.
export const removeArrived = (list, content) => {
  const index = list.findIndex((entry) => entry.status === 'sending' && entry.content === content);

  return index === -1 ? list : list.filter((entry, position) => position !== index);
};
