# reBrowser

reBrowser is a development fork of [BrowserOS](https://github.com/browseros-ai/BrowserOS), maintained by [BlueOriginAI](https://github.com/BlueOriginAI). It keeps the Chromium browser, AI assistant, local MCP tools, and agent cockpit as the starting point for our own browser development.

Repository: https://github.com/BlueOriginAI/reBrowser

## Development status

- Product name: **reBrowser**, including the agent-focused build.
- Initial changes cover product descriptors, macOS bundle/profile identities, extension names, page titles, and visible sidebar names.
- Internal `browseros` / `browserclaw` build keys and APIs remain compatible with upstream.
- This is a source fork, not a published installer. Icons, cloud service integrations, release signing, Windows/Linux install identities, and update infrastructure still need fork-specific work before distribution.

Read [our development guide](docs/remocode-development.md) before building. The [original upstream README](README.upstream.md) is preserved for attribution and architecture reference; its download links, services, and benchmarks refer to BrowserOS, not to a reBrowser release.

## License and provenance

The original [AGPL-3.0 license](LICENSE), component licenses, and copyright notices are retained. This fork does not imply endorsement by BrowserOS. Changes distributed to users must comply with the applicable source-availability requirements.
