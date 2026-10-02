/*
 * LobbyFX page hook — runs in FACEIT's own page world at document_start.
 * Watches which sounds the page plays (so the user can choose the match-found one)
 * and swaps the chosen sound for the user's custom sound.
 */
(() => {
  if (window.__lfxHook) return;
  window.__lfxHook = true;

  let cfg = { enabled: false, trigger: '', url: '', volume: 0.8 };
  const clean = (u) => String(u || '').split('?')[0];

  window.addEventListener('message', (e) => {
    if (e.source === window && e.data?.__lfx === 'sound-config') cfg = e.data;
  });

  const origPlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function (...args) {
    try {
      if (!this.__lfxOwn && this instanceof HTMLAudioElement) {
        const src = clean(this.currentSrc || this.src || this.querySelector?.('source')?.src);
        if (src) {
          window.postMessage({ __lfx: 'played', src }, location.origin);
          if (cfg.enabled && cfg.url && src === clean(cfg.trigger)) {
            const a = new Audio(cfg.url);
            a.__lfxOwn = true;
            a.volume = Math.min(1, Math.max(0, cfg.volume));
            origPlay.call(a).catch(() => {});
            return Promise.resolve(); // FACEIT's own sound is skipped
          }
        }
      }
    } catch {}
    return origPlay.apply(this, args);
  };
})();
