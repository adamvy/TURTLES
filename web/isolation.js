// GitHub Pages cannot set COOP/COEP response headers. The pinned same-origin
// service worker adds isolation and reloads once; no user program is cached.
let reloadStarted = false;
function reloadWhenControlled() {
  if (reloadStarted || window.crossOriginIsolated) return;
  // updatefound can fire before installation has finished. A reload at that
  // point still receives an unisolated document and can strand the first visit.
  if (!navigator.serviceWorker?.controller) return;
  reloadStarted = true;
  window.location.reload();
}
window.coi = {
  quiet: true,
  coepCredentialless: () => false,
  coepDegrade: () => false,
  doReload: () => {
    navigator.serviceWorker?.ready.then(reloadWhenControlled);
  },
};
// Claiming a client does not change that document's isolation. Reload once the
// activated worker controls navigation, including a previously stranded tab.
navigator.serviceWorker?.addEventListener('controllerchange', reloadWhenControlled);
