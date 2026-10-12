import { lazy, Suspense, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import ConnectionBanner from '../components/ConnectionBanner';
import MessagePane from '../components/MessagePane';
import Sidebar from '../components/Sidebar';
import { useConversations } from '../hooks/useConversations';
import { useDeliveryReceipts } from '../hooks/useDeliveryReceipts';
import { useMessageNotifications } from '../hooks/useMessageNotifications';
import { createGroupConversation, startDirectConversation } from '../services/chat.service';
import { getUnreadTotal } from '../utils/conversationFilters';

// The feed downloads only when someone opens it.
const FeedPanel = lazy(() => import('../components/FeedPanel'));

export default function ChatPage() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const onFeed = pathname === '/feed';

  const [activeId, setActiveId] = useState(null);

  // Set when the person clicks a search result: which message to open the chat around.
  const [jump, setJump] = useState(null);

  const { conversations, loading, error, addConversation, reload, updateState } =
    useConversations(activeId);

  // Tells the server "delivered" for every incoming message, even in chats that are not open.
  useDeliveryReceipts();

  const active = conversations.find((c) => c._id === activeId) || null;
  const aroundId = jump && active && jump.conversationId === active._id ? jump.messageId : null;

  // Opening a chat always leaves the feed.
  const leaveFeed = () => {
    if (onFeed) navigate('/');
  };

  const handleSelect = (id) => {
    setJump(null);
    setActiveId(id);
    leaveFeed();
  };

  const handleOpenResult = (result) => {
    setJump({ conversationId: result.conversation, messageId: result._id, nonce: Date.now() });
    setActiveId(result.conversation);
    leaveFeed();
  };

  const handleStartChat = async (userId) => {
    const conversation = await startDirectConversation(userId);
    addConversation(conversation);
    setJump(null);
    setActiveId(conversation._id);
    leaveFeed();
  };

  const handleCreateGroup = async ({ name, memberIds }) => {
    const conversation = await createGroupConversation({ name, memberIds });
    addConversation(conversation);
    setJump(null);
    setActiveId(conversation._id);
    leaveFeed();
  };

  // "Try again" inside a chat: opening it afresh loads its messages again.
  const handleRetryMessages = () => {
    setJump({ conversationId: activeId, messageId: null, nonce: Date.now() });
  };

  // Pop-ups and desktop notifications for chats that are not in front.
  useMessageNotifications({ conversations, activeId, onOpen: handleSelect });

  // The browser tab shows the number of unread messages, like "(3) Buzzly".
  const totalUnread = getUnreadTotal(conversations);

  useEffect(() => {
    document.title = totalUnread > 0 ? `(${totalUnread}) Buzzly` : 'Buzzly';

    return () => {
      document.title = 'Buzzly';
    };
  }, [totalUnread]);

  // On a phone, only one thing is on screen: the list, a chat, or the feed.
  const showingDetail = Boolean(active) || onFeed;

  return (
    <div className="flex h-dvh flex-col bg-slate-900 text-slate-100">
      <ConnectionBanner />

      <div className="flex min-h-0 flex-1">
        <Sidebar
          className={showingDetail ? 'hidden md:flex' : 'flex'}
          conversations={conversations}
          activeConversation={active}
          loading={loading}
          error={error}
          activeId={activeId}
          onSelect={handleSelect}
          onStartChat={handleStartChat}
          onCreateGroup={handleCreateGroup}
          onOpenResult={handleOpenResult}
          onUpdateState={updateState}
          onRetry={reload}
        />

        <main className={`${showingDetail ? 'flex' : 'hidden md:flex'} min-h-0 min-w-0 flex-1`}>
          {onFeed ? (
            <Suspense
              fallback={
                <div className="flex flex-1 items-center justify-center text-sm text-slate-400">
                  Loading...
                </div>
              }
            >
              <FeedPanel
                onBack={() => {
                  setActiveId(null);
                  navigate('/');
                }}
                onStartChat={handleStartChat}
              />
            </Suspense>
          ) : active ? (
            <MessagePane
              key={`${active._id}:${jump?.nonce ?? 'latest'}`}
              conversation={active}
              aroundId={aroundId}
              onBack={() => setActiveId(null)}
              onRetry={handleRetryMessages}
              onUpdateState={(patch) => updateState(active._id, patch)}
              onLeave={() => setActiveId(null)}
              onStartChat={handleStartChat}
            />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-slate-500">
              <p className="text-5xl" aria-hidden="true">💬</p>
              <p className="font-medium text-slate-300">Welcome to Buzzly</p>
              <p className="text-sm">Select a conversation, or press ✏️ New to start one.</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
