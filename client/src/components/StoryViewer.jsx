import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import {
  deleteStoryRequest,
  fetchStoryViewers,
  replyToStoryRequest,
} from '../services/story.service';
import { getDisplayName } from '../utils/conversation';
import { getErrorMessage } from '../utils/getErrorMessage';
import { getStoryBackground } from '../utils/storyBackgrounds';
import { timeAgo } from '../utils/timeAgo';
import Avatar from './Avatar';

const STORY_MS = 5000; // each story shows for 5 seconds
const REACTIONS = ['❤️', '😂', '😮', '😢', '👏', '🔥'];

// Start at the first story you have not seen yet.
const firstUnviewed = (group) => {
  const index = group.stories.findIndex((story) => !story.viewed);
  return index === -1 ? 0 : index;
};

// The reply box at the bottom of someone else's story.
// It is re-created for every story (see `key` below), so its text never leaks into the next story.
function ReplyBar({ storyId, onFocusChange }) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState(null);
  const inputRef = useRef(null);

  // The little "Reply sent" message disappears by itself.
  useEffect(() => {
    if (!note) return;

    const timer = setTimeout(() => setNote(null), 2500);
    return () => clearTimeout(timer);
  }, [note]);

  const send = async (content) => {
    const reply = content.trim();
    if (!reply || sending) return;

    setSending(true);
    setNote(null);

    try {
      await replyToStoryRequest(storyId, reply);
      setText('');
      setNote({ text: 'Reply sent ✓', error: false });
      inputRef.current?.blur(); // the story carries on playing
    } catch (err) {
      setNote({ text: getErrorMessage(err), error: true });
    } finally {
      setSending(false);
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    send(text);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/70 to-transparent px-3 pb-3 pt-8"
    >
      <div className="pointer-events-auto">
        {note && (
          <p
            role="status"
            className={`mb-2 text-center text-xs ${note.error ? 'text-red-300' : 'text-green-300'}`}
          >
            {note.text}
          </p>
        )}

        <div className="mb-2 flex justify-center gap-2">
          {REACTIONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              disabled={sending}
              onClick={() => send(emoji)}
              aria-label={`React with ${emoji}`}
              className="rounded-full bg-black/40 px-2 py-1 text-lg hover:bg-black/60 disabled:opacity-50"
            >
              {emoji}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={text}
            maxLength={500}
            onChange={(event) => setText(event.target.value)}
            onFocus={() => onFocusChange(true)}
            onBlur={() => onFocusChange(false)}
            placeholder="Reply to this story..."
            aria-label="Reply to this story"
            className="min-w-0 flex-1 rounded-full border border-white/40 bg-black/30 px-4 py-2 text-sm text-white placeholder-white/60 outline-none focus:border-white"
          />
          <button
            type="submit"
            disabled={!text.trim() || sending}
            className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {sending ? '...' : 'Send'}
          </button>
        </div>
      </div>
    </form>
  );
}

export default function StoryViewer({ groups, startIndex, onClose, onViewed, onDeleted }) {
  const { user } = useAuth();

  const [groupIndex, setGroupIndex] = useState(startIndex);
  const [storyIndex, setStoryIndex] = useState(() => firstUnviewed(groups[startIndex]));
  const [paused, setPaused] = useState(false);
  const [cycle, setCycle] = useState(0);
  const [viewers, setViewers] = useState(null); // null = closed
  const [viewersLoading, setViewersLoading] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const group = groups[groupIndex];
  const story = group?.stories[storyIndex];
  const isOwn = group?.author._id === user._id;

  const goNext = useCallback(() => {
    if (!group) return;

    if (storyIndex < group.stories.length - 1) {
      setStoryIndex(storyIndex + 1);
      return;
    }

    if (groupIndex < groups.length - 1) {
      setGroupIndex(groupIndex + 1);
      setStoryIndex(firstUnviewed(groups[groupIndex + 1]));
      return;
    }

    onClose();
  }, [group, groups, groupIndex, storyIndex, onClose]);

  const goPrev = useCallback(() => {
    if (storyIndex > 0) {
      setStoryIndex(storyIndex - 1);
      return;
    }

    if (groupIndex > 0) {
      const previous = groups[groupIndex - 1];
      setGroupIndex(groupIndex - 1);
      setStoryIndex(previous.stories.length - 1);
      return;
    }

    setCycle((value) => value + 1); // already at the very first story: start it again
  }, [groups, groupIndex, storyIndex]);

  // While someone types a reply the story waits; when they stop, it gets its 5 seconds again.
  const handleReplyFocus = useCallback((focused) => {
    setPaused(focused);
    if (!focused) setCycle((value) => value + 1);
  }, []);

  // If the story disappeared (deleted or expired), close.
  useEffect(() => {
    if (!story) onClose();
  }, [story, onClose]);

  // Move to the next story after 5 seconds.
  useEffect(() => {
    if (paused || !story) return;

    const timer = setTimeout(goNext, STORY_MS);
    return () => clearTimeout(timer);
  }, [paused, story, goNext, cycle]);

  // Tell the server this story was seen.
  const storyId = story?._id;
  const alreadyViewed = story?.viewed;

  useEffect(() => {
    if (storyId && !isOwn && !alreadyViewed) onViewed(storyId);
  }, [storyId, isOwn, alreadyViewed, onViewed]);

  // Keyboard: arrows and Escape. While typing a reply, the arrows just move the cursor.
  useEffect(() => {
    const handleKey = (event) => {
      const tag = event.target?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA';

      if (event.key === 'Escape') {
        if (typing) event.target.blur();
        else onClose();
        return;
      }

      if (typing) return;

      if (event.key === 'ArrowRight') goNext();
      if (event.key === 'ArrowLeft') goPrev();
    };

    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [goNext, goPrev, onClose]);

  const openViewers = async () => {
    setPaused(true);
    setViewers([]);
    setViewersLoading(true);

    try {
      setViewers(await fetchStoryViewers(story._id));
    } catch {
      setViewers([]);
    } finally {
      setViewersLoading(false);
    }
  };

  const closeViewers = () => {
    setViewers(null);
    setPaused(false);
    setCycle((value) => value + 1);
  };

  const handleDelete = async () => {
    try {
      await deleteStoryRequest(story._id);
      onDeleted();
      onClose();
    } catch {
      setConfirmingDelete(false);
    }
  };

  if (!story) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black">
      <div
        className="relative flex h-dvh w-full max-w-md flex-col"
        style={story.type === 'text' ? getStoryBackground(story.background) : undefined}
      >
        <div className="absolute inset-x-0 top-0 z-10 flex gap-1 p-2">
          {group.stories.map((item, index) => (
            <div key={item._id} className="h-1 flex-1 overflow-hidden rounded bg-white/30">
              {index < storyIndex && <div className="h-full w-full bg-white" />}
              {index === storyIndex && (
                <div
                  key={`${story._id}-${cycle}`}
                  className="h-full bg-white"
                  style={{
                    animation: `story-progress ${STORY_MS}ms linear forwards`,
                    animationPlayState: paused ? 'paused' : 'running',
                  }}
                />
              )}
            </div>
          ))}
        </div>

        <div className="absolute inset-x-0 top-4 z-10 flex items-center gap-3 px-4 pt-2">
          <Avatar name={getDisplayName(group.author)} src={group.author.avatar} size="sm" />
          <div className="min-w-0 flex-1 text-white">
            <p className="truncate text-sm font-semibold">
              {isOwn ? 'Your story' : getDisplayName(group.author)}
            </p>
            <p className="text-xs text-white/70">{timeAgo(story.createdAt)}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close story"
            className="rounded-full bg-black/40 px-3 py-1 text-white hover:bg-black/60"
          >
            ✕
          </button>
        </div>

        <div className="flex flex-1 items-center justify-center overflow-hidden">
          {story.type === 'image' ? (
            <img src={story.imageUrl} alt={story.text || 'Story'} className="max-h-full max-w-full object-contain" />
          ) : (
            <p className="whitespace-pre-wrap break-words px-8 text-center text-2xl font-semibold text-white">
              {story.text}
            </p>
          )}
        </div>

        {story.type === 'image' && story.text && (
          <p
            className={`absolute inset-x-0 z-10 bg-black/50 px-4 py-3 text-center text-sm text-white ${
              isOwn ? 'bottom-16' : 'bottom-36'
            }`}
          >
            {story.text}
          </p>
        )}

        <button
          type="button"
          onClick={goPrev}
          aria-label="Previous story"
          className="absolute inset-y-20 left-0 z-[5] w-1/3"
        />
        <button
          type="button"
          onClick={goNext}
          aria-label="Next story"
          className="absolute inset-y-20 right-0 z-[5] w-2/3"
        />

        {!isOwn && <ReplyBar key={story._id} storyId={story._id} onFocusChange={handleReplyFocus} />}

        {isOwn && (
          <div className="absolute inset-x-0 bottom-0 z-10 flex items-center justify-between px-4 py-3 text-white">
            <button
              type="button"
              onClick={openViewers}
              className="rounded-full bg-black/40 px-4 py-2 text-sm hover:bg-black/60"
            >
              👁 {story.viewerCount ?? 0}
            </button>

            {confirmingDelete ? (
              <span className="flex items-center gap-2 text-sm">
                Delete this story?
                <button
                  type="button"
                  onClick={handleDelete}
                  className="rounded-full bg-red-600 px-3 py-1 hover:bg-red-500"
                >
                  Yes
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(false)}
                  className="rounded-full bg-black/40 px-3 py-1 hover:bg-black/60"
                >
                  No
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                aria-label="Delete story"
                className="rounded-full bg-black/40 px-4 py-2 text-sm hover:bg-black/60"
              >
                🗑️ Delete
              </button>
            )}
          </div>
        )}

        {viewers !== null && (
          <div
            className="absolute inset-0 z-20 flex items-end justify-center bg-black/60"
            onClick={closeViewers}
          >
            <div
              onClick={(event) => event.stopPropagation()}
              className="max-h-[70%] w-full overflow-y-auto rounded-t-2xl bg-slate-800 p-4 text-slate-100"
            >
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-semibold">Viewed by {viewers.length}</h3>
                <button
                  type="button"
                  onClick={closeViewers}
                  aria-label="Close viewers"
                  className="text-slate-400 hover:text-white"
                >
                  ✕
                </button>
              </div>

              {viewersLoading && <p className="text-sm text-slate-400">Loading...</p>}

              {!viewersLoading && viewers.length === 0 && (
                <p className="text-sm text-slate-400">Nobody has seen this yet.</p>
              )}

              <ul className="space-y-2">
                {viewers.map((viewer) => (
                  <li key={viewer._id} className="flex items-center gap-3">
                    <Avatar name={getDisplayName(viewer)} src={viewer.avatar} size="sm" />
                    <span className="flex-1 truncate">{getDisplayName(viewer)}</span>
                    <span className="text-xs text-slate-400">{timeAgo(viewer.viewedAt)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
