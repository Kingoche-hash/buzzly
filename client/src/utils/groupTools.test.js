import { describe, expect, it } from 'vitest';
import { getAdminIds, isAdmin } from './group';
import { findMentionQuery, splitMentions } from './mentions';
import { getMessagePreview } from './messagePreview';

const people = [{ _id: 'a' }, { _id: 'b' }, { _id: 'c' }];

describe('getAdminIds', () => {
  it('uses the admin list when there is one', () => {
    expect([...getAdminIds({ members: people, admins: ['b'], createdBy: 'a' })]).toEqual(['b']);
  });

  it('falls back to the creator for older groups', () => {
    expect([...getAdminIds({ members: people, admins: [], createdBy: 'a' })]).toEqual(['a']);
  });

  it('falls back to the first member when the creator is gone', () => {
    expect([...getAdminIds({ members: people, admins: [], createdBy: 'z' })]).toEqual(['a']);
  });

  it('ignores admins who are no longer members', () => {
    expect([...getAdminIds({ members: people, admins: ['x', 'b'], createdBy: 'a' })]).toEqual(['b']);
  });

  it('tells who is an admin', () => {
    const group = { members: people, admins: ['b'], createdBy: 'a' };

    expect(isAdmin(group, 'b')).toBe(true);
    expect(isAdmin(group, 'c')).toBe(false);
  });
});

describe('splitMentions', () => {
  const names = new Set(['bob']);

  it('marks mentions of people in the chat', () => {
    expect(splitMentions('hi @bob and @zed', names)).toEqual([
      { text: 'hi ', mention: null },
      { text: '@bob', mention: 'bob' },
      { text: ' and @zed', mention: null },
    ]);
  });

  it('ignores letter case, and keeps what was typed', () => {
    expect(splitMentions('@BOB!', names)).toEqual([
      { text: '@BOB', mention: 'bob' },
      { text: '!', mention: null },
    ]);
  });

  it('does not treat part of an email address as a mention', () => {
    expect(splitMentions('write to a@bob.com', names)).toEqual([{ text: 'write to a@bob.com', mention: null }]);
  });

  it('returns nothing for empty text', () => {
    expect(splitMentions('', names)).toEqual([]);
  });
});

describe('findMentionQuery', () => {
  it('finds the name being typed', () => {
    expect(findMentionQuery('hi @bo', 6)).toEqual({ query: 'bo', start: 3 });
    expect(findMentionQuery('@', 1)).toEqual({ query: '', start: 0 });
    expect(findMentionQuery('hi @bob there', 7)).toEqual({ query: 'bob', start: 3 });
  });

  it('finds nothing when no mention is being typed', () => {
    expect(findMentionQuery('hello', 5)).toBeNull();
    expect(findMentionQuery('a@b', 3)).toBeNull();
    expect(findMentionQuery('hi @bob there', 13)).toBeNull();
  });
});

describe('getMessagePreview for group notes', () => {
  it('shows the text of a note', () => {
    expect(getMessagePreview({ system: { text: 'alice added bob' } })).toBe('alice added bob');
  });
});
