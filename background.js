// LobbyFX service worker: idle state + notifications for auto-accept
chrome.runtime.onMessage.addListener((m, _sender, reply) => {
  if (m?.type === 'lfx-idle') {
    chrome.idle.queryState(Math.max(15, m.sec | 0), (state) => reply({ state }));
    return true;
  }
  if (m?.type === 'lfx-notify') {
    chrome.notifications.create('', { type: 'basic', iconUrl: 'icons/icon128.png', title: String(m.title || 'LobbyFX'), message: String(m.message || ''), priority: 2 });
  }
  return false;
});
