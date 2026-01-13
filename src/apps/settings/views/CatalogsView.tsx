// ui/src/apps/settings/views/CatalogsView.tsx
import { BookOpen, Star, Copy, Edit2, Trash2 } from "lucide-react";
import type { CatalogFile } from "../stores/settingsStore";

type CatalogsViewProps = {
  catalogs: CatalogFile[];
  decoderDir: string;
  defaultCatalog: string | null;
  onSetDefaultCatalog: (filename: string) => void;
  onDuplicateCatalog: (catalog: CatalogFile) => void;
  onEditCatalog: (catalog: CatalogFile) => void;
  onDeleteCatalog: (catalog: CatalogFile) => void;
};

export default function CatalogsView({
  catalogs,
  decoderDir,
  defaultCatalog,
  onSetDefaultCatalog,
  onDuplicateCatalog,
  onEditCatalog,
  onDeleteCatalog,
}: CatalogsViewProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Decoder Catalogs</h2>
      </div>

      {catalogs.length === 0 ? (
        <div className="text-center py-12 text-slate-500 dark:text-slate-400">
          <BookOpen className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>No catalogs found in decoder directory</p>
          <p className="text-sm mt-2">Add .toml catalog files to {decoderDir || "the decoder directory"}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {catalogs.map((catalog) => (
            <div
              key={catalog.path}
              className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700"
            >
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <h3 className="font-medium text-slate-900 dark:text-white">{catalog.name}</h3>
                  <span className="px-2 py-1 text-xs font-medium bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400 rounded">
                    {catalog.filename}
                  </span>

                  <button
                    onClick={() => onSetDefaultCatalog(catalog.filename)}
                    className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors"
                    title={defaultCatalog === catalog.filename ? "Unset as default" : "Set as default"}
                  >
                    <Star
                      className={`w-4 h-4 ${
                        defaultCatalog === catalog.filename
                          ? "fill-yellow-500 text-yellow-500"
                          : "text-slate-400 dark:text-slate-500"
                      }`}
                    />
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onDuplicateCatalog(catalog)}
                  className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
                  title="Duplicate catalog"
                >
                  <Copy className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                </button>
                <button
                  onClick={() => onEditCatalog(catalog)}
                  className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
                  title="Edit catalog name/filename"
                >
                  <Edit2 className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                </button>
                <button
                  onClick={() => onDeleteCatalog(catalog)}
                  className="p-2 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                  title="Delete catalog"
                >
                  <Trash2 className="w-4 h-4 text-red-600 dark:text-red-400" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
