let installPrompt = null;
const listeners = new Set();

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installPrompt = event;
    for (const listener of listeners) listener(true);
  });

  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    for (const listener of listeners) listener(false);
  });
}

export function subscribeToInstallPrompt(listener) {
  listeners.add(listener);
  listener(Boolean(installPrompt));
  return () => listeners.delete(listener);
}

export async function showInstallPrompt() {
  if (!installPrompt) return false;
  const prompt = installPrompt;
  installPrompt = null;
  for (const listener of listeners) listener(false);
  await prompt.prompt();
  const choice = await prompt.userChoice;
  return choice.outcome === 'accepted';
}
