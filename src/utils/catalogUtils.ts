import type { CatalogMetadata } from "../api/catalog";

/**
 * Find the default catalog from a loaded catalogs list.
 * Returns the full path if found, null otherwise.
 */
export function resolveDefaultCatalogPath(
  defaultCatalogFilename: string | null | undefined,
  catalogs: CatalogMetadata[]
): string | null {
  if (!defaultCatalogFilename || catalogs.length === 0) {
    return null;
  }

  const catalog = catalogs.find((c) => c.filename === defaultCatalogFilename);
  return catalog?.path ?? null;
}

/**
 * Build a catalog path from decoder_dir and filename.
 * Handles both absolute paths and relative paths.
 * Used when catalogs list isn't available (e.g., decoderStore.initFromSettings).
 */
export function buildCatalogPath(
  catalog: string,
  decoderDir?: string
): string {
  // If already an absolute path, return as-is
  if (catalog.startsWith("/") || catalog.includes("\\")) {
    return catalog;
  }

  // Combine with decoder_dir
  if (decoderDir) {
    const baseDir = decoderDir.replace(/[\\/]+$/, "");
    return `${baseDir}/${catalog}`;
  }

  return catalog;
}
