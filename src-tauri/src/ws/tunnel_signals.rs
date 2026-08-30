// Copyright 2026 Wired Square Pty Ltd

//! Turn a reassembled tunnel message into the shapes the Decoder already renders.
//!
//! `wiretap_catalog::modbus_rtu_stream` recovers the Modbus RTU message; this
//! decides what the Decoder *shows* for it. Two products per message:
//!
//! - **Signals**, so a tunnelled register lands in the signal table, graphs and
//!   dashboards like any other. Registers the catalogue describes decode
//!   through the ordinary [`wiretap_catalog::decode`] path — factor, offset,
//!   word order, enums, all of it — and uncatalogued ones fall back to raw
//!   values, so a tunnel is readable before anyone has mapped it.
//! - A **transaction** record for the Decoder's Modbus tab, carrying the raw
//!   reassembled bytes and how many frames they took.
//!
//! Request and response share one CAN id, so signals named the same on both
//! sides would overwrite each other in a store keyed by name. The synthesised
//! ones carry the direction in the name instead; register signals keep the
//! names the catalogue gave them, and only ever come from one side of a given
//! function code.

use wiretap_catalog::decode::Decoded;
use wiretap_catalog::{Catalog, Direction, ModbusRtuMessage, RegisterType, SignalFormat};

/// The Modbus function codes a tunnel can carry, for display.
fn function_label(function: u8) -> String {
    if function & 0x80 != 0 {
        return format!("0x{function:02X} Exception");
    }
    let name = match function {
        0x01 => "Read Coils",
        0x02 => "Read Discrete Inputs",
        0x03 => "Read Holding Registers",
        0x04 => "Read Input Registers",
        0x05 => "Write Single Coil",
        0x06 => "Write Single Register",
        0x0F => "Write Multiple Coils",
        0x10 => "Write Multiple Registers",
        _ => "Unknown",
    };
    format!("0x{function:02X} {name}")
}

/// Modbus exception codes worth naming; the rest show as a bare number.
fn exception_label(code: u8) -> String {
    let name = match code {
        0x01 => "Illegal Function",
        0x02 => "Illegal Data Address",
        0x03 => "Illegal Data Value",
        0x04 => "Slave Device Failure",
        0x05 => "Acknowledge",
        0x06 => "Slave Device Busy",
        0x08 => "Memory Parity Error",
        0x0A => "Gateway Path Unavailable",
        0x0B => "Gateway Target Failed To Respond",
        _ => "Unknown",
    };
    format!("0x{code:02X} {name}")
}

/// Which register bank a function code reads or writes. Needed to look the
/// register up: the same number means different things across banks.
fn register_type(function: u8) -> RegisterType {
    match function & 0x7F {
        0x01 | 0x05 | 0x0F => RegisterType::Coil,
        0x02 => RegisterType::Discrete,
        0x04 => RegisterType::Input,
        _ => RegisterType::Holding,
    }
}

fn signal(name: String, value: f64, display: String, format: Option<SignalFormat>) -> Decoded {
    Decoded {
        name,
        value,
        scaled: value,
        display,
        unit: None,
        mux_value: None,
        format,
    }
}

/// The synthesised signals describing the message itself, named for the side
/// they came from so a request and its response can both be on screen.
fn header_signals(msg: &ModbusRtuMessage, function_label: &str) -> Vec<Decoded> {
    let side = match msg.direction {
        Direction::Request => "Request",
        Direction::Response => "Response",
    };
    let name = |field: &str| format!("Modbus_{side}_{field}");

    let mut out = vec![
        signal(
            name("Device"),
            f64::from(msg.device_address),
            msg.device_address.to_string(),
            None,
        ),
        signal(
            name("Function"),
            f64::from(msg.function),
            function_label.to_string(),
            Some(SignalFormat::Enum),
        ),
    ];
    if let Some(reg) = msg.start_register {
        out.push(signal(
            name("Register"),
            f64::from(reg),
            format!("0x{reg:04X}"),
            Some(SignalFormat::Hex),
        ));
    }
    if let Some(qty) = msg.quantity {
        out.push(signal(name("Quantity"), f64::from(qty), qty.to_string(), None));
    }
    if let Some(code) = msg.exception {
        out.push(signal(
            name("Exception"),
            f64::from(code),
            exception_label(code),
            Some(SignalFormat::Enum),
        ));
    }
    out
}

/// Decode a message's register block against the catalogue, falling back to raw
/// values. Returns the signals and the name of the register frame that matched.
fn register_signals(msg: &ModbusRtuMessage, catalog: &Catalog) -> (Vec<Decoded>, Option<String>) {
    if msg.registers.is_empty() {
        return (Vec::new(), None);
    }
    let matched = msg.start_register.and_then(|reg| {
        catalog.modbus_register_frame(reg, register_type(msg.function), msg.device_address)
    });

    if let Some(frame) = matched {
        let decoded = wiretap_catalog::decode::decode_frame(catalog, frame, &msg.register_bytes());
        if !decoded.signals.is_empty() {
            return (decoded.signals, Some(frame.key.clone()));
        }
    }

    // No catalogue entry, or one that decodes nothing — show the registers
    // themselves so the tunnel is still readable.
    let side = match msg.direction {
        Direction::Request => "Request",
        Direction::Response => "Response",
    };
    let signals = msg
        .registers
        .iter()
        .enumerate()
        .map(|(i, &r)| {
            signal(
                format!("Modbus_{side}_Value_{i}"),
                f64::from(r),
                format!("0x{r:04X}"),
                Some(SignalFormat::Hex),
            )
        })
        .collect();
    (signals, None)
}

/// One decoded tunnel message: the signals to merge into the frame's entry, and
/// the transaction record for the Modbus tab.
pub struct DecodedTunnelMessage {
    pub signals: Vec<Decoded>,
    pub transaction: serde_json::Value,
}

/// Render one reassembled message for the WS payload.
pub fn decode_message(msg: &ModbusRtuMessage, catalog: &Catalog) -> DecodedTunnelMessage {
    let label = function_label(msg.function);
    let mut signals = header_signals(msg, &label);
    let (register_signals, matched_frame) = register_signals(msg, catalog);
    signals.extend(register_signals);

    let transaction = serde_json::json!({
        "protocol": "modbus_rtu",
        "direction": msg.direction.as_str(),
        "device": msg.device_address,
        "function": msg.function,
        "functionLabel": label,
        "register": msg.start_register,
        "quantity": msg.quantity,
        "values": msg.registers,
        "exception": msg.exception,
        "exceptionLabel": msg.exception.map(exception_label),
        "frame": matched_frame,
        "raw": msg.raw,
        "frames": msg.frame_count,
        // Only ever false under a lenient CRC policy, where the boundary came
        // from the length rules alone. It is what separates a recovered message
        // from a guessed one, so it has to reach the tab that shows them.
        "crcValid": msg.crc_valid,
    });

    DecodedTunnelMessage {
        signals,
        transaction,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use wiretap_catalog::ModbusRtuStream;

    const CATALOG: &str = r#"
[meta]
name = "sbr"
[frame.can."0x1E0"]
length = 8
[frame.can."0x1E0".tunnel]
protocol = "modbus_rtu"
device_address = 1

[frame.modbus.charge_limits]
register_number = 19938
register_type = "input"
length = 2
node_address = 1
[[frame.modbus.charge_limits.signals]]
name = "Charge_Current_Limit"
start_bit = 0
bit_length = 16
factor = 0.1
unit = "A"
"#;

    fn catalog() -> Catalog {
        Catalog::parse(CATALOG).unwrap()
    }

    /// Drive an exchange through one tunnel built from the catalogue's own
    /// declaration, chunked into 8-byte CAN payloads. One tunnel for the whole
    /// exchange on purpose — a response inherits its register address from the
    /// request that preceded it.
    fn exchange(catalog: &Catalog, messages: &[&str]) -> Vec<ModbusRtuMessage> {
        let declared = catalog.frame(0x1E0).unwrap().tunnel.as_ref().unwrap();
        let mut t = ModbusRtuStream::new(declared);
        let mut out = Vec::new();
        for hex in messages {
            let bytes: Vec<u8> = (0..hex.len())
                .step_by(2)
                .map(|i| u8::from_str_radix(&hex[i..i + 2], 16).unwrap())
                .collect();
            for chunk in bytes.chunks(8) {
                out.extend(t.push(chunk));
            }
        }
        out
    }

    fn display_of(signals: &[Decoded], name: &str) -> String {
        signals
            .iter()
            .find(|s| s.name == name)
            .unwrap_or_else(|| panic!("no signal {name}"))
            .display
            .clone()
    }

    #[test]
    fn request_decodes_to_header_signals() {
        let cat = catalog();
        let msgs = exchange(&cat, &["01044DE20002C691"]);
        let d = decode_message(&msgs[0], &cat);
        assert_eq!(
            display_of(&d.signals, "Modbus_Request_Function"),
            "0x04 Read Input Registers"
        );
        assert_eq!(display_of(&d.signals, "Modbus_Request_Register"), "0x4DE2");
        assert_eq!(display_of(&d.signals, "Modbus_Request_Quantity"), "2");
        assert_eq!(d.transaction["frames"], 1);
    }

    #[test]
    fn response_registers_decode_through_the_catalogue() {
        let cat = catalog();
        let msgs = exchange(&cat, &["01044DE20002C691", "01040401F40000BB8A"]);
        assert_eq!(msgs.len(), 2);

        let d = decode_message(&msgs[1], &cat);
        // 500 * 0.1 = 50 A, via the ordinary decode path.
        assert_eq!(display_of(&d.signals, "Charge_Current_Limit"), "50");
        assert_eq!(d.transaction["frame"], "charge_limits");
        assert_eq!(d.transaction["frames"], 2);
    }

    #[test]
    fn request_and_response_signals_do_not_collide() {
        let cat = catalog();
        let msgs = exchange(&cat, &["01044DE20002C691", "01040401F40000BB8A"]);
        let req: Vec<String> = decode_message(&msgs[0], &cat)
            .signals
            .iter()
            .map(|s| s.name.clone())
            .collect();
        let rsp = decode_message(&msgs[1], &cat).signals;
        // Both sides land in a store keyed by signal name, so no name may
        // appear on both — the response would silently replace the request.
        assert!(rsp.iter().all(|s| !req.contains(&s.name)), "{req:?}");
        // And none of them fakes a mux, which the signal table would render as
        // a mux group with the wrong payload bytes.
        assert!(rsp.iter().all(|s| s.mux_value.is_none()));
    }

    #[test]
    fn an_uncatalogued_register_falls_back_to_raw_values() {
        let cat = catalog();
        // Holding registers, so the input-register catalogue entry must not match.
        let msgs = exchange(
            &cat,
            &["01034DE200067292", "01030C01F40000012C000000C80000D570"],
        );
        let d = decode_message(&msgs[1], &cat);
        assert_eq!(display_of(&d.signals, "Modbus_Response_Value_0"), "0x01F4");
        assert_eq!(display_of(&d.signals, "Modbus_Response_Value_2"), "0x012C");
        assert!(d.transaction["frame"].is_null());
        assert_eq!(d.transaction["frames"], 3);
    }

    #[test]
    fn an_exception_response_is_labelled() {
        let cat = catalog();
        let msgs = exchange(&cat, &["01044DE20002C691", "018402C2C1"]);
        assert_eq!(msgs.len(), 2);
        let d = decode_message(&msgs[1], &cat);
        assert_eq!(
            display_of(&d.signals, "Modbus_Response_Exception"),
            "0x02 Illegal Data Address"
        );
        assert_eq!(d.transaction["exceptionLabel"], "0x02 Illegal Data Address");
        // The exception answers the request, so it names the register that failed.
        assert_eq!(display_of(&d.signals, "Modbus_Response_Register"), "0x4DE2");
    }
}
