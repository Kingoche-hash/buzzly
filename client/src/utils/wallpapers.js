// The wallpapers you can choose. Each is just a CSS background.
// "default", "dots" and "grid" use the theme's own colours, so they match every season.
export const WALLPAPERS = [
  { key: 'default', name: 'Default', style: { backgroundColor: 'var(--color-slate-900)' } },
  {
    key: 'autumn',
    name: 'Autumn',
    style: { backgroundImage: 'linear-gradient(160deg, #7a3b14, #2a1a12 80%)' },
  },
  {
    key: 'winter',
    name: 'Winter',
    style: { backgroundImage: 'linear-gradient(160deg, #1d4a6b, #0d1621 80%)' },
  },
  {
    key: 'summer',
    name: 'Summer',
    style: { backgroundImage: 'linear-gradient(160deg, #0f6b73, #072126 75%)' },
  },
  {
    key: 'spring',
    name: 'Spring',
    style: { backgroundImage: 'linear-gradient(160deg, #7a3a5e, #1b2a18 85%)' },
  },
  {
    key: 'ocean',
    name: 'Ocean',
    style: { backgroundImage: 'linear-gradient(160deg, #0c4a6e, #0f172a 70%)' },
  },
  {
    key: 'sunset',
    name: 'Sunset',
    style: { backgroundImage: 'linear-gradient(160deg, #7c2d12, #1e1b4b 80%)' },
  },
  {
    key: 'forest',
    name: 'Forest',
    style: { backgroundImage: 'linear-gradient(160deg, #14532d, #0f172a 80%)' },
  },
  {
    key: 'midnight',
    name: 'Midnight',
    style: { backgroundImage: 'linear-gradient(160deg, #1e1b4b, #020617 80%)' },
  },
  {
    key: 'rose',
    name: 'Rose',
    style: { backgroundImage: 'linear-gradient(160deg, #831843, #1e1b4b 80%)' },
  },
  {
    key: 'dots',
    name: 'Dots',
    style: {
      backgroundColor: 'var(--color-slate-900)',
      backgroundImage: 'radial-gradient(var(--color-slate-700) 1.2px, transparent 1.2px)',
      backgroundSize: '22px 22px',
    },
  },
  {
    key: 'grid',
    name: 'Grid',
    style: {
      backgroundColor: 'var(--color-slate-900)',
      backgroundImage:
        'linear-gradient(var(--color-slate-800) 1px, transparent 1px), linear-gradient(90deg, var(--color-slate-800) 1px, transparent 1px)',
      backgroundSize: '28px 28px',
    },
  },
];

// `key` is 'photo' when the person uploaded their own picture, and `photoUrl` is that picture.
export const getWallpaperStyle = (key, photoUrl = '') => {
  if (key === 'photo' && photoUrl) {
    return {
      // A dark layer over the photo keeps the messages readable.
      backgroundImage: `linear-gradient(rgba(0, 0, 0, 0.4), rgba(0, 0, 0, 0.4)), url("${photoUrl}")`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    };
  }

  return (WALLPAPERS.find((wallpaper) => wallpaper.key === key) || WALLPAPERS[0]).style;
};
