use std::{fs, process::Command};

#[cfg(target_os = "macos")]
#[test]
fn temporary_profile_is_rejected_before_global_state_is_created() -> anyhow::Result<()> {
    let root = tempfile::tempdir()?;
    let home = root.path().join("home");
    let config = root.path().join("temporary-profile/.browseros/config.json");
    fs::create_dir_all(&home)?;
    fs::create_dir_all(
        config
            .parent()
            .ok_or_else(|| anyhow::anyhow!("config parent"))?,
    )?;
    fs::write(&config, "{}")?;
    let output = Command::new(env!("CARGO_BIN_EXE_browseros-claw-server-rs"))
        .env("HOME", &home)
        .env_remove("BROWSERCLAW_DIR")
        .arg("--config")
        .arg(&config)
        .output()?;
    assert!(output.status.success());
    assert!(
        String::from_utf8_lossy(&output.stderr)
            .contains("global MCP sidecar disabled for a non-primary browser profile")
    );
    assert!(!home.join(".browserclaw").exists());
    assert!(!home.join(".claude.json").exists());
    assert!(!home.join(".codex").exists());
    Ok(())
}
