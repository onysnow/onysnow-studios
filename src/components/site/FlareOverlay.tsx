import { useEffect, useRef } from "react";

/**
 * The lens flare, as footage.
 *
 * Everything else the light does is computed, and for the core and the
 * diffraction spikes that is right — they have to be pin-sharp and exactly on
 * the pointer. But the parts of a flare that sell it are the parts synthesis
 * is worst at: an anamorphic streak is not a smooth gradient, it is a dirty,
 * asymmetric, faintly banded smear that breathes as the source moves, and no
 * amount of `exp()` produces that. So those come from real footage of real
 * flares, shot through real glass.
 *
 * The clips carry no alpha — they are black-background overlays, which is what
 * lens flare footage always is. `mix-blend-mode: screen` is the right
 * compositor for that and needs no alpha channel at all: screen is
 * 1-(1-a)(1-b), so black leaves the backdrop untouched while light adds. That
 * also makes alpha-WebM, which is bigger and patchily supported, unnecessary.
 *
 * The one problem with footage is that its flare is baked where the camera put
 * it, and ours has to follow the cursor. Solved the way a compositor solves
 * it: each clip is tagged with where its light source actually sits in frame,
 * and the layer is translated so that point lands on the pointer. The flare
 * then travels as a whole, which is also what a real one does — the ghosts
 * keep their spacing relative to the source because that spacing is a property
 * of the lens, not of the scene.
 */

type Flare = {
  name: string;
  /** Where the light source sits in the clip, as a fraction of its frame. */
  anchor: { x: number; y: number };
  /** Rendered width as a fraction of the viewport's smaller side. */
  scale: number;
  opacity: number;
};

/*
 * Four clips survived the pack. The others were colour washes and haze with no
 * structure in them — bright, but nothing a flare is made of.
 */
/*
 * Scales are deliberately close to one. At 2.6 the clip covered the whole
 * viewport, so what reached the screen was not a flare but the clip's average
 * colour laid over the page — and an overlay you cannot see the edges of reads
 * as a colour cast rather than as light.
 */
const STREAK_BLUE: Flare = {
  name: "streak-blue",
  anchor: { x: 0.42, y: 0.46 },
  scale: 0.85,
  opacity: 0.26,
};
const STREAK_GREEN: Flare = {
  name: "streak-green",
  anchor: { x: 0.55, y: 0.18 },
  scale: 2.4,
  opacity: 0.5,
};
const BEAM: Flare = { name: "beam", anchor: { x: 0.12, y: 0.86 }, scale: 1.4, opacity: 0.18 };
const CHROMA: Flare = { name: "chroma", anchor: { x: 0.78, y: 0.2 }, scale: 0.75, opacity: 0.22 };

/** Kept so swapping which flare plays is a one-line change. */
void STREAK_GREEN;

/*
 * The footage leads. What the shader keeps is the core, the aperture and the
 * diffraction spikes — the parts that must be pin-sharp and exactly on the
 * pointer, and which a scaled, resampled video frame cannot give. Everything
 * that should look photographed comes from here.
 */
const ACTIVE: Flare[] = [STREAK_BLUE, CHROMA, BEAM];

export function FlareOverlay({
  chargeRef,
  positionRef,
}: {
  chargeRef: { current: number };
  positionRef: { current: { x: number; y: number } };
}) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    // The gesture that drives this needs a fine pointer, so on touch the
    // charge never leaves zero and there would be nothing to show.
    if (!window.matchMedia?.("(pointer: fine)").matches) return;

    const videos: HTMLVideoElement[] = [];
    let started = false;

    /*
     * Nothing is fetched until the shutter is first wound. A visitor who never
     * touches it never downloads a frame of this, and the decoders never spin
     * up — which matters more than the file size, because a decoding video is
     * a cost the whole page pays whether or not anyone can see it.
     */
    const start = () => {
      if (started) return;
      started = true;
      for (const flare of ACTIVE) {
        const video = document.createElement("video");
        video.className = "flare-clip";
        video.muted = true;
        video.loop = true;
        video.autoplay = true;
        video.playsInline = true;
        video.preload = "auto";
        // WebM first; the MP4 is there for Safari, which came to VP9 late and
        // on older iOS never will.
        for (const [src, type] of [
          [`/flares/${flare.name}.webm`, "video/webm"],
          [`/flares/${flare.name}.mp4`, "video/mp4"],
        ] as const) {
          const source = document.createElement("source");
          source.src = src;
          source.type = type;
          video.appendChild(source);
        }
        host.appendChild(video);
        videos.push(video);
        // Autoplay can still be refused; a flare that will not play just does
        // not appear, rather than throwing on every frame.
        void video.play().catch(() => {});
      }
    };

    let frame = 0;
    const tick = () => {
      frame = requestAnimationFrame(tick);
      const charge = chargeRef.current;
      if (charge <= 0.002) {
        if (started) for (const v of videos) v.style.opacity = "0";
        return;
      }
      start();

      const { x, y } = positionRef.current;
      const unit = Math.min(window.innerWidth, window.innerHeight);
      // Eased, so the noise floor of a drifting pointer stays dark.
      const lit = charge * charge * (3 - 2 * charge);

      for (let i = 0; i < videos.length; i += 1) {
        const video = videos[i];
        const flare = ACTIVE[i];
        if (!video || !flare) continue;
        const w = unit * flare.scale;
        // The clip's own aspect, once it is known; 16:9 until then.
        const ratio = video.videoWidth > 0 ? video.videoHeight / video.videoWidth : 0.5625;
        const h = w * ratio;
        // Put the clip's light source on the pointer.
        const left = x - w * flare.anchor.x;
        const top = y - h * flare.anchor.y;
        video.style.width = `${w}px`;
        video.style.transform = `translate3d(${left}px, ${top}px, 0)`;
        video.style.opacity = (lit * flare.opacity).toFixed(3);
      }
    };
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      for (const v of videos) {
        v.pause();
        v.remove();
      }
    };
  }, [chargeRef, positionRef]);

  return <div ref={hostRef} aria-hidden="true" className="flare-overlay" />;
}
