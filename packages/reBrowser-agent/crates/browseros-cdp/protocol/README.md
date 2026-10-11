# Pinned CDP protocol

`protocol.json` is an upstream protocol snapshot. The crate's `build.rs` verifies its exact bytes against `protocol.sha256` before generating bindings.

Do not format this file, including adding a final newline. Biome parses and lints it, but the repository configuration disables formatting only for this pinned input so the upstream checksum remains valid.

A deliberate protocol upgrade must refresh the snapshot and its checksum together; do not change the checksum just to accept a formatting edit.
