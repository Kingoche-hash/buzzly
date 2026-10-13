import { useEffect, useRef, useState } from 'react';
import { createPostRequest } from '../services/post.service';
import { getErrorMessage } from '../utils/getErrorMessage';
import Modal from './Modal';

const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_PHOTO_SIZE = 10 * 1024 * 1024;
const MAX_PHOTOS = 10;

export default function PostComposer({ onClose, onPosted }) {
  const [files, setFiles] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');

  const inputRef = useRef(null);

  // Show a preview of every chosen photo.
  useEffect(() => {
    const urls = files.map((file) => URL.createObjectURL(file));
    setPreviews(urls);

    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [files]);

  const handleFiles = (event) => {
    const chosen = [...event.target.files];
    event.target.value = '';

    if (chosen.length === 0) return;

    const problems = [];
    const accepted = [];

    for (const file of chosen) {
      if (!PHOTO_TYPES.includes(file.type)) problems.push(`${file.name} is not a JPG, PNG or WEBP photo.`);
      else if (file.size > MAX_PHOTO_SIZE) problems.push(`${file.name} is larger than 10 MB.`);
      else accepted.push(file);
    }

    const room = MAX_PHOTOS - files.length;

    if (accepted.length > room) {
      problems.push(`A post can have at most ${MAX_PHOTOS} photos.`);
    }

    setError(problems[0] || '');
    setFiles((prev) => [...prev, ...accepted.slice(0, room)]);
  };

  const removePhoto = (position) => {
    setFiles((prev) => prev.filter((file, index) => index !== position));
  };

  const handlePost = async () => {
    setBusy(true);
    setProgress(0);
    setError('');

    try {
      const post = await createPostRequest({ files, caption: caption.trim(), onProgress: setProgress });
      onPosted(post);
      onClose();
    } catch (err) {
      setError(getErrorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Modal title="New post" onClose={busy ? () => {} : onClose}>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".jpg,.jpeg,.png,.webp"
        onChange={handleFiles}
        className="hidden"
      />

      {files.length === 0 ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex h-48 w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-600 text-slate-400 hover:border-slate-400 hover:text-slate-200"
        >
          <span className="text-4xl" aria-hidden="true">
            📷
          </span>
          Choose up to {MAX_PHOTOS} photos
        </button>
      ) : (
        <ul className="grid grid-cols-3 gap-2">
          {previews.map((url, position) => (
            <li key={url} className="relative aspect-square overflow-hidden rounded-lg bg-slate-900">
              <img src={url} alt={`Photo ${position + 1}`} className="h-full w-full object-cover" />

              {position === 0 && (
                <span className="absolute left-1 top-1 rounded bg-black/60 px-1.5 text-[10px] text-white">
                  Cover
                </span>
              )}

              <button
                type="button"
                disabled={busy}
                onClick={() => removePhoto(position)}
                aria-label={`Remove photo ${position + 1}`}
                className="absolute right-1 top-1 rounded-full bg-black/70 px-2 text-sm text-white hover:bg-black"
              >
                ✕
              </button>
            </li>
          ))}

          {files.length < MAX_PHOTOS && (
            <li>
              <button
                type="button"
                disabled={busy}
                onClick={() => inputRef.current?.click()}
                aria-label="Add more photos"
                className="flex aspect-square w-full items-center justify-center rounded-lg border-2 border-dashed border-slate-600 text-2xl text-slate-400 hover:border-slate-400"
              >
                ＋
              </button>
            </li>
          )}
        </ul>
      )}

      {files.length > 0 && (
        <p className="mt-2 text-xs text-slate-500">
          {files.length} of {MAX_PHOTOS} photos
        </p>
      )}

      <textarea
        value={caption}
        onChange={(event) => setCaption(event.target.value)}
        maxLength={2000}
        rows={3}
        placeholder="Write a caption..."
        aria-label="Caption"
        className="mt-3 w-full resize-none rounded-lg bg-slate-700 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
      />
      <p className="text-right text-xs text-slate-500">{caption.length}/2000</p>

      {error && (
        <p role="alert" className="mt-2 text-sm text-red-400">
          {error}
        </p>
      )}

      {busy && (
        <div className="mt-3 h-2 overflow-hidden rounded bg-slate-700">
          <div className="h-full bg-emerald-500 transition-all" style={{ width: `${progress}%` }} />
        </div>
      )}

      <button
        type="button"
        disabled={files.length === 0 || busy}
        onClick={handlePost}
        className="mt-4 w-full rounded-lg bg-emerald-600 py-2 font-semibold hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? `Posting... ${progress}%` : 'Share'}
      </button>
    </Modal>
  );
}
