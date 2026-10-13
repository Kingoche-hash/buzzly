import { useEffect, useRef } from 'react';
import { getConversationTitle } from '../utils/conversation';
import { getState, isMuted } from '../utils/conversationFilters';
import { getMessagePreview } from '../utils/messagePreview';
import { useAuth } from './useAuth';
import { useSocket } from './useSocket';
import { useToast } from './useToast';

// For messages in chats you are NOT looking at (and have not muted or marked as spam):
//   page visible -> a pop-up in the corner
//   page hidden  -> a desktop notification (only if you allowed them)
export const useMessageNotifications = ({ conversations, activeId, onOpen }) => {
  const { socket } = useSocket();
  const { user } = useAuth();
  const { showToast } = useToast();

  const myId = user?._id;

  // Always hold the latest values, so the listener below never needs to be re-attached.
  const latest = useRef({ conversations, activeId, onOpen });

  useEffect(() => {
    latest.current = { conversations, activeId, onOpen };
  });

  useEffect(() => {
    if (!socket) return;

    const handleMessage = (message) => {
      if (message.sender._id === myId || message.system) return;

      const { conversations: chats, activeId: openId, onOpen: open } = latest.current;

      const looking =
        openId === message.conversation &&
        document.visibilityState === 'visible' &&
        document.hasFocus();

      if (looking) return;

      const conversation = chats.find((chat) => chat._id === message.conversation);

      // Muted chats and spam stay quiet.
      // Muted chats stay quiet, except when someone @mentions me.
      const mentionedMe = Boolean(message.mentions?.includes(myId));

      if (conversation && ((isMuted(conversation) && !mentionedMe) || getState(conversation).spam)) return;

      const title = conversation ? getConversationTitle(conversation, myId) : (message.sender.displayName || message.sender.username);
      const preview = getMessagePreview(message);
      const text = conversation?.type === 'group' ? `${(message.sender.displayName || message.sender.username)}: ${preview}` : preview;

      if (document.visibilityState === 'hidden') {
        if ('Notification' in window && Notification.permission === 'granted') {
          const notification = new Notification(title, { body: text, tag: message.conversation });

          notification.onclick = () => {
            window.focus();
            open(message.conversation);
            notification.close();
          };
        }
        return;
      }

      showToast({ title, text, onClick: () => open(message.conversation) });
    };

    socket.on('receive_message', handleMessage);

    return () => {
      socket.off('receive_message', handleMessage);
    };
  }, [socket, myId, showToast]);
};