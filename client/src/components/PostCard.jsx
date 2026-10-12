import { useRef, useState } from 'react';
import { useClickOutside } from '../hooks/useClickOutside';
import { useToast } from '../hooks/useToast';
import { deletePostRequest, likePostRequest, reportPostRequest, unlikePostRequest } from '../services/post.service';
import { getDisplayName } from '../utils/conversation';
import { getErrorMessage } from '../utils/getErrorMessage';
import { fitWidth } from '../utils/imageUrl';
import { timeAgo } from '../utils/timeAgo';
import Avatar from './Avatar';
import CommentsSection from './CommentsSection';
import ConfirmDialog from './ConfirmDialog';
import Modal from './Modal';
import UserProfileDialog from './UserProfileDialog';

const REASONS = [
  ['spam', 'Spam'],
  ['inappropriate', 'Inappropriate content'],
  ['harassment', 'Harassment or bullying'],
  ['other', 'Something else'],
];

// One post in the feed. `onChange(postId, patch)` and `onRemove(postId)` update the list it lives in.
export default function PostCard({ post, onChange, onRemove, onMessage }) {
  const { showToast } = useToast();

  const [liking, setLiking] = useState(false);
  const [burst, setBurst] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialog, setDialog] = useState(null); // 'delete' | 'report' | null
  const [showProfile, setShowProfile] = useState(false);
  const menuRef = useRef(null);

  useClickOutside(menuRef, () => setMenuOpen(false), menuOpen);

  const name = getDisplayName(post.author);

  // Pictures wider than 1.91:1 or taller than 4:5 are cropped, like on Instagram.
  const ratio = Math.min(1.91, Math.max(0.8, (post.width || 1) / (post.height || 1)));

  // The number changes at once on screen, then the server confirms (or we put it back).
  const toggleLike = async () => {
    if (liking) return;

    setLiking(true);

    const nextLiked = !post.liked;
    const before = { liked: post.liked, likeCount: post.likeCount };

    onChange(post._id, {
      liked: nextLiked,
      likeCount: Math.max(0, post.likeCount + (nextLiked ? 1 : -1)),
    });

    try {
      const result = nextLiked ? await likePostRequest(post._id) : await unlikePostRequest(post._id);
      onChange(post._id, { liked: result.liked, likeCount: result.likeCount });
    } catch (err) {
      onChange(post._id, before);
      showToast({ title: 'Could not save your like', text: getErrorMessage(err) });
    } finally {
      setLiking(false);
    }
  };

  const handleDoubleClick = () => {
    setBurst(true);
    setTimeout(() => setBurst(false), 700);

    if (!post.liked) toggleLike();
  };

  const handleDelete = async () => {
    setDialog(null);

    try {
      await deletePostRequest(post._id);
      onRemove(post._id);
      showToast({ title: 'Post deleted', text: 'It is gone for everyone.' });
    } catch (err) {
      showToast({ title: 'Could not delete the post', text: getErrorMessage(err) });
    }
  };

  const handleReport = async (reason) => {
    setDialog(null);

    try {
      await reportPostRequest(post._id, reason);
      onRemove(post._id); // you will not see this post again
      showToast({ title: 'Thanks for reporting', text: 'We removed the post from your feed.' });
    } catch (err) {
      showToast({ title: 'Could not send the report', text: getErrorMessage(err) });
    }
  };

  return (
    <article className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-800">
      <header className="flex items-center gap-3 px-3 py-3">
        <button
          type="button"
          disabled={post.mine}
          onClick={() => setShowProfile(true)}
          aria-label={`Open ${name}'s profile`}
          className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-default"
        >
          <Avatar name={name} src={post.author.avatar} size="md" />
          <span className="min-w-0">
            <span className="block truncate font-semibold">{name}</span>
            <span className="block text-xs text-slate-400">{timeAgo(post.createdAt)}</span>
          </span>
        </button>

        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label="Post options"
            className="rounded-lg px-3 py-1 text-lg hover:bg-slate-700"
          >
            ⋯
          </button>

          {menuOpen && (
            <ul
              role="menu"
              className="absolute right-0 top-full z-20 mt-1 w-44 overflow-hidden rounded-xl border border-slate-600 bg-slate-800 py-1 shadow-xl"
            >
              <li role="none">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    setDialog(post.mine ? 'delete' : 'report');
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-400 hover:bg-slate-700"
                >
                  <span aria-hidden="true">{post.mine ? '🗑️' : '🚩'}</span>
                  {post.mine ? 'Delete post' : 'Report post'}
                </button>
              </li>
            </ul>
          )}
        </div>
      </header>

      <div
        className="relative overflow-hidden bg-slate-900"
        style={{ aspectRatio: ratio }}
        onDoubleClick={handleDoubleClick}
      >
        <img
          src={fitWidth(post.imageUrl, 1080)}
          alt={post.caption ? post.caption.slice(0, 100) : `Photo by ${name}`}
          loading="lazy"
          draggable={false}
          className="h-full w-full object-cover"
        />

        {burst && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 flex animate-ping items-center justify-center text-7xl"
          >
            ❤️
          </span>
        )}
      </div>

      <div className="px-3 py-3">
        <div className="flex items-center gap-4 text-2xl">
          <button
            type="button"
            onClick={toggleLike}
            aria-pressed={post.liked}
            aria-label={post.liked ? 'Unlike' : 'Like'}
            className="transition hover:scale-110"
          >
            {post.liked ? '❤️' : '🤍'}
          </button>
          <button
            type="button"
            onClick={() => setShowComments((open) => !open)}
            aria-expanded={showComments}
            aria-label="Comments"
            className="transition hover:scale-110"
          >
            💬
          </button>
        </div>

        <p className="mt-2 text-sm font-semibold">
          {post.likeCount === 1 ? '1 like' : `${post.likeCount} likes`}
        </p>

        {post.caption && (
          <p className="mt-1 whitespace-pre-wrap break-words text-sm">
            <span className="font-semibold">{name}</span> {post.caption}
          </p>
        )}

        <button
          type="button"
          onClick={() => setShowComments((open) => !open)}
          className="mt-2 text-sm text-slate-400 hover:text-slate-200"
        >
          {showComments
            ? 'Hide comments'
            : post.commentCount > 0
              ? `View all ${post.commentCount} comments`
              : 'Add a comment'}
        </button>

        {showComments && (
          <CommentsSection
            postId={post._id}
            onCountChange={(delta) =>
              onChange(post._id, { commentCount: Math.max(0, post.commentCount + delta) })
            }
          />
        )}
      </div>

      {dialog === 'delete' && (
        <ConfirmDialog
          title="Delete this post?"
          message="The photo, its likes and its comments will be removed for everyone."
          confirmLabel="Delete post"
          danger
          onConfirm={handleDelete}
          onCancel={() => setDialog(null)}
        />
      )}

      {dialog === 'report' && (
        <Modal title="Report this post" onClose={() => setDialog(null)}>
          <p className="mb-3 text-sm text-slate-400">Why are you reporting it?</p>
          <ul className="space-y-2">
            {REASONS.map(([reason, label]) => (
              <li key={reason}>
                <button
                  type="button"
                  onClick={() => handleReport(reason)}
                  className="w-full rounded-lg bg-slate-700 px-3 py-2 text-left text-sm hover:bg-slate-600"
                >
                  {label}
                </button>
              </li>
            ))}
          </ul>
        </Modal>
      )}

      {showProfile && (
        <UserProfileDialog
          userId={post.author._id}
          onClose={() => setShowProfile(false)}
          onMessage={onMessage}
        />
      )}
    </article>
  );
}
