// GitHub Pages cannot set these headers. Register the same worker URL as older
// releases, so installation and upgrades share one registration and scope.
(() => {
  const serviceWorker = navigator.serviceWorker;
  if (!serviceWorker) return;
  const workerURL = new URL('./coi-serviceworker.js', document.currentScript.src);
  const reloadKey = `turtles-isolation:${workerURL.pathname}`;
  let reloading = false;
  function reloadWhenControlled() {
    if (crossOriginIsolated || reloading || serviceWorker.controller?.scriptURL !== workerURL.href) return;
    try {
      // Stop retrying automatically if browser policy still forbids isolation.
      if (sessionStorage.getItem(reloadKey)) return;
      sessionStorage.setItem(reloadKey, '1');
    } catch { /* Storage can be unavailable; controller changes still work. */ }
    reloading = true;
    location.reload();
  }
  if (crossOriginIsolated) {
    try { sessionStorage.removeItem(reloadKey); } catch { /* Storage is optional. */ }
  }
  // Install this before register: installation can complete before it resolves.
  serviceWorker.addEventListener('controllerchange', reloadWhenControlled);
  serviceWorker.register(workerURL, { updateViaCache: 'none' })
    .then(() => serviceWorker.ready)
    .then(reloadWhenControlled)
    .catch(error => console.error('Browser memory setup failed:', error));
})();
