import { useState } from 'react';
import { THEMES, applyTheme, getThemeSetting, seasonOf } from '../utils/theme';
import Modal from './Modal';

const cardClass = (selected) =>
  `rounded-xl border-2 p-3 text-left transition ${
    selected ? 'border-emerald-400 bg-slate-700' : 'border-slate-600 hover:bg-slate-700/60'
  }`;

export default function ThemePicker({ onClose }) {
  const [setting, setSetting] = useState(getThemeSetting);

  const currentSeason = THEMES.find((theme) => theme.key === seasonOf());

  const choose = (next) => {
    applyTheme(next);
    setSetting(next);
  };

  return (
    <Modal title="Appearance" onClose={onClose}>
      <p className="mb-3 text-sm text-slate-400">
        Choose how Buzzly looks. This is saved on this device.
      </p>

      <button
        type="button"
        onClick={() => choose('auto')}
        aria-pressed={setting === 'auto'}
        className={`${cardClass(setting === 'auto')} mb-3 flex w-full items-center gap-3`}
      >
        <span className="text-2xl" aria-hidden="true">
          🌦️
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium">Match the season</span>
          <span className="block text-xs text-slate-400">
            Changes by itself through the year. Right now: {currentSeason.name}.
          </span>
        </span>
        {setting === 'auto' && <span aria-hidden="true">✓</span>}
      </button>

      <div className="grid grid-cols-2 gap-3">
        {THEMES.map((theme) => (
          <button
            key={theme.key}
            type="button"
            onClick={() => choose(theme.key)}
            aria-pressed={setting === theme.key}
            className={cardClass(setting === theme.key)}
          >
            <span className="flex items-center gap-1">
              {theme.colors.map((color) => (
                <span
                  key={color}
                  style={{ backgroundColor: color }}
                  className="h-5 w-5 rounded-full border border-white/20"
                />
              ))}
              {setting === theme.key && (
                <span className="ml-auto" aria-hidden="true">
                  ✓
                </span>
              )}
            </span>
            <span className="mt-2 block font-medium">
              <span aria-hidden="true">{theme.emoji}</span> {theme.name}
            </span>
            <span className="block text-xs text-slate-400">{theme.description}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}
