// The only module that touches localStorage. Keys are namespaced: GitHub Pages
// serves every project of one account from one origin.
const KEY = 'sweety:progress';

export const DEFAULT_SETTINGS = Object.freeze({ music: 6, sfx: 8, gentle: false, shake: true });
const fresh = () => ({ unlocked: 1, hearts: {}, done: {}, settings: { ...DEFAULT_SETTINGS }, seenCredits: false });

// keep only finite, non-negative whole numbers: a hand-edited save can't show "♥ lots"
function cleanCounts(o) {
  const out = {};
  if (o && typeof o === 'object' && !Array.isArray(o)) for (const [k, v] of Object.entries(o)) if (Number.isFinite(v) && v >= 0) out[k] = Math.floor(v);
  return out;
}

export function loadProgress() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh();
    const p = JSON.parse(raw);
    const st = p.settings && typeof p.settings === 'object' ? p.settings : {};
    const num = (v, d) => (Number.isFinite(v) ? Math.max(0, Math.min(10, v)) : d);
    return {
      unlocked: Number.isFinite(p.unlocked) ? Math.max(1, Math.floor(p.unlocked)) : 1,
      hearts: cleanCounts(p.hearts),
      done: p.done && typeof p.done === 'object' ? p.done : {},
      settings: {
        music: num(st.music, DEFAULT_SETTINGS.music),
        sfx: num(st.sfx, DEFAULT_SETTINGS.sfx),
        gentle: typeof st.gentle === 'boolean' ? st.gentle : DEFAULT_SETTINGS.gentle,
        shake: typeof st.shake === 'boolean' ? st.shake : DEFAULT_SETTINGS.shake,
      },
      seenCredits: !!p.seenCredits,
    };
  } catch { return fresh(); }
}

export function saveProgress(p) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* private mode: play on */ }
}
