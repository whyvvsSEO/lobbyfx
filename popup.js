import * as S from './lib/store.js';
import { t, setLang, applyI18n, localTitle } from './lib/i18n.js';

const $ = (id) => document.getElementById(id);
let state;
let heroKey = '';

function mediaEl(pv) {
  if (!pv) return null;
  const el = document.createElement(pv.type === 'video' ? 'video' : 'img');
  if (pv.type === 'video') Object.assign(el, { muted: true, loop: true, autoplay: true, playsInline: true });
  el.src = pv.url;
  if (pv.fallback) el.onerror = () => { el.onerror = null; el.src = pv.fallback; };
  el.alt = '';
  return el;
}
const label = (i) => (i.title ? localTitle(i.title) : i.label) || '—';

async function render() {
  state = await S.getAll();
  setLang(state.settings.lang);
  applyI18n();
  const s = state.settings;
  const item = state.library.find((i) => i.id === s.active);

  const hero = $('hero');
  const key = item ? item.id : '';
  if (key !== heroKey) {
    heroKey = key;
    [...hero.children].forEach((c) => c.id !== 'heroDim' && c.remove());
    const m = mediaEl(await S.previewOf(item));
    if (m) hero.prepend(m);
    else hero.insertAdjacentHTML('beforeend', `<div class="empty">${t('lib.emptyHint')}</div>`);
  }
  hero.classList.toggle('off', !s.enabled);
  $('heroDim').style.opacity = s.dim / 100;
  $('label').textContent = item ? label(item) : t('none');
  $('enabled').checked = !!s.enabled;
  $('enabled').disabled = !item;
  $('dim').value = s.dim;
  $('dimOut').textContent = s.dim + '%';

  const favs = state.library.filter((i) => i.fav).slice(0, 8);
  const box = $('favs');
  box.textContent = '';
  for (const f of favs) {
    const b = document.createElement('button');
    b.className = 'fav' + (f.id === s.active ? ' on' : '');
    b.title = label(f);
    b.setAttribute('aria-label', label(f));
    const m = mediaEl(await S.previewOf(f));
    if (m) b.appendChild(m);
    b.onclick = () => S.setSettings({ active: f.id, enabled: true });
    box.appendChild(b);
  }
  $('noFavs').hidden = favs.length > 0;

  const sel = $('theme');
  sel.textContent = '';
  for (const th of S.THEMES) {
    const o = document.createElement('option');
    o.value = th.id;
    o.textContent = t('th.' + th.id);
    sel.appendChild(o);
  }
  sel.value = s.theme;

  let tabs = [];
  try { tabs = await chrome.tabs.query({ url: 'https://www.faceit.com/*' }); } catch {}
  const st = $('status');
  if (!tabs.length) { st.dataset.s = ''; st.querySelector('span').textContent = t('pop.statusClosed'); }
  else if (s.enabled && item) { st.dataset.s = 'on'; st.querySelector('span').textContent = t('pop.statusOn'); }
  else { st.dataset.s = 'idle'; st.querySelector('span').textContent = t('pop.statusOff'); }
}

$('enabled').onchange = () => S.setSettings({ enabled: $('enabled').checked });
let dt;
$('dim').oninput = () => {
  $('dimOut').textContent = $('dim').value + '%';
  $('heroDim').style.opacity = $('dim').value / 100;
  clearTimeout(dt);
  dt = setTimeout(() => S.setSettings({ dim: +$('dim').value }), 120);
};
$('theme').onchange = () => S.setSettings({ theme: $('theme').value });
$('openApp').onclick = () => { chrome.runtime.openOptionsPage(); window.close(); };
$('openFaceit').onclick = async () => {
  const [tab] = await chrome.tabs.query({ url: 'https://www.faceit.com/*' });
  if (tab) { await chrome.tabs.update(tab.id, { active: true }); await chrome.windows.update(tab.windowId, { focused: true }); }
  else await chrome.tabs.create({ url: 'https://www.faceit.com/uk/matchmaking' });
  window.close();
};

chrome.storage.onChanged.addListener((c, area) => { if (area === 'local' && (c.settings || c.library)) render(); });
render();
