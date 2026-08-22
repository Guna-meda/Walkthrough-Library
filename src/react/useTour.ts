import { useCallback, useEffect, useRef, useState } from "react";
import { TourPlayer } from "../player.js";
import type { Flow, Step } from "../types.js";

export interface UseTourResult {
  start: (flow: Flow) => void;
  next: () => void;
  stop: () => void;
  currentStepId: string | null;
  isActive: boolean;
}

/**
 * Thin React wrapper around the core TourPlayer. The player instance is created
 * once (via useRef) and survives re-renders; currentStepId/isActive mirror the
 * player's own onStepChange callback into React state, and the player is stopped
 * automatically on unmount.
 */
export function useTour(): UseTourResult {
  const playerRef = useRef<TourPlayer | null>(null);
  if (playerRef.current === null) {
    playerRef.current = new TourPlayer();
  }

  const [currentStepId, setCurrentStepId] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      playerRef.current?.stop();
    };
  }, []);

  const start = useCallback((flow: Flow) => {
    playerRef.current?.start(flow, {
      onStepChange: (step: Step | null) => {
        setCurrentStepId(step ? step.id : null);
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
  };
}
