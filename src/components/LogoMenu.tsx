// ui/src/components/LogoMenu.tsx

import { useState, useRef, useEffect } from "react";
import { Search, Activity, FileText, Calculator, Settings, Send } from "lucide-react";
import logo from "../assets/logo.png";

export type PanelId = "discovery" | "decoder" | "catalog-editor" | "frame-calculator" | "payload-analysis" | "frame-order-analysis" | "transmit" | "settings";

interface LogoMenuProps {
  onPanelClick: (panelId: PanelId) => void;
}

interface MenuItem {
  id: PanelId;
  icon: typeof Search;
  label: string;
  color: string;
  bgColor: string;
}

const menuItems: MenuItem[] = [
  {
    id: "discovery",
    icon: Search,
    label: "Discovery",
    color: "text-purple-400",
    bgColor: "hover:bg-purple-500/10",
  },
  {
    id: "decoder",
    icon: Activity,
    label: "Decoder",
    color: "text-green-400",
    bgColor: "hover:bg-green-500/10",
  },
  {
    id: "transmit",
    icon: Send,
    label: "Transmit",
    color: "text-red-400",
    bgColor: "hover:bg-red-500/10",
  },
  {
    id: "catalog-editor",
    icon: FileText,
    label: "Catalog Editor",
    color: "text-blue-400",
    bgColor: "hover:bg-blue-500/10",
  },
  {
    id: "frame-calculator",
    icon: Calculator,
    label: "Calculator",
    color: "text-teal-400",
    bgColor: "hover:bg-teal-500/10",
  },
  {
    id: "settings",
    icon: Settings,
    label: "Settings",
    color: "text-orange-400",
    bgColor: "hover:bg-orange-500/10",
  },
];

export default function LogoMenu({ onPanelClick }: LogoMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  // Close menu on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }
  }, [isOpen]);

  const handleItemClick = (panelId: PanelId) => {
    onPanelClick(panelId);
    setIsOpen(false);
  };

  return (
    <div ref={menuRef} className="relative flex items-center px-2" style={{ height: '35px' }}>
      {/* Logo button with white rounded background */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-center hover:shadow transition-all"
        title="Open app menu"
      >
        <img
          src={logo}
          alt="CANdor"
          className="w-full h-full object-contain"
        />
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <div className="absolute top-full left-2 mt-1 py-1 min-w-[180px] bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-50">
          {menuItems.map((item) => {
            const Icon = item.icon;
            // Add divider before Settings
            const showDivider = item.id === "settings";
            return (
              <div key={item.id}>
                {showDivider && <div className="my-1 border-t border-slate-700" />}
                <button
                  onClick={() => handleItemClick(item.id)}
                  className={`
                    w-full flex items-center gap-3 px-3 py-2 text-left
                    text-white hover:text-white font-medium
                    ${item.bgColor} transition-colors
                  `}
                >
                  <Icon className={`w-4 h-4 ${item.color}`} />
                  <span className="text-sm text-white">{item.label}</span>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
