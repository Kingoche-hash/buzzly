import { describe, expect, it } from 'vitest';
import { getMessagePreview } from './messagePreview';
import { REACTIONS, summarizeReactions } from './reactions';

describe('summarizeReactions', () => {
  it('counts each emoji and marks mine', () => {
    const reactions = [
      { user: 'a', emoji: '👍' },
      { user: 'me', emoji: '👍' },
      { user: 'b', emoji: '😂' },
    ];

    expect(summarizeReactions(reactions, 'me')).toEqual([
      { emoji: '👍', count: 2, mine: true },
      { emoji: '😂', count: 1, mine: false },
    ]);
  });

  it('handles messages with no reactions', () => {
    expect(summarizeReactions(undefined, 'me')).toEqual([]);
    expect(summarizeReactions([], 'me')).toEqual([]);
  });

  it('offers six reactions, starting with the thumbs up', () => {
    expect(REACTIONS).toHaveLength(6);
    expect(REACTIONS[0]).toBe('👍');
  });
});

describe('getMessagePreview for deleted and shared messages', () => {
  it('says when a message was deleted, even if it still has old text', () => {
    expect(getMessagePreview({ content: '', deletedAt: '2026-01-01T00:00:00Z' })).toBe('🚫 This message was deleted');
    expect(getMessagePreview({ content: 'secret', deletedAt: '2026-01-01T00:00:00Z' })).toBe('🚫 This message was deleted');
  });

  it('describes a shared post', () => {
    expect(getMessagePreview({ content: '', sharedPost: { post: 'x' } })).toBe('📸 Shared a post');
  });
});
