// ui/src/apps/settings/dialogs/EditBookmarkDialog.tsx
import { useMemo } from "react";
import Dialog from "../../../components/Dialog";
import { Input, FormField, SecondaryButton, PrimaryButton } from "../../../components/forms";
import { h2 } from "../../../styles";

/** Get the local timezone abbreviation (e.g., "AEDT", "PST") */
function getLocalTimezoneAbbr(): string {
  const formatter = new Intl.DateTimeFormat("en", { timeZoneName: "short" });
  const parts = formatter.formatToParts(new Date());
  const tzPart = parts.find((p) => p.type === "timeZoneName");
  return tzPart?.value || "Local";
}

type EditBookmarkDialogProps = {
  isOpen: boolean;
  name: string;
  startTime: string;
  endTime: string;
  maxFrames: string;
  onChangeName: (name: string) => void;
  onChangeStartTime: (time: string) => void;
  onChangeEndTime: (time: string) => void;
  onChangeMaxFrames: (maxFrames: string) => void;
  onCancel: () => void;
  onSave: () => void;
};

export default function EditBookmarkDialog({
  isOpen,
  name,
  startTime,
  endTime,
  maxFrames,
  onChangeName,
  onChangeStartTime,
  onChangeEndTime,
  onChangeMaxFrames,
  onCancel,
  onSave,
}: EditBookmarkDialogProps) {
  const localTzAbbr = useMemo(() => getLocalTimezoneAbbr(), []);

  return (
    <Dialog isOpen={isOpen} maxWidth="max-w-md">
      <div className="p-6">
        <h2 className={`${h2} mb-6`}>Edit Bookmark</h2>

        <div className="space-y-4">
          <FormField label="Name" variant="default">
            <Input
              variant="default"
              value={name}
              onChange={(e) => onChangeName(e.target.value)}
              placeholder="Bookmark name"
            />
          </FormField>

          <FormField label={`From (${localTzAbbr})`} variant="default">
            <Input
              variant="default"
              type="datetime-local"
              step="1"
              value={startTime}
              onChange={(e) => onChangeStartTime(e.target.value)}
            />
          </FormField>

          <FormField label={`To (${localTzAbbr})`} variant="default">
            <Input
              variant="default"
              type="datetime-local"
              step="1"
              value={endTime}
              onChange={(e) => onChangeEndTime(e.target.value)}
            />
          </FormField>

          <FormField label="Max Frames" variant="default">
            <Input
              variant="default"
              type="number"
              min={0}
              placeholder="No limit"
              value={maxFrames}
              onChange={(e) => onChangeMaxFrames(e.target.value)}
            />
          </FormField>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <SecondaryButton onClick={onCancel}>Cancel</SecondaryButton>
          <PrimaryButton onClick={onSave} disabled={!name.trim()}>
            Save
          </PrimaryButton>
        </div>
      </div>
    </Dialog>
  );
}
