/*
 * LobbyFX content script (isolated world) — runs on faceit.com.
 *  1. Background: picks the right library item for the current page (per-page rules,
 *     rotation) and draws it under the FACEIT UI.
 *  2. Themes: tags FACEIT elements by their real colours/sizes and restyles them.
 *  3. Sounds: passes the custom match-found sound to hook.js (page world) and
 *     records which sounds FACEIT plays, so the user can pick the trigger.
 */
(() => {
  // ======================================================================
  // State
  // ======================================================================
  let settings = null;
  let library = [];
  let rotationPick = null;     // item id chosen by rotation for this tab
  let rotationTimer = null;
  let lastCategory = null;

  const ext = (p) => chrome.runtime.getURL(p);

  // FACEIT page -> category used by the per-page background rules
  const PAGE_RULES = [
    ['matchroom', /\/room\//],
    ['history', /\/players\/[^/]+\/[^/]+\/history/],
    ['stats', /\/players\/[^/]+\/(?!friends|videos|guestbook|inventory|clubs|teams)[a-z0-9_]+(\/(matchmaking|leagues|tournaments|stats))?\/?$/],
    ['profile', /\/players\//],
    ['lobby', /\/matchmaking/],
    ['play', /\/play\/?$/],
    ['home', /\/home\/?$/],
    ['parties', /\/parties/],
    ['rank', /\/(rank|ladders|leaderboard)/],
    ['track', /\/track/],
    ['feed', /\/social-feed|\/feed/],
    ['missions', /\/missions/],
    ['shop', /\/shop|\/subscriptions/],
    ['clubs', /\/clubs?\b|\/create-club|\/hub/],
    ['competitions', /\/(tournaments?|championships?|league|esea)/],
    ['settings', /\/settings/],
  ];
  function category() {
    const p = location.pathname;
    for (const [name, re] of PAGE_RULES) if (re.test(p)) return name;
    return 'other';
  }

  // ======================================================================
  // 1. Background engine
  // ======================================================================
  const STYLE_ID = 'lfx-style';
  const LAYER_ID = 'lfx-layer';
  let cur = { on: false, type: null, src: '', dim: 0, blur: 0 };
  let mediaKey = '';
  let layer = null, media = null, dimEl = null;
  const blobCache = new Map(); // fileKey -> blob: URL

  const bgCss = `
    html.lfx-on [class*="styles__CanvasHolder"]{ background:#000 !important; }
    html.lfx-on [class*="Matchmaking__Background-"]{ display:none !important; }
    html.lfx-on #canvas-wrapper{ position:relative; z-index:1; }
    #${LAYER_ID}{ position:absolute; inset:0; overflow:hidden; pointer-events:none; z-index:0; display:none; }
    html.lfx-on #${LAYER_ID}{ display:block; }
    #${LAYER_ID} .lfx-media{ position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); border:0; }
    #${LAYER_ID} .lfx-img{ position:absolute; inset:0; background:center/cover no-repeat; }
    #${LAYER_ID} video.lfx-media{ min-width:100%; min-height:100%; width:auto; height:auto; object-fit:cover; }
    #${LAYER_ID} .lfx-dim{ position:absolute; inset:0; }
  `;

  function ensureStyle(id, text) {
    let s = document.getElementById(id);
    if (!s) {
      s = document.createElement('style');
      s.id = id;
      (document.head || document.documentElement).appendChild(s);
    }
    if (s.textContent !== text) s.textContent = text;
  }

  const holder = () => document.querySelector('[class*="styles__CanvasHolder"]');

  function sizeIframe() {
    if (!media || media.tagName !== 'IFRAME' || !layer) return;
    const { width: w, height: h } = layer.getBoundingClientRect();
    const k = Math.max(w / 16, h / 9);
    media.style.width = Math.ceil(k * 16) + 'px';
    media.style.height = Math.ceil(k * 9) + 'px';
  }

  // Crossfade: the new background fades in over the old one once it is ready to show
  let swapToken = 0;
  function buildMedia() {
    const old = media;
    const token = ++swapToken;
    // drop anything left over from an unfinished earlier fade
    [...layer.children].forEach((c) => { if (c !== dimEl && c !== old) c.remove(); });
    const { type, src } = cur;
    let el = null;
    if (type === 'image') {
      el = document.createElement('div');
      el.className = 'lfx-img';
      el.style.backgroundImage = `url("${src.replace(/"/g, '%22')}")`;
    } else if (type === 'video') {
      el = document.createElement('video');
      el.className = 'lfx-media';
      Object.assign(el, { src, autoplay: true, loop: true, muted: true, playsInline: true });
      el.setAttribute('muted', '');
      el.play().catch(() => {});
    } else if (type === 'youtube') {
      const id = encodeURIComponent(src);
      el = document.createElement('iframe');
      el.className = 'lfx-media';
      el.allow = 'autoplay; encrypted-media';
      el.src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&mute=1&loop=1&playlist=${id}` +
        '&controls=0&disablekb=1&modestbranding=1&playsinline=1&rel=0&iv_load_policy=3&fs=0';
    }
    media = el;
    if (!el) { old?.remove(); return; }
    const fade = Math.max(0, +(settings?.rotation?.fade ?? 1));
    el.style.transition = `opacity ${fade}s ease`;
    el.style.opacity = old && fade ? '0' : '1';
    layer.insertBefore(el, dimEl);
    sizeIframe();
    if (!old) return;
    if (!fade) { old.remove(); return; }
    let shown = false;
    const show = () => {
      if (shown || token !== swapToken) return;
      shown = true;
      void el.offsetWidth; // make sure the transparent state is painted first
      requestAnimationFrame(() => requestAnimationFrame(() => { el.style.opacity = '1'; }));
      setTimeout(() => old.remove(), fade * 1000 + 150);
    };
    if (type === 'image') { const img = new Image(); img.onload = img.onerror = show; img.src = src; }
    else if (type === 'video') { el.addEventListener('playing', show, { once: true }); el.addEventListener('error', show, { once: true }); }
    else el.addEventListener('load', () => setTimeout(show, 900), { once: true }); // YouTube needs a moment after load
    setTimeout(show, 5000); // never get stuck on the old background
  }

  function ensureLayer() {
    const h = holder();
    if (!h) return;
    if (!layer) {
      layer = document.createElement('div');
      layer.id = LAYER_ID;
      dimEl = document.createElement('div');
      dimEl.className = 'lfx-dim';
      layer.appendChild(dimEl);
      new ResizeObserver(sizeIframe).observe(layer);
    }
    if (layer.parentElement !== h) {
      if (getComputedStyle(h).position === 'static') h.style.position = 'relative';
      h.prepend(layer);
      sizeIframe();
    }
    const key = cur.type + '|' + cur.src;
    if (key !== mediaKey) { mediaKey = key; buildMedia(); }
    dimEl.style.background = `rgba(0,0,0,${cur.dim / 100})`;
    if (media) {
      const b = cur.blur;
      media.style.filter = b ? `blur(${b}px)` : '';
      const base = media.tagName === 'DIV' ? '' : 'translate(-50%,-50%) ';
      media.style.transform = base + (b ? `scale(${1 + b / 100 + 0.04})` : '');
    }
  }

  function paint() {
    document.documentElement.classList.toggle('lfx-on', cur.on);
    if (!cur.on) return;
    ensureStyle(STYLE_ID, bgCss);
    ensureLayer();
    if (media && media.tagName === 'VIDEO' && media.paused) media.play().catch(() => {});
  }

  async function resolveItem(item) {
    if (!item) return null;
    if (item.type === 'youtube') return { type: 'youtube', src: item.src };
    if (item.fileKey) {
      if (!blobCache.has(item.fileKey)) {
        const got = await chrome.storage.local.get(item.fileKey);
        if (!got[item.fileKey]) return null;
        const blob = await (await fetch(got[item.fileKey])).blob();
        blobCache.set(item.fileKey, URL.createObjectURL(blob));
      }
      return { type: item.type, src: blobCache.get(item.fileKey) };
    }
    const src = item.src?.startsWith('ext:') ? ext(item.src.slice(4)) : item.src;
    return src ? { type: item.type, src } : null;
  }

  function rotationPool() {
    const favs = library.filter((i) => i.fav);
    const pool = settings.rotation.pool === 'fav' && favs.length ? favs : library;
    return pool;
  }

  function pickRotation() {
    const pool = rotationPool();
    if (!pool.length) { rotationPick = null; return; }
    let next = pool[Math.floor(Math.random() * pool.length)];
    if (pool.length > 1 && next.id === rotationPick) next = pool[(pool.indexOf(next) + 1) % pool.length];
    rotationPick = next.id;
  }

  function setupRotation() {
    clearInterval(rotationTimer);
    rotationTimer = null;
    const r = settings.rotation;
    if (!r.enabled) return;
    if (!rotationPick) pickRotation();
    if (r.mode === 'interval') {
      rotationTimer = setInterval(() => { pickRotation(); update(); }, Math.max(3, +r.seconds || 30) * 1000);
    }
  }

  async function update() {
    if (!settings) return;
    const cat = category();
    // "visit" rotation: new background every time you come back to the lobby
    if (settings.rotation.enabled && settings.rotation.mode === 'visit' && cat === 'lobby' && lastCategory && lastCategory !== 'lobby') pickRotation();
    lastCategory = cat;

    const rule = settings.pages[cat] || 'none';
    let itemId = null;
    if (rule === 'active') itemId = settings.rotation.enabled && rotationPick ? rotationPick : settings.active;
    else if (rule !== 'none') itemId = rule;

    const item = library.find((i) => i.id === itemId);
    const res = settings.enabled ? await resolveItem(item) : null;
    cur = res
      ? { on: true, type: res.type, src: res.src, dim: +settings.dim || 0, blur: +settings.blur || 0 }
      : { ...cur, on: false };
    paint();
    applyTheme();
    applyUi();
    sendSoundConfig();
  }

  // ======================================================================
  // 2. Themes (element classifier + per-theme CSS)
  // ======================================================================
  const THEME_STYLE = 'lfx-theme';
  let classifierOn = false, mo = null, fullTimer = null;

  function pixelTile(size, palette, seed, draw) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    let s = seed;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      g.fillStyle = (draw && draw(x, y, rnd)) || palette[Math.floor(rnd() * palette.length)];
      g.fillRect(x, y, 1, 1);
    }
    return c.toDataURL();
  }
  let textures = null;
  function tex() {
    if (textures) return textures;
    textures = {
      stone: pixelTile(16, ['#2b2b2f', '#303035', '#26262a', '#36363b', '#2e2e33', '#232327'], 7),
      grass: pixelTile(16, ['#6b4a2f', '#5d3f27', '#795436', '#4f3520'], 11, (x, y, r) =>
        y < 3 + Math.floor(r() * 3) ? ['#5fa83a', '#4e9330', '#6dbd43', '#438228'][Math.floor(r() * 4)] : null),
    };
    return textures;
  }


  // ---------- original vector art for decorated themes ----------
  const svgUrl = (svg) => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  const ART = {
    catPeek: svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 60"><path d="M18 60 Q14 34 22 26 L16 2 L44 18 Q60 12 76 18 L104 2 L98 26 Q106 34 102 60Z" fill="#ffd9ea" stroke="#3a1d38" stroke-width="3.5" stroke-linejoin="round"/><path d="M22 8 L38 20 L27 25Z M98 8 L82 20 L93 25Z" fill="#ff9cc6"/><ellipse cx="44" cy="40" rx="6" ry="8" fill="#3a1d38"/><ellipse cx="76" cy="40" rx="6" ry="8" fill="#3a1d38"/><circle cx="46" cy="37" r="2.2" fill="#fff"/><circle cx="78" cy="37" r="2.2" fill="#fff"/><path d="M57 50 L63 50 L60 54Z" fill="#ff7fb3"/><ellipse cx="32" cy="52" rx="6" ry="3" fill="#ffb3d1" opacity=".8"/><ellipse cx="88" cy="52" rx="6" ry="3" fill="#ffb3d1" opacity=".8"/></svg>`),
    catFace: svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 84"><path d="M14 32 L10 4 L36 18 Q50 13 64 18 L90 4 L86 32 Q97 48 88 62 Q76 80 50 80 Q24 80 12 62 Q3 48 14 32Z" fill="#ffd9ea" stroke="#3a1d38" stroke-width="3" stroke-linejoin="round"/><path d="M16 12 L31 21 L21 27Z M84 12 L69 21 L79 27Z" fill="#ff9cc6"/><path d="M30 44 Q36 38 42 44" stroke="#3a1d38" stroke-width="3.5" fill="none" stroke-linecap="round"/><path d="M58 44 Q64 38 70 44" stroke="#3a1d38" stroke-width="3.5" fill="none" stroke-linecap="round"/><path d="M47 54 L53 54 L50 58Z" fill="#ff7fb3"/><path d="M50 58 Q46 64 42 61 M50 58 Q54 64 58 61" stroke="#3a1d38" stroke-width="2.5" fill="none" stroke-linecap="round"/><path d="M8 52 L28 55 M8 60 L28 59 M92 52 L72 55 M92 60 L72 59" stroke="#3a1d38" stroke-width="2" stroke-linecap="round"/><ellipse cx="26" cy="64" rx="6" ry="3.5" fill="#ffb3d1"/><ellipse cx="74" cy="64" rx="6" ry="3.5" fill="#ffb3d1"/></svg>`),
    paw: svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><g fill="#ffb3d1"><ellipse cx="20" cy="27" rx="9" ry="7.5"/><ellipse cx="8" cy="17" rx="4" ry="5"/><ellipse cx="16" cy="10" rx="4" ry="5"/><ellipse cx="25" cy="10" rx="4" ry="5"/><ellipse cx="32" cy="17" rx="4" ry="5"/></g></svg>`),
    pawsPattern: svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 260"><g fill="#ffb3d1" opacity=".55"><g transform="translate(30 40) rotate(-20)"><ellipse cx="12" cy="16" rx="6" ry="5"/><circle cx="4" cy="8" r="2.8"/><circle cx="9" cy="3" r="2.8"/><circle cx="15" cy="3" r="2.8"/><circle cx="20" cy="8" r="2.8"/></g><g transform="translate(170 120) rotate(25)"><ellipse cx="12" cy="16" rx="6" ry="5"/><circle cx="4" cy="8" r="2.8"/><circle cx="9" cy="3" r="2.8"/><circle cx="15" cy="3" r="2.8"/><circle cx="20" cy="8" r="2.8"/></g><path transform="translate(90 190) scale(.9)" d="M12 21 C-4 10 2 -2 12 6 C22 -2 28 10 12 21Z"/><path transform="translate(210 30) scale(.7)" d="M12 21 C-4 10 2 -2 12 6 C22 -2 28 10 12 21Z"/></g></svg>`),
    katana: svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 60"><defs><linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4f6f8"/><stop offset=".55" stop-color="#b9c0c8"/><stop offset="1" stop-color="#6d747d"/></linearGradient></defs><path d="M168 26 Q420 22 636 6 Q560 26 168 38Z" fill="url(#b)"/><path d="M180 33 Q300 31 420 26 Q520 21 600 13" stroke="#fff" stroke-width="1.4" fill="none" opacity=".7" stroke-dasharray="10 6"/><rect x="150" y="18" width="18" height="28" rx="4" fill="#c9a24a"/><rect x="146" y="22" width="26" height="20" rx="8" fill="#a3802f"/><rect x="16" y="24" width="132" height="16" rx="6" fill="#111"/><g fill="#c1121f">${Array.from({ length: 9 }, (_, i) => `<path d="M${24 + i * 14} 32 l7 -7 l7 7 l-7 7z"/>`).join('')}</g><rect x="8" y="22" width="12" height="20" rx="4" fill="#c9a24a"/></svg>`),
    sun: svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="46" fill="#c1121f"/></svg>`),
    petals: svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300"><g fill="#ffc2d6"><path transform="translate(40 30) rotate(20)" d="M0 0 C8 -10 20 -6 18 6 C16 16 4 18 0 10 C-2 6 -2 3 0 0Z" opacity=".85"/><path transform="translate(200 90) rotate(-35) scale(.8)" d="M0 0 C8 -10 20 -6 18 6 C16 16 4 18 0 10 C-2 6 -2 3 0 0Z" opacity=".7"/><path transform="translate(110 200) rotate(60) scale(1.1)" d="M0 0 C8 -10 20 -6 18 6 C16 16 4 18 0 10 C-2 6 -2 3 0 0Z" opacity=".6"/><path transform="translate(260 250) rotate(-10) scale(.7)" d="M0 0 C8 -10 20 -6 18 6 C16 16 4 18 0 10 C-2 6 -2 3 0 0Z" opacity=".8"/></g></svg>`),
    bunnyPeek: svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80"><path d="M38 44 Q30 6 40 2 Q52 0 50 40Z M82 44 Q90 6 80 2 Q68 0 70 40Z" fill="#fff6fb" stroke="#4a2c5a" stroke-width="3.5" stroke-linejoin="round"/><path d="M41 38 Q36 12 42 8 Q47 8 46 36Z M79 38 Q84 12 78 8 Q73 8 74 36Z" fill="#cdb4ff"/><path d="M14 80 Q14 40 60 38 Q106 40 106 80Z" fill="#fff6fb" stroke="#4a2c5a" stroke-width="3.5" stroke-linejoin="round"/><circle cx="44" cy="60" r="5" fill="#4a2c5a"/><circle cx="76" cy="60" r="5" fill="#4a2c5a"/><circle cx="45.5" cy="58" r="1.8" fill="#fff"/><circle cx="77.5" cy="58" r="1.8" fill="#fff"/><path d="M55 68 Q60 73 65 68" stroke="#4a2c5a" stroke-width="3" fill="none" stroke-linecap="round"/><ellipse cx="32" cy="70" rx="6" ry="3.5" fill="#a8f0d4"/><ellipse cx="88" cy="70" rx="6" ry="3.5" fill="#a8f0d4"/></svg>`),
    pawsTiny: svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 14 10"><g fill="#fff" opacity=".38"><ellipse cx="7" cy="6.6" rx="2.4" ry="2"/><circle cx="4" cy="4" r="1.1"/><circle cx="6" cy="2.6" r="1.1"/><circle cx="8" cy="2.6" r="1.1"/><circle cx="10" cy="4" r="1.1"/></g></svg>`),
    heart: svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 36"><path d="M20 34 C4 22 0 14 4 8 C8 1 17 2 20 9 C23 2 32 1 36 8 C40 14 36 22 20 34Z" fill="#a8f0d4" stroke="#4a2c5a" stroke-width="2.5" stroke-linejoin="round"/></svg>`),
    candyPattern: svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 280 280"><g opacity=".6"><path transform="translate(30 40) scale(.6)" d="M20 34 C4 22 0 14 4 8 C8 1 17 2 20 9 C23 2 32 1 36 8 C40 14 36 22 20 34Z" fill="#cdb4ff"/><path transform="translate(180 150) scale(.5)" d="M20 34 C4 22 0 14 4 8 C8 1 17 2 20 9 C23 2 32 1 36 8 C40 14 36 22 20 34Z" fill="#a8f0d4"/><path transform="translate(200 40)" d="M10 0 L12.5 7 L20 7.5 L14 12 L16 20 L10 15.5 L4 20 L6 12 L0 7.5 L7.5 7Z" fill="#ffe7a3"/><path transform="translate(70 190) scale(.8)" d="M10 0 L12.5 7 L20 7.5 L14 12 L16 20 L10 15.5 L4 20 L6 12 L0 7.5 L7.5 7Z" fill="#ffc6e0"/><path transform="translate(110 100)" d="M8 14 Q0 14 2 8 Q4 2 11 4 Q14 -2 21 1 Q27 3 26 9 Q32 10 30 15Z" fill="#fff6fb" opacity=".7"/><circle cx="250" cy="240" r="3" fill="#ffe7a3"/><circle cx="20" cy="250" r="2.5" fill="#cdb4ff"/><circle cx="150" cy="20" r="2.5" fill="#a8f0d4"/></g></svg>`),
  };

  const T = (name, body) => body.replace(/& /g, `html[data-lfx-theme="${name}"] `);
  const THEMES = {
    blockcraft: () => T('blockcraft', `
      @import url('https://fonts.googleapis.com/css2?family=Tiny5&display=swap');
      & body, & body *{ font-family:'Tiny5','Courier New',monospace !important; border-radius:0 !important; }
      & body{ text-shadow:2px 2px 0 rgba(0,0,0,.55); }
      & img{ image-rendering:auto !important; }
      & body, & [class*="styles__CanvasHolder"]{ background:url(${tex().stone}) 0 0/64px 64px repeat !important; image-rendering:pixelated; }
      & [data-bc="base"]{ background:linear-gradient(rgba(0,0,0,.3),rgba(0,0,0,.3)), url(${tex().stone}) 0 0/64px 64px repeat !important; }
      & [class*="LocalNavigationWrapper"]{ background:url(${tex().grass}) 0 0/64px 64px repeat-x, #4f3520 !important; border:3px solid #000 !important; box-shadow:none !important; }
      & [data-bc="panel"]{ background:rgba(30,30,34,.94) !important; border:3px solid #000 !important; box-shadow:inset 3px 3px 0 #4a4a50, inset -3px -3px 0 #141416 !important; }
      & [data-bc="slot"]{ background:#2a2a2e !important; border:2px solid #000 !important; box-shadow:inset 3px 3px 0 #141416, inset -3px -3px 0 #4a4a50 !important; }
      & [data-bc="tile"]{ background:rgba(42,42,46,.85) !important; border:3px solid #000 !important; box-shadow:inset 4px 4px 0 #141416, inset -4px -4px 0 #4a4a50 !important; }
      & [data-bc="tile"]:hover{ background:rgba(60,133,39,.35) !important; }
      & [data-bc="btn"]{ background:#6e6e74 !important; color:#fff !important; border:2px solid #000 !important; box-shadow:inset 3px 3px 0 #a5a5ab, inset -3px -3px 0 #3c3c40 !important; }
      & [data-bc="btn"]:hover{ background:#7f86b8 !important; }
      & [data-bc="btn-go"]{ background:#3c8527 !important; color:#fff !important; border:2px solid #000 !important; box-shadow:inset 3px 3px 0 #5fbf3a, inset -3px -3px 0 #24561a !important; }
      & [class*="ProgressBar__Progress"]{ background-color:#1b1b1e !important; box-shadow:0 0 0 2px #000 !important; }
      & [class*="ProgressBar__Progress"]::before{ background-image:linear-gradient(270deg,#7ee03a 0,rgba(126,224,58,.15) 100%) !important; }
      & [data-bc="xp"]{ background:linear-gradient(#c8ff7a,#7ee03a) !important; }
      & [data-bc="accent"]{ color:#55ff55 !important; }
      & [data-bc="lime"]{ color:#ffd23f !important; }
      & [data-bc="lime-bg"]{ background:#ffd23f !important; color:#1d1d1d !important; text-shadow:none !important; }
    `),
    glass: () => T('glass', `
      & [data-bc="base"]{ background:rgba(8,8,12,.55) !important; backdrop-filter:blur(10px); }
      & [class*="LocalNavigationWrapper"]{ background:rgba(20,20,28,.45) !important; backdrop-filter:blur(16px) saturate(140%); border:1px solid rgba(255,255,255,.08) !important; border-radius:14px !important; }
      & [data-bc="panel"]{ background:rgba(22,22,30,.5) !important; backdrop-filter:blur(18px) saturate(140%); border:1px solid rgba(255,255,255,.09) !important; border-radius:16px !important; box-shadow:0 8px 30px rgba(0,0,0,.25) !important; }
      & [data-bc="slot"], & [data-bc="tile"]{ background:rgba(255,255,255,.06) !important; backdrop-filter:blur(12px); border:1px solid rgba(255,255,255,.1) !important; border-radius:12px !important; }
      & [data-bc="tile"]:hover, & [data-bc="slot"]:hover{ background:rgba(255,255,255,.12) !important; }
      & [data-bc="btn"]{ background:rgba(255,255,255,.08) !important; border:1px solid rgba(255,255,255,.14) !important; border-radius:10px !important; backdrop-filter:blur(10px); }
      & [data-bc="btn-go"]{ background:linear-gradient(135deg,#8b5cf6,#5b8cff) !important; border-radius:10px !important; color:#fff !important; box-shadow:0 6px 20px rgba(110,90,255,.35) !important; }
      & [class*="ProgressBar__Progress"]::before{ background-image:linear-gradient(270deg,#8b8cff 0,rgba(139,140,255,.15) 100%) !important; }
      & [data-bc="xp"]{ background:linear-gradient(90deg,#8b5cf6,#5b8cff) !important; }
      & [data-bc="accent"]{ color:#b4a0ff !important; }
    `),
    neon: () => T('neon', `
      @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@500;700&display=swap');
      & h1, & h2, & h3, & h4, & h5, & h6, & button{ font-family:'Orbitron','Segoe UI',sans-serif !important; letter-spacing:.04em; }
      & [data-bc="base"]{ background:#05040a !important; }
      & [class*="LocalNavigationWrapper"]{ background:#07060f !important; border-bottom:1px solid #ff2bd6 !important; box-shadow:0 2px 18px rgba(255,43,214,.35) !important; }
      & [data-bc="panel"]{ background:rgba(8,6,18,.85) !important; border:1px solid #2de2ff !important; box-shadow:0 0 14px rgba(45,226,255,.25), inset 0 0 14px rgba(45,226,255,.08) !important; border-radius:6px !important; }
      & [data-bc="slot"], & [data-bc="tile"]{ background:rgba(10,8,22,.8) !important; border:1px solid rgba(255,43,214,.6) !important; border-radius:6px !important; }
      & [data-bc="tile"]:hover{ box-shadow:0 0 18px rgba(255,43,214,.45) !important; }
      & [data-bc="btn"]{ background:transparent !important; border:1px solid #2de2ff !important; color:#2de2ff !important; border-radius:6px !important; }
      & [data-bc="btn-go"]{ background:#ff2bd6 !important; color:#05040a !important; border-radius:6px !important; box-shadow:0 0 22px rgba(255,43,214,.6) !important; }
      & [class*="ProgressBar__Progress"]::before{ background-image:linear-gradient(270deg,#2de2ff 0,rgba(45,226,255,.15) 100%) !important; }
      & [data-bc="xp"]{ background:#2de2ff !important; box-shadow:0 0 10px #2de2ff !important; }
      & [data-bc="accent"]{ color:#ff2bd6 !important; text-shadow:0 0 8px rgba(255,43,214,.6); }
      & [data-bc="lime"]{ color:#2de2ff !important; }
    `),

    kitty: () => T('kitty', `
      @import url('https://fonts.googleapis.com/css2?family=Comfortaa:wght@500;700&display=swap');
      & body, & body *{ font-family:'Comfortaa','Segoe UI',sans-serif !important; }
      & [data-bc="base"]{ background:linear-gradient(180deg,#43102c,#260818 70%,#1e0614) !important; }
      & [class*="NavigationSidebarHolder"]{ background:linear-gradient(180deg,rgba(94,13,51,.55),rgba(46,8,28,.55)) !important; box-shadow:inset -1.5px 0 0 rgba(255,95,162,.55), 6px 0 18px rgba(255,79,154,.12) !important; }
      & [class*="AccountSidebarHolder"]{ background:linear-gradient(180deg,rgba(94,13,51,.55),rgba(46,8,28,.55)) !important; box-shadow:inset 1.5px 0 0 rgba(255,95,162,.55), -6px 0 18px rgba(255,79,154,.12) !important; }
      & [class*="NavigationSidebarHolder"] svg, & [class*="AccountSidebarHolder"] svg{ color:#ffc2dc; }
      & [class*="LocalNavigationWrapper"]{ background:linear-gradient(180deg,rgba(94,13,51,.95),rgba(62,8,34,.95)) !important; border:2px solid #ff5fa2 !important; border-radius:18px !important; box-shadow:0 0 0 2px #3a0820 inset, 0 0 16px rgba(255,79,154,.45) !important; position:relative; overflow:visible !important; }
      & [data-bc="panel"]{ background:rgba(58,10,34,.86) !important; border:1.5px solid rgba(255,95,162,.55) !important; border-radius:18px !important; box-shadow:0 0 18px rgba(255,79,154,.15) !important; }
      & [data-bc="slot"]{ background:rgba(255,95,162,.08) !important; border:1.5px dashed rgba(255,143,190,.5) !important; border-radius:14px !important; }
      & [data-bc="tile"]{ background:rgba(255,95,162,.07) !important; border:1.5px solid rgba(255,95,162,.5) !important; border-radius:16px !important; position:relative; overflow:visible !important; }
      & [data-bc="tile"]::before{ content:""; position:absolute; left:50%; top:-30px; width:44px; height:37px; transform:translateX(-50%); background:url("${ext('themes/kitty-cat.webp')}") center bottom/contain no-repeat; pointer-events:none; z-index:2; }
      & [data-bc="tile"]:hover{ background:rgba(255,95,162,.16) !important; box-shadow:0 0 16px rgba(255,79,154,.35) !important; }
      & [data-bc="btn"]{ background:rgba(255,95,162,.12) !important; border:1.5px solid rgba(255,95,162,.6) !important; color:#ffe3ef !important; border-radius:999px !important; }
      & [data-bc="btn-go"]{ background:linear-gradient(180deg,#8c1a4c,#5e0d33 55%,#4a0828) !important; color:#fff !important; border:2px solid #ff5fa2 !important; border-radius:14px !important; box-shadow:0 0 14px rgba(255,79,154,.6) !important; }
      & [class*="PlayButtonWrapper__Container"], & [class*="PlayButtonWrapper__Container"] button{ overflow:visible !important; }
      & [class*="PlayButtonWrapper__Container"] button{ position:relative; isolation:isolate; background:transparent !important; border:0 !important; box-shadow:none !important; border-radius:0 !important; color:#fff !important; text-shadow:0 0 6px #ff5fa2, 0 0 14px rgba(255,79,154,.8) !important; font-weight:700 !important; }
      & [class*="PlayButtonWrapper__Container"] button::after{ content:""; position:absolute; inset:-5px -7px; border-style:solid; border-width:0 36px; border-image:url("${ext('themes/kitty-btn.webp')}") 0 87 fill / 0 36px stretch; z-index:-1; pointer-events:none; }
      & [class*="PlayButtonWrapper__Container"] button:hover::after{ filter:brightness(1.15); }
      & [class*="PlayButtonWrapper__Container"] button:disabled{ color:rgba(255,226,239,.6) !important; text-shadow:none !important; }
      & [class*="PlayButtonWrapper__Container"] button:disabled::after{ filter:grayscale(.55) brightness(.65); }
      & [class*="PlayButtonWrapper__Container"] button::before{ content:""; position:absolute; left:50%; top:-58px; width:82px; height:70px; transform:translateX(-50%); background:url("${ext('themes/kitty-cat.webp')}") center bottom/contain no-repeat; pointer-events:none; z-index:5; filter:drop-shadow(0 0 8px rgba(255,79,154,.6)); }
      & [class*="EloWidget-module"] [class*="ProgressBar__Progress"]{ background:#3a0820 !important; border:1.5px solid #ff5fa2 !important; border-radius:999px !important; overflow:visible !important; box-shadow:0 0 10px rgba(255,79,154,.35) !important; }
      & [class*="EloWidget-module"] [class*="ProgressBar__Progress"]::before{ border-radius:999px !important; background:${ART.pawsTiny} 0 50%/14px 10px repeat-x, linear-gradient(90deg,#ff4f8b,#e05ad6 60%,#b77cff) !important; }
      & [class*="EloWidget-module"] [class*="ProgressBar__Progress"]::after{ content:""; position:absolute; top:50%; left:var(--lfx-prog,0%); width:34px; height:29px; transform:translate(-50%,-58%); background:url("${ext('themes/kitty-cat.webp')}") center/contain no-repeat; pointer-events:none; z-index:2; filter:drop-shadow(0 0 5px rgba(255,79,154,.8)); }
      & [data-bc="xp"]{ background:linear-gradient(90deg,#ff4f8b,#b77cff) !important; }
      & [data-bc="accent"]{ color:#ff8fbe !important; text-shadow:0 0 8px rgba(255,79,154,.5); }
      & [data-bc="lime"]{ color:#ffd1e6 !important; }
      & [class*="styles__CanvasHolder"]::after{ content:""; position:absolute; inset:0; background:${ART.pawsPattern} 0 0/260px 260px repeat; opacity:.16; pointer-events:none; z-index:0; animation:lfxDrift 60s linear infinite; }
      @keyframes lfxDrift{ to{ background-position:260px 520px; } }
    `),
    samurai: () => T('samurai', `
      @import url('https://fonts.googleapis.com/css2?family=Russo+One&display=swap');
      & h1, & h2, & h3, & h4, & h5, & h6, & button{ font-family:'Russo One','Segoe UI',sans-serif !important; letter-spacing:.03em; }
      & [data-bc="base"]{ background:#0a0505 !important; }
      & [class*="LocalNavigationWrapper"]{ background:#0d0707 !important; border:0 !important; border-bottom:2px solid #c1121f !important; border-radius:0 !important; position:relative; overflow:visible !important; }
      & [class*="LocalNavigationWrapper"]::after{ content:""; position:absolute; left:50%; bottom:-20px; width:min(560px,60%); height:44px; transform:translateX(-50%) rotate(-2deg); background:${ART.katana} center/contain no-repeat; pointer-events:none; z-index:3; filter:drop-shadow(0 4px 6px rgba(0,0,0,.6)); }
      & [data-bc="panel"]{ background:rgba(14,8,8,.92) !important; border:1px solid rgba(193,18,31,.35) !important; border-left:3px solid #c1121f !important; border-radius:2px !important; }
      & [data-bc="slot"], & [data-bc="tile"]{ background:rgba(20,10,10,.85) !important; border:1px solid rgba(201,162,74,.35) !important; border-radius:2px !important; }
      & [data-bc="tile"]:hover{ border-color:#c9a24a !important; box-shadow:0 0 0 1px #c9a24a inset !important; }
      & [data-bc="btn"]{ background:transparent !important; border:1px solid rgba(201,162,74,.6) !important; color:#e9d7b0 !important; border-radius:2px !important; }
      & [data-bc="btn-go"]{ background:#c1121f !important; color:#f5e6c8 !important; border-radius:2px !important; text-transform:uppercase; box-shadow:0 0 0 1px #5e0910 inset, 0 8px 22px rgba(193,18,31,.35) !important; }
      & [class*="ProgressBar__Progress"]::before{ background-image:linear-gradient(270deg,#c1121f 0,rgba(193,18,31,.15) 100%) !important; }
      & [data-bc="xp"]{ background:#c9a24a !important; }
      & [data-bc="accent"]{ color:#e0b55a !important; }
      & [data-bc="lime"]{ color:#e9d7b0 !important; }
      & [class*="styles__CanvasHolder"]::before{ content:""; position:absolute; right:6%; top:14%; width:220px; height:220px; background:${ART.sun} center/contain no-repeat; opacity:.22; pointer-events:none; z-index:0; }
      & [class*="styles__CanvasHolder"]::after{ content:""; position:absolute; inset:0; background:${ART.petals} 0 0/300px 300px repeat; opacity:.55; pointer-events:none; z-index:2; animation:lfxFall 26s linear infinite; }
      @keyframes lfxFall{ to{ background-position:-300px 600px; } }
    `),
    candy: () => T('candy', `
      @import url('https://fonts.googleapis.com/css2?family=Baloo+2:wght@500;700&display=swap');
      & body, & body *{ font-family:'Baloo 2','Segoe UI',sans-serif !important; }
      & [data-bc="base"]{ background:#1c1530 !important; }
      & [class*="LocalNavigationWrapper"]{ background:linear-gradient(90deg,rgba(74,44,90,.95),rgba(60,46,100,.95)) !important; border:2px solid #cdb4ff !important; border-radius:22px !important; position:relative; overflow:visible !important; }
      & [class*="PlayButtonWrapper__Container"], & [class*="PlayButtonWrapper__Container"] button{ overflow:visible !important; }
      & [class*="PlayButtonWrapper__Container"] button{ position:relative; }
      & [class*="PlayButtonWrapper__Container"] button::before{ content:""; position:absolute; left:50%; top:-40px; width:62px; height:42px; transform:translateX(-50%); background:${ART.bunnyPeek} center bottom/contain no-repeat; pointer-events:none; z-index:5; }
      & [data-bc="panel"]{ background:rgba(44,32,72,.9) !important; border:2px solid rgba(205,180,255,.5) !important; border-radius:22px !important; box-shadow:0 0 0 4px rgba(168,240,212,.08), 0 8px 26px rgba(120,90,200,.18) !important; }
      & [data-bc="slot"]{ background:rgba(205,180,255,.08) !important; border:1.5px dashed rgba(168,240,212,.55) !important; border-radius:16px !important; }
      & [data-bc="tile"]{ background:rgba(205,180,255,.08) !important; border:2px solid rgba(205,180,255,.45) !important; border-radius:20px !important; position:relative; overflow:visible !important; }
      & [data-bc="tile"]::after{ content:""; position:absolute; right:-8px; top:-10px; width:24px; height:22px; background:${ART.heart} center/contain no-repeat; transform:rotate(14deg); pointer-events:none; }
      & [data-bc="tile"]:hover{ background:rgba(168,240,212,.12) !important; border-color:#a8f0d4 !important; }
      & [data-bc="btn"]{ background:rgba(205,180,255,.14) !important; border:1.5px solid rgba(205,180,255,.6) !important; color:#f3ecff !important; border-radius:999px !important; }
      & [data-bc="btn-go"]{ background:linear-gradient(135deg,#a8f0d4,#cdb4ff 60%,#ffc6e0) !important; color:#2c1a40 !important; border-radius:999px !important; box-shadow:0 6px 20px rgba(205,180,255,.45) !important; }
      & [class*="ProgressBar__Progress"]::before{ background-image:linear-gradient(270deg,#a8f0d4 0,rgba(168,240,212,.15) 100%) !important; }
      & [data-bc="xp"]{ background:linear-gradient(90deg,#cdb4ff,#a8f0d4) !important; }
      & [data-bc="accent"]{ color:#cdb4ff !important; }
      & [data-bc="lime"]{ color:#a8f0d4 !important; }
      & [class*="styles__CanvasHolder"]::after{ content:""; position:absolute; inset:0; background:${ART.candyPattern} 0 0/280px 280px repeat; opacity:.3; pointer-events:none; z-index:0; animation:lfxFloat 70s linear infinite; }
      @keyframes lfxFloat{ to{ background-position:-280px -560px; } }
    `),
  };

  // Classifier: FACEIT's class names are generated, so look at real colours and sizes
  const rgb = (s) => (s.match(/[\d.]+/g) || []).map(Number);
  const isOrange = ([r, g, b, a = 1]) => a > 0.5 && r > 230 && g > 55 && g < 100 && b < 30;
  const isLime = ([r, g, b, a = 1]) => a > 0.5 && r > 160 && r < 200 && g > 240 && b < 30;
  const isDark = ([r, g, b, a = 1]) => a >= 0.55 && r === g && g === b && r <= 46;
  const isFaint = ([r, g, b, a = 1]) => a > 0 && a <= 0.12 && r > 200 && r === g && g === b;

  function classify(el, cs, box) {
    const bg = rgb(cs.backgroundColor), fg = rgb(cs.color);
    const clickable = el.tagName === 'BUTTON' || el.getAttribute('role') === 'button';
    const thin = box.height <= 12 && box.width > 30;
    if (isOrange(bg)) return thin ? 'xp' : 'btn-go';
    if (isLime(bg)) return thin ? 'xp' : 'lime-bg';
    if (isDark(bg) && (box.width >= innerWidth * 0.98 || (box.height >= innerHeight * 0.85 && box.width < 140))) return 'base';
    if (clickable && (isDark(bg) || isFaint(bg))) return box.height > 64 && box.width < 400 ? 'tile' : box.height > 64 ? 'slot' : 'btn';
    if (isDark(bg) && box.width > 120 && box.height > 40) return 'panel';
    if (isFaint(bg) && box.width > 30 && box.height > 24) return box.height > 120 && box.width < 400 ? 'tile' : 'slot';
    if (isOrange(fg)) return 'accent';
    if (isLime(fg)) return 'lime';
    return null;
  }

  function tag(el) {
    if (el.closest('svg') || el.id === LAYER_ID || el.closest('#' + LAYER_ID)) return;
    const key = typeof el.className === 'string' ? el.className : '';
    if (el.dataset.bc !== undefined && el.dataset.bcKey === key) return;
    el.removeAttribute('data-bc');
    const box = el.getBoundingClientRect();
    if (!box.width || !box.height) return;
    // classify with the theme switched off so we read FACEIT's own colours
    const cs = getComputedStyle(el);
    el.dataset.bcKey = key;
    el.dataset.bc = classify(el, cs, box) || '';
  }
  function scan(root = document.body) {
    if (!root || root.nodeType !== 1) return;
    tag(root);
    root.querySelectorAll('*').forEach(tag);
  }

  function startClassifier() {
    if (classifierOn) return;
    classifierOn = true;
    // Tag first with no theme attribute, so computed colours are FACEIT's originals
    const theme = document.documentElement.getAttribute('data-lfx-theme');
    document.documentElement.removeAttribute('data-lfx-theme');
    scan();
    if (theme) document.documentElement.setAttribute('data-lfx-theme', theme);
    const pending = new Set();
    let t = null;
    mo = new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.type === 'childList') m.addedNodes.forEach((n) => n.nodeType === 1 && pending.add(n));
        else if (m.attributeName === 'class') pending.add(m.target);
      }
      clearTimeout(t);
      t = setTimeout(() => { pending.forEach(scan); pending.clear(); }, 120);
    });
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    fullTimer = setInterval(() => scan(), 2500);
  }
  function stopClassifier() {
    if (!classifierOn) return;
    classifierOn = false;
    mo?.disconnect();
    clearInterval(fullTimer);
    document.querySelectorAll('[data-bc-key]').forEach((e) => { e.removeAttribute('data-bc'); e.removeAttribute('data-bc-key'); });
  }

  function applyTheme() {
    const name = settings?.theme;
    const html = document.documentElement;
    const needTags = !!settings?.ui?.accent;
    if (!name || name === 'none' || !THEMES[name]) {
      html.removeAttribute('data-lfx-theme');
      document.getElementById(THEME_STYLE)?.remove();
      if (needTags) startClassifier(); else stopClassifier();
      return;
    }
    if (html.getAttribute('data-lfx-theme') === name && classifierOn) return;
    // The theme CSS must not affect classification
    html.removeAttribute('data-lfx-theme');
    stopClassifier();
    startClassifier();
    ensureStyle(THEME_STYLE, THEMES[name]());
    html.setAttribute('data-lfx-theme', name);
  }


  // ======================================================================
  // 2b. Interface tweaks: accent colour, hidden blocks, custom Play text
  // ======================================================================
  const UI_STYLE = 'lfx-ui';
  const HIDE_CSS = {
    widgets: '[class*="WidgetStack-module"], [class*="CampaignWidgetV3-module"]',
    rank: '[class*="EloWidget-module"][class*="rankRow"]',
    missions: 'a[href$="/missions"]',
    shop: 'a[href$="/shop"], a[href*="/subscriptions"]',
    notices: '[class*="HeaderMessageBarHolder"]',
  };
  const IDLE_PLAY = /^(пошук матчу|знайти матч|поиск матча|найти матч|find match|play|грати|играть|znajdź mecz|szukaj meczu|buscar partida|spiel suchen)$/i;
  function textOn(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return '#fff';
    const n = parseInt(m[1], 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#111' : '#fff';
  }
  function applyUi() {
    const u = settings?.ui || {};
    const html = document.documentElement;
    const P = 'html[data-lfx-ui] body ';
    let css = '';
    const acc = /^#[0-9a-f]{6}$/i.test(u.accent || '') ? u.accent : '';
    if (acc) {
      css += `${P}[data-bc="btn-go"]{ background:${acc} !important; color:${textOn(acc)} !important; }
        ${P}[data-bc="accent"]{ color:${acc} !important; }
        ${P}[data-bc="xp"]{ background:${acc} !important; }
        ${P}[class*="ProgressBar__Progress"]::before{ background-image:linear-gradient(270deg,${acc} 0,${acc}26 100%) !important; }\n`;
    }
    const hide = Object.entries(u.hide || {}).filter(([k, v]) => v && HIDE_CSS[k]).map(([k]) => HIDE_CSS[k]);
    if (hide.length) css += `${hide.map((x) => x.split(',').map((y) => P + y.trim()).join(', ')).join(', ')}{ display:none !important; }\n`;
    if (playText()) {
      css += `${P}[data-lfx-play]{ font-size:0 !important; }
        ${P}[data-lfx-play]::after{ content:attr(data-lfx-play); font-size:var(--lfx-fs,14px); text-transform:none; }\n`;
    }
    if (css && settings.enabled !== false) { ensureStyle(UI_STYLE, css); html.setAttribute('data-lfx-ui', ''); }
    else { document.getElementById(UI_STYLE)?.remove(); html.removeAttribute('data-lfx-ui'); }
    playTick();
  }
  const THEME_PLAY = { kitty: 'Uwu<3' };
  const playText = () => (settings?.enabled === false ? '' : (settings?.ui?.playText || THEME_PLAY[settings?.theme] || '')).trim().slice(0, 40);
  function playTick() {
    const txt = playText();
    document.querySelectorAll('[data-lfx-play]').forEach((el) => {
      if (!txt || !IDLE_PLAY.test(el.textContent.trim())) el.removeAttribute('data-lfx-play');
      else if (el.getAttribute('data-lfx-play') !== txt) el.setAttribute('data-lfx-play', txt);
    });
    if (!txt) return;
    document.querySelectorAll('[class*="PlayButtonWrapper__Container"] [class*="ButtonTextWrapper"]').forEach((el) => {
      if (el.hasAttribute('data-lfx-play') || !IDLE_PLAY.test(el.textContent.trim())) return;
      el.style.setProperty('--lfx-fs', getComputedStyle(el).fontSize);
      el.setAttribute('data-lfx-play', txt);
    });
  }

  // ======================================================================
  // 2c. Auto-accept (only while the player is actually at the PC)
  // ======================================================================
  const ACCEPT_RE = /^(accept|прийняти|принять|akceptuj|zaakceptuj|aceptar|annehmen|accepter|aceitar|accetta)$/i;
  const MATCH_RE = /match|матч|mecz|partida|partie|spiel/i;
  const INVITE_RE = /invit|запрош|приглаш|zaprosz|einlad/i;
  const handled = new WeakSet();
  let soundHitAt = 0, acceptBusy = false, debugTimer = null;
  const L = () => settings?.lang || 'uk';
  const MSG = {
    uk: ['Матч прийнято', 'LobbyFX прийняв матч за тебе.', 'Матч знайдено', 'Ти неактивний — автоприйом пропущено.'],
    ru: ['Матч принят', 'LobbyFX принял матч за тебя.', 'Матч найден', 'Ты неактивен — автоприём пропущен.'],
    en: ['Match accepted', 'LobbyFX accepted the match for you.', 'Match found', 'You look away — auto-accept skipped.'],
  };
  const visible = (el) => { const b = el.getBoundingClientRect(); const cs = getComputedStyle(el); return b.width > 20 && b.height > 14 && cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0.05; };
  function popupOf(el) {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      if (p.getAttribute('role') === 'dialog' || p.getAttribute('aria-modal') === 'true' || getComputedStyle(p).position === 'fixed') return p;
    }
    return null;
  }
  function findAccept() {
    const recentSound = Date.now() - soundHitAt < 30000;
    for (const b of document.querySelectorAll('button, [role="button"]')) {
      if (handled.has(b) || !ACCEPT_RE.test(b.textContent.trim()) || !visible(b) || b.disabled) continue;
      const box = popupOf(b);
      if (!box) continue;
      const t = box.textContent.slice(0, 3000);
      if (INVITE_RE.test(t) && !recentSound) continue;
      if (!MATCH_RE.test(t) && !recentSound) continue;
      return b;
    }
    return null;
  }
  const ask = (msg) => new Promise((res) => { try { chrome.runtime.sendMessage(msg, (r) => { void chrome.runtime.lastError; res(r); }); } catch { res(null); } });
  async function logAccept(entry) {
    const { acceptlog = [] } = await chrome.storage.local.get('acceptlog');
    chrome.storage.local.set({ acceptlog: [{ t: Date.now(), ...entry }, ...acceptlog].slice(0, 20) });
  }
  async function acceptTick() {
    const a = settings?.autoAccept;
    if (!a?.enabled || settings.enabled === false || acceptBusy) return;
    const btn = findAccept();
    if (!btn) return;
    acceptBusy = true; handled.add(btn); clearTimeout(debugTimer);
    try {
      const m = MSG[L()] || MSG.en;
      const lo = Math.max(0, +a.delayMin || 0), hi = Math.max(lo, +a.delayMax || lo);
      const wait = (lo + Math.random() * (hi - lo)) * 1000;
      if (+a.idleMin > 0) {
        const r = await ask({ type: 'lfx-idle', sec: Math.round(+a.idleMin * 60) });
        if (r && r.state && r.state !== 'active') {
          logAccept({ ok: false, why: 'idle' });
          if (a.notify) ask({ type: 'lfx-notify', title: m[2], message: m[3] });
          return;
        }
      }
      await new Promise((r) => setTimeout(r, wait));
      if (!btn.isConnected || !visible(btn)) { logAccept({ ok: false, why: 'gone' }); return; }
      btn.click();
      logAccept({ ok: true, delay: Math.round(wait), label: btn.textContent.trim() });
      if (a.notify) ask({ type: 'lfx-notify', title: m[0], message: m[1] });
    } finally { setTimeout(() => { acceptBusy = false; }, 1500); }
  }
  function captureDebug() {
    // the match sound played but no Accept button was recognised: keep the popups' markup so we can fix the selector
    const boxes = [...document.querySelectorAll('[role="dialog"], [aria-modal="true"], body *')]
      .filter((e) => e.getAttribute('role') === 'dialog' || e.getAttribute('aria-modal') === 'true' || (getComputedStyle(e).position === 'fixed' && e.getBoundingClientRect().width > 200))
      .slice(0, 6).map((e) => e.outerHTML.slice(0, 8000));
    chrome.storage.local.set({ acceptDebug: { t: Date.now(), url: location.pathname, html: boxes } });
  }
  function onMatchSound() {
    soundHitAt = Date.now();
    if (!settings?.autoAccept?.enabled) return;
    let n = 0;
    const fast = setInterval(() => { acceptTick(); if (++n > 40) clearInterval(fast); }, 250);
    clearTimeout(debugTimer);
    debugTimer = setTimeout(() => { if (Date.now() - soundHitAt < 15000 && !acceptBusy) captureDebug(); }, 12000);
  }

  // ======================================================================
  // 3. Sounds (bridge to hook.js in the page world)
  // ======================================================================
  let soundUrlCache = { key: '', url: '' };

  async function soundUrl(id) {
    if (!id) return '';
    if (id.startsWith('builtin:')) return ext(`sounds/${id.slice(8)}.wav`);
    if (soundUrlCache.key === id) return soundUrlCache.url;
    const { sounds = [] } = await chrome.storage.local.get('sounds');
    const s = sounds.find((x) => x.id === id);
    let url = '';
    if (s?.fileKey) url = (await chrome.storage.local.get(s.fileKey))[s.fileKey] || '';
    else if (s?.src) url = s.src;
    soundUrlCache = { key: id, url };
    return url;
  }

  async function sendSoundConfig() {
    const s = settings?.sound || {};
    window.postMessage({
      __lfx: 'sound-config',
      enabled: !!(s.enabled && s.trigger),
      trigger: s.trigger || '',
      url: s.enabled ? await soundUrl(s.id) : '',
      volume: (s.volume ?? 80) / 100,
    }, location.origin);
  }

  window.addEventListener('message', async (e) => {
    if (e.source !== window || e.data?.__lfx !== 'played') return;
    const src = String(e.data.src || '').split('?')[0];
    if (!src) return;
    if (settings?.sound?.trigger && src === settings.sound.trigger.split('?')[0]) onMatchSound();
    const { soundlog = [] } = await chrome.storage.local.get('soundlog');
    const next = [{ src, t: Date.now(), page: category() }, ...soundlog.filter((x) => x.src !== src)].slice(0, 15);
    chrome.storage.local.set({ soundlog: next });
  });

  // ======================================================================
  // Boot
  // ======================================================================
  async function load() {
    const got = await chrome.storage.local.get(['settings', 'library']);
    settings = got.settings;
    library = got.library || [];
    if (!settings) return;
    setupRotation();
    await update();
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.settings || changes.library) {
      if (changes.settings?.newValue?.sound?.id !== changes.settings?.oldValue?.sound?.id) soundUrlCache = { key: '', url: '' };
      load();
    } else if (changes.sounds) {
      soundUrlCache = { key: '', url: '' };
      sendSoundConfig();
    }
  });

  // SPA navigation: watch the URL
  let lastPath = location.pathname;
  setInterval(() => {
    if (location.pathname !== lastPath) { lastPath = location.pathname; update(); }
    else paint();
  }, 700);
  function progTick() {
    if (!document.documentElement.hasAttribute('data-lfx-theme')) return;
    document.querySelectorAll('[class*="EloWidget-module"] [class*="ProgressBar__Progress"]').forEach((el) => {
      const w = parseFloat(getComputedStyle(el, '::before').width) || 0, full = el.clientWidth || 1;
      const v = Math.min(100, (w / full) * 100).toFixed(2) + '%';
      if (el.style.getPropertyValue('--lfx-prog') !== v) el.style.setProperty('--lfx-prog', v);
    });
  }
  setInterval(() => { if (playText() || document.querySelector('[data-lfx-play]')) playTick(); acceptTick(); progTick(); }, 400);

  load();
})();
