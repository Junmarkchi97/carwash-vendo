"use client";

import { formatPeso } from "@/lib/currency";
import { useEffect, useRef, useState } from "react";

function roundPhp(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n);
}

/**
 * Counts peso totals with a roller-style stepped animation on increases/decreases.
 * Large jumps use a short eased sweep so the UI never stalls for seconds.
 */
export function AnimatedPesoAmount({
  valuePhp,
  className,
}: {
  valuePhp: number;
  className?: string;
}) {
  const target = roundPhp(valuePhp);
  const [display, setDisplay] = useState(target);
  const displayRef = useRef(target);

  useEffect(() => {
    const from = displayRef.current;
    if (target === from) return;

    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      displayRef.current = target;
      setDisplay(target);
      return;
    }

    let cancelled = false;
    let intervalId: number | null = null;
    let rafId: number | null = null;

    const cleanup = () => {
      if (intervalId !== null) {
        window.clearInterval(intervalId);
        intervalId = null;
      }
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    };

    const steps = Math.abs(target - from);
    const dir = target > from ? 1 : -1;

    /** Many steps: eased sweep (still shows changing integers each frame). */
    if (steps > 120) {
      const duration = Math.min(2000, 650 + steps * 1.8);
      const t0 = performance.now();
      const tick = (now: number) => {
        if (cancelled) return;
        const t = Math.min(1, (now - t0) / duration);
        const eased = 1 - (1 - t) * (1 - t);
        const v = Math.round(from + (target - from) * eased);
        displayRef.current = v;
        setDisplay(v);
        if (t < 1) {
          rafId = requestAnimationFrame(tick);
        } else {
          displayRef.current = target;
          setDisplay(target);
        }
      };
      rafId = requestAnimationFrame(tick);
      return () => {
        cancelled = true;
        cleanup();
      };
    }

    const maxDuration = 2200;
    const msPerStep = Math.max(22, Math.min(56, maxDuration / Math.max(1, steps)));
    let current = from;

    intervalId = window.setInterval(() => {
      if (cancelled) return;
      current += dir;
      if ((dir > 0 && current >= target) || (dir < 0 && current <= target)) {
        current = target;
        displayRef.current = current;
        setDisplay(current);
        if (intervalId !== null) {
          window.clearInterval(intervalId);
          intervalId = null;
        }
        return;
      }
      displayRef.current = current;
      setDisplay(current);
    }, msPerStep);

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [target]);

  return <span className={className}>{formatPeso(display)}</span>;
}
