// ui/src/components/CatalogButton.tsx
//
// Shared catalog display button. Shows the selected catalog name with a star
// icon if it's the default, or "No catalog" in italic when nothing is selected.

import { Star } from "lucide-react";
import type { CatalogMetadata } from "../api/catalog";
import { buttonBase } from "../styles/buttonStyles";
import { iconSm } from "../styles/spacing";

export interface CatalogButtonProps {
  catalogs: CatalogMetadata[];
  catalogPath: string | null;
  defaultCatalogFilename?: string | null;
  onClick: () => void;
}

/** Normalise path separators for cross-platform comparison (Windows uses backslashes) */
const normalisePath = (p: string) => p.replace(/\\/g, "/");

export default function CatalogButton({
  catalogs,
  catalogPath,
  defaultCatalogFilename,
  onClick,
}: CatalogButtonProps) {
  const normalisedCatalogPath = catalogPath ? normalisePath(catalogPath) : null;
  const selectedCatalog = catalogs.find(
    (c) => normalisePath(c.path) === normalisedCatalogPath
  );
  const hasCatalog = !!selectedCatalog;
  const catalogName = selectedCatalog?.name || "No catalog";
  const isDefaultCatalog = selectedCatalog?.filename === defaultCatalogFilename;

  if (hasCatalog) {
    return (
      <button
        onClick={onClick}
        className={buttonBase}
        title="Select catalog"
      >
        {isDefaultCatalog && (
          <Star
            className={`${iconSm} text-amber-500 flex-shrink-0`}
            fill="currentColor"
          />
        )}
        <span className="max-w-32 truncate">{catalogName}</span>
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      className={buttonBase}
      title="Select catalog"
    >
      <span className="text-[color:var(--text-muted)] italic">No catalog</span>
    </button>
  );
}
