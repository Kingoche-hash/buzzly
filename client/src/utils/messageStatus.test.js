import { describe, expect, it } from 'vitest';
import { getMessageStatus } from './messageStatus';

const chat = (bobPrivacy = {}) => ({
  members: [{ _id: 'me' }, { _id: 'bob', privacy: bobPrivacy }],
});

describe('getMessageStatus', () => {
  it('is "sent" when nobody has received it', () => {
    expect(getMessageStatus({ deliveredTo: [], readBy: [] }, chat(), 'me')).toBe('sent');
  });

  it('is "delivered" when the other person received it', () => {
    expect(getMessageStatus({ deliveredTo: ['bob'], readBy: [] }, chat(), 'me')).toBe('delivered');
  });

  it('is "read" when the other person read it', () => {
    expect(getMessageStatus({ deliveredTo: ['bob'], readBy: ['bob'] }, chat(), 'me')).toBe('read');
  });

  it('never shows "read" for someone who turned read receipts off', () => {
    const message = { deliveredTo: ['bob'], readBy: ['bob'] };
    expect(getMessageStatus(message, chat({ readReceipts: false }), 'me')).toBe('delivered');
  });

  it('in a group, needs EVERYONE to have received it', () => {
    const group = { members: [{ _id: 'me' }, { _id: 'bob' }, { _id: 'carol' }] };

    expect(getMessageStatus({ deliveredTo: ['bob'], readBy: [] }, group, 'me')).toBe('sent');
    expect(getMessageStatus({ deliveredTo: ['bob', 'carol'], readBy: ['bob'] }, group, 'me')).toBe('delivered');
    expect(getMessageStatus({ deliveredTo: ['bob', 'carol'], readBy: ['bob', 'carol'] }, group, 'me')).toBe('read');
  });
});
