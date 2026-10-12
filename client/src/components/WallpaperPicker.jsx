import { useRef, useState } from 'react';
import { getErrorMessage } from '../utils/getErrorMessage';
import { WALLPAPERS } from '../utils/wallpapers';
import Modal from './Modal';

const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_PHOTO_SIZE = 10 * 1024 * 1024;

// A small square version of the photo, made by Cloudinary.
const thumbnail = (url) => url.replace('/upload/', '/upload/c_fill,w_160,h_160,q_auto/');

export default function WallpaperPicker({ current, photoUrl = '', onChoose, onChoosePhoto, onClose }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  const handleFile = async (event) => {
    const file = event.target.files[0];
    event.target.value = '';

    if (!file) return;

    if (!PHOTO_TYPES.includes(file.type)) {
      setError('Use a JPG, PNG or WEBP photo.');
      return;
    }

    if (file.size > MAX_PHOTO_SIZE) {
      setError('That photo is larger than 10 MB.');
      return;
    }

    setBusy(true);
    setError('');

    try {
      await onChoosePhoto(file); // the window closes by itself when this is done
    } catch (err) {
      setError(getErrorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Modal title="Chat wallpaper" onClose={onClose}>
      <p className="mb-3 text-sm text-slate-400">Only you see this wallpaper.</p>

      <input
        ref={inputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.webp"
        onChange={handleFile}
        className="hidden"
      />

      <div className="grid grid-cols-4 gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          aria-label="Upload your own photo"
          className="flex flex-col items-center gap-1 text-xs text-slate-300 disabled:opacity-60"
        >
          <span className="flex h-20 w-full items-center justify-center rounded-lg border-2 border-dashed border-slate-500 text-2xl">
            {busy ? '⏳' : '📷'}
          </span>
          {busy ? 'Uploading...' : 'Your photo'}
        </button>

        {current === 'photo' && photoUrl && (
          <span className="flex flex-col items-center gap-1 text-xs text-slate-300">
            <img
              src={thumbnail(photoUrl)}
              alt="Your current wallpaper photo"
              className="h-20 w-full rounded-lg border-2 border-emerald-400 object-cover"
            />
            Current photo
          </span>
        )}

        {WALLPAPERS.map((wallpaper) => (
          <button
            key={wallpaper.key}
            type="button"
            disabled={busy}
            onClick={() => onChoose(wallpaper.key)}
            aria-label={wallpaper.name}
            aria-pressed={current === wallpaper.key}
            className="flex flex-col items-center gap-1 text-xs text-slate-300 disabled:opacity-60"
          >
            <span
              style={wallpaper.style}
              className={`block h-20 w-full rounded-lg border-2 ${
                current === wallpaper.key ? 'border-emerald-400' : 'border-slate-600'
              }`}
            />
            {wallpaper.name}
          </button>
        ))}
      </div>

      {error && (
        <p role="alert" className="mt-3 text-sm text-red-400">
          {error}
        </p>
      )}
    </Modal>
  );
}
