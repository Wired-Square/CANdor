// ui/src/dialogs/ConfirmDeleteDialog.tsx

import Dialog from '../components/Dialog';
import { SecondaryButton, DangerButton } from '../components/forms';
import { h3, bodyDefault, paddingDialog, borderDefault, roundedDefault, gapDefault, textDanger } from '../styles';

export type ConfirmDeleteDialogProps = {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;

  // Optional overrides
  title?: string;
  message?: string;
  highlightText?: string;
  confirmText?: string;
  cancelText?: string;
};

export default function ConfirmDeleteDialog({
  open,
  onCancel,
  onConfirm,
  title,
  message,
  highlightText,
  confirmText,
  cancelText,
}: ConfirmDeleteDialogProps) {
  return (
    <Dialog isOpen={open}>
      <div className={`${paddingDialog} border ${borderDefault} ${roundedDefault}`}>
        <h3 className={`${h3} mb-2`}>
          {title ?? "Confirm Delete"}
        </h3>
        <p className={`${bodyDefault} mb-6`}>
          {message ?? "Delete this item?"}{" "}
          {highlightText && (
            <span className={`font-semibold ${textDanger}`}>{highlightText}</span>
          )}
        </p>
        <div className={`flex justify-end ${gapDefault}`}>
          <SecondaryButton onClick={onCancel}>
            {cancelText ?? "Cancel"}
          </SecondaryButton>
          <DangerButton onClick={onConfirm}>
            {confirmText ?? "Delete"}
          </DangerButton>
        </div>
      </div>
    </Dialog>
  );
}
