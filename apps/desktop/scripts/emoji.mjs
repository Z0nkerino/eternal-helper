// Copies the Fluent 3D emoji the app uses from @lobehub/fluent-emoji-3d (MIT) into public/emoji
// and writes src/lib/emoji-manifest.json (emoji → file). Run: node scripts-emoji.mjs <package dir>
import fs from 'node:fs';
import path from 'node:path';
const src = path.join(process.argv[2], 'assets');
const list = [...new Set(`
☀️ 🌤️ ⛅ 🌥️ ☁️ 🌦️ 🌧️ ⛈️ 🌩️ 🌨️ ❄️ 🌫️ 🌙 🌛 ⭐ 🌟 ✨ 🌈 💧 💦 🌡️ 🌬️ 💨 🌪️ ☔ 🌅 🌄 🌇 🌃 🔆 😎 🧴 🧣 🧤
📋 ⏰ ⏱️ ⏳ ⌛ 🔋 🪫 🔌 🎵 🎶 🎧 🎤 🎬 📹 🎥 📸 🖼️ 📅 🗓️ 📆 ✅ ☑️ ✔️ ❌ ⚠️ ❗ ❓ 💡 🔔 🔕 📌 📍 🗺️ 🌍 🌎 🌏 🕐 🕒 🕘 💱 💵 💶 💷 💴 📈 📉 💰
🎉 🎊 🎁 🎂 🥳 🎄 🎃 🔥 💯 👍 👋 🙌 👏 🤝 💪 🙏 ❤️ 💙 💜 💖 🧠 🤖 👀 💬 💭 🗨️ 📝 ✏️ 📒 📖 📚 🔍 🔎 🔗 📎 ✂️ 🗂️ 📁 📂 🗑️
😀 😃 😄 😁 😊 🙂 😉 😍 🥰 😘 🤗 🤔 🤩 😴 🥱 😮 😲 😱 😅 😂 🤣 😢 😭 😤 😡 🤯 🥶 🥵 😇 🫶 ☕ 🍵 🥤 🍎 🍕 🍿 🏃 🧘 🛌 🚀 ✈️ 🏠 💻 🖥️ ⌨️ 🖱️ 📱 🎮 🧩 🎯 🏆 🥇 🌱 🌸 🌻 🍂 🐱 🐶 ☁ 
🔴 🟠 🟡 🟢 🔵 🟣 ⚫ ⚪ 🎨 🖌️ 🖍️ 🧮 🔢 🔤 🌐 🛜 📶 🔒 🔓 🔑 ⚙️ 🛠️ 🧰 📦 ⬇️ ⬆️ 🔄 🆕 ⏸️ ▶️ ⏹️ ⏺️ ⏭️ ⏮️ 🔊 🔇
`.trim().split(/\s+/))];
const hex = (s) => [...s].map((c) => c.codePointAt(0).toString(16)).join('-');
const out = path.resolve('public/emoji');
const manifest = {};
const missing = [];
for (const e of list) {
  const candidates = [hex(e), hex(e.replace(/️/g, '')), hex(e.replace(/️/g, '') + '️')];
  const hit = candidates.find((c) => fs.existsSync(path.join(src, `${c}.webp`)));
  if (!hit) { missing.push(e); continue; }
  fs.copyFileSync(path.join(src, `${hit}.webp`), path.join(out, `${hit}.webp`));
  manifest[e.replace(/️/g, '')] = hit;
}
fs.writeFileSync('src/lib/emoji-manifest.json', JSON.stringify(manifest));
console.log(`copied ${Object.keys(manifest).length}, missing: ${missing.join(' ')}`);
