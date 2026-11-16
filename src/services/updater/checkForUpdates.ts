import { ask } from '@tauri-apps/plugin-dialog';
import { relaunch } from '@tauri-apps/plugin-process';
import { check } from '@tauri-apps/plugin-updater';

export async function checkAndInstallUpdates(): Promise<void> {
  try {
    const update = await check();
    if (!update) return;

    const shouldInstall = await ask(
      `Hay una nueva versión de Shiori (${update.version}). ¿Quieres instalarla ahora?`,
      { title: 'Actualización disponible', kind: 'info' }
    );
    if (!shouldInstall) return;

    await update.downloadAndInstall();
    await relaunch();
  } catch {
    // Las actualizaciones son opcionales y no deben impedir iniciar la aplicación.
  }
}
