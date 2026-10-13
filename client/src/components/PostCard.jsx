import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useClickOutside } from '../hooks/useClickOutside';
import { useToast } from '../hooks/useToast';
import {
  deletePostRequest,
  likePostRequest,
  reportPostRequest,
  repostRequest,
  unlikePostRequest,
  unrepostRequest,
} from '../services/post.service';
import { getDisplayName } from '../utils/conversation';
import { getErrorMessage } from '../utils/getErrorMessage';
import { timeAgo } from '../utils/timeAgo';
import Avatar from './Avatar';
import CommentsSection from './CommentsSection';
import ConfirmDialog from './ConfirmDialog';
import ImageCarousel from './ImageCarousel';
import Modal from './Modal';
import SharePostDialog from './SharePostDialog';

const REASONS = [
  ['spam', 'Spam'],
  ['inappropriate', 'Inappropriate content'],
  ['harassment', 'Harassment or bullying'],
  ['other', 'Something else'],
];

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

// One post in a feed, on a profile or on its own page.
// onChange(postId, patch) and onRemove(postId) update the list it lives in;
// onRemoveItem(itemId) removes just one entry (when I undo my repost).
export default function PostCard({ post, onChange, onRemove, onRemoveItem, startOpen = false }) {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [liking, setLiking] = useState(false);
  const [reposting, setReposting] = useState(false);
  const [burst, setBurst] = useState(false);
  const [showComments, setShowComments] = useState(startOpen);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialog, setDialog] = useState(null); // 'delete' | 'report' | 'share' | null
  const menuRef = useRef(null);

  useClickOutside(menuRef, () => setMenuOpen(false), menuOpen);

  const name = getDisplayName(post.author);
  const repostedByMe = post.repostedBy?._id === user._id;

  // The shape follows the first photo, between 1.91:1 and 4:5, like Instagram.
  const first = post.images[0];
  const ratio = Math.min(1.91, Math.max(0.8, (first?.width || 1) / (first?.height || 1)));

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

  const toggleRepost = async () => {
    if (reposting || post.mine) return;

    setReposting(true);

    const nextReposted = !post.reposted;
    const before = { reposted: post.reposted, repostCount: post.repostCount };

    onChange(post._id, {
      reposted: nextReposted,
      repostCount: Math.max(0, post.repostCount + (nextReposted ? 1 : -1)),
    });

    try {
      const result = nextReposted ? await repostRequest(post._id) : await unrepostRequest(post._id);
      onChange(post._id, { reposted: result.reposted, repostCount: result.repostCount });

      if (nextReposted) {
        showToast({ title: 'Reposted', text: 'It now shows on your profile.' });
      } else if (repostedByMe) {
        onRemoveItem?.(post.itemId); // my repost entry is gone
      }
    } catch (err) {
      onChange(post._id, before);
      showToast({ title: 'Could not repost', text: getErrorMessage(err) });
    } finally {
      setReposting(false);
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
      {post.repostedBy && (
        <p className="px-3 pt-3 text-xs text-slate-400">
          🔁{' '}
          {repostedByMe ? (
            'You reposted'
          ) : (
            <>
              <Link to={`/u/${post.repostedBy._id}`} className="font-semibold hover:underline">
                {getDisplayName(post.repostedBy)}
              </Link>{' '}
              reposted
            </>
          )}
        </p>
      )}

      <header className="flex items-center gap-3 px-3 py-3">
        <Link
          to={`/u/${post.author._id}`}
          aria-label={`Open ${name}'s profile`}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <Avatar name={name} src={post.author.avatar} size="md" />
          <span className="min-w-0">
            <span className="block truncate font-semibold">{name}</span>
            <span className="block text-xs text-slate-400">{timeAgo(post.createdAt)}</span>
          </span>
        </Link>

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

      <ImageCarousel
        images={post.images}
        alt={post.caption ? post.caption.slice(0, 100) : `Photo by ${name}`}
        ratio={ratio}
        onDoubleClick={handleDoubleClick}
      >
        {burst && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 flex animate-ping items-center justify-center text-7xl"
          >
            ❤️
          </span>
        )}
      </ImageCarousel>

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

          <button
            type="button"
            onClick={toggleRepost}
            disabled={post.mine}
            aria-pressed={post.reposted}
            aria-label={post.reposted ? 'Undo repost' : 'Repost'}
            title={post.mine ? 'You cannot repost your own post' : post.reposted ? 'Undo repost' : 'Repost'}
            className={`rounded-full px-1 transition hover:scale-110 disabled:cursor-not-allowed disabled:opacity-30 ${
              post.reposted ? 'bg-emerald-600/40' : ''
            }`}
          >
            🔁
          </button>

          <button
            type="button"
            onClick={() => setDialog('share')}
            aria-label="Share"
            className="ml-auto transition hover:scale-110"
          >
            📤
          </button>
        </div>

        <p className="mt-2 text-sm font-semibold">
          {plural(post.likeCount, 'like')}
          {post.repostCount > 0 && (
            <span className="font-normal text-slate-400"> · {plural(post.repostCount, 'repost')}</span>
          )}
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
          message="The photos, their likes, comments and reposts will be removed for everyone."
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

      {dialog === 'share' && <SharePostDialog post={post} onClose={() => setDialog(null)} />}
    </article>
  );
}
