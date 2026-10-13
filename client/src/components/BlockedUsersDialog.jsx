import { useEffect, useState } from 'react';
import { useToast } from '../hooks/useToast';
import { fetchBlockedRequest, unblockUserRequest } from '../services/block.service';
import { getDisplayName } from '../utils/conversation';
import { getErrorMessage } from '../utils/getErrorMessage';
import Avatar from './Avatar';
import Modal from './Modal';

// The list of people I blocked, each with an Unblock button.
export default function BlockedUsersDialog({ onClose }) {
  const { showToast } = useToast();

  const [users, setUsers] = useState(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');

  useEffect(() => {
    let cancelled = false;

    fetchBlockedRequest()
      .then((list) => {
        if (!cancelled) setUsers(list);
      })
      .catch((err) => {
        if (!cancelled) setError(getErrorMessage(err));
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const unblock = async (person) => {
    setBusyId(person._id);

    try {
      await unblockUserRequest(person._id);
      setUsers((prev) => prev.filter((item) => item._id !== person._id));
      showToast({ title: 'Unblocked', text: `${getDisplayName(person)} can reach you again.` });
    } catch (err) {
      showToast({ title: 'Could not unblock', text: getErrorMessage(err) });
    } finally {
      setBusyId('');
    }
  };

  return (
    <Modal title="Blocked users" onClose={onClose}>
      <p className="mb-3 text-sm text-slate-400">
        People you block can't message you, find you, or see your profile, posts, stories or when you are online.
      </p>

      {users === null && !error && <p className="py-4 text-sm text-slate-400">Loading...</p>}

      {error && (
        <p role="alert" className="py-4 text-sm text-red-400">
          {error}
        </p>
      )}

      {users?.length === 0 && (
        <div className="py-8 text-center text-sm text-slate-500">
          <p className="text-3xl" aria-hidden="true">
            ✅
          </p>
          <p className="mt-2">You haven't blocked anyone.</p>
        </div>
      )}

      <ul className="space-y-2">
        {users?.map((person) => (
          <li key={person._id} className="flex items-center gap-3 rounded-lg bg-slate-700/50 px-3 py-2">
            <Avatar name={getDisplayName(person)} src={person.avatar} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{getDisplayName(person)}</span>
              <span className="block truncate text-xs text-slate-400">@{person.username}</span>
            </span>
            <button
              type="button"
              disabled={busyId === person._id}
              onClick={() => unblock(person)}
              className="rounded-lg bg-slate-600 px-3 py-1 text-sm font-medium hover:bg-slate-500 disabled:opacity-60"
            >
              {busyId === person._id ? '...' : 'Unblock'}
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
