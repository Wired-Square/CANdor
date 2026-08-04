// io/modbus_rtu/mod.rs
//
// Modbus RTU master source for polling registers over serial.
// Uses raw serial I/O with Modbus RTU framing (CRC-16).
//
// DORMANT — deliberately. `ModbusRtuSource` is complete but has no callers:
// `modbus_rtu` is absent from `IOProfileKind`, from `is_realtime_device` and
// from `create_reader_session`'s match, so no profile can reach it. Nothing here
// is wired to the Modbus discovery work (probe/sweep/range polling), which is
// TCP-only. Wiring it up means adding the profile kind, its settings UI, and an
// RTU transport for the scanner — a deliberate piece of work, not a tidy-up.
//
// Note the name collision: the *serial framing encoding* also called
// "modbus_rtu" (`framing.rs`, `io/serial/utils.rs`) is a different feature.

mod reader;

pub use reader::{ModbusRtuConfig, ModbusRtuSource};
