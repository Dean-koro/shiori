import Database from '@tauri-apps/plugin-sql';
import { BaseDirectory, exists, mkdir } from '@tauri-apps/plugin-fs';

let dbInstance: Database | null = null;

export async function getDatabase(): Promise<Database> {
  if (!dbInstance) {
    dbInstance = await Database.load('sqlite:library.db');
    await dbInstance.execute('PRAGMA foreign_keys = ON;');
  }
  return dbInstance;
}

export async function initializeStorage(): Promise<void> {
  const folders = ['books', 'covers'];

  for (const folder of folders) {
    const folderExists = await exists(folder, { baseDir: BaseDirectory.AppData });
    if (!folderExists) {
      await mkdir(folder, { baseDir: BaseDirectory.AppData, recursive: true });
    }
  }

  await getDatabase();
}