import * as S from './lib/store.js';
import { t, setLang, applyI18n, localTitle } from './lib/i18n.js';

const $ = (id) => document.getElementById(id);
let state = { settings: null, library: [], sounds: [], soundlog: [] };
let libFilter = 'all';
let wsTag = 'all';
let workshop = { items: [], remoteOk: false };

// ---------- helpers ----------
let toastTimer;
function toast(msg, error = false) {
  const el = $('toast');
  el.textContent = msg;
  el.className = 'toast' + (error ? ' error' : '');
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), error ? 6000 : 2600);
}
const svg = (d) => `<svg viewBox="0 0 24 24"><path d="${d}"/></svg>`;
const ICON = {
  star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z',
  trash: 'M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13',
  edit: 'M4 20h4L19 9l-4-4L4 16v4z M14 6l4 4',
  play: 'M7 5l12 7-12 7z',
  stop: 'M7 7h10v10H7z',
};
function mediaEl(pv) {
  if (!pv) return null;
  const el = document.createElement(pv.type === 'video' ? 'video' : 'img');
  if (pv.type === 'video') Object.assign(el, { muted: true, loop: true, autoplay: true, playsInline: true, preload: 'metadata' });
  el.src = pv.url;
  if (pv.fallback) el.onerror = () => { el.onerror = null; el.src = pv.fallback; };
  el.alt = '';
  el.loading = 'lazy';
  return el;
}
const pvCache = new Map();
function preview(item) {
  if (!item) return Promise.resolve(null);
  const k = item.id + '|' + (item.fileKey || item.src);
  if (!pvCache.has(k)) pvCache.set(k, S.previewOf(item));
  return pvCache.get(k);
}
const itemLabel = (i) => (i.title ? localTitle(i.title) : i.label) || '—';

async function refresh() {
  state = await S.getAll();
  setLang(state.settings.lang);
  applyI18n();
  renderAll();
}

// ---------- current bar ----------
async function renderCurrent() {
  const item = state.library.find((i) => i.id === state.settings.active);
  const box = $('curThumb');
  box.textContent = '';
  const m = mediaEl(await preview(item));
  if (m) box.appendChild(m);
  $('curLabel').textContent = item ? itemLabel(item) : t('none');
  $('enabled').checked = !!state.settings.enabled;
}

// ---------- library ----------
async function renderLibrary() {
  const q = $('libSearch').value.trim().toLowerCase();
  const items = state.library.filter((i) => {
    if (libFilter === 'fav' && !i.fav) return false;
    if (libFilter === 'file' && !i.fileKey) return false;
    if (libFilter === 'url' && (i.fileKey || i.workshopId)) return false;
    if (libFilter === 'workshop' && !i.workshopId) return false;
    if (q && !(itemLabel(i) + ' ' + (i.tags || []).join(' ')).toLowerCase().includes(q)) return false;
    return true;
  });
  const grid = $('libGrid');
  grid.textContent = '';
  $('libEmpty').hidden = state.library.length > 0;
  for (const i of items) grid.appendChild(await libCard(i));
  if (state.library.length && !items.length) {
    const p = document.createElement('p');
    p.className = 'hint';
    p.textContent = t('lib.noMatch');
    grid.appendChild(p);
  }
}

function startRename(card, i) {
  const span = card.querySelector('.meta span');
  span.contentEditable = 'plaintext-only';
  span.classList.add('editing');
  span.focus();
  document.getSelection().selectAllChildren(span);
  const done = async (save) => {
    span.contentEditable = 'false';
    span.classList.remove('editing');
    const v = span.textContent.trim();
    if (save && v && v !== itemLabel(i)) await S.updateItem(i.id, { label: v, title: null });
    else span.textContent = itemLabel(i);
  };
  span.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); span.blur(); } if (e.key === 'Escape') { done(false); } };
  span.onblur = () => done(true);
}

async function libCard(i) {
  const c = document.createElement('div');
  c.className = 'mcard' + (i.id === state.settings.active ? ' active' : '');
  const th = document.createElement('div');
  th.className = 'thumb';
  th.tabIndex = 0;
  th.title = t('lib.setActive');
  const m = mediaEl(await preview(i));
  if (m) th.appendChild(m); else th.innerHTML = `<div class="ph">${t('noPreview')}</div>`;
  const badge = { youtube: 'YouTube', video: t('kind.video'), image: (S.extOf(i.src || i.label) === 'gif' ? 'GIF' : t('kind.image')) }[i.type];
  th.insertAdjacentHTML('beforeend', `<span class="badge">${badge}</span>`);
  if (i.id === state.settings.active) th.insertAdjacentHTML('beforeend', `<span class="tag-active">${t('lib.active')}</span>`);
  const acts = document.createElement('div');
  acts.className = 'acts';
  const fav = document.createElement('button');
  fav.className = 'icon-btn' + (i.fav ? ' on' : '');
  fav.title = i.fav ? t('lib.unfav') : t('lib.fav');
  fav.setAttribute('aria-label', fav.title);
  fav.innerHTML = svg(ICON.star);
  fav.onclick = async (e) => { e.stopPropagation(); await S.updateItem(i.id, { fav: !i.fav }); };
  const del = document.createElement('button');
  del.className = 'icon-btn';
  del.title = t('lib.delete');
  del.setAttribute('aria-label', del.title);
  del.innerHTML = svg(ICON.trash);
  del.onclick = async (e) => { e.stopPropagation(); await S.removeItem(i.id); toast(t('lib.deleted')); };
  const ren = document.createElement('button');
  ren.className = 'icon-btn';
  ren.title = t('lib.rename');
  ren.setAttribute('aria-label', ren.title);
  ren.innerHTML = svg(ICON.edit);
  ren.onclick = (e) => { e.stopPropagation(); startRename(c, i); };
  acts.append(fav, ren, del);
  th.appendChild(acts);
  const choose = async () => { await S.setSettings({ active: i.id, enabled: true }); toast(t('applied')); };
  th.onclick = choose;
  th.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(); } };
  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.innerHTML = '<div class="txt"><span></span><small></small></div>';
  meta.querySelector('span').textContent = itemLabel(i);
  meta.querySelector('small').textContent = i.author ? t('ws.by', { a: i.author }) : i.type === 'youtube' ? 'YouTube' : '';
  c.append(th, meta);
  return c;
}

function renderLook() {
  $('dim').value = state.settings.dim;
  $('blur').value = state.settings.blur;
  $('dimOut').textContent = state.settings.dim + '%';
  $('blurOut').textContent = state.settings.blur + ' px';
}

function pageOptions() {
  return [['active', t('pages.useMain')], ['none', t('pages.none')], ...state.library.map((i) => [i.id, itemLabel(i)])];
}
function fillSelect(sel, opts, val) {
  sel.textContent = '';
  for (const [v, label] of opts) {
    const o = document.createElement('option');
    o.value = v;
    o.textContent = label;
    sel.appendChild(o);
  }
  sel.value = opts.some(([v]) => v === val) ? val : '';
}
function renderPages() {
  const opts = pageOptions();
  const box = $('pages');
  box.textContent = '';
  for (const page of S.PAGES) {
    const row = document.createElement('label');
    const name = document.createElement('span');
    name.textContent = t('page.' + page);
    const sel = document.createElement('select');
    fillSelect(sel, opts, state.settings.pages[page] || 'none');
    sel.onchange = () => S.setSettings({ pages: { [page]: sel.value } });
    row.append(name, sel);
    box.appendChild(row);
  }
  const vals = new Set(S.PAGES.map((p) => state.settings.pages[p] || 'none'));
  fillSelect($('pagesAll'), [['', t('pages.mixed')], ...opts], vals.size === 1 ? [...vals][0] : '');
}

function renderRotation() {
  const r = state.settings.rotation;
  $('rotOn').checked = r.enabled;
  $('rotBox').classList.toggle('off', !r.enabled);
  $('rotMode').value = r.mode;
  $('rotMin').value = r.seconds;
  $('rotFade').value = r.fade;
  $('rotFadeOut').textContent = r.fade ? r.fade + ' s' : t('rot.instant');
  $('rotMinWrap').hidden = r.mode !== 'interval';
  $('rotPool').value = r.pool;
}

// ---------- workshop ----------
async function loadWorkshop() {
  workshop = await S.loadWorkshop();
  renderWorkshop();
}

function renderWorkshop() {
  const tags = [...new Set(workshop.items.flatMap((i) => i.tags || []))];
  const chips = $('wsTags');
  chips.textContent = '';
  for (const tg of ['all', ...tags]) {
    const b = document.createElement('button');
    b.textContent = tg === 'all' ? t('f.all') : '#' + tg;
    b.className = tg === wsTag ? 'on' : '';
    b.onclick = () => { wsTag = tg; renderWorkshop(); };
    chips.appendChild(b);
  }
  const q = $('wsSearch').value.trim().toLowerCase();
  const grid = $('wsGrid');
  grid.textContent = '';
  for (const w of workshop.items) {
    if (wsTag !== 'all' && !(w.tags || []).includes(wsTag)) continue;
    if (q && !(localTitle(w.title) + ' ' + (w.tags || []).join(' ')).toLowerCase().includes(q)) continue;
    const inLib = state.library.find((i) => i.workshopId === w.id);
    const c = document.createElement('div');
    c.className = 'mcard' + (inLib && inLib.id === state.settings.active ? ' active' : '');
    const th = document.createElement('div');
    th.className = 'thumb';
    const pv = w.type === 'youtube'
      ? { type: 'image', url: S.resolveExt(w.thumb || `https://i.ytimg.com/vi/${w.src}/hqdefault.jpg`) }
      : { type: w.thumb ? 'image' : w.type, url: S.resolveExt(w.thumb || w.src) };
    const img = mediaEl(pv);
    th.appendChild(img);
    th.insertAdjacentHTML('beforeend', `<span class="badge">${w.type === 'youtube' ? 'YouTube' : w.remote ? t('ws.community') : 'LobbyFX'}</span>`);
    const meta = document.createElement('div');
    meta.className = 'meta';
    const name = document.createElement('div');
    name.className = 'txt';
    name.innerHTML = '<span></span><small></small>';
    name.firstChild.textContent = localTitle(w.title);
    name.lastChild.textContent = w.author ? t('ws.by', { a: w.author }) : '';
    const btn = document.createElement('button');
    btn.className = 'btn small' + (inLib ? '' : ' primary');
    btn.textContent = inLib ? t('ws.use') : t('ws.add');
    btn.onclick = async () => {
      await S.addToLibrary({ type: w.type, src: w.src, thumb: w.thumb, title: w.title, author: w.author, label: localTitle(w.title), workshopId: w.id, tags: w.tags || [], source: 'workshop' });
      toast(t('ws.added'));
    };
    th.onclick = () => btn.click();
    meta.append(name, btn);
    c.append(th, meta);
    grid.appendChild(c);
  }
  $('wsNote').hidden = workshop.remoteOk;
  $('wsNote').textContent = t('ws.note');
}

// ---------- themes ----------
function renderThemes() {
  const grid = $('themeGrid');
  grid.textContent = '';
  for (const th of S.THEMES) {
    const active = state.settings.theme === th.id;
    const c = document.createElement('div');
    c.className = 'theme' + (active ? ' active' : '');
    c.innerHTML = `<div class="sw">${th.colors.map((col) => `<span style="background:${col}"></span>`).join('')}</div>
      <div class="body"><b></b><p></p><button class="btn small ${active ? '' : 'primary'}" type="button"></button></div>`;
    c.querySelector('b').textContent = t(`th.${th.id}`);
    c.querySelector('p').textContent = t(`th.${th.id}.d`);
    const b = c.querySelector('button');
    b.textContent = active ? t('th.active') : t('th.apply');
    b.disabled = active;
    b.onclick = async () => { await S.setSettings({ theme: th.id }); toast(t('applied')); };
    grid.appendChild(c);
  }
}

// ---------- sounds ----------
let playing = null;
function playUrl(url, btn) {
  if (playing) { playing.audio.pause(); playing.btn.innerHTML = svg(ICON.play); if (playing.btn === btn) { playing = null; return; } }
  const a = new Audio(url);
  a.volume = state.settings.sound.volume / 100;
  a.play().catch(() => toast(t('snd.cantPlay'), true));
  btn.innerHTML = svg(ICON.stop);
  a.onended = () => { btn.innerHTML = svg(ICON.play); playing = null; };
  playing = { audio: a, btn };
}
async function soundUrl(s) {
  if (s.id.startsWith('builtin:')) return chrome.runtime.getURL(`sounds/${s.id.slice(8)}.wav`);
  if (s.fileKey) return (await chrome.storage.local.get(s.fileKey))[s.fileKey];
  return s.src;
}

function renderSounds() {
  const snd = state.settings.sound;
  $('sndOn').checked = snd.enabled;
  $('vol').value = snd.volume;
  $('volOut').textContent = snd.volume + '%';
  const list = $('soundList');
  list.textContent = '';
  const all = [...S.BUILTIN_SOUNDS.map((s) => ({ ...s, label: localTitle(s.title) })), ...state.sounds];
  for (const s of all) {
    const row = document.createElement('label');
    row.className = 'snd' + (snd.id === s.id ? ' on' : '');
    row.innerHTML = `<input type="radio" name="snd"><span></span>`;
    row.querySelector('input').checked = snd.id === s.id;
    row.querySelector('input').onchange = () => S.setSettings({ sound: { id: s.id } });
    row.querySelector('span').textContent = s.label;
    const play = document.createElement('button');
    play.type = 'button';
    play.className = 'icon-btn';
    play.title = t('snd.preview');
    play.setAttribute('aria-label', play.title);
    play.innerHTML = svg(ICON.play);
    play.onclick = async (e) => { e.preventDefault(); playUrl(await soundUrl(s), play); };
    row.appendChild(play);
    if (!s.id.startsWith('builtin:')) {
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'icon-btn';
      del.title = t('lib.delete');
      del.setAttribute('aria-label', del.title);
      del.innerHTML = svg(ICON.trash);
      del.onclick = async (e) => {
        e.preventDefault();
        if (s.fileKey) await chrome.storage.local.remove(s.fileKey);
        await chrome.storage.local.set({ sounds: state.sounds.filter((x) => x.id !== s.id) });
        if (snd.id === s.id) await S.setSettings({ sound: { id: 'builtin:chime' } });
      };
      row.appendChild(del);
    }
    list.appendChild(row);
  }

  const trig = $('trigger');
  trig.className = 'trigger' + (snd.trigger ? '' : ' none');
  trig.textContent = snd.trigger ? S.fileName(snd.trigger) : t('snd.noTrigger');

  const log = $('sndLog');
  log.textContent = '';
  if (!state.soundlog.length) {
    log.innerHTML = `<p class="hint">${t('snd.logEmpty')}</p>`;
    return;
  }
  for (const e of state.soundlog) {
    const r = document.createElement('div');
    r.className = 'row' + (e.src === snd.trigger ? ' sel' : '');
    const name = document.createElement('span');
    name.textContent = S.fileName(e.src);
    name.title = e.src;
    const when = document.createElement('small');
    when.textContent = ago(e.t);
    const play = document.createElement('button');
    play.className = 'icon-btn';
    play.title = t('snd.preview');
    play.setAttribute('aria-label', play.title);
    play.innerHTML = svg(ICON.play);
    play.onclick = () => playUrl(e.src, play);
    const pick = document.createElement('button');
    pick.className = 'btn small' + (e.src === snd.trigger ? '' : ' primary');
    pick.textContent = e.src === snd.trigger ? t('snd.chosen') : t('snd.thisOne');
    pick.disabled = e.src === snd.trigger;
    pick.onclick = async () => { await S.setSettings({ sound: { trigger: e.src, enabled: true } }); toast(t('snd.saved')); };
    r.append(play, name, when, pick);
    log.appendChild(r);
  }
}
function ago(ts) {
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return t('time.now');
  if (m < 60) return t('time.min', { n: m });
  const h = Math.round(m / 60);
  if (h < 24) return t('time.h', { n: h });
  return new Date(ts).toLocaleDateString();
}


// ---------- interface ----------
function renderUi() {
  const u = state.settings.ui;
  const box = $('accents');
  box.textContent = '';
  for (const c of S.ACCENTS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'acc' + (u.accent === c ? ' on' : '');
    b.style.background = c;
    b.title = c;
    b.setAttribute('aria-label', c);
    b.onclick = () => S.setSettings({ ui: { accent: c } });
    box.appendChild(b);
  }
  const pick = document.createElement('label');
  pick.className = 'acc custom' + (u.accent && !S.ACCENTS.includes(u.accent) ? ' on' : '');
  pick.title = t('ui.custom');
  pick.innerHTML = '<input type="color">+';
  const inp = pick.querySelector('input');
  inp.value = u.accent || '#ff5500';
  inp.onchange = () => S.setSettings({ ui: { accent: inp.value } });
  if (u.accent && !S.ACCENTS.includes(u.accent)) pick.style.background = u.accent;
  box.appendChild(pick);
  $('accReset').disabled = !u.accent;
  if (document.activeElement !== $('playText')) $('playText').value = u.playText || '';

  const list = $('hideList');
  list.textContent = '';
  for (const k of S.HIDE_KEYS) {
    const row = document.createElement('label');
    row.className = 'switch';
    row.innerHTML = '<input type="checkbox"><span class="track"><span class="thumb"></span></span><span></span>';
    row.lastChild.textContent = t('hide.' + k);
    const cb = row.querySelector('input');
    cb.checked = !!u.hide[k];
    cb.onchange = () => S.setSettings({ ui: { hide: { [k]: cb.checked } } });
    list.appendChild(row);
  }
}

// ---------- auto-accept ----------
function renderAccept() {
  const a = state.settings.autoAccept;
  $('aaOn').checked = a.enabled;
  $('aaMin').value = a.delayMin;
  $('aaMax').value = a.delayMax;
  $('aaIdle').value = a.idleMin;
  $('aaNotify').checked = a.notify;
  const log = $('aaLog');
  log.textContent = '';
  const rows = state.acceptlog.slice(0, 5);
  if (!rows.length) log.innerHTML = `<p class="hint">${t('aa.logEmpty')}</p>`;
  for (const e of rows) {
    const r = document.createElement('div');
    r.className = 'row';
    const what = document.createElement('span');
    what.textContent = e.ok ? t('aa.ok', { s: (e.delay / 1000).toFixed(1) }) : t('aa.skip.' + (e.why || 'gone'));
    const when = document.createElement('small');
    when.textContent = ago(e.t);
    r.append(what, when);
    log.appendChild(r);
  }
  if (state.acceptDebug && state.acceptDebug.t > (rows[0]?.t || 0)) {
    const r = document.createElement('div');
    r.className = 'row';
    const what = document.createElement('span');
    what.textContent = t('aa.debug');
    const b = document.createElement('button');
    b.className = 'btn small';
    b.textContent = t('aa.debugSave');
    b.onclick = () => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(state.acceptDebug, null, 1)], { type: 'application/json' }));
      a.download = 'lobbyfx-accept-debug.json';
      a.click();
    };
    r.append(what, b);
    log.appendChild(r);
  }
}

// ---------- render all ----------
async function renderAll() {
  $('lang').value = state.settings.lang;
  await renderCurrent();
  renderLook();
  renderPages();
  renderRotation();
  await renderLibrary();
  renderWorkshop();
  renderThemes();
  renderSounds();
  renderUi();
  renderAccept();
  $('version').textContent = t('set.version', { v: chrome.runtime.getManifest().version });
}

// ---------- tabs ----------
function showTab(name) {
  document.querySelectorAll('.tab').forEach((s) => (s.hidden = s.id !== 'tab-' + name));
  document.querySelectorAll('#nav button').forEach((b) => b.classList.toggle('on', b.dataset.tab === name));
  history.replaceState(null, '', '#' + name);
}
document.querySelectorAll('#nav button').forEach((b) => (b.onclick = () => showTab(b.dataset.tab)));
document.querySelectorAll('[data-goto]').forEach((b) => (b.onclick = () => showTab(b.dataset.goto)));

// ---------- events: library ----------
$('urlForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const url = $('url').value.trim();
  if (!/^https?:\/\//i.test(url)) return toast(t('err.https'), true);
  const btn = $('urlBtn');
  btn.disabled = true;
  btn.textContent = t('searching');
  try {
    const r = await S.resolveUrl(url, t);
    await S.addToLibrary({ ...r, source: 'url', input: url });
    $('url').value = '';
    toast(t('applied'));
  } catch (err) { toast(err.message, true); }
  finally { btn.disabled = false; btn.textContent = t('apply'); }
});

$('drop').onclick = () => $('file').click();
$('file').onchange = async function () { await addFiles([...this.files]); this.value = ''; };
async function addFiles(files) {
  for (const f of files) {
    try { await S.importFile(f, t); toast(t('applied')); } catch (err) { toast(err.message, true); }
  }
}
['dragenter', 'dragover'].forEach((ev) => document.addEventListener(ev, (e) => { e.preventDefault(); $('drop').classList.add('over'); }));
document.addEventListener('dragleave', (e) => { if (!e.relatedTarget) $('drop').classList.remove('over'); });
document.addEventListener('drop', async (e) => {
  e.preventDefault();
  $('drop').classList.remove('over');
  const files = [...(e.dataTransfer?.files || [])];
  if (files.length) {
    if (!$('tab-sounds').hidden) return addSoundFile(files[0]);
    showTab('library');
    return addFiles(files);
  }
  const text = e.dataTransfer?.getData('text/uri-list') || e.dataTransfer?.getData('text/plain');
  if (text) { showTab('library'); $('url').value = text.split('\n')[0]; $('urlForm').requestSubmit(); }
});

$('libSearch').oninput = renderLibrary;
document.querySelectorAll('#libFilter button').forEach((b) => (b.onclick = () => {
  libFilter = b.dataset.f;
  document.querySelectorAll('#libFilter button').forEach((x) => x.classList.toggle('on', x === b));
  renderLibrary();
}));

let lookTimer;
function pushLook() {
  $('dimOut').textContent = $('dim').value + '%';
  $('blurOut').textContent = $('blur').value + ' px';
  clearTimeout(lookTimer);
  lookTimer = setTimeout(() => S.setSettings({ dim: +$('dim').value, blur: +$('blur').value }), 150);
}
$('dim').oninput = pushLook;
$('blur').oninput = pushLook;
$('enabled').onchange = () => S.setSettings({ enabled: $('enabled').checked });
$('pagesAll').onchange = () => {
  const v = $('pagesAll').value;
  if (v) S.setSettings({ pages: Object.fromEntries(S.PAGES.map((p) => [p, v])) });
};
$('rotOn').onchange = () => S.setSettings({ rotation: { enabled: $('rotOn').checked } });
$('rotMode').onchange = () => S.setSettings({ rotation: { mode: $('rotMode').value } });
$('rotMin').onchange = () => S.setSettings({ rotation: { seconds: Math.min(3600, Math.max(3, Math.round(+$('rotMin').value) || 30)) } });
$('rotFade').oninput = () => { const v = +$('rotFade').value; $('rotFadeOut').textContent = v ? v + ' s' : t('rot.instant'); };
$('rotFade').onchange = () => S.setSettings({ rotation: { fade: +$('rotFade').value } });
$('rotPool').onchange = () => S.setSettings({ rotation: { pool: $('rotPool').value } });

// ---------- events: workshop ----------
$('wsSearch').oninput = renderWorkshop;

// ---------- events: sounds ----------
$('sndOn').onchange = () => {
  S.setSettings({ sound: { enabled: $('sndOn').checked } });
  if ($('sndOn').checked && !state.settings.sound.trigger) toast(t('snd.needTrigger'));
};
$('vol').oninput = () => { $('volOut').textContent = $('vol').value + '%'; };
$('vol').onchange = () => S.setSettings({ sound: { volume: +$('vol').value } });
$('sndFileBtn').onclick = () => $('sndFile').click();
$('sndFile').onchange = async function () { await addSoundFile(this.files[0]); this.value = ''; };
$('sndUrlForm').onsubmit = async (e) => {
  e.preventDefault();
  const url = $('sndUrl').value.trim();
  if (!url) return;
  const btn = $('sndUrlBtn');
  btn.disabled = true;
  try {
    const { label, data } = await S.resolveSoundUrl(url, t);
    const id = S.uid('s');
    const key = 'file:' + id;
    await chrome.storage.local.set({ [key]: data, sounds: [...state.sounds, { id, label, fileKey: key, from: url }] });
    await S.setSettings({ sound: { id } });
    $('sndUrl').value = '';
    toast(t('snd.added'));
  } catch (err) { toast(err.message, true); }
  btn.disabled = false;
};
async function addSoundFile(f) {
  if (!f) return;
  if (!S.SND_EXT.includes(S.extOf(f.name))) return toast(t('err.soundType'), true);
  if (f.size > 5 * 1024 * 1024) return toast(t('err.soundSize'), true);
  const data = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });
  const id = S.uid('s');
  const key = 'file:' + id;
  await chrome.storage.local.set({ [key]: data, sounds: [...state.sounds, { id, label: f.name, fileKey: key }] });
  await S.setSettings({ sound: { id } });
  toast(t('snd.added'));
}

// ---------- events: interface / auto-accept ----------
$('accReset').onclick = () => S.setSettings({ ui: { accent: '' } });
$('playSave').onclick = async () => { await S.setSettings({ ui: { playText: $('playText').value.trim().slice(0, 40) } }); toast(t('ui.saved')); };
$('playText').onkeydown = (e) => { if (e.key === 'Enter') $('playSave').click(); };
$('aaOn').onchange = () => {
  S.setSettings({ autoAccept: { enabled: $('aaOn').checked } });
  if ($('aaOn').checked && !state.settings.sound.trigger) toast(t('aa.tip'));
};
const num = (id, lo, hi) => Math.min(hi, Math.max(lo, +$(id).value || 0));
$('aaMin').onchange = $('aaMax').onchange = () => {
  const a = num('aaMin', 0, 15), b = num('aaMax', 0, 15);
  S.setSettings({ autoAccept: { delayMin: Math.min(a, b), delayMax: Math.max(a, b) } });
};
$('aaIdle').onchange = () => S.setSettings({ autoAccept: { idleMin: Math.round(num('aaIdle', 0, 60)) } });
$('aaNotify').onchange = () => S.setSettings({ autoAccept: { notify: $('aaNotify').checked } });

// ---------- events: settings ----------
$('lang').onchange = () => S.setSettings({ lang: $('lang').value });
$('exportBtn').onclick = async () => {
  const blob = await S.exportAll();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `lobbyfx-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
};
$('importBtn').onclick = () => $('importFile').click();
$('importFile').onchange = async function () {
  const f = this.files[0];
  this.value = '';
  if (!f) return;
  try { await S.importAll(f, t); toast(t('set.imported')); } catch (err) { toast(err.message, true); }
};
$('resetBtn').onclick = () => { $('resetConfirm').hidden = false; };
$('resetConfirm').onclick = async () => {
  await chrome.storage.local.clear();
  $('resetConfirm').hidden = true;
  toast(t('set.wasReset'));
};

$('openFaceit').onclick = async () => {
  const [tab] = await chrome.tabs.query({ url: 'https://www.faceit.com/*' });
  if (tab) { await chrome.tabs.update(tab.id, { active: true }); await chrome.windows.update(tab.windowId, { focused: true }); }
  else chrome.tabs.create({ url: 'https://www.faceit.com/uk/matchmaking' });
};

// ---------- live updates ----------
let rt;
chrome.storage.onChanged.addListener((ch, area) => {
  if (area !== 'local') return;
  clearTimeout(rt);
  rt = setTimeout(refresh, 60);
});

// ---------- start ----------
const start = location.hash.slice(1);
if (['library', 'workshop', 'themes', 'ui', 'sounds', 'settings'].includes(start)) showTab(start);
await refresh();
loadWorkshop();
