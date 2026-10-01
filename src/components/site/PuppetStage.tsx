import { useEffect, useRef } from "react";
import { ParallaxScene } from "@/components/site/ParallaxScene";
import { Pane } from "@/effects/react/Pane";
import type { ImgSource } from "@/components/site/Img";
import { addEmitter, emitterChanged, LAMP_COLOUR, makeEmitter } from "@/effects/light/lights";
import {
  addPuppet,
  AMBER,
  birdPath,
  holdFor,
  HOUSE_PATH,
  MOON_PATH,
  setStageRoomFill,
  TREE_PATH,
  WINDOW_PATH,
  WINDOW_YELLOW,
  type Puppet,
} from "@/effects/optics/puppets";

/*
 * The stage lamp (docs/research/shadows.md 6 "Build for task 83"): a point
 * -- a filament or an LED die, about 1 mm, 4 px -- so a puppet held near the
 * screen throws a crisp shadow and one held near the lamp a large, still
 * fairly sharp one. 300 px up, the site's default lamp height.
 */
const STAGE_LAMP_RADIUS = 4;
const STAGE_LAMP_HEIGHT = 300;
/* The house lights down: a dark room, 0.05-0.1 (shadows.md 6, estimate). */
const STAGE_ROOM_FILL = 0.08;

/**
 * A shadow-puppet show (item 83, ?try=puppets on Lab samples): a lamp over
 * a photograph and cut-out puppets held between them. The puppets are not
 * drawn -- you see what an audience sees, their shadows -- and every shadow
 * is the live floor light's: where it lands, how big and how soft follow
 * from each puppet's height and the lamp's, and the coloured puppets (the
 * moon, the window) throw coloured light.
 */
export function PuppetStage({ image }: { image: ImgSource | null | undefined }) {
  const stage = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const lamp = makeEmitter("stage", LAMP_COLOUR, STAGE_LAMP_HEIGHT, () => STAGE_LAMP_RADIUS, 1);
    const removeLamp = addEmitter(lamp);

    const make = (id: string, path: string, height: number, tint: Puppet["tint"]): Puppet => ({
      id,
      path: new Path2D(path),
      x: -9999,
      y: -9999,
      size: 1,
      angle: 0,
      height,
      tint,
    });
    const tree = make("tree", TREE_PATH, 10, [0, 0, 0]);
    const house = make("house", HOUSE_PATH, 24, [0, 0, 0]);
    const glazing = make("window", WINDOW_PATH, 24, WINDOW_YELLOW);
    const moon = make("moon", MOON_PATH, 140, AMBER);
    const bird = make("bird", birdPath(0), 60, [0, 0, 0]);
    const all = [tree, house, glazing, moon, bird];
    const removers = all.map(addPuppet);

    let inView = false;
    const seen = new IntersectionObserver(([e]) => {
      inView = Boolean(e?.isIntersecting);
    });
    seen.observe(el);

    let frame = 0;
    let last = 0;
    const start = performance.now();
    const step = (now: number) => {
      frame = requestAnimationFrame(step);
      // Puppets move at a hand's pace: 30 frames a second is plenty.
      if (now - last < 33) return;
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      const s = (now - start) / 1000;
      // The house lights go down over about a second as the stage comes into view.
      lamp.charge += ((inView ? 1 : 0) - lamp.charge) * Math.min(1, dt * 3);
      if (lamp.charge < 0.002) lamp.charge = 0;
      setStageRoomFill(lamp.charge > 0 ? 1 - (1 - STAGE_ROOM_FILL) * lamp.charge : 1);

      const r = el.getBoundingClientRect();
      const lx = r.left + r.width * 0.5;
      const ly = r.top + r.height * 0.42;
      lamp.x = lx;
      lamp.y = ly;
      const H = STAGE_LAMP_HEIGHT;
      // Place each puppet by where its SHADOW should fall, as a puppeteer does.
      const place = (p: Puppet, fx: number, fy: number, shadowSize: number, angle = 0) => {
        const hold = holdFor(
          r.left + r.width * fx,
          r.top + r.height * fy,
          shadowSize,
          p.height,
          lx,
          ly,
          H,
        );
        p.x = hold.x;
        p.y = hold.y;
        p.size = hold.size;
        p.angle = angle;
      };
      const u = r.height;
      place(tree, 0.17, 0.62, u * 0.5, 0.025 * Math.sin(s * 0.9));
      place(house, 0.82, 0.66, u * 0.42);
      place(glazing, 0.82, 0.66, u * 0.42);
      place(moon, 0.68, 0.2, u * 0.2, -0.3 + 0.05 * Math.sin(s * 0.2));
      /*
       * The bird flies a loop across the screen and in depth: drawn toward
       * the lamp its shadow grows and spreads, back near the screen it
       * shrinks and sharpens (shadows.md 2.2).
       */
      const phase = (s / 14) * Math.PI * 2;
      bird.height = 30 + 110 * (0.5 + 0.5 * Math.sin(phase * 2));
      bird.path = new Path2D(birdPath(Math.sin(s * Math.PI * 2 * 2.2)));
      bird.flip = Math.cos(phase) < 0;
      place(bird, 0.5 + 0.34 * Math.sin(phase), 0.34 + 0.08 * Math.sin(phase * 2 + 1), u * 0.3);

      if (lamp.charge > 0 || inView) emitterChanged();
    };
    frame = requestAnimationFrame(step);

    return () => {
      cancelAnimationFrame(frame);
      seen.disconnect();
      removers.forEach((f) => f());
      removeLamp();
      setStageRoomFill(1);
      emitterChanged();
    };
  }, []);

  return (
    <ParallaxScene image={image} scrim="none" height="">
      <div ref={stage} className="relative h-[80svh] min-h-[480px]" data-lab-puppets>
        <Pane className="absolute bottom-6 left-6 max-w-md !p-5">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Shadow puppets</p>
          <p className="mt-3 text-sm text-muted-foreground">
            A point lamp over the photograph and cut-outs held between them. You see only the
            shadows, as an audience does: a puppet near the screen is sharp and life-size; drawn
            toward the lamp, its shadow grows and softens. The moon and the window are coloured
            cellophane.
          </p>
        </Pane>
      </div>
    </ParallaxScene>
  );
}
