// src-tauri/src/io/error.rs
//
// Structured error types for the IO module.
// Provides typed errors with device context for better diagnostics and handling.

use std::fmt;

/// Structured IO error with device context.
///
/// These error variants capture common failure modes in CAN device communication,
/// providing consistent error messages and enabling pattern matching for specific
/// error handling.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum IoError {
    /// Connection failure (TCP connect, serial open, USB claim)
    Connection { device: String, details: String },

    /// Operation timed out
    Timeout { device: String, operation: String },

    /// Protocol-level error (invalid response, parse failure, framing error)
    Protocol { device: String, details: String },

    /// Transmission failure (write error, channel closed)
    Transmission { device: String, details: String },

    /// Configuration error (invalid bitrate, unsupported option)
    Configuration { details: String },

    /// Device not found (USB enumeration, serial port not present)
    DeviceNotFound { device: String },

    /// Device is busy or locked by another process
    DeviceBusy { device: String },

    /// Read error during streaming
    Read { device: String, details: String },

    /// Generic IO error for cases that don't fit other variants
    Other { device: Option<String>, details: String },
}

impl IoError {
    /// Create a connection error
    pub fn connection(device: impl Into<String>, details: impl Into<String>) -> Self {
        Self::Connection {
            device: device.into(),
            details: details.into(),
        }
    }

    /// Create a timeout error
    pub fn timeout(device: impl Into<String>, operation: impl Into<String>) -> Self {
        Self::Timeout {
            device: device.into(),
            operation: operation.into(),
        }
    }

    /// Create a protocol error
    pub fn protocol(device: impl Into<String>, details: impl Into<String>) -> Self {
        Self::Protocol {
            device: device.into(),
            details: details.into(),
        }
    }

    /// Create a transmission error
    pub fn transmission(device: impl Into<String>, details: impl Into<String>) -> Self {
        Self::Transmission {
            device: device.into(),
            details: details.into(),
        }
    }

    /// Create a configuration error
    pub fn configuration(details: impl Into<String>) -> Self {
        Self::Configuration {
            details: details.into(),
        }
    }

    /// Create a device not found error
    pub fn not_found(device: impl Into<String>) -> Self {
        Self::DeviceNotFound {
            device: device.into(),
        }
    }

    /// Create a device busy error
    pub fn busy(device: impl Into<String>) -> Self {
        Self::DeviceBusy {
            device: device.into(),
        }
    }

    /// Create a read error
    pub fn read(device: impl Into<String>, details: impl Into<String>) -> Self {
        Self::Read {
            device: device.into(),
            details: details.into(),
        }
    }

    /// Create a generic error with device context
    pub fn other(device: impl Into<String>, details: impl Into<String>) -> Self {
        Self::Other {
            device: Some(device.into()),
            details: details.into(),
        }
    }

    /// Create a generic error without device context
    pub fn other_no_device(details: impl Into<String>) -> Self {
        Self::Other {
            device: None,
            details: details.into(),
        }
    }

    /// Get the device name if present
    pub fn device(&self) -> Option<&str> {
        match self {
            Self::Connection { device, .. } => Some(device),
            Self::Timeout { device, .. } => Some(device),
            Self::Protocol { device, .. } => Some(device),
            Self::Transmission { device, .. } => Some(device),
            Self::Configuration { .. } => None,
            Self::DeviceNotFound { device } => Some(device),
            Self::DeviceBusy { device } => Some(device),
            Self::Read { device, .. } => Some(device),
            Self::Other { device, .. } => device.as_deref(),
        }
    }
}

impl fmt::Display for IoError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Connection { device, details } => {
                write!(f, "[{}] connection failed: {}", device, details)
            }
            Self::Timeout { device, operation } => {
                write!(f, "[{}] {} timed out", device, operation)
            }
            Self::Protocol { device, details } => {
                write!(f, "[{}] protocol error: {}", device, details)
            }
            Self::Transmission { device, details } => {
                write!(f, "[{}] transmission failed: {}", device, details)
            }
            Self::Configuration { details } => {
                write!(f, "configuration error: {}", details)
            }
            Self::DeviceNotFound { device } => {
                write!(f, "[{}] device not found", device)
            }
            Self::DeviceBusy { device } => {
                write!(f, "[{}] device is busy", device)
            }
            Self::Read { device, details } => {
                write!(f, "[{}] read error: {}", device, details)
            }
            Self::Other { device: Some(d), details } => {
                write!(f, "[{}] {}", d, details)
            }
            Self::Other { device: None, details } => {
                write!(f, "{}", details)
            }
        }
    }
}

impl std::error::Error for IoError {}

/// Backwards compatibility: convert IoError to String for existing code.
/// This allows gradual migration - functions can return Result<T, IoError>
/// and callers expecting Result<T, String> will still work.
impl From<IoError> for String {
    fn from(err: IoError) -> String {
        err.to_string()
    }
}

/// Convert std::io::Error to IoError with device context
impl IoError {
    pub fn from_io_error(device: impl Into<String>, operation: &str, err: std::io::Error) -> Self {
        let device = device.into();
        match err.kind() {
            std::io::ErrorKind::TimedOut | std::io::ErrorKind::WouldBlock => {
                Self::Timeout {
                    device,
                    operation: operation.to_string(),
                }
            }
            std::io::ErrorKind::NotFound => Self::DeviceNotFound { device },
            std::io::ErrorKind::PermissionDenied
            | std::io::ErrorKind::AddrInUse
            | std::io::ErrorKind::AlreadyExists => Self::DeviceBusy { device },
            std::io::ErrorKind::ConnectionRefused
            | std::io::ErrorKind::ConnectionReset
            | std::io::ErrorKind::ConnectionAborted
            | std::io::ErrorKind::NotConnected => Self::Connection {
                device,
                details: err.to_string(),
            },
            _ => Self::Other {
                device: Some(device),
                details: format!("{}: {}", operation, err),
            },
        }
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_connection_error_display() {
        let err = IoError::connection("gvret_tcp(192.168.1.1:23)", "connection refused");
        assert_eq!(
            err.to_string(),
            "[gvret_tcp(192.168.1.1:23)] connection failed: connection refused"
        );
    }

    #[test]
    fn test_timeout_error_display() {
        let err = IoError::timeout("slcan(/dev/ttyUSB0)", "read");
        assert_eq!(err.to_string(), "[slcan(/dev/ttyUSB0)] read timed out");
    }

    #[test]
    fn test_protocol_error_display() {
        let err = IoError::protocol("gvret_usb", "invalid frame format");
        assert_eq!(
            err.to_string(),
            "[gvret_usb] protocol error: invalid frame format"
        );
    }

    #[test]
    fn test_configuration_error_display() {
        let err = IoError::configuration("invalid bitrate 123456");
        assert_eq!(err.to_string(), "configuration error: invalid bitrate 123456");
    }

    #[test]
    fn test_device_not_found_display() {
        let err = IoError::not_found("gs_usb(1:5)");
        assert_eq!(err.to_string(), "[gs_usb(1:5)] device not found");
    }

    #[test]
    fn test_into_string_conversion() {
        let err = IoError::timeout("device", "connect");
        let s: String = err.into();
        assert_eq!(s, "[device] connect timed out");
    }

    #[test]
    fn test_device_accessor() {
        let err = IoError::connection("mydevice", "failed");
        assert_eq!(err.device(), Some("mydevice"));

        let err = IoError::configuration("invalid");
        assert_eq!(err.device(), None);
    }

    #[test]
    fn test_from_io_error_timeout() {
        let io_err = std::io::Error::new(std::io::ErrorKind::TimedOut, "timed out");
        let err = IoError::from_io_error("device", "read", io_err);
        assert!(matches!(err, IoError::Timeout { .. }));
    }

    #[test]
    fn test_from_io_error_not_found() {
        let io_err = std::io::Error::new(std::io::ErrorKind::NotFound, "not found");
        let err = IoError::from_io_error("device", "open", io_err);
        assert!(matches!(err, IoError::DeviceNotFound { .. }));
    }

    #[test]
    fn test_from_io_error_connection() {
        let io_err = std::io::Error::new(std::io::ErrorKind::ConnectionRefused, "refused");
        let err = IoError::from_io_error("device", "connect", io_err);
        assert!(matches!(err, IoError::Connection { .. }));
    }
}
