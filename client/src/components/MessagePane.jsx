import { Fragment, lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useMessages } from '../hooks/useMessages';
import { usePresence } from '../hooks/usePresence';
import { useReadReceipts } from '../hooks/useReadReceipts';
import { useToast } from '../hooks/useToast';
import { useTyping } from '../hooks/useTyping';
import { useTypingEmitter } from '../hooks/useTypingEmitter';
import { reportMessageRequest } from '../services/chat.service';
import { getConversationTitle, getOtherMember } from '../utils/conversation';
import { getState, isMuted } from '../utils/conversationFilters';
import { dayKey, formatDayLabel } from '../utils/formatDay';
import { formatLastSeen } from '../utils/formatLastSeen';
import { formatTyping } from '../utils/formatTyping';
import { getErrorMessage } from '../utils/getErrorMessage';
import { getMessageStatus } from '../utils/messageStatus';
import { getWallpaperStyle } from '../utils/wallpapers';
import Avatar from './Avatar';
import ChatMenu from './ChatMenu';
import MessageActionSheet from './MessageActionSheet';
import MessageBubble from './MessageBubble';
import MessageComposer from './MessageComposer';
import { MessageListSkeleton } from './Skeleton';
import UserProfileDialog from './UserProfileDialog';

const GroupInfoDialog = lazy(() => import('./GroupInfoDialog'));

const EDIT_WINDOW_MS = 15 * 60 * 1000;

// Called when someone opens a message's menu (never while drawing the screen).
const canEditMessage = (message, myId) =>
  message.sender._id === myId &&
  !message.deletedAt &&
  !message.sharedPost &&
  Date.now() - new Date(message.createdAt).getTime() < EDIT_WINDOW_MS;

export default function MessagePane({
  conversation,
  onBack,
  onRetry,
  onUpdateState,
  onLeave,
  onStartChat,
  aroundId = null,
}) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { isOnline, getLastSeen } = usePresence();
  const { getTypingNames } = useTyping();
  const {
    messages,
    loading,
    error,
    hasMore,
    loadingOlder,
    loadOlder,
    hasNewer,
    loadingNewer,
    loadNewer,
    jumpToLatest,
    send,
    sendFiles,
    editMessage,
    deleteMessage,
    reactToMessage,
  } = useMessages(conversation._id, aroundId);
  const { notifyTyping, stopTyping } = useTypingEmitter(conversation._id);

  // Reports "read" while this chat is open and the window is in front.
  useReadReceipts(conversation._id, messages);

  const bottomRef = useRef(null);
  const jumpedRef = useRef(false);
  const lastId = messages.at(-1)?._id;

  const [showProfile, setShowProfile] = useState(false);
  const [showGroup, setShowGroup] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null);
  const [editing, setEditing] = useState(null);
  const [sheet, setSheet] = useState(null); // { id, canEdit } of the message whose menu is open

  // The message we jumped to glows for a few seconds.
  const [highlightId, setHighlightId] = useState(aroundId);

  useEffect(() => {
    if (!aroundId) return;

    const timer = setTimeout(() => setHighlightId(null), 3000);
    return () => clearTimeout(timer);
  }, [aroundId]);

  // Scrolling: first to the message we jumped to, otherwise to the newest message.
  useEffect(() => {
    if (loading) return;

    if (aroundId && !jumpedRef.current) {
      const target = document.getElementById(`message-${aroundId}`);

      if (target) {
        target.scrollIntoView({ block: 'center' });
        jumpedRef.current = true;
        return;
      }
    }

    if (!hasNewer) bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [loading, lastId, aroundId, hasNewer]);

  // The bubbles are memoized, so they all get ONE stable set of actions that always call the latest code.
  const latest = useRef({});

  useEffect(() => {
    latest.current = {
      openMenu: (message) => setSheet({ id: message._id, canEdit: canEditMessage(message, user._id) }),
      react: async (message, emoji) => {
        try {
          await reactToMessage(message._id, emoji);
        } catch (err) {
          showToast({ title: 'Could not react', text: err.message });
        }
      },
    };
  });

  const actions = useMemo(
    () => ({
      openMenu: (message) => latest.current.openMenu(message),
      react: (message, emoji) => latest.current.react(message, emoji),
    }),
    []
  );

  const sheetMessage = sheet ? messages.find((message) => message._id === sheet.id) : null;

  const handleSend = async (content) => {
    await send(content, replyingTo?._id);
    setReplyingTo(null);
  };

  const handleSendFiles = async (files, content, onProgress) => {
    await sendFiles(files, content, onProgress, replyingTo?._id);
    setReplyingTo(null);
  };

  const handleSubmitEdit = async (content) => {
    await editMessage(editing._id, content);
    setEditing(null);
  };

  const title = getConversationTitle(conversation, user._id);
  const typingText = formatTyping(getTypingNames(conversation._id));
  const state = getState(conversation);
  const muted = isMuted(conversation);
  const other = conversation.type === 'direct' ? getOtherMember(conversation, user._id) : null;

  // The line under the title: "Online", "Last seen ...", or "3 members, 2 online".
  let status = '';
  let statusIsOnline = false;
  let headerOnline = null;

  if (other) {
    if (other.privacy?.showPresence === false) {
      // This person hides it, so we show nothing.
      status = '';
    } else {
      statusIsOnline = isOnline(other._id);
      headerOnline = statusIsOnline;
      status = statusIsOnline ? 'Online' : formatLastSeen(getLastSeen(other));
    }
  } else if (conversation.type === 'group') {
    const onlineCount = conversation.members.filter(
      (member) => member._id === user._id || isOnline(member._id)
    ).length;

    status = `${conversation.members.length} members, ${onlineCount} online`;
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col min-w-0">
      <header className="flex items-center gap-3 border-b border-slate-700 bg-slate-900 px-4 py-3">
        <button
          onClick={onBack}
          aria-label="Back to conversations"
          className="md:hidden rounded-lg px-2 py-1 hover:bg-slate-700"
        >
          ←
        </button>

        <button
          type="button"
          
          onClick={() => (other ? setShowProfile(true) : setShowGroup(true))}
          aria-label={other ? `Open ${title}'s profile` : `Open ${title} info`}
          className="flex min-w-0 items-center gap-3 rounded-lg text-left disabled:cursor-default"
        >
          <Avatar name={title} src={other ? other.avatar : conversation.avatar} online={headerOnline} />
          <span className="min-w-0">
            <span className="block truncate font-semibold">
              {title}
              {state.pinned && <span aria-label="Pinned"> 📌</span>}
              {muted && <span aria-label="Muted"> 🔕</span>}
            </span>
            {status && (
              <span className={`block text-xs ${statusIsOnline ? 'text-emerald-400' : 'text-slate-400'}`}>
                {status}
              </span>
            )}
          </span>
        </button>

        <ChatMenu
          conversation={conversation}
          currentUserId={user._id}
          onUpdate={onUpdateState}
          onLeave={onLeave}
          onStartChat={onStartChat}
        />
      </header>

      <div
        className="flex-1 overflow-y-auto px-4 py-4 space-y-2"
        style={getWallpaperStyle(state.wallpaper, conversation.state?.wallpaperUrl)}
      >
        {hasMore && (
          <div className="text-center">
            <button
              onClick={loadOlder}
              disabled={loadingOlder}
              className="text-sm text-emerald-400 hover:underline disabled:opacity-60"
            >
              {loadingOlder ? 'Loading...' : 'Load older messages'}
            </button>
          </div>
        )}

        {loading && <MessageListSkeleton />}

        {error && (
          <div role="alert" className="py-4 text-center text-sm text-red-400">
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

        {!loading && !error && messages.length === 0 && (
          <div className="py-16 text-center text-sm text-slate-500">
            <p className="text-3xl" aria-hidden="true">👋</p>
            <p className="mt-2 font-medium text-slate-300">No messages yet</p>
            <p className="mt-1">Say hello!</p>
          </div>
        )}

        {messages.map((message, index) => {
          const mine = message.sender._id === user._id;
          const previous = messages[index - 1];
          const startsNewDay = !previous || dayKey(previous.createdAt) !== dayKey(message.createdAt);

          return (
            <Fragment key={message._id}>
              {startsNewDay && (
                <div className="flex justify-center py-2">
                  <span className="rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-400">
                    {formatDayLabel(message.createdAt)}
                  </span>
                </div>
              )}

              <MessageBubble
                message={message}
                mine={mine}
                myId={user._id}
                showSender={!mine && conversation.type === 'group'}
                status={mine ? getMessageStatus(message, conversation, user._id) : 'sent'}
                glowing={highlightId === message._id}
                actions={actions}
                members={conversation.type === 'group' ? conversation.members : null}
              />
            </Fragment>
          );
        })}

        <div ref={bottomRef} />
      </div>

      {hasNewer && (
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 border-t border-slate-700 bg-slate-800 px-4 py-2 text-sm">
          <span className="text-slate-400">You are reading older messages</span>
          <button
            onClick={loadNewer}
            disabled={loadingNewer}
            className="text-emerald-400 hover:underline disabled:opacity-60"
          >
            {loadingNewer ? 'Loading...' : 'Load newer'}
          </button>
          <button onClick={jumpToLatest} className="text-emerald-400 hover:underline">
            Jump to latest
          </button>
        </div>
      )}

      <div className="h-5 bg-slate-900 px-4 text-xs italic text-emerald-400">{typingText}</div>

      <div className="bg-slate-900 pb-[env(safe-area-inset-bottom)]">
        <MessageComposer
          members={conversation.type === 'group' ? conversation.members : null}
          onSend={handleSend}
          onSendFiles={handleSendFiles}
          onTyping={notifyTyping}
          onStopTyping={stopTyping}
          replyingTo={replyingTo}
          onCancelReply={() => setReplyingTo(null)}
          editing={editing}
          onCancelEdit={() => setEditing(null)}
          onSubmitEdit={handleSubmitEdit}
        />
      </div>

      {sheet && sheetMessage && (
        <MessageActionSheet
          message={sheetMessage}
          mine={sheetMessage.sender._id === user._id}
          myId={user._id}
          canEdit={sheet.canEdit}
          onClose={() => setSheet(null)}
          onReply={() => {
            setEditing(null);
            setReplyingTo(sheetMessage);
            setSheet(null);
          }}
          onEdit={() => {
            setReplyingTo(null);
            setEditing(sheetMessage);
            setSheet(null);
          }}
          onCopy={async () => {
            try {
              await navigator.clipboard.writeText(sheetMessage.content);
              showToast({ title: 'Copied', text: 'The message is on your clipboard.' });
            } catch {
              throw new Error('Your browser did not allow copying.');
            }
          }}
          onReact={(emoji) => reactToMessage(sheetMessage._id, emoji)}
          onDelete={(scope) => deleteMessage(sheetMessage._id, scope)}
          onReport={async (reason) => {
            try {
              await reportMessageRequest(conversation._id, sheetMessage._id, reason);
              showToast({ title: 'Thanks for reporting', text: 'We will take a look.' });
            } catch (err) {
              throw new Error(getErrorMessage(err));
            }
          }}
        />
      )}

      {showGroup && conversation.type === 'group' && (
        <Suspense fallback={null}>
          <GroupInfoDialog
            conversation={conversation}
            currentUserId={user._id}
            onLeave={onLeave}
            onClose={() => setShowGroup(false)}
          />
        </Suspense>
      )}

      {showProfile && other && (
        <UserProfileDialog userId={other._id} onClose={() => setShowProfile(false)} />
      )}
    </section>
  );
}
