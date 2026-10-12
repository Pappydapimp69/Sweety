// The only module that touches localStorage. Keys are namespaced: GitHub Pages
// serves every project of one account from one origin.
const KEY = 'sweety:progress';

const fresh = () => ({ unlocked: 1, hearts: {}, done: {} });

export function loadProgress() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh();
    const p = JSON.parse(raw);
    return {
      unlocked: Number.isFinite(p.unlocked) ? p.unlocked : 1,
      hearts: p.hearts && typeof p.hearts === 'object' ? p.hearts : {},
      done: p.done && typeof p.done === 'object' ? p.done : {},
    };
  } catch { return fresh(); }
}

export function saveProgress(p) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* private mode: play on */ }
}
