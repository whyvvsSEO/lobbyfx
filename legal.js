// Shows the rules page in the LobbyFX language (or ?lang=)
(async () => {
  let lang = new URLSearchParams(location.search).get('lang');
  if (!lang) { try { lang = (await chrome.storage.local.get('settings')).settings?.lang; } catch {} }
  if (!['uk', 'en', 'ru'].includes(lang)) lang = 'uk';
  const show = (l) => {
    document.documentElement.lang = l;
    document.querySelectorAll('section[data-lang]').forEach((s) => s.classList.toggle('on', s.dataset.lang === l));
    document.querySelectorAll('#langs button').forEach((b) => b.classList.toggle('on', b.dataset.l === l));
  };
  document.querySelectorAll('#langs button').forEach((b) => (b.onclick = () => show(b.dataset.l)));
  show(lang);
})();
