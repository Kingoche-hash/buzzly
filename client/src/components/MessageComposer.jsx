import { useEffect, useRef, useState } from 'react';
import { useClickOutside } from '../hooks/useClickOutside';
import { ACCEPT, formatFileSize, validateFiles } from '../utils/attachments';
import { getDisplayName } from '../utils/conversation';
import { getMessagePreview } from '../utils/messagePreview';
import EmojiPicker from './EmojiPicker';

export default function MessageComposer({
  onSend,
  onSendFiles,
  onTyping,
  onStopTyping,
  replyingTo = null,
  onCancelReply,
  editing = null,
  onCancelEdit,
  onSubmitEdit,
}) {
  const [text, setText] = useState('');
  const [files, setFiles] = useState([]);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState(null);
  const [showEmoji, setShowEmoji] = useState(false);

  const fileInputRef = useRef(null);
  const inputRef = useRef(null);
  const emojiRef = useRef(null);

  useClickOutside(emojiRef, () => setShowEmoji(false), showEmoji);

  // Starting an edit puts the message's text in the box.
  useEffect(() => {
    if (!editing) return;

    setText(editing.content || '');
    setFiles([]);
    setError('');
    setShowEmoji(false);
    inputRef.current?.focus();
  }, [editing]);

  // Replying puts the cursor in the box.
  useEffect(() => {
    if (replyingTo) inputRef.current?.focus();
  }, [replyingTo]);

  const handleChange = (event) => {
    const value = event.target.value;
    setText(value);

    if (editing) return;

    if (value.trim()) onTyping();
    else onStopTyping();
  };

  const handleCancelEdit = () => {
    onCancelEdit();
    setText('');
    setError('');
  };

  const handleKeyDown = (event) => {
    if (event.key !== 'Escape') return;

    if (showEmoji) setShowEmoji(false);
    else if (editing) handleCancelEdit();
    else if (replyingTo) onCancelReply();
  };

  const insertEmoji = (emoji) => {
    const input = inputRef.current;
    const start = input?.selectionStart ?? text.length;
    const end = input?.selectionEnd ?? text.length;
    const next = text.slice(0, start) + emoji + text.slice(end);

    if (next.length > 4000) return;

    setText(next);
    if (!editing) onTyping();

    requestAnimationFrame(() => {
      input?.focus();
      const position = start + emoji.length;
      input?.setSelectionRange(position, position);
    });
  };

  const handleFilesChosen = (event) => {
    const chosen = Array.from(event.target.files);
    event.target.value = ''; // lets you pick the same file again later

    if (chosen.length === 0) return;

    const combined = [...files, ...chosen];
    const problem = validateFiles(combined);

    if (problem) {
      setError(problem);
      return;
    }

    setError('');
    setFiles(combined);
  };

  const removeFile = (index) => {
    setFiles((prev) => prev.filter((_, position) => position !== index));
    setError('');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const content = text.trim();
    if (sending) return;

    // Saving an edit.
    if (editing) {
      if (!content) return;

      setSending(true);
      setError('');

      try {
        await onSubmitEdit(content);
        setText('');
      } catch (err) {
        setError(err.message);
      } finally {
        setSending(false);
      }

      return;
    }

    if (!content && files.length === 0) return;

    setSending(true);
    setError('');
    setShowEmoji(false);

    try {
      if (files.length > 0) {
        setProgress(0);
        await onSendFiles(files, content, setProgress);
        setFiles([]);
      } else {
        await onSend(content);
      }

      setText('');
      onStopTyping();
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
      setProgress(null);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="border-t border-slate-700 p-3">
      {error && (
        <p role="alert" className="mb-2 text-sm text-red-400">
          {error}
        </p>
      )}

      {replyingTo && !editing && (
        <div className="mb-2 flex items-start gap-2 rounded-lg border-l-4 border-emerald-400 bg-slate-700/60 px-3 py-2 text-sm">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-emerald-300">
              Replying to {getDisplayName(replyingTo.sender)}
            </p>
            <p className="truncate text-slate-300">{getMessagePreview(replyingTo)}</p>
          </div>
          <button
            type="button"
            onClick={onCancelReply}
            aria-label="Cancel reply"
            className="text-slate-400 hover:text-white"
          >
            ✕
          </button>
        </div>
      )}

      {editing && (
        <div className="mb-2 flex items-start gap-2 rounded-lg border-l-4 border-amber-400 bg-slate-700/60 px-3 py-2 text-sm">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-amber-300">✏️ Editing message</p>
            <p className="truncate text-slate-300">{editing.content}</p>
          </div>
          <button
            type="button"
            onClick={handleCancelEdit}
            aria-label="Cancel edit"
            className="text-slate-400 hover:text-white"
          >
            ✕
          </button>
        </div>
      )}

      {files.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-2">
          {files.map((file, index) => (
            <li
              key={`${file.name}-${index}`}
              className="flex max-w-full items-center gap-2 rounded-lg bg-slate-700 px-2 py-1 text-xs"
            >
              <span aria-hidden="true">📎</span>
              <span className="truncate">
                {file.name} ({formatFileSize(file.size)})
              </span>
              <button
                type="button"
                onClick={() => removeFile(index)}
                disabled={sending}
                aria-label={`Remove ${file.name}`}
                className="text-slate-400 hover:text-white disabled:opacity-50"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      {sending && progress !== null && (
        <p className="mb-2 text-xs text-slate-400">
          {progress < 100 ? `Uploading... ${progress}%` : 'Processing...'}
        </p>
      )}

      <div className="flex gap-2">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPT}
          onChange={handleFilesChosen}
          className="hidden"
        />

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={sending || Boolean(editing)}
          aria-label="Attach files"
          title="Attach files"
          className="rounded-lg bg-slate-700 px-3 py-2 hover:bg-slate-600 disabled:opacity-50"
        >
          📎
        </button>

        <div ref={emojiRef} className="relative">
          <button
            type="button"
            onClick={() => setShowEmoji((open) => !open)}
            disabled={sending}
            aria-label="Emoji"
            aria-expanded={showEmoji}
            title="Emoji"
            className="rounded-lg bg-slate-700 px-3 py-2 hover:bg-slate-600 disabled:opacity-50"
          >
            😊
          </button>

          {showEmoji && <EmojiPicker onPick={insertEmoji} />}
        </div>

        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onBlur={onStopTyping}
          maxLength={4000}
          placeholder={
            editing
              ? 'Edit your message'
              : files.length > 0
                ? 'Add a caption (optional)'
                : 'Type a message'
          }
          aria-label="Message"
          className="min-w-0 flex-1 rounded-lg bg-slate-700 px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-500"
        />

        <button
          type="submit"
          disabled={sending || (editing ? !text.trim() : !text.trim() && files.length === 0)}
          className="rounded-lg bg-emerald-600 px-4 py-2 font-semibold hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {editing ? 'Save' : 'Send'}
        </button>
      </div>
    </form>
  );
}
