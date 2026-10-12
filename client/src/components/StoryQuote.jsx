import { getStoryBackground } from '../utils/storyBackgrounds';

// A small square version of the story photo, made by Cloudinary.
const thumbnail = (url) => url.replace('/upload/', '/upload/c_fill,w_96,h_128,q_auto/');

// The little story card shown above a reply, so the reply makes sense on its own.
export default function StoryQuote({ reply, mine }) {
  return (
    <div className="mb-1 flex items-stretch gap-2 rounded-lg border-l-4 border-white/50 bg-black/20 p-2">
      {reply.type === 'image' && reply.imageUrl ? (
        <img
          src={thumbnail(reply.imageUrl)}
          alt=""
          loading="lazy"
          className="h-14 w-10 shrink-0 rounded object-cover"
        />
      ) : (
        <span
          aria-hidden="true"
          style={getStoryBackground(reply.background)}
          className="flex h-14 w-10 shrink-0 items-center justify-center overflow-hidden rounded p-0.5 text-center text-[6px] font-semibold leading-tight text-white"
        >
          {(reply.text || '').slice(0, 40)}
        </span>
      )}

      <span className="min-w-0">
        <span className="block text-xs font-semibold">
          {mine ? 'You replied to their story' : 'Replied to your story'}
        </span>
        <span className="block truncate text-xs opacity-80">
          {reply.text || (reply.type === 'image' ? '📷 Photo story' : 'Story')}
        </span>
      </span>
    </div>
  );
}
