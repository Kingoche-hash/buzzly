// The people who run a group, as a Set of ids.
// Older groups have no admin list yet: their creator counts as the admin.
export const getAdminIds = (conversation) => {
  const memberIds = new Set(conversation.members.map((member) => member._id));
  const explicit = (conversation.admins || []).filter((id) => memberIds.has(id));

  if (explicit.length > 0) return new Set(explicit);
  if (memberIds.has(conversation.createdBy)) return new Set([conversation.createdBy]);

  return new Set(conversation.members.length > 0 ? [conversation.members[0]._id] : []);
};

export const isAdmin = (conversation, userId) => getAdminIds(conversation).has(userId);
