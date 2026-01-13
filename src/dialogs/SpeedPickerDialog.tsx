// ui/src/dialogs/SpeedPickerDialog.tsx

import { Check, X } from "lucide-react";
import Dialog from "../components/Dialog";
import type { PlaybackSpeed } from "../components/TimeController";
import { h2, cardElevated, paddingCard, borderDefault, hoverLight, roundedDefault, textSuccess } from "../styles";

const SPEED_OPTIONS: { value: PlaybackSpeed; label: string }[] = [
  { value: 0.25, label: "0.25x" },
  { value: 0.5, label: "0.5x" },
  { value: 1, label: "1x (realtime)" },
  { value: 2, label: "2x" },
  { value: 10, label: "10x" },
  { value: 30, label: "30x" },
  { value: 60, label: "60x" },
  { value: 0, label: "No Limit" },
];

type Props = {
  isOpen: boolean;
  onClose: () => void;
  speed: PlaybackSpeed;
  onSpeedChange: (speed: PlaybackSpeed) => void;
};

export default function SpeedPickerDialog({
  isOpen,
  onClose,
  speed,
  onSpeedChange,
}: Props) {
  const handleSelect = (newSpeed: PlaybackSpeed) => {
    onSpeedChange(newSpeed);
    onClose();
  };

  return (
    <Dialog isOpen={isOpen} onBackdropClick={onClose} maxWidth="max-w-sm">
      <div className={`${cardElevated} shadow-xl overflow-hidden`}>
        <div className={`${paddingCard} border-b ${borderDefault} flex items-center justify-between`}>
          <h2 className={h2}>
            Playback Speed
          </h2>
          <button
            onClick={onClose}
            className={`p-1 ${roundedDefault} ${hoverLight} transition-colors`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="max-h-[50vh] overflow-y-auto">
          <div className="py-1">
            {SPEED_OPTIONS.map((opt) => {
              const isSelected = opt.value === speed;
              return (
                <button
                  key={opt.value}
                  onClick={() => handleSelect(opt.value)}
                  className={`w-full px-4 py-2.5 flex items-center gap-3 text-left ${hoverLight} transition-colors ${
                    isSelected ? "bg-slate-100 dark:bg-slate-700" : ""
                  }`}
                >
                  <span className="flex-1 text-sm font-medium text-slate-900 dark:text-white">
                    {opt.label}
                  </span>
                  {isSelected && (
                    <Check className={`w-4 h-4 ${textSuccess} flex-shrink-0`} />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </Dialog>
  );
}
