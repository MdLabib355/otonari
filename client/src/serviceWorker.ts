// Registers the service worker that `npm run build` creates (see vite.config.ts; `npm run dev` has none).
//
// A fresh start always loads the newest version from the server. But an installed app can stay open in
// the background for days. So when it comes back to the screen, we look for a new version, and reload
// the page if there is one.

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', reloadIfOutdated);
  navigator.serviceWorker.register('/sw.ts').then(lookForUpdates, () => {}); // without it, the app works too
}

function lookForUpdates(registration: ServiceWorkerRegistration) {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') registration.update().catch(() => {}); // e.g. offline
  });
}

// A new service worker has brought the files of the newest version. Is this page made of them?
// (The name of the script is different in every version.)
async function reloadIfOutdated() {
  const newestPage = await (await fetch('/index.html')).text();
  const myScript = document.querySelector('script[src^="/assets/"]')?.getAttribute('src');
  if (myScript && !newestPage.includes(myScript)) window.location.reload();
}
