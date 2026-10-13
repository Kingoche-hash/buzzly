import { useRef, useState } from 'react';
import { fitWidth } from '../utils/imageUrl';

// One or several photos. With several: swipe, arrows, a "2/5" counter and dots.
export default function ImageCarousel({ images, alt, ratio, onDoubleClick, children }) {
  const trackRef = useRef(null);
  const [index, setIndex] = useState(0);

  const many = images.length > 1;

  const handleScroll = () => {
    const track = trackRef.current;
    if (track) setIndex(Math.round(track.scrollLeft / track.clientWidth));
  };

  const go = (next) => {
    const track = trackRef.current;
    track?.scrollTo({ left: next * track.clientWidth, behavior: 'smooth' });
  };

  return (
    <div
      className="relative overflow-hidden bg-slate-900"
      style={{ aspectRatio: ratio }}
      onDoubleClick={onDoubleClick}
    >
      <div
        ref={trackRef}
        onScroll={handleScroll}
        style={{ scrollbarWidth: 'none' }}
        className="flex h-full w-full snap-x snap-mandatory overflow-x-auto [&::-webkit-scrollbar]:hidden"
      >
        {images.map((image, position) => (
          <img
            key={`${image.url}-${position}`}
            src={fitWidth(image.url, 1080)}
            alt={many ? `${alt} (photo ${position + 1} of ${images.length})` : alt}
            loading="lazy"
            draggable={false}
            className="h-full w-full shrink-0 snap-center object-cover"
          />
        ))}
      </div>

      {many && (
        <>
          <span className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white">
            {index + 1}/{images.length}
          </span>

          {index > 0 && (
            <button
              type="button"
              onClick={() => go(index - 1)}
              aria-label="Previous photo"
              className="absolute left-2 top-1/2 hidden h-8 w-8 -translate-y-1/2 rounded-full bg-black/50 text-white hover:bg-black/70 md:block"
            >
              ‹
            </button>
          )}

          {index < images.length - 1 && (
            <button
              type="button"
              onClick={() => go(index + 1)}
              aria-label="Next photo"
              className="absolute right-2 top-1/2 hidden h-8 w-8 -translate-y-1/2 rounded-full bg-black/50 text-white hover:bg-black/70 md:block"
            >
              ›
            </button>
          )}

          <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center gap-1">
            {images.map((image, position) => (
              <span
                key={`${image.url}-dot-${position}`}
                className={`h-1.5 w-1.5 rounded-full ${position === index ? 'bg-white' : 'bg-white/40'}`}
              />
            ))}
          </div>
        </>
      )}

      {children}
    </div>
  );
}
