// ui/src/apps/discovery/hooks/useModbusScanSync.ts

import { useEffect } from "react";
import { wsTransport } from "../../../services/wsTransport";
import { MsgType, decodeWsJson, type ModbusScanStateMsg } from "../../../services/wsProtocol";
import { useDiscoveryToolboxStore } from "../../../stores/discoveryToolboxStore";

/**
 * Feed the toolbox store from the running sweep's progress messages.
 *
 * Subscribes directly rather than adding a `SessionCallbacks` entry: that would
 * put a Modbus-specific callback in a generic session interface, which is the
 * layering this message type was moved to the session channel to avoid.
 *
 * The session id comes from the store, so the subscription lasts exactly as long
 * as the scan — `finishModbusScan` clearing it is what tears this down.
 */
export function useModbusScanSync() {
  const scanSessionId = useDiscoveryToolboxStore(
    (s) =>
      s.toolbox.modbusRegisterScanResults?.sessionId ??
      s.toolbox.modbusUnitIdScanResults?.sessionId ??
      null
  );

  useEffect(() => {
    if (!scanSessionId) return;

    return wsTransport.onSessionMessage(
      scanSessionId,
      MsgType.ModbusScanState,
      (_payload, raw) => {
        let state: ModbusScanStateMsg;
        try {
          state = decodeWsJson<ModbusScanStateMsg>(raw);
        } catch {
          return;
        }

        const store = useDiscoveryToolboxStore.getState();
        if (state.progress) store.updateModbusScanProgress(state.progress, state.notes);
        store.setModbusScanDevices(state.device_info);
        // The sweep publishes a terminal status on its way out — the start call
        // returned as soon as the session was running, long before there was
        // anything to report.
        if (state.status !== "scanning") store.finishModbusScan(state.notes);
      }
    );
  }, [scanSessionId]);
}
