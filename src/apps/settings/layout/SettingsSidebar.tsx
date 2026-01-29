// ui/src/apps/settings/layout/SettingsSidebar.tsx
import { MapPin, Cable, BookOpen, Monitor, Cog, Bookmark } from "lucide-react";
import { iconLg } from "../../../styles/spacing";
import {
  bgPrimary,
  borderDefault,
  bgInfo,
  textInfo,
  hoverLight,
  textSecondary,
  roundedDefault,
  gapSmall,
  spaceYSmall,
} from "../../../styles";

export type SettingsSection = "general" | "locations" | "data-io" | "catalogs" | "bookmarks" | "display";

type SettingsSidebarProps = {
  currentSection: SettingsSection;
  onSelect: (section: SettingsSection) => void;
};

export default function SettingsSidebar({ currentSection, onSelect }: SettingsSidebarProps) {
  const itemClasses = (section: SettingsSection) =>
    `w-full flex items-center ${gapSmall} px-4 py-3 ${roundedDefault} transition-colors text-left ${
      currentSection === section
        ? `${bgInfo} ${textInfo}`
        : `${hoverLight} ${textSecondary}`
    }`;

  return (
    <aside className={`w-64 ${bgPrimary} border-r ${borderDefault} flex flex-col overflow-hidden`}>
      <div className="flex-1 overflow-y-auto p-4">
        <nav className={spaceYSmall}>
          <button onClick={() => onSelect("general")} className={itemClasses("general")}>
            <Cog className={iconLg} />
            <span className="font-medium">General</span>
          </button>
          <button onClick={() => onSelect("locations")} className={itemClasses("locations")}>
            <MapPin className={iconLg} />
            <span className="font-medium">Storage</span>
          </button>
          <button onClick={() => onSelect("data-io")} className={itemClasses("data-io")}>
            <Cable className={iconLg} />
            <span className="font-medium">Data IO</span>
          </button>
          <button onClick={() => onSelect("catalogs")} className={itemClasses("catalogs")}>
            <BookOpen className={iconLg} />
            <span className="font-medium">Catalogs</span>
          </button>
          <button onClick={() => onSelect("bookmarks")} className={itemClasses("bookmarks")}>
            <Bookmark className={iconLg} />
            <span className="font-medium">Bookmarks</span>
          </button>
          <button onClick={() => onSelect("display")} className={itemClasses("display")}>
            <Monitor className={iconLg} />
            <span className="font-medium">Display</span>
          </button>
        </nav>
      </div>
    </aside>
  );
}
