import { Link } from 'react-router-dom';
import { squareThumb } from '../utils/imageUrl';

// The small post card inside a chat message that shares a post. Tapping it opens the post.
export default function SharedPostQuote({ shared }) {
  return (
    <Link
      to={`/p/${shared.post}`}
      className="mb-1 flex items-stretch gap-2 rounded-lg border-l-4 border-white/50 bg-black/20 p-2 hover:bg-black/30"
    >
      {shared.imageUrl ? (
        <img
          src={squareThumb(shared.imageUrl, 120)}
          alt=""
          loading="lazy"
          className="h-14 w-14 shrink-0 rounded object-cover"
        />
      ) : (
        <span
          aria-hidden="true"
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded bg-black/30 text-2xl"
        >
          📸
        </span>
      )}

      <span className="min-w-0">
        <span className="block text-xs font-semibold">
          📸 Post by {shared.authorName || 'someone'}
          {shared.imageCount > 1 ? ` · ${shared.imageCount} photos` : ''}
        </span>
        <span className="block truncate text-xs opacity-80">{shared.caption || 'Tap to open'}</span>
      </span>
    </Link>
  );
}
