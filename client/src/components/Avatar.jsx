import { useState } from 'react';

const COLORS = [
  'bg-emerald-600',
  'bg-sky-600',
  'bg-violet-600',
  'bg-amber-600',
  'bg-rose-600',
  'bg-teal-600',
  'bg-indigo-600',
  'bg-pink-600',
];

const SIZES = {
  sm: 'h-8 w-8 text-sm',
  md: 'h-10 w-10 text-base',
  lg: 'h-12 w-12 text-lg',
  xl: 'h-24 w-24 text-4xl',
};

// The same name always gets the same colour.
const colorFor = (name) => {
  let hash = 0;
  for (const character of name) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return COLORS[hash % COLORS.length];
};

// The person's photo if they have one, otherwise a coloured circle with their first letter.
// `online` adds a green or grey dot.
export default function Avatar({ name = '?', src = '', size = 'md', online = null }) {
  const [failedSrc, setFailedSrc] = useState('');

  const initial = (name.trim()[0] || '?').toUpperCase();
  const showImage = Boolean(src) && failedSrc !== src;

  return (
    <span className="relative inline-block shrink-0">
      {showImage ? (
        <img src={src} alt="" onError={() => setFailedSrc(src)} className={`rounded-full object-cover ${SIZES[size]}`} />
      ) : (
        <span
          aria-hidden="true"
          className={`flex items-center justify-center rounded-full font-semibold text-white ${SIZES[size]} ${colorFor(name)}`}
        >
          {initial}
        </span>
      )}
      {online !== null && (
        <span
          role="img"
          aria-label={online ? 'Online' : 'Offline'}
          className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-slate-800 ${
            online ? 'bg-green-400' : 'bg-slate-500'
          }`}
        />
      )}
    </span>
  );
}