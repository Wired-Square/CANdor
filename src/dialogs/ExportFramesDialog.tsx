// ui/src/dialogs/ExportFramesDialog.tsx

import { useState, useEffect } from "react";
import Dialog from "../components/Dialog";
import { Select, FormField, PrimaryButton, SecondaryButton } from "../components/forms";
import { h3, bodyDefault, caption } from "../styles";

export type ExportFormat = "csv" | "json" | "candump" | "hex" | "bin";

/** Data mode for the export dialog */
export type ExportDataMode = "frames" | "bytes";

export type ExportFramesDialogProps = {
  open: boolean;
  /** Number of items to export (frames or bytes depending on mode) */
  itemCount: number;
  /** What kind of data we're exporting */
  dataMode?: ExportDataMode;
  /** Default filename (without extension) - passed to OS file picker */
  defaultFilename?: string;
  onCancel: () => void;
  onExport: (format: ExportFormat, filename: string) => void;
};

const FRAME_FORMAT_EXTENSIONS: Record<string, string> = {
  csv: ".csv",
  json: ".json",
  candump: ".log",
};

const BYTES_FORMAT_EXTENSIONS: Record<string, string> = {
  hex: ".hex",
  bin: ".bin",
  csv: ".csv",
};

const FRAME_FORMAT_DESCRIPTIONS: Record<string, string> = {
  csv: "GVRET/SavvyCAN compatible CSV format",
  json: "JSON array of frame objects with all fields",
  candump: "Linux can-utils candump format (timestamp interface frame#data)",
};

const BYTES_FORMAT_DESCRIPTIONS: Record<string, string> = {
  hex: "Hex dump with timestamps",
  bin: "Raw binary bytes (no timestamps)",
  csv: "CSV with timestamp and byte value columns",
};

export default function ExportFramesDialog({
  open,
  itemCount,
  dataMode = "frames",
  defaultFilename,
  onCancel,
  onExport,
}: ExportFramesDialogProps) {
  const [format, setFormat] = useState<ExportFormat>(dataMode === "bytes" ? "hex" : "csv");

  // Update format when dataMode changes
  useEffect(() => {
    if (dataMode === "bytes") {
      setFormat("hex");
    } else {
      setFormat("csv");
    }
  }, [dataMode]);

  const formatExtensions = dataMode === "bytes" ? BYTES_FORMAT_EXTENSIONS : FRAME_FORMAT_EXTENSIONS;
  const formatDescriptions = dataMode === "bytes" ? BYTES_FORMAT_DESCRIPTIONS : FRAME_FORMAT_DESCRIPTIONS;
  const formatOptions = dataMode === "bytes"
    ? [{ value: "hex", label: "Hex dump" }, { value: "bin", label: "Binary" }, { value: "csv", label: "CSV" }]
    : [{ value: "csv", label: "CSV" }, { value: "json", label: "JSON" }, { value: "candump", label: "candump log" }];

  const handleExport = () => {
    const ext = formatExtensions[format] || ".txt";
    const baseName = defaultFilename || (dataMode === "bytes" ? "serial-bytes" : "can-frames");
    const fullFilename = `${baseName}${ext}`;
    onExport(format, fullFilename);
  };

  const itemLabel = dataMode === "bytes" ? "bytes" : "frames";
  const title = dataMode === "bytes" ? "Export Bytes" : "Export Frames";

  return (
    <Dialog isOpen={open} maxWidth="max-w-sm">
      <div className="p-6 space-y-4">
        <div className={h3}>{title}</div>
        <div className={bodyDefault}>
          Export {itemCount.toLocaleString()} {itemLabel} to file
        </div>

        <FormField label="Format" variant="simple">
          <Select
            variant="simple"
            value={format}
            onChange={(e) => setFormat(e.target.value as ExportFormat)}
          >
            {formatOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </Select>
        </FormField>

        <div className={caption}>
          {formatDescriptions[format]}
        </div>

        <div className="flex justify-end gap-3 pt-4">
          <SecondaryButton onClick={onCancel}>Cancel</SecondaryButton>
          <PrimaryButton onClick={handleExport}>Export</PrimaryButton>
        </div>
      </div>
    </Dialog>
  );
}
