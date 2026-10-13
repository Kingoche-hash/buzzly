import { useState } from 'react';

const CATEGORIES = [
  {
    name: 'Smileys',
    icon: '😀',
    emojis: '😀 😃 😄 😁 😆 😅 😂 🤣 😊 😇 🙂 🙃 😉 😌 😍 🥰 😘 😋 😛 😜 🤪 😎 🤩 🥳 😏 😒 😞 😔 😟 🙁 😣 😖 😫 😩 🥺 😢 😭 😤 😠 😡 🤯 😳 🥵 🥶 😱 😰 🤗 🤔 🤭 🤫 😶 😐 🙄 😬 😴 🤤 🤒 🤢 🤮 😷',
  },
  {
    name: 'Gestures',
    icon: '👍',
    emojis: '👍 👎 👌 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ ✋ 🖐️ 🖖 👋 🤝 🙏 👏 🙌 👐 🤲 💪 ✍️ 🤳 🙋 🤷 🤦 🙇 💁 🙆 🙅 👀 👂 👃 👄 🧠',
  },
  {
    name: 'Hearts and symbols',
    icon: '❤️',
    emojis: '❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 ✨ ⭐ 🌟 💫 🔥 💥 💯 ✅ ❌ ❓ ❗ 💤 🎉 🎊 🎁 🏆 🥇 🎈',
  },
  {
    name: 'Animals and nature',
    icon: '🐶',
    emojis: '🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🙈 🙉 🙊 🐔 🐧 🐦 🦉 🦋 🐝 🐞 🐢 🐍 🐙 🐬 🐳 🌸 🌼 🌻 🌹 🌲 🍀 🍁 🍂 🌈 ☀️ 🌙 ❄️ ☔ 🌊',
  },
  {
    name: 'Food and drink',
    icon: '🍕',
    emojis: '🍎 🍌 🍇 🍓 🍒 🍑 🍍 🥝 🍅 🥑 🥕 🌽 🍞 🧀 🍳 🥞 🍔 🍟 🍕 🌭 🌮 🍣 🍜 🍝 🍰 🎂 🍩 🍪 🍫 🍿 ☕ 🍵 🍺 🍷 🥂 🍹 🥤',
  },
  {
    name: 'Activities and objects',
    icon: '⚽',
    emojis: '⚽ 🏀 🏈 ⚾ 🎾 🏐 🎮 🎲 🎯 🎵 🎶 🎤 🎧 🎸 🎬 📷 📱 💻 📚 ✏️ 📌 📎 🔒 🔑 💡 🎓 ✈️ 🚗 🚲 🏠 💰 ⌚ 📞 🕒 🌍',
  },
].map((category) => ({ ...category, emojis: category.emojis.split(' ') }));

// A small emoji panel with six categories. onPick(emoji) is called for every emoji tapped.
export default function EmojiPicker({ onPick }) {
  const [tab, setTab] = useState(0);
  const category = CATEGORIES[tab];

  return (
    <div
      role="dialog"
      aria-label="Emoji picker"
      className="absolute bottom-full left-0 z-30 mb-2 w-72 max-w-[85vw] overflow-hidden rounded-xl border border-slate-600 bg-slate-800 shadow-xl"
    >
      <div className="flex border-b border-slate-700">
        {CATEGORIES.map((item, index) => (
          <button
            key={item.name}
            type="button"
            onClick={() => setTab(index)}
            aria-label={item.name}
            aria-pressed={tab === index}
            title={item.name}
            className={`flex-1 py-2 text-lg ${tab === index ? 'bg-slate-700' : 'hover:bg-slate-700/60'}`}
          >
            {item.icon}
          </button>
        ))}
      </div>

      <div className="grid max-h-48 grid-cols-8 gap-0.5 overflow-y-auto p-2">
        {category.emojis.map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => onPick(emoji)}
            aria-label={emoji}
            className="rounded p-1 text-xl hover:bg-slate-700"
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
