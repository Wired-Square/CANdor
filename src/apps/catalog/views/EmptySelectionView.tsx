// ui/src/apps/catalog/views/EmptySelectionView.tsx

import { FileText } from "lucide-react";

export type EmptySelectionViewProps = {
  title?: string;
  subtitle?: string;
};

export default function EmptySelectionView({
  title = "Select a node",
  subtitle = "Select a node from the structure tree to view its content",
}: EmptySelectionViewProps) {
  return (
    <div className="flex items-center justify-center h-full text-slate-500 dark:text-slate-400">
      <div className="text-center">
        <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
        <p className="font-medium text-slate-700 dark:text-slate-300">{title}</p>
        <p className="text-sm mt-1">{subtitle}</p>
      </div>
    </div>
  );
}
