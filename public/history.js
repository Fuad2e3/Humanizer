// Rewrite history, kept only in this browser (localStorage).
const KEY = "humanizer-history";
const MAX = 30;

export function loadHistory() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(list) ? list : [];
  } catch { return []; }
}

function save(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX))); return true; }
  catch { return false; }
}

export function addHistory(entry) {
  const list = loadHistory();
  list.unshift({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), at: Date.now(), ...entry });
  save(list);
  return list;
}

export function removeHistory(id) {
  const list = loadHistory().filter((e) => e.id !== id);
  save(list);
  return list;
}

export function clearHistory() {
  try { localStorage.removeItem(KEY); } catch {}
  return [];
}
