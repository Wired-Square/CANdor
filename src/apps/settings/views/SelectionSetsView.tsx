// ui/src/apps/settings/views/SelectionSetsView.tsx

import { Star, Edit2, Trash2 } from "lucide-react";
import { iconMd, flexRowGap2 } from "../../../styles/spacing";
import { cardDefault } from "../../../styles/cardStyles";
import { iconButtonHover, iconButtonHoverDanger } from "../../../styles/buttonStyles";
import type { SelectionSet } from "../../../utils/selectionSets";

type SelectionSetsViewProps = {
  selectionSets: SelectionSet[];
  onEditSelectionSet: (set: SelectionSet) => void;
  onDeleteSelectionSet: (set: SelectionSet) => void;
};

const formatDate = (timestamp: number) => {
  return new Date(timestamp).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

export default function SelectionSetsView({
  selectionSets,
  onEditSelectionSet,
  onDeleteSelectionSet,
}: SelectionSetsViewProps) {
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-[color:var(--text-primary)]">Selection Sets</h2>

      {selectionSets.length === 0 ? (
        <div className="text-center py-12 text-[color:var(--text-muted)]">
          <Star className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>No selection sets saved yet</p>
          <p className="text-sm mt-2">Create selection sets from the Decoder or Discovery apps</p>
        </div>
      ) : (
        <div className="space-y-2">
          {selectionSets.map((set) => (
            <div
              key={set.id}
              className={`flex items-center justify-between p-4 ${cardDefault}`}
            >
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <h4 className="font-medium text-[color:var(--text-primary)]">{set.name}</h4>
                </div>
                <div className="mt-1 text-sm text-[color:var(--text-muted)]">
                  {set.selectedIds?.length ?? set.frameIds.length}/{set.frameIds.length} frames selected
                  {" · "}
                  Created {formatDate(set.createdAt)}
                  {set.lastUsedAt && ` · Last used ${formatDate(set.lastUsedAt)}`}
                </div>
              </div>
              <div className={flexRowGap2}>
                <button
                  onClick={() => onEditSelectionSet(set)}
                  className={iconButtonHover}
                  title="Edit selection set"
                >
                  <Edit2 className={`${iconMd} text-[color:var(--text-muted)]`} />
                </button>
                <button
                  onClick={() => onDeleteSelectionSet(set)}
                  className={iconButtonHoverDanger}
                  title="Delete selection set"
                >
                  <Trash2 className={`${iconMd} text-[color:var(--text-red)]`} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
