import { useEffect } from "react";
import { previewing } from "@/effects/engine/preview";
import { addTask, ORDER } from "@/effects/engine/scheduler";
import {
  beginPass,
  blitAll,
  buildProgram,
  endPass,
  onSharedGlLoss,
  sharedGl,
} from "@/effects/engine/gl";
import { paneCanvas } from "@/effects/engine/compositor";
import { glassGeometry } from "@/effects/scene/scene";
import { pointLights, roomLight } from "@/effects/light/lights";
import { camera } from "@/effects/camera/camera";
import { t } from "@/lib/tuning";
import { DropSim } from "@/effects/water/sim";
import { WATER } from "@/effects/water/liquids";
import { rainVolume } from "@/effects/water/rain";
import {
  COMPOSE_FRAGMENT,
  COMPOSE_VERTEX,
  MAP_FRAGMENT,
  MAP_VERTEX,
  MAX_WATER_LIGHTS,
} from "@/effects/water/water.glsl";

/**
 * How many CSS px a millimetre of the glass is: the scale the drop physics
 * is measured in (docs/research/water-drops.md 7.6, still unknown; 3.6 is
 * the estimate shadows.md uses for a lamp's filament). At this scale water
 * starts to run at a contact diameter of 4.4 mm, 16 px.
 */
export const PX_PER_MM = 3.6;
/**
 * The drop map's resolution against CSS px. water-drops 7.6 planned half;
 * at this pane scale a typical rain drop is 7 px across, which half
 * resolution drew as a blocky 3-texel blob, so: full.
 */
const MAP_SCALE = 1;
/** The water layer's resolution against CSS px. */
const LAYER_SCALE = 1;

/**
 * Water drops on the glass (task 77, ?try=drops): rain lands on every pane
 * in view, beads, merges, and runs once a drop is heavy enough, leaving a
 * trail; each drop is a lens holding the photograph behind, upside down,
 * sharp through the frost, with every light's highlight on it. The
 * simulation is effects/water/sim (ported from raindrop-fx, MIT); the
 * drawing is effects/water/water.glsl.
 */
export function WaterDrops() {
  useEffect(() => {
    if (!previewing("drops")) return;
    const s = sharedGl();
    if (!s) return;
    const { gl, canvas } = s;

    const mapProgram = buildProgram(gl, MAP_VERTEX, MAP_FRAGMENT, "water map");
    const composeProgram = buildProgram(gl, COMPOSE_VERTEX, COMPOSE_FRAGMENT, "water");
    if (!mapProgram || !composeProgram) return;
    const mapPos = gl.getAttribLocation(mapProgram, "aPos");
    const mapDrop = gl.getAttribLocation(mapProgram, "aDrop");
    const composePos = gl.getAttribLocation(composeProgram, "aPos");
    const MU = (n: string) => gl.getUniformLocation(mapProgram, n);
    const CU = (n: string) => gl.getUniformLocation(composeProgram, n);
    const uMapSize = MU("uMapSize");
    const u = {
      map: CU("uMap"),
      mapUv: CU("uMapUv"),
      mapTexel: CU("uMapTexel"),
      photo: CU("uPhoto"),
      hasPhoto: CU("uHasPhoto"),
      image: CU("uImage"),
      imageFit: CU("uImageFit"),
      pane: CU("uPane"),
      scale: CU("uScale"),
      pxPerMm: CU("uPxPerMm"),
      gap: CU("uGap"),
      frostBlur: CU("uFrostBlur"),
      ior: CU("uIor"),
      room: CU("uRoom"),
      lightCount: CU("uLightCount"),
      lightPos: CU("uLightPos"),
      lightColour: CU("uLightColour"),
      lightRadius: CU("uLightRadius"),
      roomTex: CU("uRoomTex"),
      hasRoom: CU("uHasRoom"),
      roomExposure: CU("uRoomExposure"),
      viewCentre: CU("uViewCentre"),
      cameraDistance: CU("uCameraDistance"),
    };

    const quadBuffer = gl.createBuffer();
    const triangle = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, triangle);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

    // The drop map: one texture and framebuffer, as large as the largest pane needs.
    const mapTex = gl.createTexture();
    const fbo = gl.createFramebuffer();
    let texW = 0;
    let texH = 0;
    const ensureMap = (w: number, h: number) => {
      if (w <= texW && h <= texH) return;
      texW = Math.max(texW, w);
      texH = Math.max(texH, h);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, mapTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, texW, texH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, mapTex, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    };

    // The photographs, as textures (as GlassLight loads them).
    const photos = new Map<string, WebGLTexture | null>();
    const photo = (src: string) => {
      if (photos.has(src)) return photos.get(src) ?? null;
      photos.set(src, null);
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const tex = gl.createTexture();
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        photos.set(src, tex);
        task.wake();
      };
      img.src = src;
      return null;
    };

    // The room the glass reflects (effects/optics/environment), level 0 as GlassSolid loads it.
    let room: WebGLTexture | null = null;
    const roomSrc = document.documentElement.getAttribute("data-room-hdr");
    if (roomSrc) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width = 1024;
        c.height = 256;
        c.getContext("2d")?.drawImage(img, 0, 0, c.width, c.height);
        room = gl.createTexture();
        gl.activeTexture(gl.TEXTURE3);
        gl.bindTexture(gl.TEXTURE_2D, room);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, c);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        task.wake();
      };
      img.src = roomSrc;
    }

    // How much the pane blurs what is behind it, from its backdrop-filter (as GlassLight reads it).
    const blurOf = new WeakMap<HTMLElement, number>();
    const paneBlur = (el: HTMLElement) => {
      let b = blurOf.get(el);
      if (b === undefined) {
        const m = /blur\(([\d.]+)px\)/.exec(getComputedStyle(el).backdropFilter || "");
        b = m ? Number(m[1]) : 30;
        blurOf.set(el, b);
      }
      return b;
    };

    const sims = new Map<HTMLElement, DropSim>();
    // For the verification rigs (dev only): the sims, to count drops and runners.
    if (import.meta.env.DEV) (window as unknown as { __waterSims?: unknown }).__waterSims = sims;
    const layers = new Map<HTMLElement, HTMLCanvasElement>();
    let seed = 1;
    let rng = 0x2545f491;
    const random = () => {
      rng ^= rng << 13;
      rng ^= rng >>> 17;
      rng ^= rng << 5;
      return (rng >>> 0) / 4294967296;
    };
    let verts = new Float32Array(6 * 6 * 64);
    const lightPos = new Float32Array(MAX_WATER_LIGHTS * 3);
    const lightColour = new Float32Array(MAX_WATER_LIGHTS * 3);
    const lightRadius = new Float32Array(MAX_WATER_LIGHTS);
    let idleTimer = 0;

    const drawPane = (pane: ReturnType<typeof glassGeometry>[number], sim: DropSim) => {
      const w = Math.max(1, Math.round(pane.w * LAYER_SCALE));
      const h = Math.max(1, Math.round(pane.h * LAYER_SCALE));
      let layer = layers.get(pane.el);
      if (!layer || !layer.isConnected) {
        layer = paneCanvas(pane.el, "pane:water");
        layers.set(pane.el, layer);
      }
      if (sim.count === 0) {
        layer.getContext("2d")?.clearRect(0, 0, layer.width, layer.height);
        return;
      }
      if (!beginPass(w, h, "water")) return;
      const mw = Math.max(1, Math.round(pane.w * MAP_SCALE));
      const mh = Math.max(1, Math.round(pane.h * MAP_SCALE));
      ensureMap(mw, mh);

      // 1. The drop map.
      const need = sim.count * 36;
      if (verts.length < need) verts = new Float32Array(need * 2);
      let k = 0;
      for (let i = 0; i < sim.count; i++) {
        const a = sim.radius(i);
        const h0 = sim.capHeight(i);
        // Stretched along its run as it speeds up (raindrop-fx raindrop.ts L82-L85).
        const speed = Math.hypot(sim.vx[i]!, sim.vy[i]!);
        const e = 0.3 * (2 / Math.PI) * Math.atan(0.018 * speed);
        const sy = 1 + e;
        const sx = 1 / Math.sqrt(sy);
        const cx = sim.x[i]! * PX_PER_MM;
        const cy = sim.y[i]! * PX_PER_MM;
        const rx = a * PX_PER_MM * sx * 1.05;
        const ry = a * PX_PER_MM * sy * 1.05;
        const corners = [
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, -1],
          [1, 1],
          [-1, 1],
        ] as const;
        for (const [qx, qy] of corners) {
          verts[k++] = cx + qx * rx;
          verts[k++] = cy + qy * ry;
          verts[k++] = qx * 1.05;
          verts[k++] = qy * 1.05;
          verts[k++] = a;
          verts[k++] = h0;
        }
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.viewport(0, 0, mw, mh);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.useProgram(mapProgram);
      gl.uniform2f(uMapSize, pane.w, pane.h);
      gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, verts.subarray(0, k), gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(mapPos);
      gl.vertexAttribPointer(mapPos, 2, gl.FLOAT, false, 24, 0);
      gl.enableVertexAttribArray(mapDrop);
      gl.vertexAttribPointer(mapDrop, 4, gl.FLOAT, false, 24, 8);
      gl.drawArrays(gl.TRIANGLES, 0, k / 6);
      gl.disableVertexAttribArray(mapDrop);
      gl.disable(gl.BLEND);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);

      // 2. The water layer.
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(composeProgram);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, mapTex);
      gl.uniform1i(u.map, 2);
      gl.uniform2f(u.mapUv, mw / texW, mh / texH);
      gl.uniform2f(u.mapTexel, 1 / texW, 1 / texH);
      const tex = pane.src ? photo(pane.src) : null;
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(u.photo, 1);
      gl.uniform1f(u.hasPhoto, tex ? 1 : 0);
      gl.uniform4f(u.image, pane.ix, pane.iy, pane.iw, pane.ih);
      gl.uniform3f(u.imageFit, pane.ia, pane.ifocus.x, pane.ifocus.y);
      gl.uniform4f(u.pane, pane.x, pane.y, pane.w, pane.h);
      gl.uniform1f(u.scale, LAYER_SCALE);
      gl.uniform1f(u.pxPerMm, PX_PER_MM);
      /*
       * What the drop images: the frosted back face, the glass's thickness
       * behind it, blurred as the pane blurs; or, with the front etched too
       * (?try=satin), the photograph itself, the gap further back.
       */
      const frontEtched = previewing("satin") && pane.causes.material.frost > 0;
      const frosted = pane.causes.material.frost > 0 && !frontEtched;
      gl.uniform1f(
        u.gap,
        frosted ? pane.causes.thickness : pane.causes.gap + pane.causes.thickness,
      );
      gl.uniform1f(u.frostBlur, frosted ? paneBlur(pane.el) : 0);
      gl.uniform1f(u.ior, WATER.n);
      gl.uniform3f(u.room, 0.05, 0.045, 0.04);
      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, room);
      gl.uniform1i(u.roomTex, 3);
      gl.uniform1f(u.hasRoom, room ? 1 : 0);
      gl.uniform1f(u.roomExposure, roomLight.gain);
      const vw = document.documentElement.clientWidth || window.innerWidth;
      const vhNow = document.documentElement.clientHeight || window.innerHeight;
      gl.uniform2f(u.viewCentre, vw / 2, vhNow / 2);
      gl.uniform1f(u.cameraDistance, camera.distance(vw));
      let n = 0;
      for (const l of pointLights()) {
        if (n >= MAX_WATER_LIGHTS || l.below || l.charge <= 0.002) continue;
        lightPos[n * 3] = l.x;
        lightPos[n * 3 + 1] = l.y;
        lightPos[n * 3 + 2] = Math.max(l.height, 20);
        const strength = l.charge * Math.min(l.gain / 8, 2);
        lightColour[n * 3] = l.colour[0] * strength;
        lightColour[n * 3 + 1] = l.colour[1] * strength;
        lightColour[n * 3 + 2] = l.colour[2] * strength;
        lightRadius[n] = l.radius;
        n++;
      }
      gl.uniform1i(u.lightCount, n);
      gl.uniform3fv(u.lightPos, lightPos);
      gl.uniform3fv(u.lightColour, lightColour);
      gl.uniform1fv(u.lightRadius, lightRadius);
      gl.bindBuffer(gl.ARRAY_BUFFER, triangle);
      gl.enableVertexAttribArray(composePos);
      gl.vertexAttribPointer(composePos, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.disableVertexAttribArray(composePos);
      blitAll(canvas, layer);
      endPass();
    };

    let lastLights = "";
    const task = addTask("water", ORDER.passes, (_now, dtMs) => {
      const dt = Math.min(dtMs / 1000, 0.25);
      const vh = document.documentElement.clientHeight || window.innerHeight;
      // Rain: drops per second per square centimetre of glass ("Rain").
      const rain = t("rainAmount");
      let busy = rain > 0;
      // The lights, to redraw highlights when they move.
      const lightsNow = pointLights()
        .filter((l) => !l.below && l.charge > 0.002)
        .map((l) => `${Math.round(l.x)},${Math.round(l.y)},${l.charge.toFixed(2)}`)
        .join(";");
      const lightsMoved = lightsNow !== lastLights;
      lastLights = lightsNow;
      for (const pane of glassGeometry()) {
        if (pane.y + pane.h < 0 || pane.y > vh || pane.w < 40 || pane.h < 40) continue;
        // A drop shows the photograph behind its pane; a pane with none (the header bar) gets no rain yet.
        if (!pane.src) continue;
        let sim = sims.get(pane.el);
        if (!sim) {
          sim = new DropSim({
            width: pane.w / PX_PER_MM,
            height: pane.h / PX_PER_MM,
            seed: seed++,
          });
          sims.set(pane.el, sim);
        }
        const areaCm2 = (sim.width * sim.height) / 100;
        const expected = rain * areaCm2 * dt;
        let spawn = Math.floor(expected);
        if (random() < expected - spawn) spawn++;
        for (let q = 0; q < spawn; q++) {
          sim.addVolume(
            random() * sim.width,
            random() * sim.height,
            rainVolume(random(), random()),
            WATER.id,
          );
        }
        const moved = sim.step(dt) || spawn > 0;
        if (moved) busy = true;
        if (moved || lightsMoved || !layers.has(pane.el)) drawPane(pane, sim);
      }
      if (!busy) {
        // Nothing runs: evaporation still goes on, slowly (water-drops 6.1: 4 Hz is plenty).
        window.clearTimeout(idleTimer);
        idleTimer = window.setTimeout(() => task.wake(), 250);
      }
      return busy;
    });
    const wake = () => task.wake();
    window.addEventListener("pointermove", wake, { passive: true });
    window.addEventListener("scroll", wake, { passive: true });
    task.wake();

    const stopLoss = onSharedGlLoss(
      () => task.stop(),
      () => {},
    );
    return () => {
      task.stop();
      stopLoss();
      window.clearTimeout(idleTimer);
      window.removeEventListener("pointermove", wake);
      window.removeEventListener("scroll", wake);
      for (const layer of layers.values()) layer.remove();
      for (const tex of photos.values()) if (tex) gl.deleteTexture(tex);
      gl.deleteTexture(mapTex);
      gl.deleteFramebuffer(fbo);
      gl.deleteBuffer(quadBuffer);
      gl.deleteBuffer(triangle);
    };
  }, []);
  return null;
}
