// A message of mine that is being sent, or that could not be sent (with Retry and Delete).
export default function PendingMessage({ item, onRetry, onDiscard }) {
  const failed = item.status === 'failed';

  return (
    <div className="flex justify-end">
      <div className="flex max-w-[92%] flex-col items-end sm:max-w-[80%]">
        <div
          className={`min-w-0 rounded-2xl px-3 py-2 ${
            failed ? 'bg-red-950/70 ring-1 ring-red-400' : 'bg-emerald-600/60'
          }`}
        >
          {item.replyPreview && (
            <div className="mb-1 rounded-lg border-l-4 border-white/50 bg-black/20 p-2 text-xs">
              <span className="block truncate font-semibold">{item.replyPreview.senderName}</span>
              <span className="block truncate opacity-80">{item.replyPreview.text}</span>
            </div>
          )}

          <p className="whitespace-pre-wrap break-words">{item.content}</p>

          <p className="mt-1 text-right text-[10px] text-slate-200/80">
            {failed ? '⚠ Not sent' : '🕒 Sending...'}
          </p>
        </div>

        {failed && (
          <div role="alert" className="mt-1 flex flex-wrap items-center justify-end gap-2 text-xs">
            <span className="text-red-300">{item.error || 'Could not send.'}</span>
            <button
              type="button"
              onClick={onRetry}
              className="rounded-lg bg-slate-700 px-2 py-1 font-medium hover:bg-slate-600"
            >
              Retry
            </button>
            <button
              type="button"
              onClick={onDiscard}
              className="rounded-lg px-2 py-1 text-slate-300 hover:bg-slate-700"
            >
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
