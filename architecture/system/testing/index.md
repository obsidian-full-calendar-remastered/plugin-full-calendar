# Testing and Validation

!!! abstract "Validation Philosophy"
    Tests are not only regression guards; they are executable architecture checks. This project treats **Architecture Docs + Jest suite** as one contract: docs define expected behavior, tests continuously verify it.

## Verification Layers

Unit tests protect core logic, parsing, and deterministic transforms. Integration tests verify cache-provider interactions, vault propagation, recurrence behavior, and failure handling. UI behavior tests cover interaction callbacks and command-level expectations where practical.

## Recommended Validation Loop

1. `npm run compile`
2. `npm run test`
3. Reconcile behavior with architecture pages for the touched subsystem.

## Deviation Policy

!!! warning "Immediate Escalation"
    If implementation behavior conflicts with architecture docs, flag it immediately to maintainers. Resolve by either fixing code to the documented contract or updating the relevant architecture section with a precise, traceable change.

## Testing Anchors

Test doubles and vault behavior: `test_helpers/MockVault.ts`  
Core contract surface: `src/core/`  
Provider contract surface: `src/providers/`  
Feature integration surface: `src/features/`

## Documentation Synchronization Rule

Behavioral changes require synchronized updates in three places: user-facing docs, the impacted architecture page, and troubleshooting references when failure modes or limits changed.
