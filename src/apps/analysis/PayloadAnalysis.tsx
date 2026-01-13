// ui/src/apps/analysis/PayloadAnalysis.tsx
// Payload Analysis results panel - displays ChangesResultView in its own app tab

import { useDiscoveryStore } from "../../stores/discoveryStore";
import ChangesResultView from "../discovery/views/tools/ChangesResultView";

export default function PayloadAnalysis() {
  const results = useDiscoveryStore((s) => s.toolbox.changesResults);

  if (!results) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-900 text-center p-8">
        <div className="max-w-md">
          <h2 className="text-lg font-semibold text-slate-700 dark:text-slate-200 mb-2">
            No Payload Analysis Results
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Run the Payload Change Analysis tool from Discovery to see results here.
          </p>
        </div>
      </div>
    );
  }

  // Render the existing ChangesResultView - not embedded since this is its own panel
  return (
    <div className="h-full bg-slate-50 dark:bg-slate-900">
      <ChangesResultView />
    </div>
  );
}
