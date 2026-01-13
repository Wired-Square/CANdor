// ui/src/apps/catalog/io.ts

import { openCatalog, saveCatalog, pickCatalogToOpen as pickCatalogToOpenApi, pickCatalogToSave } from "../../api";
import type { AppSettings } from "../../hooks/useSettings";

// Re-export AppSettings for backward compatibility
export type Settings = AppSettings;

export async function openCatalogAtPath(path: string): Promise<string> {
  return await openCatalog(path);
}

export async function saveCatalogAtPath(path: string, content: string): Promise<void> {
  await saveCatalog(path, content);
}

export async function pickCatalogToOpen(defaultDir?: string): Promise<string | null> {
  return await pickCatalogToOpenApi(defaultDir);
}

export async function pickCatalogSavePath(defaultPath?: string): Promise<string | null> {
  return await pickCatalogToSave(defaultPath);
}
