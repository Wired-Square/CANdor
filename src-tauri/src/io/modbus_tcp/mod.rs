// io/modbus_tcp/mod.rs
//
// Modbus TCP client driver for polling registers and scanning Modbus devices.
// - Source: catalog-driven polling of known registers
// - Scanner: one-shot discovery of registers and active unit IDs

mod conn;
pub mod poll;
pub mod ranges;
mod reader;
pub mod scan_source;
pub mod scanner;

pub use ranges::{build_polls_from_ranges, ModbusRange, ModbusRangeSpec};
pub use scan_source::{ModbusScanSource, ScanJob};
pub use reader::{ModbusTcpConfig, ModbusTcpSource, PollEmitMode, PollGroup, RegisterType};
pub use scanner::{
    FcProbeConfig, FcProbeEntry, ModbusScanConfig, ScanCompletePayload, UnitIdScanConfig,
};

/// Read `host`/`port`/`unit_id` off a Modbus profile's connection map, tolerating
/// both the string and number spellings the settings file allows. The Rust twin
/// of `modbusConnectionOf` in `src/utils/modbusProfiles.ts`.
pub fn modbus_endpoint(profile: &crate::settings::IOProfile) -> (String, u16, u8) {
    let conn = &profile.connection;
    let num = |key: &str| -> Option<i64> {
        conn.get(key)
            .and_then(|v| v.as_i64().or_else(|| v.as_str().and_then(|s| s.parse().ok())))
    };
    (
        conn.get("host").and_then(|v| v.as_str()).unwrap_or("127.0.0.1").to_string(),
        num("port").unwrap_or(502) as u16,
        num("unit_id").unwrap_or(1) as u8,
    )
}

/// Map the catalogue crate's register type onto the IO layer's enum.
fn map_register_type(rt: wiretap_catalog::modbus::RegisterType) -> RegisterType {
    use wiretap_catalog::modbus::RegisterType as Cat;
    match rt {
        Cat::Input => RegisterType::Input,
        Cat::Holding => RegisterType::Holding,
        Cat::Coil => RegisterType::Coil,
        Cat::Discrete => RegisterType::Discrete,
    }
}

/// Build Modbus poll groups from a catalogue's `[frame.modbus.*]` entries via the
/// shared `wiretap-catalog` crate (which resolves the register-from-key and
/// signal-less-register shorthands, the `register_base` protocol address, the
/// per-register slave address, and the poll interval). The single source of truth
/// for catalogue → polls, shared by the interactive editor (`catalog.polls` WS
/// command) and the MCP/headless open flow. A catalogue with no Modbus frames
/// yields no polls (not an error).
///
/// Frames marked `disabled` are skipped — the catalogue crate defines that flag
/// as "the poll task skips this frame entirely", which WireTAP previously ignored.
pub fn build_polls_from_catalog(catalog_toml: &str) -> Result<Vec<PollGroup>, String> {
    use wiretap_catalog::modbus::{ManifestError, ModbusManifest};
    let manifest = match ModbusManifest::parse(catalog_toml) {
        Ok(m) => m,
        Err(ManifestError::NoFrames) => return Ok(vec![]),
        Err(e) => return Err(format!("Failed to parse catalog: {e}")),
    };
    Ok(manifest
        .frames
        .iter()
        .filter(|f| !f.disabled)
        .map(|f| PollGroup {
            register_type: map_register_type(f.register_type),
            start_register: manifest.protocol_address(f),
            count: f.length,
            interval_ms: f.interval_ms,
            frame_id: f.register_number as u32,
            device_address: f.device_address,
            // Catalogue signals are bit offsets into the whole block.
            emit_mode: PollEmitMode::Block,
        })
        .collect())
}
