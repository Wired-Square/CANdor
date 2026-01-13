// ui/src/apps/settings/layout/SettingsTopBar.tsx
import { Cog } from "lucide-react";

export default function SettingsTopBar() {
  return (
    <header className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-6 py-3">
      <div className="flex items-center gap-3">
        <Cog className="w-5 h-5 text-orange-600 dark:text-orange-400 flex-shrink-0" />
        <span className="font-semibold text-slate-900 dark:text-white">Settings</span>
      </div>
    </header>
  );
}
