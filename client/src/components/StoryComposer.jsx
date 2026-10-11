import { useEffect, useRef, useState } from 'react';
import { createStoryRequest } from '../services/story.service';
import { getErrorMessage } from '../utils/getErrorMessage';
import { STORY_BACKGROUNDS, getStoryBackground } from '../utils/storyBackgrounds';
import Modal from './Modal';

const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_PHOTO_SIZE = 10 * 1024 * 1024;

const tabClass = (selected) =>
  `flex-1 rounded-md px-3 py-1.5 text-sm font-medium ${
    selected ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
  }`;

export default function StoryComposer({ onClose, onPosted }) {
  const [mode, setMode] = useState('text');
  const [text, setText] = useState('');
  const [background, setBackground] = useState('emerald');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const fileInputRef = useRef(null);

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

  const canPost = mode === 'text' ? text.trim().length > 0 : Boolean(file);

  const handlePost = async () => {
    setBusy(true);
    setError('');

    try {
      await createStoryRequest(
        mode === 'text'
          ? { text: text.trim(), background }
          : { file, text: caption.trim() }
      );

      onPosted();
      onClose();
    } catch (err) {
      setError(getErrorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Modal title="New story" onClose={onClose}>
      <div className="mb-3 flex gap-2">
        <button type="button" onClick={() => setMode('text')} className={tabClass(mode === 'text')}>
          Text
        </button>
        <button type="button" onClick={() => setMode('photo')} className={tabClass(mode === 'photo')}>
          Photo
        </button>
      </div>

      {mode === 'text' && (
        <div>
          <div
            style={getStoryBackground(background)}
            className="flex h-56 items-center justify-center rounded-xl p-4"
          >
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={280}
              placeholder="Type your story"
              aria-label="Story text"
              className="h-full w-full resize-none bg-transparent text-center text-xl font-semibold text-white placeholder-white/60 outline-none"
            />
          </div>

          <div className="mt-3 flex items-center gap-2">
            {STORY_BACKGROUNDS.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setBackground(item.key)}
                aria-label={`${item.name} background`}
                aria-pressed={background === item.key}
                style={item.style}
                className={`h-8 w-8 rounded-full border-2 ${
                  background === item.key ? 'border-white' : 'border-transparent'
                }`}
              />
            ))}
            <span className="ml-auto text-xs text-slate-400">{text.length}/280</span>
          </div>
        </div>
      )}

      {mode === 'photo' && (
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".jpg,.jpeg,.png,.webp"
            onChange={handleFile}
            className="hidden"
          />

          {preview && file ? (
            <img src={preview} alt="Story preview" className="max-h-72 w-full rounded-lg object-contain" />
          ) : (
            <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-slate-600 text-sm text-slate-400">
              No photo chosen yet
            </div>
          )}

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="mt-3 rounded-lg bg-slate-700 px-4 py-2 text-sm hover:bg-slate-600"
          >
            {file ? 'Choose a different photo' : 'Choose a photo'}
          </button>

          <input
            type="text"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            maxLength={280}
            placeholder="Add a caption (optional)"
            aria-label="Caption"
            className="mt-3 w-full rounded-lg bg-slate-700 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm text-red-400">
          {error}
        </p>
      )}

      <button
        type="button"
        disabled={!canPost || busy}
        onClick={handlePost}
        className="mt-4 w-full rounded-lg bg-emerald-600 py-2 font-semibold hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? 'Posting...' : 'Post story'}
      </button>

      <p className="mt-2 text-center text-xs text-slate-500">
        People you chat with can see it for 24 hours.
      </p>
    </Modal>
  );
}
