// CRC-16/Modbus, for the client-side framing *detector*.
//
// Framing itself is done in Rust — the serial reader and `apply_framing_to_capture`
// both run `wiretap_catalog::tunnel::ModbusTunnel`. This file used to sit beside a
// full TypeScript port of the framer, which went stale the moment the Rust side
// stopped brute-forcing message lengths; only the checksum was ever imported.

/**
 * Calculate CRC-16 for Modbus RTU (polynomial 0xA001)
 */
export function crc16Modbus(data: Uint8Array): number {
  let crc = 0xFFFF;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      if (crc & 0x0001) {
        crc = (crc >> 1) ^ 0xA001;
      } else {
        crc >>= 1;
      }
    }
  }
  return crc;
}
