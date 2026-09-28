import { EDGE_PROFILE_GLSL } from "@/effects/optics/edge-profile.glsl";
import { REFLECTION_GLSL } from "@/effects/optics/reflection.glsl";
import { EDGE_SIDE_GLSL } from "@/effects/optics/edge-side.glsl";
import { SURFACE_LAYERS_GLSL } from "@/effects/optics/surface-layers.glsl";
import { ENVIRONMENT_GLSL } from "@/effects/optics/environment.glsl";
import { LIGHTS_GLSL } from "@/effects/light/light-uniforms";

/**
 * Fragment shader for one pane of glass.
 *
 * Built from the technique the LiquidGlass library uses, rather than from
 * guesswork: a HEIGHT FIELD over the pane, normals taken from its gradient,
 * and the backdrop SAMPLED at an offset along those normals. That last part is
 * the whole difference between refraction and a filter. A CSS filter processes
 * every pixel where it already is; refraction means fetching the backdrop from
 * somewhere else, which is why no amount of blur, brightness or tint ever
 * looked like glass here.
 *
 * The backdrop is the photograph the band is sitting on. LiquidGlass has to
 * rasterise arbitrary DOM to get a texture; this site does not, because the
 * one thing behind every pane that matters is a picture already in the page.
 *
 * Parameters carry LiquidGlass's names and its defaults as the starting point
 * — refraction 0.69, chromatic aberration 0.05, fresnel 1, edge highlight 0.05
 * — so they can be compared against the reference rather than re-invented.
 *
 * What is modelled, in the order light meets it:
 *
 *   height    the bevel. A biconvex profile, deepest at the rim, flat across
 *             the middle, which is what gives an edge its lens.
 *   normal    the gradient of that height field, from the rounded-rect SDF.
 *   refract   the backdrop sampled along the normal, per channel, because
 *             glass disperses and a real edge fringes into colour.
 *   fresnel   reflectivity climbing toward grazing angles, so the rim turns
 *             mirror-like while the centre stays a window.
 *   specular  Blinn-Phong from the cursor light, treated as a real source.
 *   arris     the lit corner, blown out by the tonemap rather than drawn.
 *   sides     the pane's thickness, opening and closing as the page scrolls.
 *   material  photographed grime, shown only where light rakes across it.
 */
export const GLASS_LIGHT_FRAGMENT_SHADER = /* glsl */ `
precision highp float;

uniform vec2  uViewport;      // device pixels
uniform float uScale;         // device pixels per CSS pixel
uniform float uRestEdge;      // how much edge shows with nothing shining

/*
 * ---- What is standing on this pane ----
 *
 * Up to MAX_OCC shadow shapes, in the pane's own pixels, already displaced by
 * each occluder's cast vector -- so these are where the shadows LAND, not
 * where the photographs sit.
 *
 * uOccRect: centre.xy, half-size.zw
 * uOccSoft: corner radius, penumbra, strength, unused
 */
#define MAX_OCC 6
uniform vec4 uOccRect[MAX_OCC];
uniform vec4 uOccSoft[MAX_OCC];
uniform float uOccCount;

uniform vec4  uRect;          // x, y, w, h of this pane, CSS pixels
uniform float uRadius;        // corner radius, CSS pixels
uniform float uEdgeWidth;     // this pane's bevel width, CSS pixels -- the one edge every effect shares
uniform float uStraight;      // 1: a full-width band -- top and bottom edges only
uniform float uTilt;          // -1 looking up at it, 1 looking down at it
uniform float uBar;           // 1: a thin fixed bar (.glass--bar), thinner glass
uniform float uThickness;     // this pane's thickness, CSS px (its data-thickness)
uniform float uSeed;
uniform float uGrimeRake;   // tunable
uniform float uGrimeSpecks; // tunable
uniform float uGrimeFloor;  // tunable
uniform float uGap;         // this pane's gap to the photographs behind it, CSS px
/*
 * The lamp's reflection on the face comes from causes only: what the glass is
 * made of (uIor), how frosted its surface is (uFrost), how high the lamp is
 * above it and how bright it is (the lights: uLightPos, uLightPower). There is no
 * glare setting -- see effects/optics/reflection.ts.
 */
uniform float uIor;          // this pane's material
uniform float uFrost;        // this pane's material
uniform float uFaceLamp;    // 1: the face's own image of the lamp is drawn (LAMP_REFLECTION_ENABLED)
// The lights: position, height above this pane, colour, power, size, charge.
${LIGHTS_GLSL}

/*
 * The room the face reflects (see effects/optics/environment.ts): an HDR
 * equirectangular band, log-encoded, with mip levels filtered in linear
 * light. Causes only: the room, the camera's distance, and how rough the
 * front face is.
 */
uniform sampler2D uRoom;
uniform float uHasRoom;
uniform float uRoomWidth;       // texels round the full 360 degrees
uniform float uCameraDistance;  // CSS pixels from the screen
uniform float uFrontRoughness;  // GGX alpha of the face you look at
uniform float uRoomExposure;    // how brightly lit the room is (1: middle grey)
uniform vec2  uEye;             // the viewer's eye, from the viewport middle, CSS px

uniform sampler2D uBackdrop;  // the photograph behind this pane
uniform float uHasBackdrop;
uniform vec4  uImage;         // x, y, w, h of the image element, CSS pixels
uniform float uImageAspect;   // intrinsic width / height
/*
 * The photograph BELOW the pane, for a band on a seam between two: its bottom
 * side face looks down at it. The same image as uBackdrop otherwise.
 */
uniform sampler2D uBackdropBelow;
uniform float uHasBelow;
uniform vec4  uImageBelow;
uniform float uImageBelowAspect;


uniform vec3  uWarm;
uniform vec3  uCool;

#define TAU 6.28318530718

/* LiquidGlass's defaults, kept by name so they can be compared with it. */
#define REFRACTION 0.69
#define CHROM_ABERRATION 0.05
#define EDGE_HIGHLIGHT 0.05
#define FRESNEL 1.0
#define MAX_BEND 34.0   // peak displacement at the rim, CSS pixels

/*
 * The side face and the arris -- their absorption, the mirror, the glints and
 * the echo -- are modelled in effects/optics/edge-side.ts (optics plan step 8,
 * from the reference photographs), shared with the CSS side layers.
 */


/*
 * The edge: rounded box, band, Fresnel rise and tonemap, from the shared
 * optics library -- the same edge the CSS bend and the light under the glass
 * are drawn from. Its width is uEdgeWidth, per pane; there is no width here.
 */
${EDGE_PROFILE_GLSL}
${REFLECTION_GLSL}
${EDGE_SIDE_GLSL}
${SURFACE_LAYERS_GLSL}
${ENVIRONMENT_GLSL}

/*
 * How much of the light is blocked at this point on the pane.
 *
 * This is the whole of the per-pixel occlusion. It replaces one number per
 * pane, which dimmed the entire rake in proportion to whatever was standing
 * in the light -- so a single photograph in a corner flattened the grime
 * across the whole band, and the dimming had no relationship to the shape of
 * the shadow you could see.
 *
 * Shadows do not add; the darkest one wins. Two overlapping prints do not
 * make a blacker hole than one, they make a hole the shape of both, so this
 * takes a max rather than a sum.
 *
 * The loop bound is a constant because GLSL ES 1.0 requires it, and the count
 * is tested inside rather than used as a break condition -- a uniform in the
 * loop condition fails to compile on some drivers, which is the kind of thing
 * that works everywhere you test it and not on somebody's laptop.
 */
float occlusionAt(vec2 local) {
  float blocked = 0.0;
  for (int i = 0; i < MAX_OCC; i++) {
    if (float(i) >= uOccCount) continue;
    vec4 rect = uOccRect[i];
    vec4 soft = uOccSoft[i];

    // Rounded-rectangle distance: negative inside, in pixels.
    vec2 q = abs(local - rect.xy) - rect.zw + soft.x;
    float d = min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - soft.x;

    // The penumbra straddles the edge, so the shadow fades across it rather
    // than stopping dead at the boundary.
    float edge = max(soft.y, 0.5);
    blocked = max(blocked, soft.z * (1.0 - smoothstep(-edge, edge, d)));
  }
  return clamp(blocked, 0.0, 1.0);
}

/*
 * The surface, photographed, laid over the pane with no repeat to spot:
 * surfaceAt() in the shared surface-layers chunk, which the light under the
 * glass reads too (see effects/optics/surface-layers.glsl.ts).
 */

/* Where a page point falls in an object-fit: cover image (x, y, w, h). */
vec2 coverUv(vec2 pt, vec4 image, float aspect) {
  vec2 rel = (pt - image.xy) / max(image.zw, vec2(1.0));
  float boxAspect = image.z / max(image.w, 1.0);
  vec2 scale = boxAspect > aspect
    ? vec2(1.0, boxAspect / aspect)
    : vec2(aspect / boxAspect, 1.0);
  return (rel - 0.5) / scale + 0.5;
}

void main() {
  // gl_FragCoord counts up from the bottom; the page counts down from the top.
  vec2 frag = vec2(gl_FragCoord.x, uViewport.y - gl_FragCoord.y) / uScale;

  vec2 halfSize = uRect.zw * 0.5;
  vec2 p = frag - (uRect.xy + halfSize);
  /*
   * A band across the whole page has no sides: they are off the screen. Its
   * edges are measured as if it ran on forever sideways, so the rim, the
   * bevel and the bend run straight across and nothing turns a corner.
   */
  vec2 edgeHalf = uStraight > 0.5 ? vec2(1e5, halfSize.y) : halfSize;
  float d = roundedBox(p, edgeHalf, uRadius);
  float inside = smoothstep(0.5, -0.5, d);

  /*
   * ---- Normal from the height field ----
   *
   * The SDF's gradient is the outward normal of the pane's edge, taken by
   * central difference. Multiplied by the slope of the height field it becomes
   * the direction and strength of the bend: hard in the bevel, nothing at all
   * across the middle, which is exactly how a pane behaves.
   */
  const float EPS = 1.0;
  float dx = roundedBox(p + vec2(EPS, 0.0), edgeHalf, uRadius)
           - roundedBox(p - vec2(EPS, 0.0), edgeHalf, uRadius);
  float dy = roundedBox(p + vec2(0.0, EPS), edgeHalf, uRadius)
           - roundedBox(p - vec2(0.0, EPS), edgeHalf, uRadius);
  vec2 grad = normalize(vec2(dx, dy) + 1e-6);

  float depth = -d;                       // positive inside
  float band = edgeBand(depth, uEdgeWidth);

  /*
   * A displacement CURVE, not the raw derivative of the height field.
   *
   * Differentiating the squircle is correct and useless: its slope is enormous
   * in the first pixel and essentially zero two pixels in, so the bend existed
   * in a band three pixels wide and there was nothing to see. What matters is
   * not the exact surface normal at a point, it is how much displacement the
   * bevel produces across its whole width — strongest at the rim, falling
   * smoothly to nothing at the inner boundary.
   *
   * pow(1 - band, 1.6), from the screen-space refraction write-up at
   * zenn.dev/orectic, which reaches the same conclusion from the other
   * direction: the falloff is what you want, not the gradient.
   */
  float curve = pow(1.0 - band, 1.6);
  // The bevel bends what is behind it toward the middle of the pane.
  vec2 bend = grad * curve * REFRACTION * MAX_BEND;

  /*
   * ---- The backdrop, sampled ----
   *
   * Mapped through object-fit: cover, so the photograph is sampled where it is
   * actually drawn rather than where its element happens to be.
   */
  vec2 rel = (frag - uImage.xy) / max(uImage.zw, vec2(1.0));
  float boxAspect = uImage.z / max(uImage.w, 1.0);
  vec2 coverScale = boxAspect > uImageAspect
    ? vec2(1.0, boxAspect / uImageAspect)
    : vec2(uImageAspect / boxAspect, 1.0);
  vec2 uvBase = (rel - 0.5) / coverScale + 0.5;
  vec2 uvBend = bend / max(uImage.zw, vec2(1.0)) / coverScale;

  /*
   * Per-channel offsets. Long wavelengths refract least, so red travels a
   * shorter path than blue — the fringe on a real glass edge is not a tint
   * applied afterwards, it is three different samples.
   */
  vec3 refracted = vec3(
    texture2D(uBackdrop, uvBase + uvBend * (1.0 - CHROM_ABERRATION)).r,
    texture2D(uBackdrop, uvBase + uvBend).g,
    texture2D(uBackdrop, uvBase + uvBend * (1.0 + CHROM_ABERRATION)).b
  );
  vec3 straight = texture2D(uBackdrop, uvBase).rgb;

  /*
   * Only the bevel refracts. Across the body of the pane the displaced sample
   * and the straight one are the same anyway, but mixing explicitly keeps the
   * middle honest if the slope ever picks up numerical noise.
   */
  float bevel = 1.0 - band;
  bevel *= bevel;
  vec3 backdrop = mix(straight, refracted, bevel) - straight;

  /*
   * ---- Fresnel ----
   * Glass is barely reflective face-on and mirror-like at a grazing angle. On
   * a flat pane the grazing angles are the rim, so reflectivity climbs there.
   */
  float facing = clamp(depth / max(min(halfSize.x, halfSize.y), 1.0), 0.0, 1.0);
  float fresnel = FRESNEL * fresnelRise(facing);

  /*
   * The lamp's own terms -- how far it reaches this point, the specular, the
   * arris glint, the piped light, the grime it rakes, its image in the face
   * -- are worked out per light in the loop over the lights below (step B of
   * the light-system design), so every light in the list lights the glass.
   */

  // ---- The surface ----
  vec3 surf = surfaceAt(frag - uRect.xy, uSeed) * uHasSurface;
  float handled = 0.35 + 0.95 * surf.b;

  /*
   * Marks, not a film.
   *
   * These were the raw texture values scaled, and the map has signal almost
   * everywhere -- so every pixel of every pane carried a little something and
   * the whole panel read as dusty rather than as glass somebody had touched.
   * A wiped pane is CLEAR across most of its face and dirty in specific
   * places.
   *
   * smoothstep is the clarity control: everything below uGrimeFloor goes to
   * zero and stays there, which is what opens the pane back up, while what is
   * above it survives at close to full strength. Raising the floor removes
   * marks rather than dimming them, which is the difference between cleaning
   * glass and looking at it in worse light.
   */
  float glint = smoothstep(uGrimeFloor, uGrimeFloor + 0.42, surf.r) * 3.4 * handled;
  float smear = smoothstep(uGrimeFloor * 0.85, uGrimeFloor * 0.85 + 0.5, surf.g) * 1.25 * handled;

  /*
   * ---- The arris ----
   *
   * The eased corner between the face and the side (effects/optics/
   * edge-side.ts). It holds every normal from the face's to the side's, so it
   * mirrors the lamp wherever the half-vector falls in that arc: a soft band
   * 1-2 px wide, brightest beside the lamp and gone along the rest of the
   * edge -- the short glints of the reference photos. Its width is the
   * corner's radius; its length is the lamp's size.
   *
   * The pixel's nearest point on the outline, and the outward normal there,
   * come from the same SDF as everything else.
   */
  float ad = abs(d);
  float arrisWear = 0.62 + 0.9 * surf.b * uHasSurface + 0.38 * (1.0 - uHasSurface);
  vec2 viewCentre = 0.5 * uViewport / uScale;
  vec3 eye = vec3(viewCentre + uEye, uCameraDistance);
  vec2 onEdge = frag - grad * d;
  float blockedEdge = occlusionAt(onEdge - uRect.xy);


  /*
   * ---- The room, in the arris ----
   *
   * Not gated on the lamp. The corner turns through a quarter circle in a
   * pixel or two, so it reflects a whole swath of the room -- for a top edge,
   * up to the ceiling and its lights -- which is why a pane's rim is bright
   * in any lit room. Four normals across the arc, each with its own Fresnel,
   * each blurred over its eighth of the arc.
   */
  vec3 ray = normalize(vec3(onEdge, 0.0) - eye);
  float texelsPerPx = uRoomWidth / (6.28318530718 * uCameraDistance) / uScale;
  float arcBias = roomLod(0.3927, uRoomWidth) - log2(max(texelsPerPx, 1e-4));
  vec3 arrisRoom = vec3(0.0);
  for (int k = 0; k < 4; k++) {
    float th = (float(k) + 0.5) * 0.3926990817;
    vec3 n = vec3(grad * sin(th), cos(th));
    vec3 r = reflect(ray, n);
    /*
     * Only the part of the arc that throws your line of sight back out into
     * the room reflects the room. Toward the side, the reflected ray runs on
     * into the page, onto the photograph -- the side's mirror, below.
     */
    arrisRoom += step(0.0, r.z) * fresnelSchlick(dot(-ray, n), uIor)
      * decodeRadiance(texture2D(uRoom, roomUvDir(r), arcBias).rgb);
  }
  arrisRoom *= 0.25 * arrisProfile(ad) * uRoomExposure * uHasRoom;

  /*
   * ---- The side faces ----
   *
   * Which of the two you can see depends on where the pane sits against your
   * eye, so they open against each other as the page scrolls; their heights
   * match the CSS side layers' (effects/scene/scene writeSides). Every boundary is
   * eased over the arris radius: nothing on a real edge is a hard step.
   *
   * The window through the side -- the photograph behind it, absorbed over
   * the long path -- is the CSS multiply layer (.glass-side): absorption
   * subtracts, and this canvas can only add. What this adds is what the side
   * REFLECTS, and the echo.
   */
  // Whole pixels, as the CSS side layers are placed (effects/scene/scene).
  float topT = floor(sideHeight(sideOpen(uTilt, 1.0), uBar, uThickness) + 0.5);
  float botT = floor(sideHeight(sideOpen(uTilt, 0.0), uBar, uThickness) + 0.5);
  float withinX = step(uRect.x, frag.x) * step(frag.x, uRect.x + uRect.z) * inside;
  float dTop = frag.y - uRect.y;
  float dBot = (uRect.y + uRect.w) - frag.y;
  float onTop = smoothstep(-ARRIS_RADIUS, ARRIS_RADIUS, dTop)
    * (1.0 - smoothstep(topT - ARRIS_RADIUS, topT + ARRIS_RADIUS, dTop)) * withinX;
  float onBot = smoothstep(-ARRIS_RADIUS, ARRIS_RADIUS, dBot)
    * (1.0 - smoothstep(botT - ARRIS_RADIUS, botT + ARRIS_RADIUS, dBot)) * withinX;

  /*
   * The side as a mirror. You see it at a grazing angle, so it reflects
   * strongly -- Fresnel from how grazing the look is, which is how thin the
   * side shows (sideCosine) -- and what it reflects is what
   * faces it: the photograph above the top edge, the one below the bottom
   * edge, reached by following the ray off the side to the photograph the
   * gap behind (mirrorReach). Its light and dark blocks are that photograph,
   * flipped and squeezed, so the pattern changes along the edge and moves as
   * your eye does.
   */
  float xLean = (frag.x - eye.x) / uCameraDistance;
  float topY = uRect.y;
  float botY = uRect.y + uRect.w;
  float fTop = fresnelSchlick(sideCosine(topT, uThickness), uIor);
  float fBot = fresnelSchlick(sideCosine(botT, uThickness), uIor);
  float zTop = uThickness * (1.0 - clamp(dTop / topT, 0.0, 1.0));
  float zBot = uThickness * (1.0 - clamp(dBot / botT, 0.0, 1.0));
  vec2 seenTop = vec2(frag.x + xLean * (uGap + zTop), topY - mirrorReach(dTop, topT, uGap, uThickness));
  vec2 seenBot = vec2(frag.x + xLean * (uGap + zBot), botY + mirrorReach(dBot, botT, uGap, uThickness));
  vec3 mirrorTop = texture2D(uBackdrop, coverUv(seenTop, uImage, uImageAspect)).rgb * uHasBackdrop;
  vec3 mirrorBot = texture2D(uBackdropBelow, coverUv(seenBot, uImageBelow, uImageBelowAspect)).rgb * uHasBelow;
  vec3 sideLight = mirrorTop * fTop * onTop + mirrorBot * fBot * onBot;

  /*
   * What the side RELAYS: looking along the slab, light from under the pane
   * reaches you by total internal reflection -- the photograph there,
   * squeezed and flipped into the side, the light and dark blocks of the
   * reference photos. Same geometry as the mirror, turned inward. Unlike the
   * reflections it HAS crossed the glass, so it is left for the side layer to
   * absorb (added after the division below).
   */
  vec2 relayTop = vec2(frag.x - xLean * (uGap + zTop), topY + mirrorReach(dTop, topT, uGap, uThickness));
  vec2 relayBot = vec2(frag.x - xLean * (uGap + zBot), botY - mirrorReach(dBot, botT, uGap, uThickness));
  vec3 relayed = RELAY_GAIN * (
    texture2D(uBackdrop, coverUv(relayTop, uImage, uImageAspect)).rgb * uHasBackdrop * onTop * (1.0 - fTop)
    + texture2D(uBackdropBelow, coverUv(relayBot, uImageBelow, uImageBelowAspect)).rgb * uHasBelow * onBot * (1.0 - fBot)
  );

  /*
   * The echo: through the face just inside the edge, the side seen again by
   * total internal reflection -- a paler copy of the edge displaced inward by
   * the side's height, its light having crossed the side twice.
   */
  vec3 behindBelow = texture2D(uBackdropBelow, coverUv(frag, uImageBelow, uImageBelowAspect)).rgb * uHasBelow;
  vec3 echoTint = exp(-SIDE_ABSORB * 2.0 * SIDE_PATH_MIN) * ECHO_GAIN;
  sideLight += echoTint * withinX * (
    straight * uHasBackdrop * echoProfile(dTop, topT) + behindBelow * echoProfile(dBot, botT)
  );



  // ---- Light off the grime ----
  /*
   * There used to be a "flashlight" here: a pool of the lamp painted on the
   * face, behind a setting that sat at zero. The lamp on the face is its
   * reflection, and that is now worked out from the material below.
   */

  /*
   * The grime, raked by the light.
   *
   * This is the term that makes a pane look USED, and it had been tuned down
   * far enough to disappear. Dust and finger-smear on glass are invisible
   * until something catches them at a shallow angle -- which is what rake is
   * -- and then they are the most obvious thing on the surface. Weak here does
   * not read as subtle, it reads as clean glass.
   *
   * The smears carry most of it now rather than the specks: a wiped pane is
   * mostly broad films with a few bright points in them, not an even dusting.
   */
  /*
   * Drawn HERE, by this pass, which is where it was and where it looked
   * right.
   *
   * It spent one commit as '.glass__grime', a tiled span inside each pane, on
   * the reasoning that a mark on a surface cannot be in front of the things
   * resting on it. The reasoning still holds. The result did not: a 2048px
   * map tiled at native size and pushed through brightness(1.8) contrast(3.2)
   * lights up 11% of every pixel on the pane and blows 5.9% of them to white,
   * which is not a wiped pane with a few marks on it, it is an even
   * high-frequency field -- generated-looking, because the arithmetic made it
   * generated. The shader's version is sparse because 'rake' is a real
   * falloff around the source rather than a mask over a repeating tile.
   *
   * The layering complaint is real and comes back with this. It is a separate
   * problem from what the marks LOOK like, and trading the look away to fix
   * it was the wrong trade.
   */
  /*
   * Cut by what is standing on the glass.
   *
   * A photograph blocking the source is also stopping that light reaching the
   * marks underneath it, so the rake has a hole in it the shape of the
   * shadow. Not taken all the way to zero: a shadow on a real pane is not a
   * void -- the grime there still catches the ambient room, just not the
   * source.
   */
  float blocked = occlusionAt(frag - uRect.xy);
  float unlit = 1.0 - blocked * 0.88;


  /*
   * Grime also scatters the light passing THROUGH the pane, not only what
   * grazes it. That was a term here scaled by a setting that sat at zero; it
   * comes back driven by the smudge layer in step 9 of the optics plan.
   */




  /*
   * What the glass does to the photograph is not gated on the charge. A pane
   * bends, absorbs and reflects what is around it whether or not anybody is
   * shining anything at it: the side's mirror and echo, and the room in the
   * arris, are there with the shutter idle.
   *
   * They are also untinted. Their colour belongs to the photograph, the room
   * and the absorption; warming it by distance from the cursor would paint
   * the light's colour onto something the light is not responsible for.
   */
  /*
   * The face's refraction is NOT done here, and cannot be.
   *
   * This canvas composites with plus-lighter, which only ever adds. Refraction
   * means MOVING pixels — the original has to be replaced, not brightened —
   * and adding a displaced copy on top of an image that is still there at full
   * strength produces a faint double exposure, which is exactly what it looked
   * like. The bevel's displacement belongs to the SVG filter in the stylesheet,
   * which samples the backdrop from another position and composites behind the
   * content where it can actually replace it.
   *
   * What the side face and the arris REFLECT stays here, because reflection
   * is genuinely additive: it lands on top of what is seen through them. The
   * absorption through the side is the CSS multiply layer.
   */
  /*
   * ---- Every light in the list ----
   *
   * Each light's contribution is worked out on its own and summed: light
   * adds (superposition). With one light the sums are that light's terms
   * exactly, so the page did not change when the loop arrived.
   */
  vec3 lampLight = vec3(0.0);     // (tint * (rim + face) + mirror) * lit, per light
  vec3 lampSpecular = vec3(0.0);  // the Blinn-Phong highlight, per light
  float lampEdge = 0.0;           // the bevel's share of each light
  for (int i = 0; i < MAX_LIGHTS; i++) {
    if (i >= uLightCount) break;
    vec2 lightXY = uLightPos[i].xy;
    float lightHeight = uLightPos[i].z;
    float lightPower = uLightPower[i];
    float charge = uLightCharge[i];

    // ---- The light, and how far it reaches this point ----
    float dl = distance(frag, lightXY);
    float direct = 1.0 / (1.0 + (dl * dl) / 3600.0);
    float spill = exp(-dl / 280.0);
    float reach = direct + spill * 0.11;

    /*
     * Grime rides the BROAD falloff, not the core.
     *
     * This was direct + spill * 0.035 -- so almost entirely the direct term,
     * which is half strength at 60px and 2% by 400px. The smears therefore existed only
     * in a tight pool directly under the cursor, which is precisely where the
     * blown core whites everything out. Raising their strength could never fix
     * that: the problem was reach, not amount.
     *
     * A smear catches any light crossing it, and at any distance the light
     * reaching it is the wide scatter rather than the hot centre. So the spill
     * term carries most of this now, and the direct term is pulled back so the
     * area around the pointer stops blowing out.
     */
    float rake = direct * 0.55 + spill * 0.6;

    /*
     * ---- Blinn-Phong specular ----
     * The cursor light is a real source, so the pane answers it with a real
     * highlight: half-vector against the surface normal, tightened by the bevel.
     */
    vec2 toLight = normalize(lightXY - frag + 1e-6);
    float ndl = max(dot(grad, toLight), 0.0);
    float specular = pow(ndl, 24.0) * bevel * direct * 3.0;


    vec3 lamp = vec3(lightXY, lightHeight);
    float arrisLamp = arrisGlint(onEdge, grad, lamp, uLightRadius[i], eye, uFrontRoughness, lightPower, uIor)
      * arrisWear * (1.0 - blockedEdge);
    /*
     * The camera's bloom round that highlight: a lens spreads a bright line
     * into a glow, and the glow is what tells you the line is bright rather
     * than merely pale. It follows the highlight -- there is no glow where the
     * arris is not lit. (It used to ride the lamp's distance, which lit the
     * whole width of a pane white whenever the lamp was near.)
     */
    float bloom = exp(-ad / 15.0) * 0.35 + exp(-ad / 48.0) * 0.05;
    vec3 rim = vec3(arrisLamp * (arrisProfile(ad) + bloom));

    /*
     * ---- Light piped through the pane ----
     *
     * A pane is a light guide. Light that gets into it is trapped by total
     * internal reflection between the two faces and travels until it reaches an
     * edge, where the angle finally breaks and it escapes -- the principle of an
     * edge-lit acrylic sign, and why the far edge of a pane glows when you put a
     * torch anywhere on it. It escapes AT the arris, so it has the arris's
     * width, and it goes green on the way: the path is the pane's width.
     *
     * Only scattered light is trapped. Light crossing clear glass leaves by the
     * far face at the angle it came in; it takes a rough surface -- the frost,
     * the grime -- to throw some of it past the critical angle. So how much is
     * piped follows the frost, and a clear pane pipes almost nothing. (It was
     * the same for every pane, with a 15 px glow of its own, which lit the
     * whole width of the edge white whenever the lamp was near.)
     */
    float toPane = roundedBox(lightXY - (uRect.xy + halfSize), halfSize, uRadius);
    float couple = exp(-max(toPane, 0.0) / 130.0) * uFrost;
    /*
     * How far it gets. Trapped light crosses the pane corner to corner, one
     * bounce every 2 t tan(critical angle) -- about 1.8 thicknesses -- and at
     * each bounce off the frosted face some of it is scattered back out: that
     * is the same frost that trapped it. So a frosted pane is a poor guide and
     * the glow dies within a few hundred pixels. And it spreads as it goes, in
     * the plane of the pane, so it thins as 1 / distance on top of that.
     * (It ran 780 px with no spreading, so the whole length of an edge lit up
     * wherever the lamp was.)
     */
    float bounce = 1.8 * uThickness;
    float escapeLength = bounce / max(0.25 * uFrost, 0.02);
    float piped = couple * exp(-dl / escapeLength) / (1.0 + dl / (4.0 * uThickness));
    vec3 pipedTint = exp(-SIDE_ABSORB * 0.45);
    rim += pipedTint * arrisProfile(ad) * 1.7 * arrisWear * piped;

    vec3 face = vec3(inside * rake * (smear * uGrimeRake + glint * uGrimeSpecks) * unlit);

    /*
     * ---- The lamp, reflected by the face ----
     *
     * Glass reflects about 4% straight on -- ((n - 1) / (n + 1))^2 -- and more
     * toward grazing. It was two settings, both at zero, so the pane reflected
     * nothing. Now it is the material's reflectance, spread by the surface's
     * roughness: polished glass gives a small, sharp, bright image of the lamp;
     * frost spreads the same light into a wide, dim sheen. Neither end is
     * tuned; both follow from uIor, uFrost and where the lamp is.
     *
     * Blocked by whatever is standing on the glass between it and the lamp.
     */
    float reflected = lampReflection(frag - lightXY, lightHeight, lightPower * uFaceLamp, uIor, uFrost);
    vec3 mirror = inside * uLightColour[i] * reflected * (1.0 - blocked);

    /*
     * Everything the light does scales with the charge, and there is genuinely
     * nothing at zero: glass does not glow, a light shining on it does. The
     * refraction is NOT gated — a pane bends what is behind it whether or not
     * anybody is shining anything at it.
     */
    float lit = charge * charge * (3.0 - 2.0 * charge);
    vec3 tint = mix(uWarm, uCool, smoothstep(0.0, 1.0, dl / 460.0));

    lampLight += (tint * (rim + face) + mirror) * lit;
    lampSpecular += vec3(specular) * inside * lit;
    lampEdge += bevel * lit * reach;
  }

  vec3 colour = sideLight + arrisRoom;
  colour += lampLight;
  /*
   * The specular is the LIGHT, so it is gated on the light. The bevel's edge
   * highlight is GEOMETRY, so it is not.
   *
   * These two were summed and put behind (0.35 + 0.65 * lit), which let 35%
   * of a Blinn-Phong highlight through at zero charge -- a soft bright blob
   * tracking the pointer across every pane whether or not anything was
   * shining. Reported twice as a glow that should not be there before the
   * charge, and both times I looked at CursorLight, which is innocent: every
   * one of its terms is already multiplied by the charge. It was this line.
   *
   * The edge highlight keeps its floor. It is the bevel catching the ambient
   * room rather than the cursor, it does not move when the pointer moves, and
   * without it the pane has no edge at all when idle.
   */
  colour += lampSpecular;
  /*
   * The resting floor is a HINT of an edge, not a third of the pane.
   *
   * At 0.35 this put the bevel's highlight across every pixel the bevel
   * touches whenever the shutter was idle -- measured at 18-37% of the pane
   * covered at mean luma 60-80, added with plus-lighter. That is not an edge
   * catching the room, it is a wash, and it is what made the panes look
   * blown out and dusty with nothing shining on them.
   *
   * The bevel is wide on purpose -- it is where the refraction lives -- so
   * anything applied across its whole width is a broad term whether or not it
   * was meant to be. Squaring it pulls the floor back to the arris, where a
   * resting highlight actually sits, and the level is a knob because how much
   * ambient a pane catches is a property of the room, not a fact.
   */
  /*
   * Both follow a source. At rest the only one is the room -- so with the
   * room's lights off (Room brightness 0) there is no resting edge at all --
   * and the lamp's share follows the lamp's reach, so an edge across the
   * page from it does not light up because the shutter is wound.
   */
  float restEdge = bevel * bevel * uRestEdge * uRoomExposure * uHasRoom;
  colour += vec3(EDGE_HIGHLIGHT) * (restEdge + lampEdge) * inside;

  // The tonemap is what blows the arris out: everything above 1.0 compresses
  // toward white, so colour survives only where the light has fallen off.
  /*
   * ---- The room, reflected by the face ----
   *
   * Not gated on the lamp: the room is lit whether or not the shutter is
   * wound, and glass reflects it either way. How much is Fresnel from the
   * material -- 4.2% straight on, rising toward grazing, and rising again at
   * the rim where the bevel turns the surface away -- and what is the room's
   * own brightness, lamps and all. In a dark room that is a faint image with
   * the lamps standing out of it, which is what a window at night shows.
   *
   * The level of the room image is set by the face's roughness: the blur it
   * puts on the reflected direction, converted to texels. The room is
   * magnified on screen, so the bias is that level minus how magnified it is.
   */
  // The reflected ray runs from the eye: (point - eye), so the room slides
  // across the face as the viewpoint moves.
  vec2 fromCentre = frag - 0.5 * uViewport / uScale - uEye;
  float cosView = uCameraDistance / length(vec3(fromCentre, uCameraDistance));
  float reflectance = fresnelSchlick(cosView, uIor);
  reflectance += (1.0 - reflectance) * fresnel;
  float roomBias = roomLod(uFrontRoughness, uRoomWidth) - log2(max(texelsPerPx, 1e-4));
  vec3 room = decodeRadiance(
    texture2D(uRoom, roomUv(fromCentre, uCameraDistance), roomBias).rgb
  );
  colour += inside * reflectance * room * uRoomExposure * uHasRoom;

  colour = toneMapGlass(colour);

  /*
   * The CSS side layers multiply everything under them by the side's
   * transmittance -- this pass included, since it is drawn inside the pane.
   * What the side and the arris REFLECT has not crossed the glass and must
   * not be absorbed, so it is divided by the same factor here, in the same
   * encoding the layers multiply in, and comes out as computed.
   */
  vec3 absorbed = vec3(1.0);
  if (dTop >= 0.0 && dTop < topT) absorbed *= sideTransmittance(dTop);
  if (dBot >= 0.0 && dBot < botT) absorbed *= sideTransmittance(dBot);
  absorbed *= (1.0 - farArrisLoss(abs(dTop - topT))) * (1.0 - farArrisLoss(abs(dBot - botT)));
  absorbed = mix(vec3(1.0), absorbed, withinX);
  colour /= pow(max(absorbed, vec3(0.05)), vec3(1.0 / 2.2));
  colour += relayed;

  /*
   * NO GRAIN HERE. Deliberately, and permanently.
   *
   * There used to be a per-pixel hash dithered in at this point, weighted by
   * 4*l*(1-l) so it peaked in the midtones. The justification was 8-bit
   * banding on smooth analytic falloffs. The result was a fine even dust over
   * the entire pane that read as a noise overlay rather than as glass, at its
   * very worst across exactly the mid-grey the panes spend most of their time
   * at. Asked for its removal repeatedly; it is gone.
   *
   * If banding ever genuinely shows, the fix is a smaller ORDERED dither tied
   * to the quantisation step, not a random field at 0.09 -- but it has not
   * shown, and the pane has no business carrying texture that is not the
   * smudge and scratch photographs.
   */

  /*
   * NOT clipped to the pane.
   *
   * Multiplying alpha by 'inside' cut every contribution off at the boundary,
   * which killed the one thing that has no business stopping there: the bloom.
   * A lit edge throws light OUT of the glass as well as into it — that spill
   * above the top of a pane is most of what tells you the edge is bright
   * rather than merely pale — and cutting it at the boundary drew a hard line
   * exactly where the glow should be softest.
   *
   * Everything that genuinely belongs inside the pane already carries its own
   * 'inside' factor: the refracted backdrop, the side band, the scattered
   * face, the reflected source, the specular. What is left unbounded is the
   * rim, which is the part that should escape.
   */
  float alpha = clamp(max(max(abs(colour.r), abs(colour.g)), abs(colour.b)), 0.0, 1.0);
  gl_FragColor = vec4(colour, alpha);
}
`;
