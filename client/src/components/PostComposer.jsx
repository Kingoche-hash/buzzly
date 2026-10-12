import { useEffect, useRef, useState } from 'react';
import { createPostRequest } from '../services/post.service';
import { getErrorMessage } from '../utils/getErrorMessage';
import Modal from './Modal';

const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_PHOTO_SIZE = 10 * 1024 * 1024;

export default function PostComposer({ onClose, onPosted }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');

  const inputRef = useRef(null);

  // Show a preview of the chosen photo.
  useEffect(() => {
    if (!file) return;

    const url = URL.createObjectURL(file);
    setPreview(url);

    return () => URL.revokeObjectURL(url);
  }, [file]);

  const handleFile = (event) => {
    const chosen = event.target.files[0];
    event.target.value = '';

    if (!chosen) return;

    if (!PHOTO_TYPES.includes(chosen.type)) {
      setError('Use a JPG, PNG or WEBP photo.');
      return;
    }

    if (chosen.size > MAX_PHOTO_SIZE) {
      setError('That photo is larger than 10 MB.');
      return;
    }

    setError('');
    setFile(chosen);
  };

  const handlePost = async () => {
    setBusy(true);
    setProgress(0);
    setError('');

    try {
      const post = await createPostRequest({ file, caption: caption.trim(), onProgress: setProgress });
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
        accept=".jpg,.jpeg,.png,.webp"
        onChange={handleFile}
        className="hidden"
      />

      {preview && file ? (
        <img src={preview} alt="Preview of your post" className="max-h-80 w-full rounded-lg object-contain" />
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex h-48 w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-600 text-slate-400 hover:border-slate-400 hover:text-slate-200"
        >
          <span className="text-4xl" aria-hidden="true">
            📷
          </span>
          Choose a photo
        </button>
      )}

      {file && (
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="mt-3 rounded-lg bg-slate-700 px-4 py-2 text-sm hover:bg-slate-600 disabled:opacity-60"
        >
          Choose a different photo
        </button>
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
        disabled={!file || busy}
        onClick={handlePost}
        className="mt-4 w-full rounded-lg bg-emerald-600 py-2 font-semibold hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? `Posting... ${progress}%` : 'Share'}
      </button>
    </Modal>
  );
}
