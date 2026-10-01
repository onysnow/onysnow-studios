/** The GLSL twin of effects/optics/casters.ts castPoint and lampDiscAt; see that file. */
export const CASTERS_GLSL = /* glsl */ `
// effects/optics/casters.ts: how much of the lamp the casters hide from a
// point P of the photograph. ch picks the mask's channel (red: just off the
// photograph; green: resting on glass); h is that channel's height.
float casterCover(sampler2D mask, vec2 viewportCss, vec2 P, vec2 L, float H, float R, float h, float extra, int ch) {
  if (h <= 0.0 || h >= H - 1.0) return 0.0;
  vec2 c = P + (L - P) * (h / H);
  vec2 toL = L - P;
  float lat = length(toL);
  vec2 rad = lat > 0.5 ? toL / lat : vec2(1.0, 0.0);
  vec2 tng = vec2(-rad.y, rad.x);
  float cosT = H / sqrt(lat * lat + H * H);
  float across = R * h / H;
  float a = sqrt(across * across + extra * extra);
  float b = sqrt((across / max(cosT, 0.2)) * (across / max(cosT, 0.2)) + extra * extra);
  float sum = 0.0;
  for (int k = 0; k < 13; k++) {
    // A centre and two rings: the lamp's disc on the caster's plane.
    float fk = float(k);
    float ring = k == 0 ? 0.0 : (k < 5 ? 0.45 : 0.9);
    float ang = k < 5 ? fk * 1.5707963 + 0.785398 : (fk - 5.0) * 0.785398;
    vec2 o = rad * (cos(ang) * ring * b) + tng * (sin(ang) * ring * a);
    vec4 m = texture2D(mask, (c + o) / viewportCss);
    sum += ch == 0 ? m.r : (ch == 1 ? m.g : m.b);
  }
  return sum / 13.0;
}
`;
