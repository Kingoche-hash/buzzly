import { describe, expect, it } from 'vitest';
import { formatTyping } from './formatTyping';
import { getMessagePreview } from './messagePreview';

describe('formatTyping', () => {
  it('writes the right sentence for one, two or many people', () => {
    expect(formatTyping([])).toBe('');
    expect(formatTyping(['Alice'])).toBe('Alice is typing...');
    expect(formatTyping(['Alice', 'Bob'])).toBe('Alice and Bob are typing...');
    expect(formatTyping(['A', 'B', 'C'])).toBe('Several people are typing...');
  });
});

describe('getMessagePreview', () => {
  it('shows the text of a message', () => {
    expect(getMessagePreview({ content: 'Hello' })).toBe('Hello');
  });

  it('describes photos and files when there is no text', () => {
    const photo = { mimeType: 'image/png', fileName: 'a.png' };
    const pdf = { mimeType: 'application/pdf', fileName: 'report.pdf' };

    expect(getMessagePreview({ content: '', attachments: [photo] })).toBe('📷 Photo');
    expect(getMessagePreview({ content: '', attachments: [photo, photo] })).toBe('📷 2 photos');
    expect(getMessagePreview({ content: '', attachments: [pdf] })).toBe('📎 report.pdf');
    expect(getMessagePreview({ content: '', attachments: [pdf, photo] })).toBe('📎 2 files');
  });

  it('has a fallback for an empty chat', () => {
    expect(getMessagePreview(null)).toBe('No messages yet');
    expect(getMessagePreview({ content: '', attachments: [] })).toBe('No messages yet');
  });
});
