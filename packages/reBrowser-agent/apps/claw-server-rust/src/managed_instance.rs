//! Authorize the macOS managed sidecar before it can touch user-wide state.
//!
//! A separate Chromium profile is not a separate OS user: it still inherits HOME.
//! In particular Playwright's temporary profiles must not publish their port or
//! reconcile the real user's MCP configs, even when no primary browser is open.

use std::path::Path;

pub const POLICY_MARKER: &str = "rebrowser-mcp-instance-policy=1;";

pub const REJECTION: &str =
    "reBrowser: global MCP sidecar disabled for a non-primary browser profile";

pub fn may_start(config: &Path) -> bool {
    #[cfg(target_os = "macos")]
    {
        let Some(home) = std::env::var_os("HOME") else {
            return false;
        };
        let primary = Path::new(&home)
            .join("Library/Application Support/RemocodeBrowserNeo/.browseros/config.json");
        same_config(config, &primary)
    }
    #[cfg(not(target_os = "macos"))]
    {
        // This fork's installed-profile identity is currently defined for macOS.
        let _ = config;
        true
    }
}

fn same_config(config: &Path, primary: &Path) -> bool {
    // Resolve both sides: substring/prefix tests would authorize sibling profiles
    // and symlinked temporary directories. Missing paths fail closed.
    match (config.canonicalize(), primary.canonicalize()) {
        (Ok(actual), Ok(expected)) => actual == expected,
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::same_config;
    use std::{fs, io, path::PathBuf};

    struct Fixture(PathBuf);
    impl Fixture {
        fn new() -> io::Result<Self> {
            let root = std::env::temp_dir().join(format!(
                "rebrowser-instance-policy-{}-{}",
                std::process::id(),
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map_err(io::Error::other)?
                    .as_nanos()
            ));
            fs::create_dir_all(&root)?;
            Ok(Self(root))
        }
        fn config(&self, profile: &str) -> io::Result<PathBuf> {
            let directory = self.0.join(profile).join(".browseros");
            fs::create_dir_all(&directory)?;
            let path = directory.join("config.json");
            fs::write(&path, "{}")?;
            Ok(path)
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn primary_profile_is_authorized() -> io::Result<()> {
        let root = Fixture::new()?;
        let primary = root.config("RemocodeBrowserNeo")?;
        assert!(same_config(&primary, &primary));
        Ok(())
    }

    #[test]
    fn temporary_and_other_profiles_cannot_claim_global_state() -> io::Result<()> {
        let root = Fixture::new()?;
        let primary = root.config("RemocodeBrowserNeo")?;
        for name in [
            "playwright_chromiumdev_profile",
            "RemocodeBrowserNeo-test",
            "other",
        ] {
            assert!(!same_config(&root.config(name)?, &primary));
        }
        Ok(())
    }

    #[test]
    fn missing_primary_does_not_promote_a_temporary_instance() -> io::Result<()> {
        let root = Fixture::new()?;
        assert!(!same_config(
            &root.config("temporary")?,
            &root.0.join("missing")
        ));
        Ok(())
    }

    #[cfg(unix)]
    #[test]
    fn symlink_alias_resolves_to_the_actual_profile() -> io::Result<()> {
        let root = Fixture::new()?;
        let primary = root.config("RemocodeBrowserNeo")?;
        let other = root.config("temporary")?;
        let alias = root.0.join("alias.json");
        std::os::unix::fs::symlink(&other, &alias)?;
        assert!(!same_config(&alias, &primary));
        fs::remove_file(&alias)?;
        std::os::unix::fs::symlink(&primary, &alias)?;
        assert!(same_config(&alias, &primary));
        Ok(())
    }
}
