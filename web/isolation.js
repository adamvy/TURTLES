// GitHub Pages cannot set COOP/COEP response headers. The pinned same-origin
// service worker adds isolation and reloads once; no user program is cached.
window.coi = {quiet: true, coepCredentialless: () => false, coepDegrade: () => false};
