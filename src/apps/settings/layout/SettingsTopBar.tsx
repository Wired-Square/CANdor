// ui/src/apps/settings/layout/SettingsTopBar.tsx
import { Cog } from "lucide-react";
import { iconLg } from "../../../styles/spacing";
import { borderDivider, bgSurface } from "../../../styles";

export default function SettingsTopBar() {
  return (
    <header className={`${bgSurface} ${borderDivider} px-6 py-3`}>
      <div className="flex items-center gap-3">
        <Cog className={`${iconLg} text-orange-600 dark:text-orange-400 flex-shrink-0`} />
        <span className="font-semibold text-slate-900 dark:text-white">Settings</span>
      </div>
    </header>
  );
}
