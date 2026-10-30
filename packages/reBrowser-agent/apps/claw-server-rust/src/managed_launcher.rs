//! Local compatibility launcher for an installed backend newer than this checkout.
//! Future full builds enforce the identical policy directly in main.rs.

mod managed_instance;

#[cfg(unix)]
use std::os::unix::process::CommandExt;
use std::{ffi::OsString, io, path::PathBuf, process::Command};

fn config_argument(args: &[OsString]) -> Option<PathBuf> {
    let mut found = None;
    let mut args = args.iter();
    while let Some(arg) = args.next() {
        let value = if arg == "--config" {
            Some(PathBuf::from(args.next()?))
        } else {
            arg.to_str()
                .and_then(|s| s.strip_prefix("--config="))
                .map(PathBuf::from)
        };
        if let Some(value) = value {
            if found.is_some() {
                return None;
            }
            found = Some(value);
        }
    }
    found
}

fn main() -> io::Result<()> {
    let args: Vec<OsString> = std::env::args_os().skip(1).collect();
    let version_only = args.len() == 1 && args[0] == "--version";
    if !version_only && !config_argument(&args).is_some_and(|p| managed_instance::may_start(&p)) {
        eprintln!("{}", managed_instance::REJECTION);
        return Ok(());
    }
    let backend = std::env::current_exe()?.with_file_name("reBrowser-server-core");
    #[cfg(unix)]
    {
        Err(Command::new(backend).args(args).exec())
    }
    #[cfg(not(unix))]
    {
        let status = Command::new(backend).args(args).status()?;
        std::process::exit(status.code().unwrap_or(1));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn config_argument_accepts_both_forms_but_rejects_duplicates() {
        let args = |v: &[&str]| v.iter().map(OsString::from).collect::<Vec<_>>();
        assert_eq!(
            config_argument(&args(&["--config=/a"])),
            Some(PathBuf::from("/a"))
        );
        assert_eq!(
            config_argument(&args(&["--config", "/a"])),
            Some(PathBuf::from("/a"))
        );
        assert_eq!(
            config_argument(&args(&["--config=/a", "--config=/b"])),
            None
        );
        assert_eq!(config_argument(&args(&["--config"])), None);
    }
}
