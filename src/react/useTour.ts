"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { TourPlayer } from "../player.js";
import type { FlowAbandonedInfo, FlowCompleteInfo, MatchLogEntry } from "../player.js";
import type { Flow, Step } from "../types.js";

/** Mirrors whichever of the player's onFlowComplete/onFlowAbandoned/onStepUnresolved
 * callbacks most recently fired, so a component can read one piece of state instead of
 * wiring up its own callbacks for all three. */
export type TourEvent =
  | { type: "complete"; info: FlowCompleteInfo }
  | { type: "abandoned"; info: FlowAbandonedInfo }
  | { type: "unresolved"; step: Step };

export interface UseTourResult {
  start: (flow: Flow) => void;
  next: () => void;
  stop: () => void;
  currentStepId: string | null;
  isActive: boolean;
  matchLog: MatchLogEntry[];
  lastEvent: TourEvent | null;
}

/**
 * Thin React wrapper around the core TourPlayer. The player instance is created
 * once (via useRef) and survives re-renders; currentStepId/isActive mirror the
 * player's own onStepChange callback into React state, matchLog mirrors
 * getMatchLog() on every step change, lastEvent mirrors the most recent
 * onFlowComplete/onFlowAbandoned/onStepUnresolved callback, and the player is
 * stopped automatically on unmount.
 */
export function useTour(): UseTourResult {
  const playerRef = useRef<TourPlayer | null>(null);
  if (playerRef.current === null) {
    playerRef.current = new TourPlayer();
  }

  const [currentStepId, setCurrentStepId] = useState<string | null>(null);
  const [matchLog, setMatchLog] = useState<MatchLogEntry[]>([]);
  const [lastEvent, setLastEvent] = useState<TourEvent | null>(null);

  useEffect(() => {
    return () => {
      playerRef.current?.stop();
    };
  }, []);

  const start = useCallback((flow: Flow) => {
    const player = playerRef.current;
    if (!player) return;
    player.start(flow, {
      onStepChange: (step: Step | null) => {
        setCurrentStepId(step ? step.id : null);
        setMatchLog(player.getMatchLog());
      },
      onFlowComplete: (info: FlowCompleteInfo) => {
        setLastEvent({ type: "complete", info });
      },
      onFlowAbandoned: (info: FlowAbandonedInfo) => {
        setLastEvent({ type: "abandoned", info });
      },
      onStepUnresolved: (step: Step) => {
        setLastEvent({ type: "unresolved", step });
      },
    });
  }, []);

  const next = useCallback(() => {
    playerRef.current?.next();
  }, []);

  const stop = useCallback(() => {
    playerRef.current?.stop();
  }, []);

  return {
    start,
    next,
    stop,
    currentStepId,
    isActive: currentStepId !== null,
    matchLog,
    lastEvent,
  };
}
