// ui/src/apps/settings/dialogs/EditBookmarkDialog.tsx

import Dialog from "../../../components/Dialog";
import { Input, FormField, SecondaryButton, PrimaryButton } from "../../../components/forms";
import { h2 } from "../../../styles";
import TimeBoundsInput, { type TimeBounds } from "../../../components/TimeBoundsInput";

type EditBookmarkDialogProps = {
  isOpen: boolean;
  name: string;
  timeBounds: TimeBounds;
  onChangeName: (name: string) => void;
  onChangeTimeBounds: (bounds: TimeBounds) => void;
  onCancel: () => void;
  onSave: () => void;
};

export default function EditBookmarkDialog({
  isOpen,
  name,
  timeBounds,
  onChangeName,
  onChangeTimeBounds,
  onCancel,
  onSave,
}: EditBookmarkDialogProps) {
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

          <TimeBoundsInput
            value={timeBounds}
            onChange={onChangeTimeBounds}
            showBookmarks={false}
          />
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
