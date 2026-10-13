import { Fragment, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useMessages } from '../hooks/useMessages';
import { usePresence } from '../hooks/usePresence';
import { useReadReceipts } from '../hooks/useReadReceipts';
import { useToast } from '../hooks/useToast';
import { useTyping } from '../hooks/useTyping';
import { useTypingEmitter } from '../hooks/useTypingEmitter';
import { reportMessageRequest } from '../services/chat.service';
import { getConversationTitle, getDisplayName, getOtherMember } from '../utils/conversation';
import { getState, isMuted } from '../utils/conversationFilters';
import { getDraft, saveDraft } from '../utils/drafts';
import { dayKey, formatDayLabel } from '../utils/formatDay';
import { formatLastSeen } from '../utils/formatLastSeen';
import { formatTyping } from '../utils/formatTyping';
import { getErrorMessage } from '../utils/getErrorMessage';
import { getMessagePreview } from '../utils/messagePreview';
import { getMessageStatus } from '../utils/messageStatus';
import { findFirstUnread } from '../utils/unread';
import { getWallpaperStyle } from '../utils/wallpapers';
import Avatar from './Avatar';
import ChatMenu from './ChatMenu';
import MessageActionSheet from './MessageActionSheet';
import MessageBubble from './MessageBubble';
import MessageComposer from './MessageComposer';
import PendingMessage from './PendingMessage';
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
    pending,
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
    retryPending,
    discardPending,
    sendFiles,
    editMessage,
    deleteMessage,
    reactToMessage,
  } = useMessages(conversation._id, aroundId);
  const { notifyTyping, stopTyping } = useTypingEmitter(conversation._id);

  // Reports "read" while this chat is open and the window is in front.
  useReadReceipts(conversation._id, messages);

  const listRef = useRef(null);
  const bottomRef = useRef(null);
  const scrolledRef = useRef(false); // the first scroll after loading has happened
  const atBottomRef = useRef(true);
  const prevLastRef = useRef('');
  const lastIdRef = useRef('');
  const wantBottomRef = useRef(false); // "Jump to latest" was pressed: scroll when the newest messages arrive
  const lastId = messages.at(-1)?._id;

  const [showProfile, setShowProfile] = useState(false);
  const [showGroup, setShowGroup] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null);
  const [editing, setEditing] = useState(null);
  const [sheet, setSheet] = useState(null); // { id, canEdit } of the message whose menu is open
  const [showJump, setShowJump] = useState(false);

  // The newest message I have seen at the bottom. Messages after it are "new below".
  const [bottomMark, setBottomMark] = useState('');

  // The message we jumped to glows for a few seconds.
  const [highlightId, setHighlightId] = useState(aroundId);

  // The "new messages" line, decided once when the first messages arrive.
  // undefined = not decided yet, null = nothing unread.
  const [divider, setDivider] = useState(undefined);

  if (!loading && divider === undefined) {
    setDivider(aroundId ? null : findFirstUnread(messages, user._id, conversation.unreadCount));
  }

  useEffect(() => {
    lastIdRef.current = lastId ?? '';
  });

  useEffect(() => {
    if (!aroundId) return;

    const timer = setTimeout(() => setHighlightId(null), 3000);
    return () => clearTimeout(timer);
  }, [aroundId]);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, []);

  // The first scroll after the messages load: to a search result, to the "new messages" line, or to the bottom.
  useEffect(() => {
    if (loading || scrolledRef.current) return;

    scrolledRef.current = true;
    prevLastRef.current = lastId ?? '';
    setBottomMark(lastId ?? '');

    if (aroundId) {
      const target = document.getElementById(`message-${aroundId}`);

      if (target) {
        target.scrollIntoView({ block: 'center' });
        return;
      }
    }

    if (divider) {
      document.getElementById('new-messages-divider')?.scrollIntoView({ block: 'start' });
      return;
    }

    if (!hasNewer) scrollToBottom();
  }, [loading, aroundId, divider, hasNewer, lastId, scrollToBottom]);

  // A new message at the bottom: follow it only if I was already at the bottom, or it is mine.
  // Otherwise it waits, and the ↓ button shows how many arrived.
  useEffect(() => {
    if (loading || !scrolledRef.current || !lastId) return;

    const previous = prevLastRef.current;
    prevLastRef.current = lastId;

    if (lastId <= previous) return; // nothing new at the bottom (a reaction, a deletion...)

    const wanted = wantBottomRef.current;
    wantBottomRef.current = false;

    if (hasNewer && !wanted) return; // reading the past: new messages wait for "Jump to latest"

    if (wanted || messages.at(-1).sender._id === user._id || atBottomRef.current) {
      scrollToBottom();
      setBottomMark(lastId);
    }
  }, [loading, lastId, hasNewer, messages, user._id, scrollToBottom]);

  // A message I am sending shows at the bottom, so go there.
  useEffect(() => {
    if (pending.length > 0) scrollToBottom();
  }, [pending.length, scrollToBottom]);

  const handleScroll = () => {
    const element = listRef.current;
    if (!element) return;

    const distance = element.scrollHeight - element.scrollTop - element.clientHeight;

    atBottomRef.current = distance < 120;
    setShowJump(distance > 300);

    if (distance < 120 && lastIdRef.current) setBottomMark(lastIdRef.current);
  };

  // Messages that arrived below while I was reading higher up.
  const newBelow = useMemo(
    () =>
      bottomMark
        ? messages.filter(
            (message) => message._id > bottomMark && !message.system && message.sender._id !== user._id
          ).length
        : 0,
    [messages, bottomMark, user._id]
  );

  const handleJumpDown = () => {
    if (hasNewer) {
      wantBottomRef.current = true;
      jumpToLatest();
    } else {
      scrollToBottom();
    }
  };

  // If I leave with a message that could not be sent, its text comes back as a draft.
  const pendingRef = useRef(pending);

  useEffect(() => {
    pendingRef.current = pending;
  });

  useEffect(
    () => () => {
      const failed = pendingRef.current.filter((item) => item.status === 'failed');

      if (failed.length > 0 && !getDraft(user._id, conversation._id)) {
        saveDraft(user._id, conversation._id, failed.map((item) => item.content).join('\n'));
      }
    },
    [user._id, conversation._id]
  );

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
    const preview = replyingTo
      ? { senderName: getDisplayName(replyingTo.sender), text: getMessagePreview(replyingTo) }
      : null;

    await send(content, replyingTo?._id, preview);
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
          className="flex min-w-0 items-center gap-3 rounded-lg text-left"
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

      <div className="relative flex min-h-0 flex-1 flex-col">
        <div
          ref={listRef}
          onScroll={handleScroll}
          className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-4"
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

          {!loading && !error && messages.length === 0 && pending.length === 0 && (
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

                {divider?.id === message._id && (
                  <div
                    id="new-messages-divider"
                    role="separator"
                    className="flex scroll-mt-4 items-center gap-3 py-2"
                  >
                    <span className="h-px flex-1 bg-emerald-400/40" />
                    <span className="rounded-full bg-emerald-700/60 px-3 py-1 text-xs font-medium text-emerald-100">
                      {divider.count === 1 ? '1 new message' : `${divider.count} new messages`}
                    </span>
                    <span className="h-px flex-1 bg-emerald-400/40" />
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

          {pending.map((item) => (
            <PendingMessage
              key={item.tempId}
              item={item}
              onRetry={() => retryPending(item.tempId)}
              onDiscard={() => discardPending(item.tempId)}
            />
          ))}

          <div ref={bottomRef} />
        </div>

        {(showJump || newBelow > 0) && (
          <button
            type="button"
            onClick={handleJumpDown}
            aria-label={
              newBelow > 0 ? `Scroll to the newest messages, ${newBelow} new` : 'Scroll to the newest messages'
            }
            className="absolute bottom-4 right-4 z-10 rounded-full bg-slate-800 px-3 py-2 text-lg shadow-lg ring-1 ring-slate-600 hover:bg-slate-700"
          >
            ↓
            {newBelow > 0 && (
              <span className="absolute -right-1 -top-2 rounded-full bg-emerald-500 px-1.5 text-xs font-semibold text-white">
                {newBelow > 99 ? '99+' : newBelow}
              </span>
            )}
          </button>
        )}
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
          <button
            onClick={() => {
              wantBottomRef.current = true;
              jumpToLatest();
            }}
            className="text-emerald-400 hover:underline"
          >
            Jump to latest
          </button>
        </div>
      )}

      <div className="h-5 bg-slate-900 px-4 text-xs italic text-emerald-400">{typingText}</div>

      <div className="bg-slate-900 pb-[env(safe-area-inset-bottom)]">
        <MessageComposer
          conversationId={conversation._id}
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
