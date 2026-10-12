import { describe, expect, it } from 'vitest';
import { applyFilter, getUnreadTotal, isMuted } from './conversationFilters';

const DAY = 24 * 60 * 60 * 1000;
const ago = (days) => new Date(Date.now() - days * DAY).toISOString();
const ahead = (days) => new Date(Date.now() + days * DAY).toISOString();

const chat = (overrides = {}) => ({ _id: 'x', type: 'direct', unreadCount: 0, state: {}, ...overrides });
const ids = (list) => list.map((conversation) => conversation._id);

describe('applyFilter', () => {
  it('"all" hides spam and deleted chats', () => {
    const list = [
      chat({ _id: 'normal' }),
      chat({ _id: 'spam', state: { spam: true } }),
      chat({ _id: 'deleted', state: { deletedAt: ago(1) } }),
    ];

    expect(ids(applyFilter(list, 'all'))).toEqual(['normal']);
  });

  it('"unread" shows only chats with unread messages', () => {
    const list = [chat({ _id: 'a', unreadCount: 3 }), chat({ _id: 'b' })];

    expect(ids(applyFilter(list, 'unread'))).toEqual(['a']);
  });

  it('"groups" shows only groups', () => {
    const list = [chat({ _id: 'g', type: 'group' }), chat({ _id: 'd' })];

    expect(ids(applyFilter(list, 'groups'))).toEqual(['g']);
  });

  it('puts pinned chats first and keeps the rest in order', () => {
    const list = [chat({ _id: 'a' }), chat({ _id: 'b', state: { pinned: true } }), chat({ _id: 'c' })];

    expect(ids(applyFilter(list, 'all'))).toEqual(['b', 'a', 'c']);
  });

  it('"spam" shows reported chats', () => {
    const list = [chat({ _id: 'normal' }), chat({ _id: 'spam', state: { spam: true } })];

    expect(ids(applyFilter(list, 'spam'))).toEqual(['spam']);
  });

  it('"deleted" shows chats deleted in the last 30 days, newest first, and forgets older ones', () => {
    const list = [
      chat({ _id: 'old', state: { deletedAt: ago(40) } }),
      chat({ _id: 'recent', state: { deletedAt: ago(2) } }),
      chat({ _id: 'newest', state: { deletedAt: ago(1) } }),
    ];

    expect(ids(applyFilter(list, 'deleted'))).toEqual(['newest', 'recent']);
  });
});

describe('isMuted', () => {
  it('is muted until the end time passes', () => {
    expect(isMuted(chat({ state: { mutedUntil: ahead(1) } }))).toBe(true);
    expect(isMuted(chat({ state: { mutedUntil: ago(1) } }))).toBe(false);
    expect(isMuted(chat())).toBe(false);
  });
});

describe('getUnreadTotal', () => {
  it('ignores muted, spam and deleted chats', () => {
    const list = [
      chat({ unreadCount: 2 }),
      chat({ unreadCount: 5, state: { mutedUntil: ahead(1) } }),
      chat({ unreadCount: 7, state: { spam: true } }),
      chat({ unreadCount: 3, state: { deletedAt: ago(1) } }),
    ];

    expect(getUnreadTotal(list)).toBe(2);
  });
});
