import { useState } from 'react';
import { useRelationship } from '../hooks/useRelationship';
import ConfirmDialog from './ConfirmDialog';

const base = 'rounded-lg px-4 py-1.5 text-sm font-semibold disabled:opacity-60';
const quiet = `${base} bg-slate-700 hover:bg-slate-600`;

// The friend button on someone's profile: Add friend, Cancel request, Accept or Decline, or Friends.
export default function FriendButton({ userId, name = 'this person' }) {
  const relation = useRelationship(userId);
  const [confirming, setConfirming] = useState(false);

  if (!relation.status) return null;

  const { status, busy } = relation;

  return (
    <>
      {status === 'none' && (
        <button type="button" disabled={busy} onClick={relation.send} className={quiet}>
          ➕ Add friend
        </button>
      )}

      {status === 'outgoing' && (
        <button type="button" disabled={busy} onClick={relation.cancel} className={quiet}>
          ⏳ Cancel request
        </button>
      )}

      {status === 'incoming' && (
        <>
          <button
            type="button"
            disabled={busy}
            onClick={relation.accept}
            className={`${base} bg-emerald-600 hover:bg-emerald-500`}
          >
            ✅ Accept
          </button>
          <button type="button" disabled={busy} onClick={relation.decline} className={quiet}>
            Decline
          </button>
        </>
      )}

      {status === 'friends' && (
        <button type="button" disabled={busy} onClick={() => setConfirming(true)} className={quiet}>
          ✓ Friends
        </button>
      )}

      {confirming && (
        <ConfirmDialog
          title={`Unfriend ${name}?`}
          message="You will no longer be friends. You can send a new request later."
          confirmLabel="Unfriend"
          danger
          onConfirm={async () => {
            setConfirming(false);
            await relation.unfriend();
          }}
          onCancel={() => setConfirming(false)}
        />
      )}
    </>
  );
}
