// Seasonal looks. The colours themselves live in index.css; this file chooses which one is active.
const STORAGE_KEY = 'buzzly-theme';

export const DEFAULT_SETTING = 'autumn';

// `colors` are three little swatches for the picker: background, accent, text.
export const THEMES = [
  {
    key: 'autumn',
    name: 'Autumn',
    emoji: '🍂',
    description: 'Warm browns and copper',
    colors: ['#251b15', '#c2601f', '#f6ece0'],
    themeColor: '#251b15',
  },
  {
    key: 'winter',
    name: 'Winter',
    emoji: '❄️',
    description: 'Frosty blues',
    colors: ['#162232', '#2386be', '#e6eef5'],
    themeColor: '#162232',
  },
  {
    key: 'summer',
    name: 'Summer',
    emoji: '☀️',
    description: 'Sea blue and coral',
    colors: ['#0c2f35', '#d24a3c', '#e0f4f2'],
    themeColor: '#0c2f35',
  },
  {
    key: 'spring',
    name: 'Spring',
    emoji: '🌸',
    description: 'Fresh green and blossom',
    colors: ['#1b2a18', '#cc4783', '#e8f2e0'],
    themeColor: '#1b2a18',
  },
  {
    key: 'classic',
    name: 'Classic',
    emoji: '🌙',
    description: 'The original dark blue',
    colors: ['#0f172a', '#10b981', '#f1f5f9'],
    themeColor: '#0f172a',
  },
];

// Northern hemisphere: March to May is spring, and so on.
export const seasonOf = (date = new Date()) => {
  const month = date.getMonth(); // 0 = January

  if (month >= 2 && month <= 4) return 'spring';
  if (month >= 5 && month <= 7) return 'summer';
  if (month >= 8 && month <= 10) return 'autumn';
  return 'winter';
};

// "auto" becomes the current season; anything unknown becomes the default.
export const resolveTheme = (setting, date = new Date()) => {
  if (setting === 'auto') return seasonOf(date);
  return THEMES.some((theme) => theme.key === setting) ? setting : DEFAULT_SETTING;
};

export const getThemeSetting = () => {
  try {
    return localStorage.getItem(STORAGE_KEY) || DEFAULT_SETTING;
  } catch {
    return DEFAULT_SETTING;
  }
};

// Switches the whole app to a theme (or to "auto") and remembers the choice on this device.
export const applyTheme = (setting) => {
  const key = resolveTheme(setting);
  const theme = THEMES.find((item) => item.key === key);

  document.documentElement.dataset.theme = key;

  // The colour of the phone's browser bar.
  let meta = document.querySelector('meta[name="theme-color"]');

  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }

  meta.content = theme.themeColor;

  try {
    localStorage.setItem(STORAGE_KEY, setting);
  } catch {
    // Private windows may refuse storage. The theme still works until the page closes.
  }

  return key;
};
