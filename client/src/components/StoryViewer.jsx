import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { deleteStoryRequest, fetchStoryViewers } from '../services/story.service';
import { getDisplayName } from '../utils/conversation';
import { getStoryBackground } from '../utils/storyBackgrounds';
import { timeAgo } from '../utils/timeAgo';
import Avatar from './Avatar';

const STORY_MS = 5000; // each story shows for 5 seconds

// Start at the first story you have not seen yet.
const firstUnviewed = (group) => {
  const index = group.stories.findIndex((story) => !story.viewed);
  return index === -1 ? 0 : index;
};

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

  // Keyboard: arrows and Escape.
  useEffect(() => {
    const handleKey = (event) => {
      if (event.key === 'Escape') onClose();
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
          <p className="absolute inset-x-0 bottom-16 z-10 bg-black/50 px-4 py-3 text-center text-sm text-white">
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
