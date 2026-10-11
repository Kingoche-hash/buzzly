import { useCallback, useEffect, useState } from 'react';
import { fetchStories, markStoryViewedRequest } from '../services/story.service';
import { useSocket } from './useSocket';

export const useStories = () => {
  const { socket } = useSocket();

  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  // Load the stories (again, whenever something changes).
  useEffect(() => {
    let cancelled = false;

    fetchStories()
      .then((list) => {
        if (!cancelled) setGroups(list);
      })
      .catch(() => {
        // Stories are a bonus: if they fail to load, the chat still works.
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const reload = useCallback(() => setReloadKey((key) => key + 1), []);

  // Someone posted, deleted or viewed a story.
  useEffect(() => {
    if (!socket) return;

    socket.on('stories_changed', reload);

    return () => {
      socket.off('stories_changed', reload);
    };
  }, [socket, reload]);

  // Marks a story as seen right away on screen, then tells the server.
  const markViewed = useCallback(async (storyId) => {
    setGroups((prev) =>
      prev.map((group) => {
        const stories = group.stories.map((story) =>
          story._id === storyId ? { ...story, viewed: true } : story
        );

        return { ...group, stories, hasUnviewed: stories.some((story) => !story.viewed) };
      })
    );

    try {
      await markStoryViewedRequest(storyId);
    } catch {
      // Not important enough to bother the person.
    }
  }, []);

  return { groups, loading, reload, markViewed };
};
