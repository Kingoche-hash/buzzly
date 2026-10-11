// "Just now", "5m ago", "3h ago", "2d ago".
export const timeAgo = (isoDate) => {
  const minutes = Math.floor((Date.now() - new Date(isoDate).getTime()) / 60000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  return `${Math.floor(hours / 24)}d ago`;
};
