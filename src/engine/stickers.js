// Built-in sticker library. { g: glyph, t: 1 } marks plain text symbols that take the sticker colour; the rest are emoji with their own colours.
const e = (s) => s.split(' ').map((g) => ({ g }))
const t = (s) => s.split(' ').map((g) => ({ g, t: 1 }))
export const STICKER_SETS = [
  { name: 'Stars', items: e('⭐ 🌟 ✨ 💫 🏆 🥇 🎉 💯') },
  { name: 'Marks', items: [...e('✅ ❌ ❓ ❗ 💡 ⚠️'), ...t('✔ ✘')] },
  { name: 'Arrows', items: [...e('➡️ ⬅️ ⬆️ ⬇️ ↗️ 🔄'), ...t('→ ← ↑ ↓ ⇒ ⇔')] },
  { name: 'Reactions', items: e('👍 👎 👏 🙌 👀 🤔 😀 🔥') },
  { name: 'Numbers', items: t('① ② ③ ④ ⑤ ⑥ ⑦ ⑧ ⑨ ⑩') },
  { name: 'Math', items: t('+ − × ÷ = ≠ ≤ ≥ π √ ∞ ∑ ∫ ° ½ ² ³ △ ∠ %') },
]
