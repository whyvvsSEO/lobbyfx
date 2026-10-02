// Shared data layer for the popup and the dashboard.
export const WORKSHOP_CATALOG = 'https://cdn.jsdelivr.net/gh/YOUR_GITHUB/lobbyfx-workshop@main/catalog.json';
export const MAX_FILE = 60 * 1024 * 1024;
export const IMG_EXT = ['gif', 'png', 'jpg', 'jpeg', 'webp', 'avif'];
export const VID_EXT = ['mp4', 'webm', 'mov', 'm4v'];
export const SND_EXT = ['mp3', 'ogg', 'wav', 'm4a'];

// Default Workshop: YouTube live wallpapers (played through YouTube's official embed player)
const yt = (id, title, author, tags) => ({
  id: 'yt-' + id, title, author, type: 'youtube', src: id,
  thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, tags,
});
export const BUILTIN_WORKSHOP = [
  yt('gU4vSEZwiyE', { uk: 'Гаргантюа — чорна діра', en: 'Gargantua black hole', ru: 'Гаргантюа — чёрная дыра' }, 'Tech Aadi', ['space']),
  yt('jtjVORGeGFg', { uk: 'Чорна рідина', en: 'Black liquid', ru: 'Чёрная жидкость' }, 'Take A Deep Breath And Relax', ['abstract', 'dark']),
  yt('9OHzW1ZPZnM', { uk: 'Самурай', en: 'Samurai warrior', ru: 'Самурай' }, 'Jinx Live', ['art', 'red']),
  yt('1-cPgr5qpf8', { uk: 'Чорний ангел', en: 'Black angel', ru: 'Чёрный ангел' }, 'Walls Live Hub', ['art', 'dark']),
  yt('2iOhXGvRIZg', { uk: 'Срібний серфер', en: 'Silver Surfer', ru: 'Серебряный серфер' }, 'pc stuff', ['space']),
];

// All FACEIT pages the background can be set for (order = order in the UI)
export const PAGES = ['lobby', 'matchroom', 'home', 'play', 'parties', 'rank', 'track', 'history', 'stats', 'profile', 'feed', 'missions', 'shop', 'clubs', 'competitions', 'settings', 'other'];

export const BUILTIN_SOUNDS = [
  { id: 'builtin:chime', title: { uk: 'Дзвіночок', en: 'Chime', ru: 'Колокольчик' } },
  { id: 'builtin:arcade', title: { uk: 'Аркада 8-біт', en: '8-bit arcade', ru: 'Аркада 8-бит' } },
  { id: 'builtin:gong', title: { uk: 'Гонг', en: 'Gong', ru: 'Гонг' } },
];

export const THEMES = [
  { id: 'none', colors: ['#121212', '#1d1d1d', '#ff5500'] },
  { id: 'blockcraft', colors: ['#2b2b2f', '#5fa83a', '#6e6e74'] },
  { id: 'glass', colors: ['#1a1830', '#8b5cf6', '#5b8cff'] },
  { id: 'neon', colors: ['#05040a', '#ff2bd6', '#2de2ff'] },
  { id: 'kitty', colors: ['#5e0d33', '#ff5fa2', '#ffc2dc'] },
  { id: 'candy', colors: ['#2c2048', '#cdb4ff', '#a8f0d4'] },
  { id: 'samurai', colors: ['#0a0505', '#c1121f', '#c9a24a'] },
];

export const ACCENTS = ['#ff5500', '#ff2e63', '#ff9cc6', '#cdb4ff', '#8b5cf6', '#3b82f6', '#2de2ff', '#22c55e', '#c8ff3a', '#ffd23f', '#c9a24a', '#ededee'];
export const HIDE_KEYS = ['widgets', 'rank', 'missions', 'shop', 'notices'];

export function defaultLang() {
  const l = (navigator.language || 'en').slice(0, 2);
  return l === 'uk' ? 'uk' : l === 'ru' ? 'ru' : l === 'pl' ? 'en' : 'en';
}

export const DEFAULT_SETTINGS = () => ({
  lang: defaultLang(),
  enabled: true,
  dim: 40,
  blur: 0,
  active: null,
  pages: Object.fromEntries(PAGES.map((p) => [p, p === 'lobby' ? 'active' : 'none'])),
  rotation: { enabled: false, mode: 'visit', seconds: 30, fade: 1, pool: 'fav' },
  theme: 'none',
  sound: { enabled: false, id: 'builtin:chime', volume: 80, trigger: '' },
  ui: { accent: '', playText: '', hide: { widgets: false, rank: false, missions: false, shop: false, notices: false } },
  autoAccept: { enabled: false, delayMin: 1, delayMax: 3, idleMin: 3, notify: true },
});

// ---------- storage ----------
export async function getAll() {
  const got = await chrome.storage.local.get(['settings', 'library', 'sounds', 'soundlog', 'acceptlog', 'acceptDebug']);
  const def = DEFAULT_SETTINGS();
  const s = got.settings || {};
  const settings = {
    ...def, ...s,
    pages: { ...def.pages, ...(s.pages || {}) },
    rotation: { ...def.rotation, ...(s.rotation || {}), ...(s.rotation?.minutes && !s.rotation?.seconds ? { seconds: s.rotation.minutes * 60 } : {}) },
    sound: { ...def.sound, ...(s.sound || {}) },
    ui: { ...def.ui, ...(s.ui || {}), hide: { ...def.ui.hide, ...(s.ui?.hide || {}) } },
    autoAccept: { ...def.autoAccept, ...(s.autoAccept || {}) },
  };
  if (!got.settings) await chrome.storage.local.set({ settings });
  // v0.3: the generated "Originals" were replaced by YouTube wallpapers
  let library = got.library || [];
  if (library.some((i) => /^ext:workshop\/(aurora|synthwave|bokeh|topo|stone|crimson)\.webp$/.test(i.src || ''))) {
    library = library.filter((i) => !/^ext:workshop\/(aurora|synthwave|bokeh|topo|stone|crimson)\.webp$/.test(i.src || ''));
    await chrome.storage.local.set({ library });
  }
  // v0.6: YouTube thumbnails are no longer bundled with the extension
  if (library.some((i) => i.thumbLocal)) {
    library = library.map(({ thumbLocal, ...i }) => i);
    await chrome.storage.local.set({ library });
  }
  return { settings, library, sounds: got.sounds || [], soundlog: got.soundlog || [], acceptlog: got.acceptlog || [], acceptDebug: got.acceptDebug || null };
}

export async function setSettings(patch) {
  const { settings } = await getAll();
  const next = deepMerge(settings, patch);
  await chrome.storage.local.set({ settings: next });
  return next;
}
function deepMerge(a, b) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object' && !Array.isArray(a[k]) ? deepMerge(a[k], v) : v;
  }
  return out;
}

export const uid = (p = 'i') => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export async function addToLibrary(item, makeActive = true) {
  const { library, settings } = await getAll();
  const existing = item.workshopId && library.find((i) => i.workshopId === item.workshopId);
  const entry = existing || { id: uid(), fav: false, added: Date.now(), tags: [], ...item };
  const next = existing ? library : [entry, ...library];
  const set = { library: next };
  if (makeActive) set.settings = { ...settings, active: entry.id, enabled: true };
  await chrome.storage.local.set(set);
  return entry;
}

export async function updateItem(id, patch) {
  const { library } = await getAll();
  await chrome.storage.local.set({ library: library.map((i) => (i.id === id ? { ...i, ...patch } : i)) });
}

export async function removeItem(id) {
  const { library, settings } = await getAll();
  const item = library.find((i) => i.id === id);
  if (item?.fileKey) await chrome.storage.local.remove(item.fileKey);
  const pages = { ...settings.pages };
  for (const k of Object.keys(pages)) if (pages[k] === id) pages[k] = k === 'lobby' ? 'active' : 'none';
  await chrome.storage.local.set({
    library: library.filter((i) => i.id !== id),
    settings: { ...settings, pages, active: settings.active === id ? null : settings.active },
  });
}

// ---------- helpers ----------
export const extOf = (u) => {
  const p = String(u).split(/[?#]/)[0];
  const i = p.lastIndexOf('.');
  return i < 0 ? '' : p.slice(i + 1).toLowerCase();
};
export const fileName = (u) => {
  try { return decodeURIComponent(String(u).split(/[?#]/)[0].split('/').pop()) || u; } catch { return u; }
};
export function youtubeId(input) {
  try {
    const u = new URL(input);
    const h = u.hostname.replace(/^www\.|^m\./, '');
    if (h === 'youtu.be') return u.pathname.slice(1).split('/')[0] || null;
    if (h === 'youtube.com' || h === 'youtube-nocookie.com') {
      if (u.searchParams.get('v')) return u.searchParams.get('v');
      const m = u.pathname.match(/^\/(shorts|embed|live)\/([\w-]{6,})/);
      if (m) return m[2];
    }
  } catch {}
  return null;
}
export const resolveExt = (src) => (src?.startsWith('ext:') ? chrome.runtime.getURL(src.slice(4)) : src);

/** Preview for an item: { type:'image'|'video', url } */
export async function previewOf(item) {
  if (!item) return null;
  if (item.thumb || item.type === 'youtube') return {
    type: 'image', url: resolveExt(item.thumb || `https://i.ytimg.com/vi/${item.src}/hqdefault.jpg`),
    youtube: item.type === 'youtube',
  };
  if (item.fileKey) {
    const got = await chrome.storage.local.get(item.fileKey);
    return got[item.fileKey] ? { type: item.type, url: got[item.fileKey] } : null;
  }
  return { type: item.type, url: resolveExt(item.src) };
}

// ---------- links ----------
export async function youtubeTitle(id) {
  try {
    const r = await fetch('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent('https://www.youtube.com/watch?v=' + id));
    if (r.ok) { const j = await r.json(); if (j.title) return j.title; }
  } catch {}
  return 'YouTube · ' + id;
}
function meta(doc, names) {
  for (const n of names) {
    const el = doc.querySelector(`meta[property="${n}"], meta[name="${n}"]`);
    if (el?.content) return el.content;
  }
  return null;
}

/** Resolve a link to { type, src, label } — follows Tenor/Giphy/other pages to their media. */
export async function resolveUrl(url, t, depth = 0) {
  const yt = youtubeId(url);
  if (yt) return { type: 'youtube', src: yt, label: await youtubeTitle(yt), thumb: `https://i.ytimg.com/vi/${yt}/hqdefault.jpg` };
  const e = extOf(url);
  if (IMG_EXT.includes(e)) return { type: 'image', src: url, label: fileName(url) };
  if (VID_EXT.includes(e)) return { type: 'video', src: url, label: fileName(url) };
  if (depth > 1) throw new Error(t('err.noMedia'));

  const origin = new URL(url).origin + '/*';
  if (!(await chrome.permissions.contains({ origins: [origin] }))) {
    const ok = await chrome.permissions.request({ origins: [origin] });
    if (!ok) throw new Error(t('err.noPermission'));
  }
  let res;
  try { res = await fetch(url); } catch { throw new Error(t('err.cantOpen')); }
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  const host = new URL(url).hostname.replace(/^www\./, '');
  if (ct.startsWith('image/')) return { type: 'image', src: res.url, label: fileName(url) };
  if (ct.startsWith('video/')) return { type: 'video', src: res.url, label: fileName(url) };
  const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
  const video = meta(doc, ['og:video:secure_url', 'og:video', 'twitter:player:stream']);
  if (video && /\.(mp4|webm)(\?|$)/i.test(video)) return { type: 'video', src: video, label: host };
  if (video && youtubeId(video)) return resolveUrl(video, t, depth + 1);
  const img = meta(doc, ['og:image', 'twitter:image']);
  if (img) return { ...(await resolveUrl(img, t, depth + 1)), label: host };
  throw new Error(t('err.noMedia'));
}

/** Read a picked/dropped file into the library. */
export function importFile(file, t) {
  return new Promise((resolve, reject) => {
    const e = extOf(file.name);
    const isImg = IMG_EXT.includes(e), isVid = VID_EXT.includes(e);
    if (!isImg && !isVid) return reject(new Error(t('err.fileType')));
    if (file.size > MAX_FILE) return reject(new Error(t('err.fileSize')));
    const r = new FileReader();
    r.onload = async () => {
      try {
        const key = 'file:' + uid('f');
        await chrome.storage.local.set({ [key]: r.result });
        resolve(await addToLibrary({ type: isVid ? 'video' : 'image', fileKey: key, label: file.name, source: 'file' }));
      } catch (err) { reject(err); }
    };
    r.onerror = () => reject(new Error(t('err.fileRead')));
    r.readAsDataURL(file);
  });
}

// ---------- workshop ----------
export async function loadWorkshop() {
  let remote = [];
  let remoteOk = false;
  if (!WORKSHOP_CATALOG.includes('YOUR_GITHUB')) {
    try {
      const r = await fetch(WORKSHOP_CATALOG, { cache: 'no-cache' });
      const data = await r.json();
      const base = WORKSHOP_CATALOG.replace(/[^/]+$/, '');
      const abs = (p) => (!p ? p : /^https?:/.test(p) ? p : base + p.replace(/^\.\//, ''));
      remote = (data.items || []).map((i) => ({ ...i, src: i.type === 'youtube' ? i.src : abs(i.src), thumb: abs(i.thumb), remote: true }));
      remoteOk = true;
    } catch {}
  }
  return { items: [...remote, ...BUILTIN_WORKSHOP], remoteOk };
}

// ---------- export / import ----------
export async function exportAll() {
  const all = await chrome.storage.local.get(null);
  delete all.soundlog;
  return new Blob([JSON.stringify({ app: 'LobbyFX', version: 2, exported: new Date().toISOString(), data: all })], { type: 'application/json' });
}
export async function importAll(file, t) {
  const text = await file.text();
  let json;
  try { json = JSON.parse(text); } catch { throw new Error(t('err.badBackup')); }
  if (json?.app !== 'LobbyFX' || !json.data) throw new Error(t('err.badBackup'));
  await chrome.storage.local.clear();
  await chrome.storage.local.set(json.data);
}

// ---------- sounds by link (direct .mp3/.ogg/.wav or a myinstants.com page) ----------
const blobToDataUrl = (b) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(b); });
const decodeHtml = (s) => { const d = document.createElement('textarea'); d.innerHTML = s; return d.value; };
export async function resolveSoundUrl(url, t) {
  let u;
  try { u = new URL(url.trim()); } catch { throw new Error(t('err.soundUrl')); }
  if (!/^https?:$/.test(u.protocol)) throw new Error(t('err.soundUrl'));
  const origin = u.origin + '/*';
  if (!(await chrome.permissions.contains({ origins: [origin] }))) {
    const ok = await chrome.permissions.request({ origins: [origin] });
    if (!ok) throw new Error(t('err.noPermission'));
  }
  let audioUrl = u.href, label = fileName(u.href).replace(/\.[a-z0-9]+$/i, '');
  if (!SND_EXT.includes(extOf(u.href))) {
    // a page: look for the sound file in it (myinstants: /media/sounds/<name>.mp3)
    if (/myinstants\.com$/i.test(u.hostname) && !/\/instant\//.test(u.pathname)) throw new Error(t('err.pickSound'));
    let html;
    try { html = await (await fetch(u.href)).text(); } catch { throw new Error(t('err.cantOpen')); }
    const m = html.match(/["'(]((?:https?:)?\/?[^"'()\s]*\/media\/sounds\/[^"'()\s]+\.(?:mp3|ogg|wav|m4a))["')]/i)
      || html.match(/<meta[^>]+property=["']og:audio["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/["']([^"'\s]+\.(?:mp3|ogg|wav|m4a))["']/i);
    if (!m) throw new Error(t('err.noSound'));
    audioUrl = new URL(decodeHtml(m[1]), u.href).href;
    const tm = html.match(/<h1[^>]*>([^<]+)</i) || html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) || html.match(/<title>([^<]+)</i);
    label = tm ? decodeHtml(tm[1]).replace(/\s*[-|–]\s*Myinstants.*$/i, '').replace(/\s*-\s*Instant Sound.*$/i, '').trim() : fileName(audioUrl);
    const ao = new URL(audioUrl).origin + '/*';
    if (!(await chrome.permissions.contains({ origins: [ao] })) && !(await chrome.permissions.request({ origins: [ao] }))) throw new Error(t('err.noPermission'));
  }
  let blob;
  try { const r = await fetch(audioUrl); if (!r.ok) throw 0; blob = await r.blob(); } catch { throw new Error(t('err.cantOpen')); }
  if (blob.size > 5 * 1024 * 1024) throw new Error(t('err.soundSize'));
  if (blob.type && !/^audio\/|octet-stream/.test(blob.type)) throw new Error(t('err.noSound'));
  return { label: (label || 'sound').slice(0, 60), data: await blobToDataUrl(blob) };
}
