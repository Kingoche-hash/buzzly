import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useFriends } from '../hooks/useFriends';
import { useToast } from '../hooks/useToast';
import { startDirectConversation } from '../services/chat.service';
import {
  acceptFriendRequest,
  cancelFriendRequest,
  declineFriendRequest,
  unfriendRequest,
  updateMessageSettingRequest,
} from '../services/friend.service';
import { getDisplayName } from '../utils/conversation';
import { getErrorMessage } from '../utils/getErrorMessage';
import Avatar from './Avatar';
import ConfirmDialog from './ConfirmDialog';
import Modal from './Modal';

const tabClass = (selected) =>
  `flex-1 rounded-md px-3 py-1.5 text-sm font-medium ${
    selected ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
  }`;

const smallButton = 'rounded-lg px-3 py-1 text-sm font-medium disabled:opacity-60';

// A person with a picture, a name and some buttons on the right.
function PersonRow({ person, onOpen, children }) {
  return (
    <li className="flex items-center gap-3 rounded-lg bg-slate-700/50 px-3 py-2">
      <Link to={`/u/${person._id}`} onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3">
        <Avatar name={getDisplayName(person)} src={person.avatar} size="sm" />
        <span className="min-w-0">
          <span className="block truncate font-medium">{getDisplayName(person)}</span>
          <span className="block truncate text-xs text-slate-400">@{person.username}</span>
        </span>
      </Link>
      <span className="flex shrink-0 gap-2">{children}</span>
    </li>
  );
}

const OPTIONS = [
  ['everyone', 'Everyone', 'Anyone can start a chat with you.'],
  [
    'friends',
    'Friends only',
    'Only your friends can start a chat or keep writing. If you message someone first, they can reply.',
  ],
];

export default function FriendsDialog({ onClose, startTab = 'requests' }) {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { data, loading, error, reload } = useFriends();

  const [tab, setTab] = useState(startTab);
  const [busyId, setBusyId] = useState('');
  const [unfriending, setUnfriending] = useState(null);
  const [saving, setSaving] = useState(false);
  const [savedSetting, setSavedSetting] = useState(null);

  const whoCanMessage = savedSetting ?? data.settings.whoCanMessage;

  const run = async (person, request, message) => {
    setBusyId(person._id);

    try {
      await request(person._id);
      reload();
      if (message) showToast(message);
    } catch (err) {
      showToast({ title: 'Something went wrong', text: getErrorMessage(err) });
    } finally {
      setBusyId('');
    }
  };

  const openChat = async (person) => {
    setBusyId(person._id);

    try {
      const conversation = await startDirectConversation(person._id);
      onClose();
      navigate('/', { state: { openConversationId: conversation._id } });
    } catch (err) {
      showToast({ title: 'Could not open the chat', text: getErrorMessage(err) });
      setBusyId('');
    }
  };

  const chooseSetting = async (value) => {
    if (value === whoCanMessage || saving) return;

    setSaving(true);

    try {
      setSavedSetting(await updateMessageSettingRequest(value));
      showToast({
        title: 'Saved',
        text: value === 'friends' ? 'Only friends can start chats with you.' : 'Anyone can start a chat with you.',
      });
    } catch (err) {
      showToast({ title: 'Could not save', text: getErrorMessage(err) });
    } finally {
      setSaving(false);
    }
  };

  const { friends, incoming, outgoing } = data;

  return (
    <Modal title="Friends" onClose={onClose}>
      <div className="mb-4 flex gap-2">
        <button type="button" onClick={() => setTab('requests')} className={tabClass(tab === 'requests')}>
          Requests{incoming.length > 0 ? ` (${incoming.length})` : ''}
        </button>
        <button type="button" onClick={() => setTab('friends')} className={tabClass(tab === 'friends')}>
          Friends{friends.length > 0 ? ` (${friends.length})` : ''}
        </button>
        <button type="button" onClick={() => setTab('privacy')} className={tabClass(tab === 'privacy')}>
          Privacy
        </button>
      </div>

      {loading && <p className="py-6 text-center text-sm text-slate-400">Loading...</p>}

      {error && (
        <p role="alert" className="py-6 text-center text-sm text-red-400">
          {error}
        </p>
      )}

      {!loading && !error && tab === 'requests' && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate-300">Waiting for your answer</h3>

          {incoming.length === 0 && <p className="mb-4 text-sm text-slate-500">No new requests.</p>}

          <ul className="mb-5 space-y-2">
            {incoming.map((person) => (
              <PersonRow key={person._id} person={person} onOpen={onClose}>
                <button
                  type="button"
                  disabled={busyId === person._id}
                  onClick={() =>
                    run(person, acceptFriendRequest, {
                      title: 'You are now friends',
                      text: `You and ${getDisplayName(person)} are friends.`,
                    })
                  }
                  className={`${smallButton} bg-emerald-600 hover:bg-emerald-500`}
                >
                  Accept
                </button>
                <button
                  type="button"
                  disabled={busyId === person._id}
                  onClick={() => run(person, declineFriendRequest)}
                  className={`${smallButton} bg-slate-600 hover:bg-slate-500`}
                >
                  Decline
                </button>
              </PersonRow>
            ))}
          </ul>

          <h3 className="mb-2 text-sm font-semibold text-slate-300">Requests you sent</h3>

          {outgoing.length === 0 && <p className="text-sm text-slate-500">You have no pending requests.</p>}

          <ul className="space-y-2">
            {outgoing.map((person) => (
              <PersonRow key={person._id} person={person} onOpen={onClose}>
                <button
                  type="button"
                  disabled={busyId === person._id}
                  onClick={() => run(person, cancelFriendRequest)}
                  className={`${smallButton} bg-slate-600 hover:bg-slate-500`}
                >
                  Cancel
                </button>
              </PersonRow>
            ))}
          </ul>
        </div>
      )}

      {!loading && !error && tab === 'friends' && (
        <div>
          {friends.length === 0 && (
            <div className="py-8 text-center text-sm text-slate-500">
              <p className="text-3xl" aria-hidden="true">
                👥
              </p>
              <p className="mt-2">No friends yet. Open someone's profile and press Add friend.</p>
            </div>
          )}

          <ul className="space-y-2">
            {friends.map((person) => (
              <PersonRow key={person._id} person={person} onOpen={onClose}>
                <button
                  type="button"
                  disabled={busyId === person._id}
                  onClick={() => openChat(person)}
                  aria-label={`Message ${getDisplayName(person)}`}
                  className={`${smallButton} bg-emerald-600 hover:bg-emerald-500`}
                >
                  💬
                </button>
                <button
                  type="button"
                  disabled={busyId === person._id}
                  onClick={() => setUnfriending(person)}
                  className={`${smallButton} bg-slate-600 hover:bg-slate-500`}
                >
                  Unfriend
                </button>
              </PersonRow>
            ))}
          </ul>
        </div>
      )}

      {!loading && !error && tab === 'privacy' && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate-300">Who can message me</h3>

          <ul className="space-y-2">
            {OPTIONS.map(([value, label, description]) => (
              <li key={value}>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => chooseSetting(value)}
                  aria-pressed={whoCanMessage === value}
                  className={`flex w-full items-start gap-3 rounded-xl border-2 p-3 text-left disabled:opacity-60 ${
                    whoCanMessage === value
                      ? 'border-emerald-400 bg-slate-700'
                      : 'border-slate-600 hover:bg-slate-700/60'
                  }`}
                >
                  <span className="mt-0.5" aria-hidden="true">
                    {whoCanMessage === value ? '◉' : '○'}
                  </span>
                  <span>
                    <span className="block font-medium">{label}</span>
                    <span className="block text-xs text-slate-400">{description}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {unfriending && (
        <ConfirmDialog
          title={`Unfriend ${getDisplayName(unfriending)}?`}
          message="You will no longer be friends. You can send a new request later."
          confirmLabel="Unfriend"
          danger
          onConfirm={() => {
            const person = unfriending;
            setUnfriending(null);
            run(person, unfriendRequest, { title: 'Unfriended', text: 'You are no longer friends.' });
          }}
          onCancel={() => setUnfriending(null)}
        />
      )}
    </Modal>
  );
}
