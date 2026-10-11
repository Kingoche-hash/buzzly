// The coloured backgrounds for text stories. Each is just a CSS background.
export const STORY_BACKGROUNDS = [
  { key: 'emerald', name: 'Emerald', style: { backgroundImage: 'linear-gradient(160deg, #059669, #064e3b)' } },
  { key: 'ocean', name: 'Ocean', style: { backgroundImage: 'linear-gradient(160deg, #0284c7, #0c4a6e)' } },
  { key: 'sunset', name: 'Sunset', style: { backgroundImage: 'linear-gradient(160deg, #ea580c, #7c2d12)' } },
  { key: 'violet', name: 'Violet', style: { backgroundImage: 'linear-gradient(160deg, #7c3aed, #312e81)' } },
  { key: 'rose', name: 'Rose', style: { backgroundImage: 'linear-gradient(160deg, #e11d48, #831843)' } },
  { key: 'night', name: 'Night', style: { backgroundImage: 'linear-gradient(160deg, #334155, #020617)' } },
];

export const getStoryBackground = (key) =>
  (STORY_BACKGROUNDS.find((background) => background.key === key) || STORY_BACKGROUNDS[0]).style;
