// ui/src/apps/settings/dialogs/EditSelectionSetDialog.tsx

import Dialog from "../../../components/Dialog";
import { Input, FormField, SecondaryButton, PrimaryButton } from "../../../components/forms";
import { h2 } from "../../../styles";

type EditSelectionSetDialogProps = {
  isOpen: boolean;
  name: string;
  onChangeName: (name: string) => void;
  onCancel: () => void;
  onSave: () => void;
};

export default function EditSelectionSetDialog({
  isOpen,
  name,
  onChangeName,
  onCancel,
  onSave,
}: EditSelectionSetDialogProps) {
  return (
    <Dialog isOpen={isOpen} maxWidth="max-w-md">
      <div className="p-6">
        <h2 className={`${h2} mb-6`}>Edit Selection Set</h2>

        <div className="space-y-4">
          <FormField label="Name" variant="default">
            <Input
              variant="default"
              value={name}
              onChange={(e) => onChangeName(e.target.value)}
              placeholder="Selection set name"
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
