import { useEffect, useState } from 'react';
import { useToast } from '../hooks/useToast';
import { addCommentRequest, deleteCommentRequest, fetchCommentsRequest } from '../services/post.service';
import { getDisplayName } from '../utils/conversation';
import { getErrorMessage } from '../utils/getErrorMessage';
import { timeAgo } from '../utils/timeAgo';
import Avatar from './Avatar';

// The comments under one post: read, add, delete. `onCountChange(+1 or -1)` keeps the post's number right.
export default function CommentsSection({ postId, onCountChange }) {
  const { showToast } = useToast();

  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let cancelled = false;

    fetchCommentsRequest(postId)
      .then((data) => {
        if (cancelled) return;
        setComments(data.comments);
        setHasMore(data.hasMore);
        setCursor(data.nextCursor);
      })
      .catch((err) => {
        if (!cancelled) setError(getErrorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [postId]);

  const loadMore = async () => {
    setLoadingMore(true);

    try {
      const data = await fetchCommentsRequest(postId, cursor);
      setComments((prev) => [...prev, ...data.comments]);
      setHasMore(data.hasMore);
      setCursor(data.nextCursor);
    } catch (err) {
      showToast({ title: 'Could not load more comments', text: getErrorMessage(err) });
    } finally {
      setLoadingMore(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const value = text.trim();
    if (!value || sending) return;

    setSending(true);

    try {
      const comment = await addCommentRequest(postId, value);
      setComments((prev) => [comment, ...prev]);
      setText('');
      onCountChange(1);
    } catch (err) {
      showToast({ title: 'Could not post the comment', text: getErrorMessage(err) });
    } finally {
      setSending(false);
    }
  };

  const handleDelete = async (commentId) => {
    try {
      await deleteCommentRequest(postId, commentId);
      setComments((prev) => prev.filter((comment) => comment._id !== commentId));
      onCountChange(-1);
    } catch (err) {
      showToast({ title: 'Could not delete the comment', text: getErrorMessage(err) });
    }
  };

  return (
    <div className="mt-3 border-t border-slate-700 pt-3">
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <input
          type="text"
          value={text}
          maxLength={500}
          onChange={(event) => setText(event.target.value)}
          placeholder="Add a comment..."
          aria-label="Add a comment"
          className="min-w-0 flex-1 rounded-full bg-slate-700 px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
        />
        <button
          type="submit"
          disabled={!text.trim() || sending}
          className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {sending ? '...' : 'Post'}
        </button>
      </form>

      {loading && <p className="mt-3 text-sm text-slate-400">Loading comments...</p>}

      {error && (
        <p role="alert" className="mt-3 text-sm text-red-400">
          {error}
        </p>
      )}

      {!loading && !error && comments.length === 0 && (
        <p className="mt-3 text-sm text-slate-500">No comments yet. Be the first!</p>
      )}

      <ul className="mt-3 space-y-3">
        {comments.map((comment) => (
          <li key={comment._id} className="flex items-start gap-2">
            <Avatar name={getDisplayName(comment.author)} src={comment.author.avatar} size="sm" />

            <div className="min-w-0 flex-1">
              <p className="break-words text-sm">
                <span className="font-semibold">{getDisplayName(comment.author)}</span>{' '}
                <span className="whitespace-pre-wrap">{comment.text}</span>
              </p>
              <p className="text-xs text-slate-500">{timeAgo(comment.createdAt)}</p>
            </div>

            {comment.canDelete && (
              <button
                type="button"
                onClick={() => handleDelete(comment._id)}
                aria-label="Delete comment"
                className="rounded px-2 text-slate-500 hover:text-red-400"
              >
                ✕
              </button>
            )}
          </li>
        ))}
      </ul>

      {hasMore && (
        <button
          type="button"
          onClick={loadMore}
          disabled={loadingMore}
          className="mt-3 text-sm text-emerald-400 hover:underline disabled:opacity-60"
        >
          {loadingMore ? 'Loading...' : 'Load more comments'}
        </button>
      )}
    </div>
  );
}
