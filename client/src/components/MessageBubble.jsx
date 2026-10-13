import { memo } from 'react';
import { getDisplayName } from '../utils/conversation';
import { formatTime } from '../utils/formatTime';
import { squareThumb } from '../utils/imageUrl';
import { summarizeReactions } from '../utils/reactions';
import AttachmentList from './AttachmentList';
import MessageStatus from './MessageStatus';
import SharedPostQuote from './SharedPostQuote';
import StoryQuote from './StoryQuote';

// The quote of the message this one answers. Tapping it scrolls to the original (if it is on screen).
function ReplyQuote({ reply }) {
  const jump = () =>
    document
      .getElementById(`message-${reply.message}`)
      ?.scrollIntoView({ block: 'center', behavior: 'smooth' });

  return (
    <button
      type="button"
      onClick={jump}
      className="mb-1 flex w-full items-stretch gap-2 rounded-lg border-l-4 border-white/50 bg-black/20 p-2 text-left hover:bg-black/30"
    >
      {reply.imageUrl && (
        <img
          src={squareThumb(reply.imageUrl, 96)}
          alt=""
          loading="lazy"
          className="h-10 w-10 shrink-0 rounded object-cover"
        />
      )}

      <span className="min-w-0">
        <span className="block truncate text-xs font-semibold">{reply.senderName || 'Message'}</span>
        <span className="block truncate text-xs opacity-80">{reply.text || 'Message'}</span>
      </span>
    </button>
  );
}

// One chat bubble. memo() means it redraws only when ITS OWN message changes,
// not every time someone starts typing or goes online.
// `actions` is one stable object: { openMenu(message), react(message, emoji or null) }.
function MessageBubble({ message, mine, myId, showSender, status, glowing, actions }) {
  const deleted = Boolean(message.deletedAt);
  const reactions = summarizeReactions(message.reactions, myId);

  return (
    <div id={`message-${message._id}`} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div className={`flex max-w-[92%] flex-col sm:max-w-[80%] ${mine ? 'items-end' : 'items-start'}`}>
        <div className={`group flex items-center gap-1 ${mine ? 'flex-row-reverse' : ''}`}>
          <div
            className={`min-w-0 rounded-2xl px-3 py-2 transition-shadow ${
              mine ? 'bg-emerald-600' : 'bg-slate-700'
            } ${glowing ? 'ring-2 ring-amber-300' : ''}`}
          >
            {showSender && (
              <p className="text-xs font-semibold text-emerald-300">{getDisplayName(message.sender)}</p>
            )}

            {deleted ? (
              <p className="italic opacity-70">🚫 This message was deleted</p>
            ) : (
              <>
                {message.replyTo && <ReplyQuote reply={message.replyTo} />}
                {message.storyReply && <StoryQuote reply={message.storyReply} mine={mine} />}
                {message.sharedPost && <SharedPostQuote shared={message.sharedPost} />}

                <AttachmentList attachments={message.attachments} />

                {message.content && (
                  <p className="whitespace-pre-wrap break-words">{message.content}</p>
                )}
              </>
            )}

            <p className="mt-1 flex items-center justify-end gap-1 text-[10px] text-slate-300/70">
              {message.editedAt && !deleted && <span>edited</span>}
              <span>{formatTime(message.createdAt)}</span>
              {mine && <MessageStatus status={status} />}
            </p>
          </div>

          <button
            type="button"
            onClick={() => actions.openMenu(message)}
            aria-label="Message options"
            title="Message options"
            className="shrink-0 rounded-full px-1.5 text-slate-300 opacity-0 transition hover:bg-slate-700 focus:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-60"
          >
            ⋯
          </button>
        </div>

        {reactions.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {reactions.map(({ emoji, count, mine: iReacted }) => (
              <button
                key={emoji}
                type="button"
                onClick={() => actions.react(message, iReacted ? null : emoji)}
                aria-pressed={iReacted}
                aria-label={`${emoji} ${count}`}
                className={`rounded-full border px-2 py-0.5 text-xs ${
                  iReacted ? 'border-emerald-400 bg-emerald-700/50' : 'border-slate-600 bg-slate-800'
                }`}
              >
                {emoji} {count}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(MessageBubble);
