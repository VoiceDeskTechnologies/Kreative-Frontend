# KREATIVE Studio Template and DSP Audit

## Scope

This audit covers the built-in template catalog, template compilation/application, the browser
AudioWorklet, Web Audio routing, and the AI mix-plan validation path.

The templates are starter settings, not a substitute for source analysis. The audio engine applies
the template on-device; the backend does not process raw audio.

## Verified processing path

- Template plugin names are resolved through the registered plugin catalog before application.
- Template settings are merged into the track `Fx` state and sent to the corresponding Web Audio
  nodes or `kreative-fx` AudioWorklet parameters.
- Insert order is represented visually by slots. The engine uses one fixed processing graph, so
  insert slot order is not currently an audio-order contract.
- Console EQ and parametric EQ use native `BiquadFilterNode` filters.
- Dynamics compression uses `DynamicsCompressorNode`.
- Gate, expander, dynamic EQ, saturation, amp modeling, stereo utility, and pitch correction use
  the AudioWorklet.
- Reverb uses a browser `ConvolverNode` return. Delay uses stereo Web Audio delay nodes.
- Full-mix templates use vocal, reverb, delay, and master buses with explicit send/return routing.
- Delay buses carry an eighth-note or dotted-eighth tempo-sync declaration.

## Template decisions

### Vocals

- Lead-vocal high-pass defaults are generally in the 65–80 Hz range instead of one universal
  cutoff.
- Support vocals use higher high-pass defaults, normally 95–115 Hz, to preserve lead-vocal room.
- Most corrective cuts are between 1.5 and 2.5 dB with Q values around 1–2.
- Vocal compression is normally 2:1–3:1 with moderate attack/release values.
- Vocal doubles and harmonies use restrained width values and some mono reinforcement.
- The registry now contains an original frequency-selective KREATIVE De-Esser. It is not a clone of
  Waves R-DeEsser and does not use Waves code or artwork.
- Pitch correction is optional and is only enabled by templates that explicitly request it.

### Instrumentals

- Two-track templates avoid pretending that kick, bass, snare, and melodic elements are
  independently available.
- Beat repair EQ is deliberately limited to low-mid corrective moves.
- Beat compression and saturation are optional or mixed conservatively where possible.

### Full mix and mastering

- Shared reverb and delay returns are used instead of putting time effects directly on every vocal.
- Full-mix sends normally range from approximately -14 dB to -22 dB.
- Master templates use a limited processor count and preserve a nominal -1 dB ceiling target.
- The aggressive rap vocal starter was reduced from -24 dB / 6:1 compression to -18 dB / 4:1 so
  it remains assertive without starting heavily flattened.

## Parameter validation

`template-parameters.ts` defines processor-specific metadata for supported numeric parameters:

- Units: dB, Hz, seconds, ratio, normalized, degrees, semitones, or enum.
- Supported minimum and maximum.
- Recommended step.
- Maximum change per AI iteration.
- Whether analysis is required.
- Whether automatic adjustment is safe.

The AI patch schema now rejects unknown numeric parameters, non-finite values, invalid types, and
out-of-range values using these definitions. Template-generated AI limits use the same definitions
instead of a generic percentage around the starting value.

## AI/template guardrails

Every template now carries:

- Maximum corrective EQ cut: 3 dB.
- Maximum corrective EQ Q: 2.5.
- Maximum stereo width: 1.15.
- Mastering ceiling target: -1 dB.
- Gain-reduction targets:
  - Tracks: 1–5 dB.
  - Buses: 0–3 dB.
  - Mastering: 0–2 dB.
- Instructions to re-analyze before corrective EQ, avoid stacking compression, preserve mono
  compatibility, and keep changes reversible.

These values are currently template metadata and client-side plan validation. A future server-side
AI plan endpoint should repeat the same validation before accepting an action plan.

## Known limitations

- The KREATIVE De-Esser is a browser-native detector/reducer, not a Waves R-DeEsser clone.
- True-peak estimation and loudness-matched A/B utilities are available, but are not yet a complete
  automatic mastering validation loop.
- The AudioWorklet pitch shifter uses smoother cubic-interpolated dual-head granular playback. It
  is an original browser implementation, not a licensed or equivalent Elastique processor.
- Template processing constraints are not yet automatically enforced against every post-processing
  measurement. They guide the AI plan and validate parameter ranges; result-quality validation
  remains the next engineering step.
- Insert slots do not change the fixed internal DSP order.
- No claim is made that a template has been professionally listening-tested solely because its
  unit tests pass.

## Validation performed

- Template library validation passes for all built-in templates.
- Template references resolve to registered processors and known `Fx` parameters.
- Full-mix routing tests cover required buses, send targets, and feedback-loop protection.
- Template engineering-guardrail tests pass.
- Frontend production build passes.
