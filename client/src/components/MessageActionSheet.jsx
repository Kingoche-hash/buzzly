import { useState } from 'react';
import { REACTIONS } from '../utils/reactions';
import Modal from './Modal';

const REPORT_REASONS = [
  ['spam', 'Spam'],
  ['harassment', 'Harassment or bullying'],
  ['inappropriate', 'Inappropriate content'],
  ['other', 'Something else'],
];

function Item({ icon, danger = false, disabled = false, onClick, children }) {
  return (
    <li>
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-slate-700 disabled:opacity-60 ${
          danger ? 'text-red-400' : ''
        }`}
      >
        <span aria-hidden="true">{icon}</span>
        {children}
      </button>
    </li>
  );
}

// The window that opens from the ⋯ on a message: reactions, reply, copy, edit, delete, report.
export default function MessageActionSheet({
  message,
  mine,
  myId,
  canEdit,
  onClose,
  onReply,
  onCopy,
  onEdit,
  onReact,
  onDelete,
  onReport,
}) {
  const [view, setView] = useState('menu'); // 'menu' | 'delete' | 'report'
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const deleted = Boolean(message.deletedAt);
  const myReaction = message.reactions?.find((reaction) => reaction.user === myId)?.emoji;

  // Runs an action, shows its problem if it fails, and closes the window when it works.
  const run = async (task) => {
    setBusy(true);
    setError('');

    try {
      await task();
      onClose();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const title = view === 'delete' ? 'Delete message?' : view === 'report' ? 'Report message' : 'Message';

  return (
    <Modal title={title} onClose={busy ? () => {} : onClose}>
      {view === 'menu' && (
        <>
          {!deleted && (
            <div className="mb-3 flex justify-between rounded-xl bg-slate-700/60 p-2">
              {REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  disabled={busy}
                  onClick={() => run(() => onReact(myReaction === emoji ? null : emoji))}
                  aria-label={`React with ${emoji}`}
                  aria-pressed={myReaction === emoji}
                  className={`rounded-full px-2 py-1 text-2xl transition hover:scale-110 disabled:opacity-60 ${
                    myReaction === emoji ? 'bg-emerald-600/50' : ''
                  }`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}

          <ul>
            {!deleted && (
              <Item icon="↩️" onClick={onReply}>
                Reply
              </Item>
            )}

            {!deleted && message.content && (
              <Item icon="📋" disabled={busy} onClick={() => run(onCopy)}>
                Copy text
              </Item>
            )}

            {canEdit && (
              <Item icon="✏️" onClick={onEdit}>
                Edit
              </Item>
            )}

            <Item icon="🗑️" danger onClick={() => setView('delete')}>
              Delete
            </Item>

            {!mine && !deleted && (
              <Item icon="🚩" onClick={() => setView('report')}>
                Report
              </Item>
            )}
          </ul>
        </>
      )}

      {view === 'delete' && (
        <>
          <p className="mb-4 text-sm text-slate-300">
            <strong>Delete for me</strong> removes it from your chat only.
            {mine && !deleted && (
              <>
                {' '}
                <strong>Delete for everyone</strong> replaces it with "This message was deleted" for all members.
              </>
            )}
          </p>

          <div className="flex flex-col gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => run(() => onDelete('me'))}
              className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold hover:bg-slate-600 disabled:opacity-60"
            >
              Delete for me
            </button>

            {mine && !deleted && (
              <button
                type="button"
                disabled={busy}
                onClick={() => run(() => onDelete('everyone'))}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold hover:bg-red-500 disabled:opacity-60"
              >
                Delete for everyone
              </button>
            )}

            <button
              type="button"
              disabled={busy}
              onClick={() => setView('menu')}
              className="rounded-lg px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        </>
      )}

      {view === 'report' && (
        <>
          <p className="mb-3 text-sm text-slate-400">Why are you reporting this message?</p>

          <ul className="space-y-2">
            {REPORT_REASONS.map(([reason, label]) => (
              <li key={reason}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => run(() => onReport(reason))}
                  className="w-full rounded-lg bg-slate-700 px-3 py-2 text-left text-sm hover:bg-slate-600 disabled:opacity-60"
                >
                  {label}
                </button>
              </li>
            ))}
          </ul>

          <button
            type="button"
            disabled={busy}
            onClick={() => setView('menu')}
            className="mt-3 w-full rounded-lg px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 disabled:opacity-60"
          >
            Back
          </button>
        </>
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm text-red-400">
          {error}
        </p>
      )}
    </Modal>
  );
}
