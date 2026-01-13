// ui/src/apps/settings/dialogs/EditCatalogDialog.tsx
import Dialog from "../../../components/Dialog";
import { Input, FormField, PrimaryButton, SecondaryButton } from "../../../components/forms";
import { h2 } from "../../../styles";

type Props = {
  isOpen: boolean;
  name: string;
  filename: string;
  onChangeName: (value: string) => void;
  onChangeFilename: (value: string) => void;
  onCancel: () => void;
  onSave: () => void;
};

export default function EditCatalogDialog({
  isOpen,
  name,
  filename,
  onChangeName,
  onChangeFilename,
  onCancel,
  onSave,
}: Props) {
  return (
    <Dialog isOpen={isOpen} maxWidth="max-w-md">
      <div className="p-6">
        <h2 className={`${h2} mb-4`}>Edit Catalog</h2>

        <div className="space-y-4">
          <FormField label="Name" variant="default">
            <Input
              variant="default"
              value={name}
              onChange={(e) => onChangeName(e.target.value)}
              placeholder="Catalog name"
            />
          </FormField>

          <FormField label="Filename" variant="default">
            <Input
              variant="default"
              value={filename}
              onChange={(e) => onChangeFilename(e.target.value)}
              placeholder="filename.toml"
            />
          </FormField>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <SecondaryButton onClick={onCancel}>Cancel</SecondaryButton>
          <PrimaryButton onClick={onSave}>Save</PrimaryButton>
        </div>
      </div>
    </Dialog>
  );
}
