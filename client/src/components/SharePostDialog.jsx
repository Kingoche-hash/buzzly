import { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { fetchConversations } from '../services/chat.service';
import { sharePostRequest } from '../services/post.service';
import { getConversationTitle, getOtherMember } from '../utils/conversation';
import { getErrorMessage } from '../utils/getErrorMessage';
import Avatar from './Avatar';
import Modal from './Modal';

const MAX_TARGETS = 5;

// Send a post to up to 5 of my chats, or copy its link.
export default function SharePostDialog({ post, onClose }) {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [conversations, setConversations] = useState(null);
  const [selected, setSelected] = useState([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    fetchConversations()
      .then((list) => {
        if (!cancelled) setConversations(list.filter((conversation) => !conversation.state?.deletedAt));
      })
      .catch((err) => {
        if (!cancelled) setError(getErrorMessage(err));
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = (id) => {
    setError('');

    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((item) => item !== id);

      if (prev.length >= MAX_TARGETS) {
        setError(`You can share to at most ${MAX_TARGETS} chats at once.`);
        return prev;
      }

      return [...prev, id];
    });
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/p/${post._id}`);
      showToast({ title: 'Link copied', text: 'Anyone with an account can open it.' });
    } catch {
      showToast({ title: 'Could not copy the link', text: 'Your browser did not allow it.' });
    }
  };

  const send = async () => {
    setBusy(true);
    setError('');

    try {
      await sharePostRequest(post._id, { conversationIds: selected, text: text.trim() || undefined });
      showToast({
        title: 'Shared',
        text: selected.length === 1 ? 'Sent to 1 chat.' : `Sent to ${selected.length} chats.`,
      });
      onClose();
    } catch (err) {
      setError(getErrorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Modal title="Share" onClose={onClose}>
      <button
        type="button"
        onClick={copyLink}
        className="mb-3 w-full rounded-lg bg-slate-700 px-3 py-2 text-left text-sm hover:bg-slate-600"
      >
        🔗 Copy link
      </button>

      <p className="mb-2 text-sm text-slate-400">Or send it to a chat (up to {MAX_TARGETS}):</p>

      {conversations === null && !error && <p className="py-4 text-sm text-slate-400">Loading your chats...</p>}

      {conversations?.length === 0 && (
        <p className="py-4 text-sm text-slate-500">You have no chats yet. Start one first.</p>
      )}

      <ul className="max-h-60 overflow-y-auto rounded-lg bg-slate-700/50">
        {conversations?.map((conversation) => {
          const title = getConversationTitle(conversation, user._id);
          const other = conversation.type === 'direct' ? getOtherMember(conversation, user._id) : null;
          const picked = selected.includes(conversation._id);

          return (
            <li key={conversation._id}>
              <button
                type="button"
                onClick={() => toggle(conversation._id)}
                aria-pressed={picked}
                className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-slate-700"
              >
                <Avatar name={title} src={other?.avatar} size="sm" />
                <span className="min-w-0 flex-1 truncate">{title}</span>
                <span aria-hidden="true">{picked ? '✓' : ''}</span>
              </button>
            </li>
          );
        })}
      </ul>

      {selected.length > 0 && (
        <input
          type="text"
          value={text}
          maxLength={500}
          onChange={(event) => setText(event.target.value)}
          placeholder="Add a message (optional)"
          aria-label="Message"
          className="mt-3 w-full rounded-lg bg-slate-700 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
        />
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm text-red-400">
          {error}
        </p>
      )}

      <button
        type="button"
        disabled={selected.length === 0 || busy}
        onClick={send}
        className="mt-4 w-full rounded-lg bg-emerald-600 py-2 font-semibold hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? 'Sending...' : selected.length > 1 ? `Send to ${selected.length} chats` : 'Send'}
      </button>
    </Modal>
  );
}
