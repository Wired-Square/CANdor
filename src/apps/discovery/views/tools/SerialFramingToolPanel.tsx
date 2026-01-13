// ui/src/apps/discovery/views/tools/SerialFramingToolPanel.tsx
//
// Options panel for Serial Framing Analysis tool in the Toolbox dialog.
// Analyzes raw bytes to detect framing protocol (SLIP, Modbus RTU, delimiters).

type Props = {
  bytesCount: number;
};

export default function SerialFramingToolPanel({ bytesCount }: Props) {
  return (
    <div className="space-y-3 text-xs">
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded p-2">
        <p className="text-blue-700 dark:text-blue-300 font-medium">
          Detect Framing Protocol
        </p>
        <p className="text-blue-600 dark:text-blue-400 mt-1">
          Analyze {bytesCount.toLocaleString()} raw bytes to identify the framing protocol.
        </p>
      </div>
      <p className="text-slate-500 dark:text-slate-400">
        Will test for:
      </p>
      <ul className="text-slate-500 dark:text-slate-400 list-disc list-inside space-y-0.5">
        <li>SLIP framing (0xC0 delimiter with escapes)</li>
        <li>Modbus RTU (CRC-16 validation)</li>
        <li>Common delimiters (CRLF, LF, NUL, etc.)</li>
      </ul>
      <p className="text-slate-400 dark:text-slate-500 mt-2 italic">
        After detecting framing, apply it to get frames for payload analysis.
      </p>
    </div>
  );
}
