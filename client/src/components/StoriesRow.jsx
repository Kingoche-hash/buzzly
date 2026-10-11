import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useStories } from '../hooks/useStories';
import { getDisplayName } from '../utils/conversation';
import Avatar from './Avatar';
import StoryComposer from './StoryComposer';
import StoryViewer from './StoryViewer';

const RING_NEW = { backgroundImage: 'linear-gradient(45deg, #34d399, #0ea5e9)' };
const RING_SEEN = { backgroundColor: '#475569' };

// One round picture in the row. `ring` is 'new', 'seen' or 'none'.
function Tile({ name, src, ring, onClick, onPlus }) {
  const ringStyle = ring === 'new' ? RING_NEW : ring === 'seen' ? RING_SEEN : undefined;

  return (
    <div className="relative flex w-16 shrink-0 flex-col items-center gap-1">
      <button
        type="button"
        onClick={onClick}
        aria-label={`${name}: open story`}
        style={ringStyle}
        className="rounded-full p-0.5"
      >
        <span className="block rounded-full border-2 border-slate-800">
          <Avatar name={name} src={src} size="md" />
        </span>
      </button>

      {onPlus && (
        <button
          type="button"
          onClick={onPlus}
          aria-label="Add to your story"
          className="absolute right-1 top-7 flex h-5 w-5 items-center justify-center rounded-full border-2 border-slate-800 bg-emerald-500 text-xs font-bold text-white"
        >
          +
        </button>
      )}

      <span className="w-full truncate text-center text-xs text-slate-300">{name}</span>
    </div>
  );
}

// The row of stories above the chat list.
export default function StoriesRow() {
  const { user } = useAuth();
  const { groups, reload, markViewed } = useStories();

  const [composing, setComposing] = useState(false);
  const [viewing, setViewing] = useState(null); // position in `ordered`, or null

  const mine = groups.find((group) => group.author._id === user._id);
  const others = groups.filter((group) => group.author._id !== user._id);

  // The order the viewer plays them in: mine first, then the others.
  const ordered = mine ? [mine, ...others] : others;

  return (
    <>
      <div className="flex gap-3 overflow-x-auto border-b border-slate-700 px-3 py-3">
        <Tile
          name="Your story"
          src={user.avatar}
          ring={mine ? 'new' : 'none'}
          onClick={() => (mine ? setViewing(0) : setComposing(true))}
          onPlus={() => setComposing(true)}
        />

        {others.map((group, index) => (
          <Tile
            key={group.author._id}
            name={getDisplayName(group.author)}
            src={group.author.avatar}
            ring={group.hasUnviewed ? 'new' : 'seen'}
            onClick={() => setViewing(mine ? index + 1 : index)}
          />
        ))}
      </div>

      {composing && <StoryComposer onClose={() => setComposing(false)} onPosted={reload} />}

      {viewing !== null && ordered[viewing] && (
        <StoryViewer
          groups={ordered}
          startIndex={viewing}
          onClose={() => setViewing(null)}
          onViewed={markViewed}
          onDeleted={reload}
        />
      )}
    </>
  );
}
