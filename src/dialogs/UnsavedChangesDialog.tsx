// ui/src/dialogs/UnsavedChangesDialog.tsx

import Dialog from '../components/Dialog';
import { SecondaryButton, DangerButton } from '../components/forms';
import { h2, bodyDefault, paddingDialog, gapDefault } from '../styles';

export type UnsavedChangesDialogProps = {
  isOpen: boolean;
  onCancel: () => void;
  onConfirmLeave: () => void;
};

/**
 * Dialog to confirm leaving a screen with unsaved changes.
 * Shared across Settings and Catalog Editor.
 */
export default function UnsavedChangesDialog({ isOpen, onCancel, onConfirmLeave }: UnsavedChangesDialogProps) {
  return (
    <Dialog isOpen={isOpen}>
      <div className={paddingDialog}>
        <h2 className={`${h2} mb-4`}>Unsaved Changes</h2>
        <p className={`${bodyDefault} mb-6`}>
          You have unsaved changes. Are you sure you want to leave without saving?
        </p>
        <div className={`flex justify-end ${gapDefault}`}>
          <SecondaryButton onClick={onCancel}>Cancel</SecondaryButton>
          <DangerButton onClick={onConfirmLeave}>Leave Without Saving</DangerButton>
        </div>
      </div>
    </Dialog>
  );
}
