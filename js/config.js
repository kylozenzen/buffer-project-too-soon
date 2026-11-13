// config.js — per-deploy settings for Too Soon?
// The Buffer OAuth client id comes from the Netlify environment variable BUFFER_CLIENT_ID
// (served by /.netlify/functions/app-config). You can also hard-code it below as a fallback.
window.TOOSOON_CONFIG = {
  prefix: 'toosoon',
  BUFFER_CLIENT_ID: '',
  scope: 'posts:read posts:write account:read offline_access', // posts:write is only used for rewrite, drafts and push back
  tokenEndpoint: '/.netlify/functions/buffer-token',
  proxyEndpoint: '/.netlify/functions/buffer-proxy',
};

// Resolves once the Netlify-provided settings are loaded (never rejects).
window.TOOSOON_CONFIG_READY = fetch('/.netlify/functions/app-config')
  .then(r => (r.ok ? r.json() : {}))
  .catch(() => ({}))
  .then(remote => {
    if (remote && remote.bufferClientId) window.TOOSOON_CONFIG.BUFFER_CLIENT_ID = remote.bufferClientId;
    return window.TOOSOON_CONFIG;
  });
