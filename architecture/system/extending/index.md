# Extending the Plugin

!!! abstract "Extension Philosophy"
    Extension work should be additive, bounded, and contract-driven. New capabilities should plug into existing ownership lines instead of introducing parallel state paths.

## Safe Extension Paths

### Add a Provider
Implement the provider contract, add provider-specific config/UI, register through ProviderRegistry, and wire lifecycle creation/teardown. Validate capabilities and read/write behavior under both nominal and failure conditions.

### Add a Feature Manager
Keep feature logic scoped under `src/features/`, subscribe through stable cache/update hooks, and ensure unload cleanup is explicit. Feature managers may observe and react; they should not silently redefine core state semantics.

### Add UI Behavior
Keep interaction handling in UI modules, but delegate business rules to core/feature layers. Any new command or setting must be reflected in User Docs and in architecture pages if ownership boundaries or data paths change.

!!! warning "Contributor Update Rule"
    When behavior changes, update only the relevant architecture sections with precise edits (append or targeted modification). Do not overwrite unrelated sections, because these pages are used as implementation contracts for both humans and chatbots.

## Safety Baseline

State mutations go through EventCache, provider-specific logic stays in provider modules, timezone/recurrence invariants stay intact, and all non-trivial extensions ship with tests plus documentation deltas.
