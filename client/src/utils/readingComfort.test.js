import { describe, expect, it } from 'vitest';
import { removeArrived, removePending, updatePending } from './pending';
import { findFirstUnread } from './unread';

const message = (id, overrides = {}) => ({ _id: id, sender: { _id: 'other' }, readBy: [], ...overrides });

describe('findFirstUnread', () => {
  it('finds the first message from someone else that I have not read', () => {
    const list = [message('1', { readBy: ['me'] }), message('2'), message('3')];

    expect(findFirstUnread(list, 'me')).toEqual({ id: '2', count: 2 });
  });

  it('ignores my own messages, group notes and deleted messages', () => {
    const list = [
      message('1', { sender: { _id: 'me' } }),
      message('2', { system: { text: 'x' } }),
      message('3', { deletedAt: '2026-01-01' }),
    ];

    expect(findFirstUnread(list, 'me')).toBeNull();
  });

  it('is null when everything is read, or there are no messages', () => {
    expect(findFirstUnread([message('1', { readBy: ['me'] })], 'me')).toBeNull();
    expect(findFirstUnread([], 'me')).toBeNull();
  });

  it('uses the chat list count when more messages are unread than are loaded', () => {
    expect(findFirstUnread([message('1'), message('2')], 'me', 50)).toEqual({ id: '1', count: 50 });
  });
});

describe('pending messages', () => {
  const list = [
    { tempId: 'a', content: 'hello', status: 'sending' },
    { tempId: 'b', content: 'hello', status: 'sending' },
    { tempId: 'c', content: 'hello', status: 'failed' },
  ];

  it('changes one entry', () => {
    const next = updatePending(list, 'a', { status: 'failed', error: 'x' });

    expect(next[0]).toEqual({ tempId: 'a', content: 'hello', status: 'failed', error: 'x' });
    expect(next[1]).toBe(list[1]);
  });

  it('removes one entry', () => {
    expect(removePending(list, 'b').map((entry) => entry.tempId)).toEqual(['a', 'c']);
  });

  it('removes the OLDEST message that is still being sent with the same text', () => {
    expect(removeArrived(list, 'hello').map((entry) => entry.tempId)).toEqual(['b', 'c']);
  });

  it('never removes a failed message, and leaves the list alone when nothing matches', () => {
    const onlyFailed = [{ tempId: 'c', content: 'hello', status: 'failed' }];

    expect(removeArrived(onlyFailed, 'hello')).toBe(onlyFailed);
    expect(removeArrived(list, 'something else')).toBe(list);
  });
});
