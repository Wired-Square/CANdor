// ui/src/apps/discovery/views/tools/ChecksumDiscoveryToolPanel.tsx

import { useTranslation } from "react-i18next";
import { useDiscoveryStore } from "../../../../stores/discoveryStore";
import { toolPanelInput, toolPanelLabel } from "../../../../styles/inputStyles";
import { textMuted, textSecondary, borderDefault } from "../../../../styles/colourTokens";

export default function ChecksumDiscoveryToolPanel() {
  const { t } = useTranslation("discovery");
  const options = useDiscoveryStore((s) => s.toolbox.checksumDiscovery);
  const updateOptions = useDiscoveryStore((s) => s.updateChecksumDiscoveryOptions);

  return (
    <div className="space-y-3 text-xs">
      <div className="space-y-1">
        <label className={toolPanelLabel}>{t("checksumDiscovery.minSamples")}</label>
        <input
          type="number"
          min={5}
          max={50}
          value={options.minSamples}
          onChange={(e) =>
            updateOptions({ minSamples: Math.max(5, Math.min(50, Number(e.target.value) || 10)) })
          }
          className={toolPanelInput}
        />
      </div>

      <div className="space-y-1">
        <label className={toolPanelLabel}>{t("checksumDiscovery.matchThreshold")}</label>
        <input
          type="number"
          min={80}
          max={100}
          value={options.minMatchRate}
          onChange={(e) =>
            updateOptions({ minMatchRate: Math.max(80, Math.min(100, Number(e.target.value) || 95)) })
          }
          className={toolPanelInput}
        />
      </div>

      <label className="flex items-start gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={options.searchCustomPolynomials}
          onChange={(e) => updateOptions({ searchCustomPolynomials: e.target.checked })}
          className="rounded mt-0.5"
        />
        <span>
          <span className={textSecondary}>{t("checksumDiscovery.searchCustomPolynomials")}</span>
          <span className={`block ${textMuted}`}>
            {t("checksumDiscovery.searchCustomPolynomialsHint")}
          </span>
        </span>
      </label>

      <p className={`${textMuted} pt-2 border-t ${borderDefault}`}>
        {t("checksumDiscovery.panelDescription")}
      </p>
    </div>
  );
}
