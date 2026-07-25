/**
 * lib/mock/services/timeline.ts — the deterministic async engine every mock
 * service is built on (spec §2, §22).
 *
 * runTimeline() plays an ordered list of steps with fixed delays, invoking a
 * subscriber per step. Every timer is registered globally so Reset Demo (or a
 * route change) can cancel ALL in-flight mock work — no stale updates, ever.
 */

export interface StepSpec<T> {
  /** ms after the previous step (deterministic fixture value). */
  delay: number;
  emit: T;
}

export interface TimelineHandle {
  /** Resolves true when finished, false when cancelled. */
  done: Promise<boolean>;
  cancel: () => void;
}

/** All live cancellers — cancelAllMockWork() sweeps this on Reset. */
const active = new Set<() => void>();

export function cancelAllMockWork(): void {
  for (const cancel of Array.from(active)) cancel();
  active.clear();
}

export function runTimeline<T>(
  steps: StepSpec<T>[],
  onStep: (emit: T, index: number) => void,
  opts?: { instant?: boolean },
): TimelineHandle {
  if (opts?.instant) {
    steps.forEach((s, i) => onStep(s.emit, i));
    return { done: Promise.resolve(true), cancel: () => {} };
  }

  let timer: ReturnType<typeof setTimeout> | null = null;
  let cancelled = false;
  let resolveDone: (v: boolean) => void = () => {};
  const done = new Promise<boolean>((res) => (resolveDone = res));

  const cancel = () => {
    if (cancelled) return;
    cancelled = true;
    if (timer) clearTimeout(timer);
    active.delete(cancel);
    resolveDone(false);
  };
  active.add(cancel);

  let i = 0;
  const next = () => {
    if (cancelled) return;
    if (i >= steps.length) {
      active.delete(cancel);
      resolveDone(true);
      return;
    }
    const step = steps[i];
    timer = setTimeout(() => {
      if (cancelled) return;
      onStep(step.emit, i);
      i += 1;
      next();
    }, step.delay);
  };
  next();

  return { done, cancel };
}

/** Convenience: evenly-spaced stage labels (analysis/generation sequences). */
export function stageSteps(stages: string[], totalMs: number): StepSpec<string>[] {
  const gap = Math.round(totalMs / stages.length);
  return stages.map((s) => ({ delay: gap, emit: s }));
}
