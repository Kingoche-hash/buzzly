import { useState } from 'react';
import { useToast } from '../hooks/useToast';
import { blockUserRequest } from '../services/block.service';
import { reportUserRequest } from '../services/block.service';
import { getDisplayName } from '../utils/conversation';
import { getErrorMessage } from '../utils/getErrorMessage';
import Modal from './Modal';

const REASONS = [
  ['spam', 'Spam'],
  ['harassment', 'Harassment or bullying'],
  ['fake_account', 'Pretending to be someone else'],
  ['inappropriate', 'Inappropriate content'],
  ['other', 'Something else'],
];

// Report a person, with an optional note and an option to block them at the same time.
export default function ReportUserDialog({ person, onClose, onDone }) {
  const { showToast } = useToast();

  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [alsoBlock, setAlsoBlock] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setBusy(true);
    setError('');

    try {
      await reportUserRequest(person._id, { reason, details: details.trim() || undefined });
      if (alsoBlock) await blockUserRequest(person._id);

      showToast({
        title: 'Thanks for reporting',
        text: alsoBlock ? `${getDisplayName(person)} is also blocked.` : 'We will take a look.',
      });
      onDone(alsoBlock);
      onClose();
    } catch (err) {
      setError(getErrorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Modal title={`Report ${getDisplayName(person)}`} onClose={busy ? () => {} : onClose}>
      <p className="mb-3 text-sm text-slate-400">Why are you reporting this person?</p>

      <ul className="space-y-2">
        {REASONS.map(([key, label]) => (
          <li key={key}>
            <button
              type="button"
              onClick={() => setReason(key)}
              aria-pressed={reason === key}
              className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${
                reason === key ? 'bg-emerald-600' : 'bg-slate-700 hover:bg-slate-600'
              }`}
            >
              {label}
              <span aria-hidden="true">{reason === key ? '✓' : ''}</span>
            </button>
          </li>
        ))}
      </ul>

      <textarea
        value={details}
        onChange={(event) => setDetails(event.target.value)}
        maxLength={300}
        rows={3}
        placeholder="Add a note (optional)"
        aria-label="Note"
        className="mt-3 w-full resize-none rounded-lg bg-slate-700 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
      />

      <label className="mt-3 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={alsoBlock} onChange={(event) => setAlsoBlock(event.target.checked)} />
        Also block this person
      </label>

      {error && (
        <p role="alert" className="mt-3 text-sm text-red-400">
          {error}
        </p>
      )}

      <button
        type="button"
        disabled={!reason || busy}
        onClick={submit}
        className="mt-4 w-full rounded-lg bg-emerald-600 py-2 font-semibold hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? 'Sending...' : 'Send report'}
      </button>
    </Modal>
  );
}
