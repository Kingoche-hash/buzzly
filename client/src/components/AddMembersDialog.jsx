import { useEffect, useState } from 'react';
import { useToast } from '../hooks/useToast';
import { searchUsersRequest } from '../services/chat.service';
import { addMembersRequest } from '../services/group.service';
import { getDisplayName } from '../utils/conversation';
import { getErrorMessage } from '../utils/getErrorMessage';
import Avatar from './Avatar';
import Modal from './Modal';

const MAX_MEMBERS = 50;

// Search for people and add them to a group (admins only).
export default function AddMembersDialog({ conversation, onClose }) {
  const { showToast } = useToast();

  // At most 20 at a time, and never more than the group has room for.
  const room = Math.max(0, Math.min(20, MAX_MEMBERS - conversation.members.length));
  const memberIds = new Set(conversation.members.map((member) => member._id));

  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const term = query.trim();

  // Wait 300ms after the last key press, then search.
  useEffect(() => {
    if (!term) return;

    let cancelled = false;

    const timer = setTimeout(async () => {
      try {
        const users = await searchUsersRequest(term);

        if (!cancelled) {
          setResults(users);
          setError('');
        }
      } catch (err) {
        if (!cancelled) setError(getErrorMessage(err));
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [term]);

  const toggle = (person) => {
    setError('');

    setSelected((prev) => {
      if (prev.some((item) => item._id === person._id)) return prev.filter((item) => item._id !== person._id);

      if (prev.length >= room) {
        setError(`You can add at most ${room} more ${room === 1 ? 'person' : 'people'}.`);
        return prev;
      }

      return [...prev, person];
    });
  };

  const submit = async () => {
    setBusy(true);
    setError('');

    try {
      await addMembersRequest(conversation._id, selected.map((person) => person._id));
      showToast({
        title: 'Added',
        text: selected.length === 1 ? '1 person joined the group.' : `${selected.length} people joined the group.`,
      });
      onClose();
    } catch (err) {
      setError(getErrorMessage(err));
      setBusy(false);
    }
  };

  const candidates = results?.filter((person) => !memberIds.has(person._id));

  return (
    <Modal title="Add members" onClose={busy ? () => {} : onClose}>
      {room === 0 ? (
        <p className="py-6 text-center text-sm text-slate-400">This group is full ({MAX_MEMBERS} members).</p>
      ) : (
        <>
          {selected.length > 0 && (
            <ul className="mb-3 flex flex-wrap gap-2">
              {selected.map((person) => (
                <li
                  key={person._id}
                  className="flex items-center gap-1 rounded-full bg-slate-700 py-1 pl-3 pr-2 text-xs"
                >
                  {getDisplayName(person)}
                  <button
                    type="button"
                    onClick={() => toggle(person)}
                    aria-label={`Remove ${getDisplayName(person)}`}
                    className="text-slate-400 hover:text-white"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}

          <input
            type="search"
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search people by name or username"
            aria-label="Search people"
            className="w-full rounded-lg bg-slate-700 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
          />

          {!term && <p className="mt-3 text-sm text-slate-500">Type a name or username to find people.</p>}

          {term && (
            <ul className="mt-3 max-h-60 overflow-y-auto rounded-lg bg-slate-700/50">
              {results === null && <li className="px-3 py-2 text-sm text-slate-400">Searching...</li>}

              {candidates?.length === 0 && (
                <li className="px-3 py-2 text-sm text-slate-400">No one new found with that name.</li>
              )}

              {candidates?.map((person) => {
                const picked = selected.some((item) => item._id === person._id);

                return (
                  <li key={person._id}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => toggle(person)}
                      aria-pressed={picked}
                      className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-slate-700 disabled:opacity-60"
                    >
                      <Avatar name={getDisplayName(person)} src={person.avatar} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{getDisplayName(person)}</span>
                        <span className="block truncate text-xs text-slate-400">@{person.username}</span>
                      </span>
                      <span aria-hidden="true">{picked ? '✓' : ''}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {error && (
            <p role="alert" className="mt-3 text-sm text-red-400">
              {error}
            </p>
          )}

          <button
            type="button"
            disabled={selected.length === 0 || busy}
            onClick={submit}
            className="mt-4 w-full rounded-lg bg-emerald-600 py-2 font-semibold hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? 'Adding...' : selected.length > 1 ? `Add ${selected.length} people` : 'Add to group'}
          </button>
        </>
      )}
    </Modal>
  );
}
