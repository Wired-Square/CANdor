// ui/src/apps/discovery/views/tools/SerialPayloadToolPanel.tsx
//
// Options panel for Serial Payload Analysis tool in the Toolbox dialog.
// Analyzes framed data to identify ID bytes and checksum positions.

type Props = {
  framesCount: number;
};

export default function SerialPayloadToolPanel({ framesCount }: Props) {
  return (
    <div className="space-y-3 text-xs">
      <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded p-2">
        <p className="text-green-700 dark:text-green-300 font-medium">
          Analyze Frame Structure
        </p>
        <p className="text-green-600 dark:text-green-400 mt-1">
          Analyze {framesCount.toLocaleString()} frames to identify payload structure.
        </p>
      </div>
      <p className="text-slate-500 dark:text-slate-400">
        Will identify:
      </p>
      <ul className="text-slate-500 dark:text-slate-400 list-disc list-inside space-y-0.5">
        <li>Candidate ID byte positions (frame type identifiers)</li>
        <li>Candidate source address positions</li>
        <li>Candidate checksum positions and algorithms</li>
      </ul>
      <p className="text-slate-400 dark:text-slate-500 mt-2 italic">
        Works best with structured protocol frames.
      </p>
    </div>
  );
}
