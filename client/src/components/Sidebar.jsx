import { lazy, Suspense, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { usePresence } from '../hooks/usePresence';
import { useSocket } from '../hooks/useSocket';
import { useToast } from '../hooks/useToast';
import { useTyping } from '../hooks/useTyping';
import { getConversationTitle, getDisplayName, getOtherMember } from '../utils/conversation';
import { applyFilter, getFilterCounts, getState, isMuted } from '../utils/conversationFilters';
import { formatDayLabel } from '../utils/formatDay';
import { formatTime } from '../utils/formatTime';
import { formatTyping } from '../utils/formatTyping';
import { getMessagePreview } from '../utils/messagePreview';
import Avatar from './Avatar';
import FilterMenu from './FilterMenu';
import { ConversationListSkeleton } from './Skeleton';
import StoriesRow from './StoriesRow';

// These parts download only when the person first opens them.
const NewChatDialog = lazy(() => import('./NewChatDialog'));
const ProfileDialog = lazy(() => import('./ProfileDialog'));
const SearchPanel = lazy(() => import('./SearchPanel'));
const ThemePicker = lazy(() => import('./ThemePicker'));

const tabClass = (selected) =>
  `flex-1 py-2 text-sm font-medium ${
    selected ? 'border-b-2 border-emerald-400 text-white' : 'text-slate-400 hover:text-slate-200'
  }`;

const EMPTY_MESSAGES = {
  all: { icon: '💬', title: 'No conversations yet', text: 'Press ✏️ New above to start one.' },
  unread: { icon: '✅', title: "You're all caught up", text: 'No unread messages.' },
  groups: { icon: '👥', title: 'No groups yet', text: 'Press ✏️ New and choose New group.' },
  spam: { icon: '🚫', title: 'No spam', text: 'Chats you report as spam appear here.' },
  deleted: { icon: '🗑️', title: 'Nothing deleted', text: 'Deleted chats stay here for 30 days.' },
};

export default function Sidebar({
  conversations,
  activeConversation,
  loading,
  error,
  activeId,
  onSelect,
  onStartChat,
  onCreateGroup,
  onOpenResult,
  onUpdateState,
  onRetry,
  className = '',
}) {
  const { user, logout } = useAuth();
  const { connected } = useSocket();
  const { isOnline } = usePresence();
  const { getTypingNames } = useTyping();
  const { showToast } = useToast();

  const [tab, setTab] = useState('chats');
  const [filter, setFilter] = useState('all');
  const [showNewChat, setShowNewChat] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showTheme, setShowTheme] = useState(false);

  // Desktop notifications need the person's permission first.
  const [permission, setPermission] = useState(() =>
    'Notification' in window ? Notification.permission : 'unsupported'
  );

  const enableNotifications = async () => {
    setPermission(await Notification.requestPermission());
  };

  const visible = applyFilter(conversations, filter);
  const counts = getFilterCounts(conversations);
  const empty = EMPTY_MESSAGES[filter];

  // The small button at the right of a row, in the Spam and Recently deleted views.
  let rowAction = null;
  if (filter === 'deleted') rowAction = { label: 'Recover', patch: { deleted: false } };
  if (filter === 'spam') rowAction = { label: 'Not spam', patch: { spam: false } };

  const runAction = async (conversationId, patch) => {
    try {
      await onUpdateState(conversationId, patch);
    } catch {
      showToast({ title: 'Could not save the change', text: 'Please try again.' });
    }
  };

  return (
    <aside
      className={`${className} w-full md:w-80 shrink-0 flex-col border-r border-slate-700 bg-slate-800`}
    >
      <div className="flex items-center justify-between border-b border-slate-700 px-4 py-3">
        <button
          type="button"
          onClick={() => setShowProfile(true)}
          aria-label="Open your profile"
          className="flex min-w-0 items-center gap-3 rounded-lg text-left"
        >
          <Avatar name={getDisplayName(user)} src={user.avatar} size="sm" />
          <span className="min-w-0">
            <span className="block truncate font-semibold">{getDisplayName(user)}</span>
            <span className="flex items-center gap-1 text-xs text-slate-400">
              <span
                className={`inline-block h-2 w-2 rounded-full ${
                  connected ? 'bg-green-400' : 'bg-amber-400'
                }`}
              />
              {connected ? 'Live' : 'Connecting...'}
            </span>
          </span>
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowTheme(true)}
            aria-label="Change appearance"
            title="Appearance"
            className="rounded-lg bg-slate-700 px-3 py-1 text-sm hover:bg-slate-600"
          >
            🎨
          </button>
          <Link
            to="/feed"
            aria-label="Open the feed"
            title="Feed"
            className="rounded-lg bg-slate-700 px-3 py-1 text-sm hover:bg-slate-600"
          >
            📸
          </Link>
          <button
            onClick={logout}
            className="rounded-lg bg-slate-700 px-3 py-1 text-sm hover:bg-slate-600"
          >
            Log out
          </button>
        </div>
      </div>

      {permission === 'default' && (
        <button
          type="button"
          onClick={enableNotifications}
          className="border-b border-slate-700 bg-slate-700/40 px-4 py-2 text-left text-xs text-emerald-300 hover:bg-slate-700"
        >
          🔔 Turn on desktop notifications
        </button>
      )}

      <div className="flex border-b border-slate-700">
        <button type="button" onClick={() => setTab('chats')} className={tabClass(tab === 'chats')}>
          Chats
        </button>
        <button type="button" onClick={() => setTab('search')} className={tabClass(tab === 'search')}>
          Search
        </button>
      </div>

      {tab === 'search' ? (
        <Suspense fallback={<p className="px-4 py-6 text-sm text-slate-400">Loading...</p>}>
          <SearchPanel
            conversations={conversations}
            activeConversation={activeConversation}
            onOpen={onOpenResult}
          />
        </Suspense>
      ) : (
        <>
          <StoriesRow />

          <div className="flex items-center justify-between border-b border-slate-700 px-3 py-2">
            <FilterMenu value={filter} onChange={setFilter} counts={counts} />
            <button
              type="button"
              onClick={() => setShowNewChat(true)}
              aria-label="New chat"
              title="New chat or group"
              className="rounded-lg bg-emerald-600 px-3 py-1 text-sm font-semibold hover:bg-emerald-500"
            >
              ✏️ New
            </button>
          </div>

          {loading && <ConversationListSkeleton />}

          {error && (
            <div role="alert" className="px-4 py-3 text-sm text-red-400">
              <p>{error}</p>
              <button
                type="button"
                onClick={onRetry}
                className="mt-2 rounded-lg bg-slate-700 px-3 py-1 text-slate-100 hover:bg-slate-600"
              >
                Try again
              </button>
            </div>
          )}

          {!loading && !error && visible.length === 0 && (
            <div className="px-6 py-10 text-center text-sm text-slate-500">
              <p className="text-3xl" aria-hidden="true">{empty.icon}</p>
              <p className="mt-2 font-medium text-slate-300">{empty.title}</p>
              <p className="mt-1">{empty.text}</p>
            </div>
          )}

          <ul className="flex-1 overflow-y-auto">
            {visible.map((conversation) => {
              const other =
                conversation.type === 'direct' ? getOtherMember(conversation, user._id) : null;
              const title = getConversationTitle(conversation, user._id);
              const typingText = formatTyping(getTypingNames(conversation._id));
              const unread = conversation.unreadCount || 0;
              const state = getState(conversation);
              const muted = isMuted(conversation);

              return (
                <li
                  key={conversation._id}
                  className="flex items-center border-b border-slate-700/50 hover:bg-slate-700/60"
                >
                  <button
                    onClick={() => onSelect(conversation._id)}
                    className={`flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left ${
                      conversation._id === activeId ? 'bg-slate-700' : ''
                    }`}
                  >
                    <Avatar
                      name={title}
                      src={other?.avatar}
                      online={other ? isOnline(other._id) : null}
                    />

                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className={`truncate ${unread > 0 ? 'font-semibold' : 'font-medium'}`}>
                          {title}
                          {state.pinned && <span aria-label="Pinned"> 📌</span>}
                          {muted && <span aria-label="Muted"> 🔕</span>}
                        </span>
                        {conversation.lastMessage && (
                          <span className="shrink-0 text-xs text-slate-400">
                            {formatTime(conversation.lastMessage.createdAt)}
                          </span>
                        )}
                      </span>

                      <span className="mt-0.5 flex items-center justify-between gap-2">
                        {filter === 'deleted' && state.deletedAt ? (
                          <span className="block truncate text-sm text-slate-400">
                            Deleted {formatDayLabel(state.deletedAt)}
                          </span>
                        ) : typingText ? (
                          <span className="block truncate text-sm italic text-emerald-400">
                            {typingText}
                          </span>
                        ) : (
                          <span
                            className={`block truncate text-sm ${
                              unread > 0 ? 'text-slate-200' : 'text-slate-400'
                            }`}
                          >
                            {getMessagePreview(conversation.lastMessage)}
                          </span>
                        )}

                        {unread > 0 && filter !== 'deleted' && (
                          <span
                            aria-label={`${unread} unread messages`}
                            className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold text-white ${
                              muted ? 'bg-slate-600' : 'bg-emerald-500'
                            }`}
                          >
                            {unread > 99 ? '99+' : unread}
                          </span>
                        )}
                      </span>
                    </span>
                  </button>

                  {rowAction && (
                    <button
                      type="button"
                      onClick={() => runAction(conversation._id, rowAction.patch)}
                      className="mr-3 shrink-0 rounded-lg bg-slate-700 px-3 py-1 text-xs font-medium text-emerald-300 hover:bg-slate-600"
                    >
                      {rowAction.label}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}

      <Suspense fallback={null}>
        {showNewChat && (
          <NewChatDialog
            onClose={() => setShowNewChat(false)}
            onStartChat={onStartChat}
            onCreateGroup={onCreateGroup}
          />
        )}

        {showProfile && <ProfileDialog onClose={() => setShowProfile(false)} />}
        {showTheme && <ThemePicker onClose={() => setShowTheme(false)} />}
      </Suspense>
    </aside>
  );
}
