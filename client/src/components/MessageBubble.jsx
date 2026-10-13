import { memo } from 'react';
import { getDisplayName } from '../utils/conversation';
import { formatTime } from '../utils/formatTime';
import AttachmentList from './AttachmentList';
import MessageStatus from './MessageStatus';
import SharedPostQuote from './SharedPostQuote';
import StoryQuote from './StoryQuote';

// One chat bubble. memo() means it redraws only when ITS OWN message changes,
// not every time someone starts typing or goes online.
function MessageBubble({ message, mine, showSender, status, glowing }) {
  return (
    <div id={`message-${message._id}`} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-3 py-2 transition-shadow sm:max-w-[75%] ${
          mine ? 'bg-emerald-600' : 'bg-slate-700'
        } ${glowing ? 'ring-2 ring-amber-300' : ''}`}
      >
        {showSender && (
          <p className="text-xs font-semibold text-emerald-300">{getDisplayName(message.sender)}</p>
        )}

        {message.storyReply && <StoryQuote reply={message.storyReply} mine={mine} />}
        {message.sharedPost && <SharedPostQuote shared={message.sharedPost} />}

        <AttachmentList attachments={message.attachments} />

        {message.content && <p className="whitespace-pre-wrap break-words">{message.content}</p>}

        <p className="mt-1 flex items-center justify-end gap-1 text-[10px] text-slate-300/70">
          <span>{formatTime(message.createdAt)}</span>
          {mine && <MessageStatus status={status} />}
        </p>
      </div>
    </div>
  );
}

export default memo(MessageBubble);
