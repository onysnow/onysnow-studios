/**
 * Winding the shutter with sustained fast pointer movement.
 *
 * No particular shape is required — circling, scrubbing, shaking, whatever.
 * Charge comes from SPEED alone, and what makes it a deliberate act is that it
 * has to be SUSTAINED: the bleed is constant, so around a second and a half of
 * continuous fast movement is needed before it fills, and it starts draining
 * the moment you slow down.
 *
 * That duration requirement is what keeps it from triggering by accident. A
 * single fast flick across the page lasts a fraction of a second and barely
 * registers; only someone deliberately keeping the pointer moving gets there.
 *
 * A generous locality bound remains, so that continuously travelling in one
 * direction — dragging a scrollbar, sweeping to a far corner — isn't mistaken
 * for winding. It is wide enough not to be felt while moving vigorously.
 */
const SAMPLE_MS = 700;
/*
 * Speed thresholds, calibrated against measured pointer motion rather than
 * guessed. Vigorous circling in place produces roughly 1300–1500 px/s; an
 * earlier REF_SPEED of 2200 meant even hard circling only earned about half
 * the gain rate, leaving a net of +0.08/s against the bleed — twelve seconds
 * to fill, which reads as broken rather than as difficult.
 */
const MIN_SPEED = 250;
const REF_SPEED = 1400;
/**
 * Max distance from the recent path's own centre. Wide on purpose: this is not
 * meant to demand small circles, only to exclude movement that is going
 * somewhere rather than staying put.
 */
const MAX_DRIFT = 520;
/*
 * Charge per second at reference speed, and the constant bleed.
 *
 * GAIN must exceed DECAY by a clear margin or the charge can never rise at all
 * — an earlier pair had the bleed larger than the gain, so the meter sat at
 * zero no matter how hard the pointer was moved. The difference between them
 * is the real fill rate: ~0.8/s here, so roughly 1.3s of hard circling to
 * fill, and the same to drain once you stop. At a measured 1350 px/s the net
 * is about +0.7/s, so roughly a second and a half of circling.
 */
const GAIN = 1.5;
const DECAY = 0.75;
/*
 * Once armed, it STAYS armed until a click spends it. No timer.
 *
 * The charge is hard to earn, so putting it on a countdown means losing it
 * while deciding where to point — which is the moment the whole thing is
 * building toward. Holding it makes the state something you own rather than
 * something you race.
 */

type Sample = { x: number; y: number; t: number };

export type ShutterChargeHandlers = {
  /** 0 → 1, every frame the value changes. */
  onCharge?: (charge: number, armed: boolean) => void;
};

export function watchShutterCharge({ onCharge }: ShutterChargeHandlers) {
  let samples: Sample[] = [];
  let charge = 0;
  let armed = false;
  let lastFrame = performance.now();
  let lastReported = -1;
  let raf = 0;
  let stopped = false;

  function onMove(event: PointerEvent) {
    samples.push({ x: event.clientX, y: event.clientY, t: performance.now() });
  }

  function frame(now: number) {
    if (stopped) return;
    const dt = Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;

    samples = samples.filter((s) => now - s.t <= SAMPLE_MS);

    let speed = 0;
    let local = false;

    if (samples.length >= 3) {
      let distance = 0;
      for (let i = 1; i < samples.length; i += 1) {
        const a = samples[i - 1]!;
        const b = samples[i]!;
        distance += Math.hypot(b.x - a.x, b.y - a.y);
      }
      const span = (samples[samples.length - 1]!.t - samples[0]!.t) / 1000;
      speed = span > 0 ? distance / span : 0;

      let cx = 0;
      let cy = 0;
      for (const s of samples) {
        cx += s.x;
        cy += s.y;
      }
      cx /= samples.length;
      cy /= samples.length;
      const furthest = Math.max(...samples.map((s) => Math.hypot(s.x - cx, s.y - cy)));
      local = furthest <= MAX_DRIFT;
    }

    if (armed) {
      // Held at full until spent, so the glow stays up while you choose a target.
      charge = 1;
    } else {
      if (local && speed > MIN_SPEED) {
        const strength = Math.min(1, (speed - MIN_SPEED) / (REF_SPEED - MIN_SPEED));
        charge += strength * GAIN * dt;
      }
      charge -= DECAY * dt;
      charge = Math.max(0, Math.min(1, charge));

      if (charge >= 1) armed = true;
    }

    const rounded = Math.round(charge * 100) / 100;
    if (rounded !== lastReported) {
      lastReported = rounded;
      onCharge?.(rounded, armed);
    }

    raf = requestAnimationFrame(frame);
  }

  window.addEventListener("pointermove", onMove, { passive: true });
  raf = requestAnimationFrame(frame);

  return {
    isArmed: () => armed,
    /** Called after the shutter fires, so the charge has to be earned again. */
    spend: () => {
      armed = false;
      charge = 0;
      lastReported = -1;
      onCharge?.(0, false);
    },
    stop: () => {
      stopped = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
    },
  };
}
