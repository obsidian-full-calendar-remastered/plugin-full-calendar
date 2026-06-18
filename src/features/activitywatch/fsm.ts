import { ContextProfile, TriggerRule } from '../../types/settings';

// ── Data Interfaces ──────────────────────────────────────────────────────

export interface AWEventData {
  app?: string;
  title?: string;
  url?: string;
  project?: string;
  file?: string;
  status?: string;
  [key: string]: unknown;
}

export interface AWNode {
  bucketType: string;
  data: AWEventData;
}

export interface CompoundEvent {
  startMs: number;
  endMs: number;
  states: AWNode[];
}

export interface SplitEvent {
  startMs: number;
  endMs: number;
  bucketType: string;
  data: AWEventData;
}

export interface CandidateSession {
  startMs: number;
  endMs: number;
  profile: ContextProfile;
  fitness_score: number;
  splintersInside: SplitEvent[];
  primaryEvidenceSplinters: SplitEvent[];
}

export interface FinalBlock {
  startMs: number;
  endMs: number;
  profile: ContextProfile;
  splintersInside: SplitEvent[];
  primaryEvidenceSplinters: SplitEvent[];
}

export interface SeedState {
  profileName: string;
  profileColor: string;
  state: 'warmup' | 'active';
  sessionStartMs: number;
  lastEvidenceEndMs: number;
  targetTimeMs: number;
  fitnessScoreMs: number;
}

// ── Rule Evaluation ──────────────────────────────────────────────────────
//
// Evaluates a rule against all concurrent states in a CompoundEvent time slice.
// If a match is found, returns the exact AWNode that triggered the rule.
//
export function evaluateRule(rule: TriggerRule, event: CompoundEvent): AWNode | null {
  for (const state of event.states) {
    if (rule.bucketType && rule.bucketType.trim() !== '' && rule.bucketType !== 'any') {
      if (!state.bucketType.toLowerCase().includes(rule.bucketType.toLowerCase())) continue;
    }

    let compareString = '';
    if (rule.matchField) {
      const fieldName = rule.matchField.toLowerCase();
      let fd = state.data[rule.matchField];
      if (fd === undefined) {
        const key = Object.keys(state.data).find(k => k.toLowerCase() === fieldName);
        if (key) fd = state.data[key];
      }
      if (fd !== undefined) {
        compareString = typeof fd === 'string' ? fd : JSON.stringify(fd);
      }
    }

    if (!compareString) {
      const fd =
        state.data.app ||
        state.data.url ||
        state.data.title ||
        state.data.project ||
        state.data.file ||
        '';
      compareString = typeof fd === 'string' ? fd : JSON.stringify(fd);
    }

    if (!rule.matchPattern || !compareString) continue;

    let matched: boolean;
    if (rule.useRegex) {
      try {
        matched = new RegExp(rule.matchPattern, 'i').test(compareString);
      } catch {
        matched = false;
      }
    } else {
      matched = compareString.toLowerCase().includes(rule.matchPattern.toLowerCase());
    }

    if (matched) {
      return state;
    }
  }
  return null;
}

// ── Phase 1: Hypothesis Generation (FSM) ─────────────────────────────────
//
// For each profile, walk the splintered timeline as a 3-state FSM:
//   idle → warmup → active
//
// Key design decisions:
//   - Chronological gaps between splinters are added to bufferTime
//   - Supporting evidence can sustain warmup/active sessions but cannot start from idle
//   - The committed session ends at the last match, not at trailing mismatches
//   - bufferTime is accumulated across gaps AND mismatch events,
//     and only resets on primary/supporting evidence
//
export function generateHypotheses(
  splinteredTimeline: CompoundEvent[],
  profiles: ContextProfile[],
  seedStates: SeedState[] = []
): CandidateSession[] {
  const allCandidates: CandidateSession[] = [];

  // Ensure chronological order
  const sorted = [...splinteredTimeline].sort((a, b) => a.startMs - b.startMs);
  const seedByProfile = new Map<string, SeedState>(
    seedStates.map(seed => [`${seed.profileName}::${seed.profileColor}`, seed])
  );

  for (const profile of profiles) {
    let state: 'idle' | 'warmup' | 'active' = 'idle';
    let sessionStart = -1;
    let sessionEnd = 0;
    let targetTime = 0;
    let bufferTime = 0;
    let fitnessScore = 0;
    let lastEvidenceEndMs = 0;
    let splintersInside: SplitEvent[] = [];
    let primaryEvidenceSplinters: SplitEvent[] = [];

    const thresholdMs = profile.activationThresholdMins * 60 * 1000;
    const softBreakMs = profile.softBreakLimitMins * 60 * 1000;

    const profileSeed = seedByProfile.get(`${profile.name}::${profile.color}`);
    if (profileSeed) {
      state = profileSeed.state;
      sessionStart = profileSeed.sessionStartMs;
      sessionEnd = profileSeed.lastEvidenceEndMs;
      targetTime = Math.max(profileSeed.targetTimeMs, thresholdMs);
      bufferTime = 0;
      fitnessScore = Math.max(0, profileSeed.fitnessScoreMs);
      lastEvidenceEndMs = profileSeed.lastEvidenceEndMs;
      splintersInside = [];
      primaryEvidenceSplinters = [];
    }

    const resetState = () => {
      state = 'idle';
      sessionStart = -1;
      sessionEnd = 0;
      targetTime = 0;
      bufferTime = 0;
      fitnessScore = 0;
      lastEvidenceEndMs = 0;
      splintersInside = [];
      primaryEvidenceSplinters = [];
    };

    const commitCandidate = () => {
      if (sessionStart >= 0 && lastEvidenceEndMs > sessionStart) {
        allCandidates.push({
          startMs: sessionStart,
          endMs: lastEvidenceEndMs,
          profile,
          fitness_score: fitnessScore,
          splintersInside: [...splintersInside].filter(
            s => s.startMs >= sessionStart && s.endMs <= lastEvidenceEndMs
          ),
          primaryEvidenceSplinters: [...primaryEvidenceSplinters].filter(
            s => s.startMs >= sessionStart && s.endMs <= lastEvidenceEndMs
          )
        });
      }
    };

    for (const event of sorted) {
      const duration = event.endMs - event.startMs;
      if (duration <= 0) continue; // Guard: skip degenerate events

      // ── Gap detection ──
      // If there is a chronological gap between the last processed event
      // and this one, that gap counts as idle/buffer time.
      if (state !== 'idle' && sessionEnd > 0 && event.startMs > sessionEnd) {
        const gapMs = event.startMs - sessionEnd;
        bufferTime += gapMs;
        if (bufferTime > softBreakMs) {
          if (state === 'active') commitCandidate();
          resetState();
        }
      }

      // ── Classify the event ──
      let tokenType: 'primary_match' | 'supporting_match' | 'mismatch' | 'hard_break' = 'mismatch';
      let matchedEvidence: AWNode | null = null;

      // Check hard break rules first
      let isHardBreak = false;
      for (const rule of profile.hardBreakRules || []) {
        const match = evaluateRule(rule, event);
        if (match) {
          isHardBreak = true;
          break;
        }
      }
      if (isHardBreak) {
        tokenType = 'hard_break';
      } else {
        // Check primary evidence rules first
        for (const rule of profile.primaryEvidenceRules || []) {
          const match = evaluateRule(rule, event);
          if (match) {
            tokenType = 'primary_match';
            matchedEvidence = match;
            break;
          }
        }

        // Supporting evidence only matters if no primary rule matched.
        if (tokenType === 'mismatch') {
          for (const rule of profile.supportingEvidenceRules || []) {
            const match = evaluateRule(rule, event);
            if (match) {
              tokenType = 'supporting_match';
              matchedEvidence = match;
              break;
            }
          }
        }
      }

      const rawNode =
        matchedEvidence ||
        (event.states.length > 0 ? event.states[0] : { bucketType: 'unknown', data: {} });
      const splitEvent: SplitEvent = {
        startMs: event.startMs,
        endMs: event.endMs,
        bucketType: rawNode.bucketType,
        data: rawNode.data
      };

      // ── State machine transitions ──
      if (state === 'idle') {
        if (tokenType === 'primary_match') {
          state = 'warmup';
          sessionStart = event.startMs;
          sessionEnd = event.endMs;
          lastEvidenceEndMs = event.endMs;
          targetTime = duration;
          bufferTime = 0;
          fitnessScore = duration;
          splintersInside = [splitEvent];
          primaryEvidenceSplinters = [splitEvent];
          if (targetTime >= thresholdMs) state = 'active';
        }
        // supporting_match/mismatch/hard_break while idle → stay idle
      } else if (state === 'warmup') {
        if (tokenType === 'hard_break') {
          // Explicit break kills a warmup silently (not enough time to commit)
          resetState();
        } else if (tokenType === 'mismatch') {
          bufferTime += duration;
          sessionEnd = event.endMs;
          splintersInside.push(splitEvent);
          if (bufferTime > softBreakMs) {
            resetState();
          }
        } else if (tokenType === 'supporting_match') {
          // Supporting evidence sustains continuity without helping activation.
          bufferTime = 0;
          sessionEnd = event.endMs;
          lastEvidenceEndMs = event.endMs;
          splintersInside.push(splitEvent);
        } else {
          // primary_match
          targetTime += duration;
          bufferTime = 0;
          sessionEnd = event.endMs;
          lastEvidenceEndMs = event.endMs;
          fitnessScore += duration;
          splintersInside.push(splitEvent);
          primaryEvidenceSplinters.push(splitEvent);
          if (targetTime >= thresholdMs) state = 'active';
        }
      } else {
        // state === 'active'
        if (tokenType === 'hard_break') {
          commitCandidate();
          resetState();
        } else if (tokenType === 'mismatch') {
          bufferTime += duration;
          sessionEnd = event.endMs;
          splintersInside.push(splitEvent);
          if (bufferTime > softBreakMs) {
            commitCandidate();
            resetState();
          }
        } else if (tokenType === 'supporting_match') {
          bufferTime = 0;
          sessionEnd = event.endMs;
          lastEvidenceEndMs = event.endMs;
          splintersInside.push(splitEvent);
        } else {
          // primary_match
          bufferTime = 0;
          sessionEnd = event.endMs;
          lastEvidenceEndMs = event.endMs;
          fitnessScore += duration;
          splintersInside.push(splitEvent);
          primaryEvidenceSplinters.push(splitEvent);
        }
      }
    }

    // Flush any remaining active session
    if (state === 'active') {
      commitCandidate();
    }
  }
  return allCandidates;
}

// ── Phase 2: Greedy Best-Fit Allocation ──────────────────────────────────
//
// Sort candidates by fitness descending. Higher-fitness blocks claim time
// first; lower-fitness blocks get geometrically subtracted. Surviving
// fragments must still meet the profile's activation threshold.
//
export function greedyBestFitAllocation(candidates: CandidateSession[]): FinalBlock[] {
  const finalBlocks: FinalBlock[] = [];
  const sorted = [...candidates].sort((a, b) => b.fitness_score - a.fitness_score);

  for (const cand of sorted) {
    let fragments = [{ startMs: cand.startMs, endMs: cand.endMs }];

    for (const booked of finalBlocks) {
      const newFragments: { startMs: number; endMs: number }[] = [];
      for (const frag of fragments) {
        if (frag.endMs <= booked.startMs || frag.startMs >= booked.endMs) {
          newFragments.push(frag);
        } else if (frag.startMs >= booked.startMs && frag.endMs <= booked.endMs) {
          // fully swallowed — drop it
        } else {
          if (frag.startMs < booked.startMs) {
            newFragments.push({ startMs: frag.startMs, endMs: booked.startMs });
          }
          if (frag.endMs > booked.endMs) {
            newFragments.push({ startMs: booked.endMs, endMs: frag.endMs });
          }
        }
      }
      fragments = newFragments;
    }

    for (const frag of fragments) {
      const durationMins = (frag.endMs - frag.startMs) / (60 * 1000);
      if (durationMins >= cand.profile.activationThresholdMins) {
        const subSplinters = cand.splintersInside.filter(
          s => s.endMs > frag.startMs && s.startMs < frag.endMs
        );
        finalBlocks.push({
          startMs: frag.startMs,
          endMs: frag.endMs,
          profile: cand.profile,
          splintersInside: subSplinters,
          primaryEvidenceSplinters: cand.primaryEvidenceSplinters.filter(
            s => s.endMs > frag.startMs && s.startMs < frag.endMs
          )
        });
      }
    }
  }
  return finalBlocks;
}

// ── Public Entry Point ───────────────────────────────────────────────────

export function executeFSM(
  events: CompoundEvent[],
  profiles: ContextProfile[],
  seedStates: SeedState[] = []
): FinalBlock[] {
  const candidates = generateHypotheses(events, profiles, seedStates);
  return greedyBestFitAllocation(candidates);
}
