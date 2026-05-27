# Phase 7 R&D Boundary

Phase 7 is isolated from the release launcher. Do not ship hooks, memory patches, or packet manipulation in the main app until a separate test harness proves that the integration is stable and allowed for the target deployment.

## Allowed In Release Builds

- Read-only process status.
- Read-only window state.
- User-initiated launcher automation.
- Packet observation only when explicitly enabled in a lab build.
- Research notes through `/api/research/notes`.

## R&D-Only Work

- DirectPlay hook prototypes.
- Winsock hook prototypes.
- Memory map documentation.
- Internal room create/join experiments.
- Packet format notes.

## Promotion Criteria

Before any R&D work can move into release:

1. It must have a reproducible local test harness.
2. It must be disabled by default.
3. It must not change game memory or network behavior without explicit user action.
4. It must have rollback behavior.
5. It must be documented in the admin/release notes.

## Current Status

The production launcher uses UI automation and read-only telemetry only. Phase 7 hooks are represented by isolated backend research notes and this document.
