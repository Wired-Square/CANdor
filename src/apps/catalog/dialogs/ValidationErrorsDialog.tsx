// ui/src/apps/catalog/dialogs/ValidationErrorsDialog.tsx

import { AlertTriangle, CheckCircle, X } from "lucide-react";
import Dialog from "../../../components/Dialog";
import { SecondaryButton } from "../../../components/forms";
import { h2 } from "../../../styles";
import type { ValidationError } from "../types";

type Props = {
  open: boolean;
  errors: ValidationError[];
  isValid: boolean | null;
  onClose: () => void;
};

export default function ValidationErrorsDialog({ open, errors, isValid, onClose }: Props) {
  const hasErrors = errors.length > 0;
  const isValidCatalog = isValid === true && !hasErrors;

  return (
    <Dialog isOpen={open} maxWidth="max-w-2xl">
      <div className="p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div
              className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                isValidCatalog
                  ? "bg-green-100 dark:bg-green-900/30"
                  : "bg-amber-100 dark:bg-amber-900/30"
              }`}
            >
              {isValidCatalog ? (
                <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-400" />
              ) : (
                <AlertTriangle className="w-6 h-6 text-amber-600 dark:text-amber-400" />
              )}
            </div>
            <div>
              <h2 className={h2}>
                {isValidCatalog ? "Validation Passed" : "Validation Warnings"}
              </h2>
              {hasErrors && (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {errors.length} {errors.length === 1 ? "issue" : "issues"} found
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        {isValidCatalog ? (
          <p className="text-slate-700 dark:text-slate-300 mb-6">
            The catalog is valid and ready for use.
          </p>
        ) : (
          <div className="mb-6 max-h-80 overflow-y-auto">
            <div className="space-y-2">
              {errors.map((error, idx) => (
                <div
                  key={idx}
                  className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3"
                >
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-700 dark:text-slate-300">
                        {error.message}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-mono">
                        {error.field}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <SecondaryButton onClick={onClose}>Close</SecondaryButton>
        </div>
      </div>
    </Dialog>
  );
}
