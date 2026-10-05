/* NGC 4594: a live ΛCDM model of the Sombrero galaxy, its dark matter halo and the cosmic web around it.
   Shared by index.html and demo_landing_page.html. A classic script so the pages work from file://;
   three.js is loaded with a dynamic import. */
import('https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js').then((THREE) => {

/* =====================================================================
   0. Settings
   ===================================================================== */
const params = new URLSearchParams(location.hash.slice(1));
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const small = Math.min(innerWidth, innerHeight) < 700 || (navigator.hardwareConcurrency || 8) <= 4;
const Q = params.has('q') ? Math.min(1.5, Math.max(0.05, +params.get('q') || 1)) : small ? 0.45 : 0.6;   // default = the Balanced preset   // particle budget multiplier (#q= overrides, see scaled.html)
const TAU = Math.PI * 2;

/* =====================================================================
   1. Cosmology and the galactic potential  (units: kpc, Myr, Msun)
   ===================================================================== */
const h = 0.68, OMEGA_M = 0.31, N_S = 0.965;
const RHO_C = 277.5 * h * h;                  // critical density, Msun / kpc^3
const RHO_M = OMEGA_M * RHO_C;                // mean matter density (comoving)
const G = 4.498e-12;                          // kpc^3 Msun^-1 Myr^-2
const KMS = 1.0227e-3;                        // 1 km/s in kpc/Myr
const T0_GYR = 13.8;

// Halo: NFW, concentration from Dutton & Maccio (2014) at z = 0 (M in h^-1 Msun)
const M200 = 5e12;
const CONC = Math.pow(10, 0.905 - 0.101 * Math.log10(M200 * h / 1e12));
const R200 = Math.cbrt(3 * M200 / (4 * Math.PI * 200 * RHO_C));
const RS = R200 / CONC;
const mu = (x) => Math.log(1 + x) - x / (1 + x);
const MUC = mu(CONC);
const Mnfw = (r) => M200 * mu(r / RS) / MUC;
// R200m: mean enclosed density = 200 * rho_m
const R200M = (() => { let lo = R200, hi = 4 * R200; for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; (Mnfw(m) / (4 / 3 * Math.PI * m ** 3) > 200 * RHO_M) ? lo = m : hi = m; } return lo; })();
// Splashback, More, Diemer & Kravtsov (2015), accretion rate Gamma = 1.5
const GAMMA_ACC = 1.5;
const RSP = R200M * 0.54 * (1 + 0.53 * OMEGA_M) * (1 + 1.36 * Math.exp(-GAMMA_ACC / 3.04));
// Halo shape, Allgood et al. (2006)-like; spin axis along the minor axis
const AX_BA = 0.84, AX_CA = 0.68;

// Baryons
const MB = 2.2e11, AB = 2.2;                  // Hernquist bulge
const MD = 5.0e10, AD = 5.0, BD = 0.30;       // Miyamoto-Nagai disk
const MBH = 1.0e9, EPS_BH = 0.02;             // central black hole
const GMB = G * MB, GMD = G * MD, GM200 = G * M200, GMBH = G * MBH;

function vc2(R) {                              // circular speed^2 in the midplane, (kpc/Myr)^2
  R = Math.max(R, 1e-3);
  const vb = GMB * R / ((R + AB) * (R + AB));
  const s = AD + BD; const vd = GMD * R * R / Math.pow(R * R + s * s, 1.5);
  const vh = GM200 * mu(R / RS) / MUC / R;
  const vbh = GMBH * R * R / Math.pow(R * R + EPS_BH * EPS_BH, 1.5);
  return vb + vd + vh + vbh;
}
const vcomp = (R) => {                          // km/s, per component
  R = Math.max(R, 1e-3); const s = AD + BD;
  return {
    bulge: Math.sqrt(GMB * R / ((R + AB) ** 2) + GMBH * R * R / Math.pow(R * R + EPS_BH ** 2, 1.5)) / KMS,
    disk: Math.sqrt(GMD * R * R / Math.pow(R * R + s * s, 1.5)) / KMS,
    halo: Math.sqrt(GM200 * mu(R / RS) / MUC / R) / KMS,
    total: Math.sqrt(vc2(R)) / KMS,
  };
};
const vc = (R) => Math.sqrt(vc2(R));
const Omega = (R) => vc(Math.max(R, 0.02)) / Math.max(R, 0.02);
function kappa(R) {                            // epicyclic frequency: k^2 = R dO^2/dR + 4 O^2
  R = Math.max(R, 0.05); const d = R * 0.01;
  const o2p = vc2(R + d) / ((R + d) ** 2), o2m = vc2(R - d) / ((R - d) ** 2);
  return Math.sqrt(Math.max(R * (o2p - o2m) / (2 * d) + 4 * vc2(R) / (R * R), 1e-8));
}
function nuZ(R) {                              // vertical frequency at z = 0
  R = Math.max(R, 0.05);
  const sph = (GMB / ((R + AB) ** 2) + GM200 * mu(R / RS) / MUC / (R * R)) / R + GMBH / Math.pow(R * R + EPS_BH ** 2, 1.5);
  const s = AD + BD; const mn = GMD * s / (BD * Math.pow(R * R + s * s, 1.5));
  return Math.sqrt(sph + mn);
}
const Menc = (r) => Mnfw(r) + MB * r * r / ((r + AB) ** 2) + MD * Math.pow(r, 3) / Math.pow(r * r + (AD + BD) ** 2, 1.5) + MBH;
function accel(x, y, z, out) {                // full 3D force from all components (y is the spin axis)
  const r2 = x * x + y * y + z * z, r = Math.sqrt(r2) + 1e-6;
  const gs = GMB / ((r + AB) * (r + AB) * r) + GM200 * mu(r / RS) / MUC / (r2 * r) + GMBH / Math.pow(r2 + EPS_BH * EPS_BH, 1.5);
  const zb = Math.sqrt(y * y + BD * BD), s = AD + zb, gd = GMD / Math.pow(x * x + z * z + s * s, 1.5);
  out[0] = -(gs + gd) * x; out[2] = -(gs + gd) * z; out[1] = -gs * y - gd * y * s / zb;
}

// Spiral density wave: m = 2, pitch 12 deg, corotation at 10 kpc (Lin & Shu 1964)
const ARM_M = 2, PITCH = 15 * Math.PI / 180, COTP = 1 / Math.tan(PITCH);
const R_CR = 10.0, OMEGA_P = Omega(R_CR);
const DUST_R = 9.4;                           // the brim: dust/HI ring radius at 9.55 Mpc

/* =====================================================================
   2. Random numbers, sampling helpers, colour
   ===================================================================== */
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const rnd = mulberry32(4594);                 // NGC 4594
const gauss = () => { let u = 0; while (u === 0) u = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * rnd()); };
const unit = () => { const z = 2 * rnd() - 1, p = TAU * rnd(), s = Math.sqrt(1 - z * z); return [s * Math.cos(p), z, s * Math.sin(p)]; };
const norm3 = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
function nfwX(cmax) {                          // inverse CDF of NFW enclosed mass, x = r / r_s
  const target = rnd() * mu(cmax); let lo = 0, hi = cmax;
  for (let i = 0; i < 36; i++) { const m = (lo + hi) / 2; mu(m) < target ? lo = m : hi = m; }
  return (lo + hi) / 2;
}
function orbitBasis(n) {                       // u x v = n
  const a = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const u = norm3(cross(n, a)); const v = cross(n, u); return [u, v];
}
function eigSym3(m) {                          // Jacobi rotations for a symmetric 3x3 (row-major); eigenvector i is column i of v
  const a = [[m[0], m[1], m[2]], [m[3], m[4], m[5]], [m[6], m[7], m[8]]], v = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let sweep = 0; sweep < 16; sweep++) {
    if (a[0][1] ** 2 + a[0][2] ** 2 + a[1][2] ** 2 < 1e-20) break;
    for (let p = 0; p < 3; p++) for (let q = p + 1; q < 3; q++) {
      if (Math.abs(a[p][q]) < 1e-15) continue;
      const th = (a[q][q] - a[p][p]) / (2 * a[p][q]), t = (th >= 0 ? 1 : -1) / (Math.abs(th) + Math.sqrt(th * th + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < 3; k++) { const akp = a[k][p], akq = a[k][q]; a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq; }
      for (let k = 0; k < 3; k++) { const apk = a[p][k], aqk = a[q][k]; a[p][k] = c * apk - s * aqk; a[q][k] = s * apk + c * aqk; }
      for (let k = 0; k < 3; k++) { const vkp = v[k][p], vkq = v[k][q]; v[k][p] = c * vkp - s * vkq; v[k][q] = s * vkp + c * vkq; }
    }
  }
  return [[a[0][0], a[1][1], a[2][2]], v];
}
function kelvin(T) {                           // blackbody to linear RGB (Helland fit), peak-normalised
  const t = T / 100; let r, g, b;
  if (t <= 66) { r = 255; g = 99.4708025861 * Math.log(t) - 161.1195681661; b = t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307; }
  else { r = 329.698727446 * Math.pow(t - 60, -0.1332047592); g = 288.1221695283 * Math.pow(t - 60, -0.0755148492); b = 255; }
  const lin = (c) => Math.pow(clamp(c, 0, 255) / 255, 2.2);
  const c = [lin(r), lin(g), lin(b)]; const m = Math.max(...c); return c.map(x => x / m);
}

/* Gaussian random field for Zel'dovich displacements: BBKS transfer function, n_s = 0.965.
   makeGRF(modes, k range, rms displacement at a = 1, sampling box) so the same machinery serves two scales. */
function makeGRF(NM, kmin, kmax, rmsDisp, box) {
  const modes = [];
  const dlnk = Math.log(kmax / kmin) / NM;
  const T = (k) => { const q = (k * 1000 / h) / (OMEGA_M * h); const x = 2.34 * q; return Math.log(1 + x) / x * Math.pow(1 + 3.89 * q + (16.1 * q) ** 2 + (5.46 * q) ** 3 + (6.71 * q) ** 4, -0.25); };
  for (let j = 0; j < NM; j++) {
    const k = kmin * Math.exp((j + rnd()) * dlnk);
    const D2 = Math.pow(k, 3 + N_S) * T(k) ** 2;           // dimensionless power, up to normalisation
    const d = unit(); modes.push({ kx: d[0] * k, ky: d[1] * k, kz: d[2] * k, dx: d[0], dy: d[1], dz: d[2], A: Math.sqrt(D2 * dlnk) / k, ph: TAU * rnd() });
  }
  let rms = 0; const S = 400;
  const raw = (x, y, z, o) => { let a = 0, b = 0, c = 0; for (const m of modes) { const s = m.A * Math.sin(m.kx * x + m.ky * y + m.kz * z + m.ph); a += s * m.dx; b += s * m.dy; c += s * m.dz; } o[0] = a; o[1] = b; o[2] = c; return o; };
  const o = [0, 0, 0];
  for (let i = 0; i < S; i++) { raw((rnd() - .5) * box, (rnd() - .5) * box, (rnd() - .5) * box, o); rms += o[0] ** 2 + o[1] ** 2 + o[2] ** 2; }
  const scale = rmsDisp / Math.sqrt(rms / S);
  const fn = (x, y, z) => { const r = raw(x, y, z, [0, 0, 0]); return [r[0] * scale, r[1] * scale, r[2] * scale]; };
  fn.jac = (x, y, z) => {                       // psi and its deformation tensor J_ij = d psi_i / d q_j
    const P = [0, 0, 0], J = new Float32Array(9);
    for (const m of modes) {
      const ph = m.kx * x + m.ky * y + m.kz * z + m.ph, sA = m.A * Math.sin(ph) * scale, cA = m.A * Math.cos(ph) * scale;
      P[0] += sA * m.dx; P[1] += sA * m.dy; P[2] += sA * m.dz;
      const d = [m.dx, m.dy, m.dz], k = [m.kx, m.ky, m.kz];
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) J[i * 3 + j] += cA * d[i] * k[j];
    }
    return [P, J];
  };
  return fn;
}
const GRF = makeGRF(56, TAU / 9000, TAU / 220, 300, 8000);          // the node's neighbourhood: 0.2-9 Mpc waves, rms 300 kpc
const GRF2 = makeGRF(48, TAU / 150000, TAU / 7000, 3000, 140000);   // large-scale structure: 7-150 Mpc waves, rms 3 Mpc

/* Spherical collapse (Gunn & Gott 1972; Bertschinger 1985 secondary infall).
   A shell with Lagrangian radius q virialises at r0 = r_ta / 2. Returns comoving radius and progress. */
function shell(q, r0, tau, a) {
  const tta = 6 * Math.PI * Math.pow(r0 / (2 * q), 1.5);
  const f = Math.PI * tau / tta;
  let eta = Math.cbrt(6 * f);
  for (let i = 0; i < 8; i++) { const d = Math.max(1 - Math.cos(eta), 1e-3); eta -= (eta - Math.sin(eta) - f) / d; eta = clamp(eta, 0, 1.5 * Math.PI); }
  return [r0 * (1 - Math.cos(eta)) / a, smooth(Math.PI, 1.5 * Math.PI, eta)];
}
const qOf = (M, r0) => Math.max(Math.cbrt(3 * M / (4 * Math.PI * RHO_M)), 5.6 * r0);

/* =====================================================================
   3. Shared GLSL: the same potential, spiral pattern and dust model
   ===================================================================== */
const f = (x) => x.toExponential(7);
const GLSL_COMMON = /* glsl */`
#define PI 3.14159265
const float GMB = ${f(GMB)}, AB = ${f(AB)}, GMD = ${f(GMD)}, ADBD = ${f(AD + BD)};
const float GM200 = ${f(GM200)}, RS = ${f(RS)}, MUC = ${f(MUC)}, GMBH = ${f(GMBH)};
const float ARM_M = ${f(ARM_M)}, COTP = ${f(COTP)}, OMEGA_P = ${f(OMEGA_P)};
uniform float uTime;
float sq(float x){ return x*x; }
float vcirc(float R){
  R = max(R, 0.02);
  float x = R/RS;
  float v2 = GMB*R/sq(R+AB) + GMD*R*R/pow(R*R+ADBD*ADBD,1.5) + GM200*(log(1.0+x)-x/(1.0+x))/MUC/R + GMBH/R;
  return sqrt(v2);
}
float armPhase(float R, float phi, float t){ return ARM_M*(phi - OMEGA_P*t) + ARM_M*COTP*log(max(R,0.3)); }
float hash13(vec3 p){ p = fract(p*0.1031); p += dot(p, p.zyx+31.32); return fract((p.x+p.y)*p.z); }
float vnoise(vec3 p){
  vec3 i = floor(p), fr = fract(p); fr = fr*fr*(3.0-2.0*fr);
  return mix(mix(mix(hash13(i),hash13(i+vec3(1,0,0)),fr.x), mix(hash13(i+vec3(0,1,0)),hash13(i+vec3(1,1,0)),fr.x),fr.y),
             mix(mix(hash13(i+vec3(0,0,1)),hash13(i+vec3(1,0,1)),fr.x), mix(hash13(i+vec3(0,1,1)),hash13(i+vec3(1,1,1)),fr.x),fr.y), fr.z);
}
float fbm(vec3 p, int oct){ float a = 0.5, s = 0.0; for(int i=0;i<4;i++){ if(i>=oct) break; s += a*vnoise(p); p = p*2.03 + vec3(1.7,9.2,3.1); a *= 0.5; } return s; }
/* Dust: a thin, sharp-edged ring at ${DUST_R} kpc (the brim), a weaker lane inside it, and a flocculent
   layer of tightly wound filaments across the disk face. Filaments are elongated along trailing log
   spirals by sampling the noise on a cone in (R, phi), and advected by differential rotation in two
   staggered flow-map layers, so they shear into arcs and are replaced before they wind up. */
vec2 hash22(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz)*p3.zy); }
const mat3 ROT = mat3(0.7071, 0.5, -0.5, -0.5, 0.8536, 0.1464, 0.5, 0.1464, 0.8536);   // irrational-ish rotation: noise lattices never align with the view
float dustDensity(vec3 p, float t, int oct){
  float R = length(p.xz);
  if (R > ${f(DUST_R + 2.0)}) return 0.0;
  float py = p.y + 0.06*(vnoise(ROT*p*1.7 + 9.0) - 0.5);          // the midplane warps a little
  float ay = abs(py);
  float hd0 = 0.045 + 0.008*R;
  if (ay > 8.0*hd0) return 0.0;
  float phi = atan(p.z, p.x);
  float sp = 0.5 + 0.5*cos(armPhase(R, phi, t) + 0.35); sp = sp*sp;
  float Om = vcirc(R)/max(R, 0.3);
  float c = t/150.0, f1 = fract(c), f2 = fract(c + 0.5);
  float w1 = 1.0 - abs(2.0*f1 - 1.0);
  float lr = 4.5*log(max(R, 0.3));
  float a1 = phi - Om*f1*150.0 + lr, a2 = phi - Om*f2*150.0 + lr;
  // The brim as Hubble shows it: sheared cirrus, not dots. The texture is ridged noise in a domain that is stretched
  // ~6:1 along the flow and warped by a second noise field, so it reads as filaments, eddies and streaks being
  // dragged along the lane. A soft, large-scale clump field only modulates how much of it there is.
  vec2 u1 = vec2(R*a1, 2.2*py) + floor(c)*vec2(13.1, 7.7), u2 = vec2(R*a2, 2.2*py) + floor(c + 0.5)*vec2(5.3, 11.9) + 40.0;
  float big = mix(smoothstep(0.34, 0.68, fbm(vec3(u2/1.4, 0.5), 2)), smoothstep(0.34, 0.68, fbm(vec3(u1/1.4, 0.5), 2)), w1);
  // nearly coherent in R: a line of sight through the near side of the brim crosses one streak, not thirty
  vec3 s1 = vec3(u1.x*0.6, 0.35*R, u1.y*3.0), s2 = vec3(u2.x*0.6, 0.35*R, u2.y*3.0);
  s1 += 1.6*(vec3(fbm(s1*0.6 + 1.7, 2), 0.0, fbm(s1*0.6 + 4.2, 2)) - 0.5);      // domain warp in (arc, height): the streaks curl
  s2 += 1.6*(vec3(fbm(s2*0.6 + 1.7, 2), 0.0, fbm(s2*0.6 + 4.2, 2)) - 0.5);
  float ridge = mix(1.0 - abs(2.0*fbm(s2, oct) - 1.0), 1.0 - abs(2.0*fbm(s1, oct) - 1.0), w1);
  float streak = pow(smoothstep(0.35, 1.0, ridge), 2.0);
  float wob = mix(vnoise(vec3(u2*0.4, 1.0)), vnoise(vec3(u1*0.4, 1.0)), w1) - 0.5;
  float Rc = ${f(DUST_R)} + 1.1*wob;
  float mott = 0.04 + 1.6*streak + 1.8*big*(0.2 + streak);         // streaks everywhere, dense where the big clumps are; near-empty between
  float hd = hd0*(0.6 + 0.8*big + 0.5*streak);                     // clumps and streaks stand proud of the plane: ragged band edges
  float ring = exp(-0.5*sq((R - Rc)/(0.55 + 0.4*big)))*mott
             + 0.16*exp(-0.5*sq((R - ${f(DUST_R - 1.8)})/0.8))*(0.08 + 1.2*big + 0.6*streak)
             + 0.07*smoothstep(1.0, 2.4, R)*exp(-(R - 2.4)/6.0)*(0.3 + streak);   // interior dust is faint: edge-on chords through it are long
  ring *= smoothstep(${f(DUST_R + 2.0)}, ${f(DUST_R + 0.6)}, R);
  float cl = streak;
  return 1.1*ring*exp(-ay/hd)*(0.7 + 0.6*sp)*(0.5 + 0.9*cl);
}
`;

/* Star-particle helpers: extinction toward the camera, and flux-conserving point sprites. */
const GLSL_POINT = /* glsl */`
uniform float uPxScale, uA, uDust, uExtK;
uniform vec3 uCamGal;
varying vec3 vCol;
vec3 extinction(vec3 p, float jit){
  if (uDust < 0.001) return vec3(1.0);
  vec3 d = uCamGal - p;
  float t0 = 0.0, t1 = 1.0, H = 1.6;
  if (abs(d.y) > 1e-5){ float ta = (H - p.y)/d.y, tb = (-H - p.y)/d.y; t0 = max(t0, min(ta,tb)); t1 = min(t1, max(ta,tb)); }
  else if (abs(p.y) > H) return vec3(1.0);
  // clip to the cylinder R < 15
  vec2 o = p.xz, dd = d.xz; float A = dot(dd,dd), B = 2.0*dot(o,dd), C = dot(o,o) - 225.0;
  float disc = B*B - 4.0*A*C;
  if (disc <= 0.0 || A < 1e-8) return vec3(1.0);
  float sd = sqrt(disc); t0 = max(t0, (-B - sd)/(2.0*A)); t1 = min(t1, (-B + sd)/(2.0*A));
  if (t1 <= t0) return vec3(1.0);
  float L = length(d)*(t1 - t0), tau = 0.0;
  for (int i = 0; i < 14; i++){
    float s = t0 + (float(i) + jit)/14.0*(t1 - t0);
    tau += dustDensity(p + d*s, uTime, 1);
  }
  tau *= L/14.0*uExtK*uDust;
  return exp(-tau*vec3(1.32, 1.0, 0.74));
}
void emit(vec3 world, float sizeWorld, vec3 col){
  vec4 mv = modelViewMatrix*vec4(world, 1.0);
  gl_Position = projectionMatrix*mv;
  float depth = max(-mv.z, 1e-3);
  float s = sizeWorld*uPxScale/depth;
  float flux = 1.0;
  if (s < 2.2){ flux = s*s/4.84; s = 2.2; }                 // soft floor: unresolved stars blend instead of speckling
  if (s > 56.0){ flux *= 3136.0/(s*s); s = 56.0; }     // very near kernels spread out instead of blotting
  gl_PointSize = s;
  vCol = col*flux;
  if (mv.z > -0.05) { gl_PointSize = 0.0; }
}
`;
const FRAG_POINT = /* glsl */`
varying vec3 vCol;
void main(){
  vec2 c = gl_PointCoord*2.0 - 1.0; float r2 = dot(c,c);
  if (r2 > 1.0) discard;
  gl_FragColor = vec4(vCol*exp(-r2*4.0), 1.0);
}`;
const GLSL_SHELL = /* glsl */`
uniform float uTau;
vec2 shellR(float q, float r0, float tau, float a){
  float tta = 18.849556*pow(r0/(2.0*q), 1.5);
  float fz = PI*tau/tta;
  float eta = pow(6.0*fz, 1.0/3.0);
  for (int i = 0; i < 8; i++){ float d = max(1.0 - cos(eta), 1e-3); eta -= (eta - sin(eta) - fz)/d; eta = clamp(eta, 0.0, 1.5*PI); }
  return vec2(r0*(1.0 - cos(eta))/a, smoothstep(PI, 1.5*PI, eta));
}`;

/* =====================================================================
   4. Particle populations
   ===================================================================== */
const U = {
  uTime: { value: 0 }, uPxScale: { value: 1 }, uA: { value: 1 }, uDust: { value: 1 }, uExtK: { value: 7.0 },
  uCamGal: { value: new THREE.Vector3() }, uTau: { value: 1 },
};
function pointsMaterial(vertex, extra = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { ...U, ...extra },
    vertexShader: GLSL_COMMON + GLSL_POINT + GLSL_SHELL + vertex,
    fragmentShader: FRAG_POINT,
    transparent: true, depthTest: false, depthWrite: false,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
  });
}
function geom(n, attrs) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  for (const [k, [arr, size]] of Object.entries(attrs)) g.setAttribute(k, new THREE.BufferAttribute(arr, size));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e7);
  return g;
}
const scene = new THREE.Scene();
const bgScene = new THREE.Scene();

/* ---- 4a. Disk: epicyclic orbits with frequencies from the potential --------------------- */
function buildDisk(N) {
  const aOrb = new Float32Array(N * 4), aOrb2 = new Float32Array(N * 4), aSt = new Float32Array(N * 4), col = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const ty = rnd(); const type = ty < 0.035 ? 1 : ty < 0.045 ? 2 : 0;   // 0 old/intermediate, 1 OB, 2 H II (an old, quiescent disk)
    let R;
    if (type > 0) R = clamp(8.4 + gauss() * 2.4, 2.5, 14.5);
    else if (rnd() < 0.3) R = clamp(8.8 + gauss() * 1.4, 2, 16);
    else { do { R = -3.8 * Math.log(rnd() * rnd()); } while (R > 19); }
    const age = type > 0 ? 0 : clamp(10.5 * (1 - rnd() * (0.25 + 0.75 * smooth(0, 14, R))), 0.4, 11.5);   // inside-out
    const Om = Omega(R), k = kappa(R), nu = nuZ(R);
    const sigR = (type > 0 ? 7 : 12 + 42 * Math.pow(age / 10, 0.35)) * KMS;                              // age-velocity relation
    const X = clamp(gauss() * sigR / k, -0.35 * R, 0.35 * R);
    const z0 = type > 0 ? 0.04 : 0.05 + 0.2 * Math.pow(age / 10, 0.6);   // thin disk: the Sombrero's is ~0.3 kpc at the brim
    const Z = Math.min(Math.abs(z0 * Math.atanh(clamp(2 * rnd() - 1, -0.995, 0.995))) * 1.25, 1.6);    // sech^2 layer
    aOrb.set([R, TAU * rnd(), X, TAU * rnd()], i * 4);
    aOrb2.set([Om, k, Z, nu], i * 4);
    let c, lum, size;
    if (type === 0) { c = kelvin(4300 + 2600 * Math.pow(rnd(), 1.4) * (1 - age / 13)); lum = 0.45 * Math.exp(1.15 * gauss()); size = 0.03 + 0.02 * rnd(); }   // lognormal: a few giants carry the light, no uniform speckle
    else if (type === 1) { c = kelvin(9000 + 17000 * rnd() * rnd()); lum = 2.5 + 5 * rnd(); size = 0.04; }
    else { c = [1.0, 0.36, 0.42]; lum = 1.2 + 1.5 * rnd(); size = 0.07; }
    const birth = type > 0 ? 0.86 + 0.08 * rnd() : clamp(1 - age / T0_GYR, 0.05, 0.98);
    aSt.set([type, birth, size, lum], i * 4);
    aOrb2[i * 4 + 3] = nu; col.set(c, i * 3);
    aOrb[i * 4 + 3] = TAU * rnd();
    aSt[i * 4] = type + rnd() * 0.5;                                     // fractional part carries the vertical phase seed
  }
  const g = geom(N, { aOrb: [aOrb, 4], aOrb2: [aOrb2, 4], aSt: [aSt, 4], color: [col, 3] });
  const mat = pointsMaterial(/* glsl */`
    attribute vec4 aOrb; attribute vec4 aOrb2; attribute vec4 aSt; attribute vec3 color;
    uniform float uStars;
    void main(){
      float t = uTime;
      float R0 = aOrb.x, Om = aOrb2.x, k = aOrb2.y;
      float ph = k*t + aOrb.w;
      float R = R0 + aOrb.z*cos(ph);
      float phi = aOrb.y + Om*t - (2.0*Om/k)*(aOrb.z/R0)*sin(ph);
      float type = floor(aSt.x);
      float y = aOrb2.z*cos(aOrb2.w*t + fract(aSt.x)*12.566);
      vec3 p = vec3(R*cos(phi), y, R*sin(phi));
      float lum = aSt.w;
      if (type > 0.5){
        // time since this star's orbit last crossed the arm crest: young stars light up just downstream
        float rate = ARM_M*(Om - OMEGA_P);
        float since = mod(sign(rate)*armPhase(R, phi, t), 2.0*PI)/max(abs(rate), 1e-4);
        lum *= exp(-since/(type > 1.5 ? 9.0 : 32.0))*3.0;
      }
      float born = smoothstep(aSt.y, aSt.y + 0.04, uTau);
      vec3 ext = extinction(p, hash13(vec3(aOrb.xy*17.0, aSt.y*31.0)));
      emit(p/uA, aSt.z/uA, color*lum*ext*born*uStars);
    }`, { uStars: { value: 1 } });
  return new THREE.Points(g, mat);
}

/* ---- 4b. Spheroids: bulge, stellar halo and globular clusters on tilted orbits ----------- */
function buildSpheroid(N, sampler) {
  const aU = new Float32Array(N * 3), aV = new Float32Array(N * 3), aOrb = new Float32Array(N * 4), aOrb2 = new Float32Array(N * 4), aMisc = new Float32Array(N * 2), col = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const s = sampler(i);
    let n = unit();
    if (rnd() < s.rotFrac && n[1] > 0) n[1] = -n[1];                   // net rotation in the disk's sense (L along -y)
    const [u, v] = orbitBasis(n);
    aU.set(u, i * 3); aV.set(v, i * 3);
    aOrb.set([s.r, TAU * rnd(), Omega(s.r), s.e], i * 4);
    aOrb2.set([kappa(s.r), TAU * rnd(), s.birth, s.size], i * 4);
    aMisc.set([s.lum, s.flat], i * 2); col.set(s.col, i * 3);
  }
  const g = geom(N, { aU: [aU, 3], aV: [aV, 3], aOrb: [aOrb, 4], aOrb2: [aOrb2, 4], aMisc: [aMisc, 2], color: [col, 3] });
  const mat = pointsMaterial(/* glsl */`
    attribute vec3 aU; attribute vec3 aV; attribute vec4 aOrb; attribute vec4 aOrb2; attribute vec2 aMisc; attribute vec3 color;
    uniform float uVis;
    void main(){
      float t = uTime;
      float ph = aOrb2.x*t + aOrb2.y;
      float r = aOrb.x*(1.0 + aOrb.w*cos(ph));
      float th = aOrb.y + aOrb.z*t - 2.0*aOrb.z/aOrb2.x*aOrb.w*sin(ph);
      vec3 p = r*(cos(th)*aU + sin(th)*aV);
      p.y *= aMisc.y;
      float born = smoothstep(aOrb2.z, aOrb2.z + 0.05, uTau);
      vec3 ext = extinction(p, hash13(aU*91.0 + aOrb.x));
      emit(p/uA, aOrb2.w/uA, color*aMisc.x*ext*born*uVis);
    }`, { uVis: { value: 1 } });
  return new THREE.Points(g, mat);
}
const hernquistR = () => { let r; do { const s = Math.sqrt(rnd() * 0.995); r = AB * s / (1 - s); } while (r > 30); return r; };
function bulgeSampler() {
  if (rnd() < 0.08) {                                                   // extended stellar halo, rho ~ r^-3.5
    const r1 = 6, r2 = 45, a = Math.pow(r1, -0.5), b = Math.pow(r2, -0.5);
    const r = Math.pow(a - rnd() * (a - b), -2);
    return { r, e: 0.2 + 0.4 * rnd(), rotFrac: 0.1, birth: 0.06 + 0.2 * rnd(), size: 0.05, lum: 0.35, flat: 0.85, col: kelvin(4900 + 700 * rnd()) };
  }
  const r = hernquistR();
  return { r, e: 0.05 + 0.3 * rnd(), rotFrac: 0.35, birth: 0.08 + 0.22 * rnd(), size: 0.03 + 0.03 * rnd(), lum: 0.4 * Math.exp(1.1 * gauss()), flat: 0.66, col: kelvin(4500 + 1500 * rnd()) };
}
function gcSampler() {                                                   // bimodal GC system (Rhode & Zepf 2004)
  if (rnd() < 0.55) {                                                   // metal-poor, blue, extended: rho ~ r^-3
    const r = Math.exp(Math.log(1.2) + rnd() * Math.log(60 / 1.2));
    return { r, e: 0.1 + 0.5 * rnd(), rotFrac: 0, birth: 0.03 + 0.08 * rnd(), size: 0.04 + 0.05 * rnd(), lum: 1.6 * Math.exp(0.8 * gauss()), flat: 1.0, col: kelvin(6600 + 1200 * rnd()) };
  }
  const r1 = 0.8, r2 = 25, a = Math.pow(r1, -0.5), b = Math.pow(r2, -0.5);  // metal-rich, red, concentrated: rho ~ r^-3.5
  const r = Math.pow(a - rnd() * (a - b), -2);
  return { r, e: 0.1 + 0.4 * rnd(), rotFrac: 0.2, birth: 0.08 + 0.12 * rnd(), size: 0.04 + 0.05 * rnd(), lum: 1.6 * Math.exp(0.8 * gauss()), flat: 0.75, col: kelvin(4300 + 600 * rnd()) };
}

/* ---- 4c. Smooth dark matter halo: NFW, triaxial, adaptive smoothing, splashback caustic ---- */
const RHO_S = M200 / (4 * Math.PI * RS ** 3 * MUC);
const rhoNFW = (r) => { const x = Math.max(r, 0.05) / RS; return RHO_S / (x * (1 + x) ** 2); };
function buildHalo(N) {
  const aU = new Float32Array(N * 3), aV = new Float32Array(N * 3), aOrb = new Float32Array(N * 4), aOrb2 = new Float32Array(N * 4), aQd = new Float32Array(N * 3), aPsi = new Float32Array(N * 3);
  const mp = M200 / N;
  for (let i = 0; i < N; i++) {
    let r0, e, Mq;
    if (rnd() < 0.86) {                                                 // virialised NFW population
      const r = RS * nfwX(CONC);
      e = 0.1 + 0.55 * rnd() * (0.4 + 0.6 * Math.min(1, r / R200));   // radial anisotropy grows outward
      r0 = r; Mq = Menc(r);
    } else {                                                            // recently accreted: apocentres pile up at R_sp
      const rapo = R200 + (RSP - R200) * Math.pow(rnd(), 0.6);
      e = 0.55 + 0.25 * rnd(); r0 = rapo / (1 + e);
      Mq = M200 * (1 + 0.3 * (rapo - R200) / (RSP - R200));
    }
    let n = unit(); if (rnd() < 0.15 && n[1] > 0) n[1] = -n[1];        // weak halo spin aligned with the disk
    const [u, v] = orbitBasis(n);
    const th0 = TAU * rnd();
    aU.set(u, i * 3); aV.set(v, i * 3);
    const hs = Math.cbrt(mp / rhoNFW(r0)) * 2.0;                         // SPH-like smoothing, h ~ rho^(-1/3)
    aOrb.set([r0, th0, Omega(r0), e], i * 4);
    const q = qOf(Mq, r0);
    aOrb2.set([kappa(r0), TAU * rnd(), q, Math.min(hs, 90)], i * 4);
    const d0 = [Math.cos(th0) * u[0] + Math.sin(th0) * v[0], Math.cos(th0) * u[1] + Math.sin(th0) * v[1], Math.cos(th0) * u[2] + Math.sin(th0) * v[2]];
    const r = unit(); const qd = norm3([d0[0] + 0.8 * r[0], d0[1] + 0.8 * r[1], d0[2] + 0.8 * r[2]]);
    aQd.set(qd, i * 3); aPsi.set(GRF(qd[0] * q, qd[1] * q, qd[2] * q), i * 3);
  }
  const g = geom(N, { aU: [aU, 3], aV: [aV, 3], aOrb: [aOrb, 4], aOrb2: [aOrb2, 4], aQd: [aQd, 3], aPsi: [aPsi, 3] });
  const mat = pointsMaterial(/* glsl */`
    attribute vec3 aU; attribute vec3 aV; attribute vec4 aOrb; attribute vec4 aOrb2; attribute vec3 aQd; attribute vec3 aPsi;
    uniform float uVis, uR200, uIntro;
    uniform vec3 uAxes, uDMCol;
    void main(){
      float t = uTime;
      float ph = aOrb2.x*t + aOrb2.y;
      float r = aOrb.x*(1.0 + aOrb.w*cos(ph));
      float th = aOrb.y + aOrb.z*t - 2.0*aOrb.z/aOrb2.x*aOrb.w*sin(ph);
      vec3 p = r*(cos(th)*aU + sin(th)*aV);
      p *= mix(vec3(1.0), uAxes, smoothstep(0.04*uR200, 0.35*uR200, r));   // rounder centre (baryonic response)
      vec3 world = p/uA;
      float hs = aOrb2.w, gain = 1.0, hsDraw = hs/uA;
      if (uTau < 0.999){
        vec2 sh = shellR(aOrb2.z, aOrb.x, uTau, uA);
        vec3 pre = sh.x*normalize(aOrb2.z*aQd + uA*aPsi);
        float w = smoothstep(0.0, 1.0, sh.y);
        world = mix(pre, world, w);
        hs = mix(130.0, hs, w); hsDraw = mix(130.0, hsDraw, w);      // comoving mean spacing before collapse
        gain = mix(25.0, 1.0, w);
      }
      float bright = 0.5*pow(hs, -1.45)*gain;                 // ~ projected density, compressed range
      float fade = smoothstep(1.5, 10.0, length(world - cameraPosition));
      vec3 c = vec3(bright*fade*uVis);                        // scalar density; coloured in post
      emit(world, hsDraw, c);
    }`, {
    uVis: { value: 1 }, uR200: { value: R200 }, uIntro: { value: 0 },
    uAxes: { value: new THREE.Vector3(1, AX_CA, AX_BA).multiplyScalar(1 / Math.cbrt(AX_BA * AX_CA)) },
    uDMCol: { value: new THREE.Color(0.30, 0.40, 1.0) },
  });
  return new THREE.Points(g, mat);
}

/* ---- 4d. Subhalos: dN/dm ~ m^-1.9, Einasto radial distribution, live leapfrog orbits ------ */
const SUB = (() => {
  const N = 300, ALPHA = 1.9, m1 = 3e8, m2 = 2.5e11;
  const aE = 0.678, rm2 = 0.81 * R200;                                   // Springel et al. (2008)
  const einasto = (r) => r * r * Math.exp(-(2 / aE) * (Math.pow(r / rm2, aE) - 1));
  let pmax = 0; for (let r = 1; r < 1.3 * R200; r += 2) pmax = Math.max(pmax, einasto(r));
  const subs = [];
  const p1 = Math.pow(m1, 1 - ALPHA), p2 = Math.pow(m2, 1 - ALPHA);
  const NEIGH = [[2.5e11, 720, 0.35], [1.2e11, 820, 3.44], [6e10, 1250, -0.25], [8e10, 600, 1.9], [4e10, 750, 3.0], [1.5e11, 1400, -0.12], [3e10, 800, 4.0]];   // neighbour galaxies beyond R_sp (mass, r, angle in the splashback stop's sky plane: +u is screen-left, +v is screen-down)
  const cdir = norm3([-0.797, 0.530, 0.290]); const [cu, cv] = orbitBasis(cdir);   // the camera direction at the subhalo stop (el 32, az -70)
  for (let i = 0; i < N + NEIGH.length; i++) {
    const m = i < N ? Math.pow(p1 + rnd() * (p2 - p1), 1 / (1 - ALPHA)) : NEIGH[i - N][0];
    let r; if (i < N) { do { r = 8 + rnd() * (1.25 * R200 - 8); } while (rnd() * pmax > einasto(r)); } else r = NEIGH[i - N][1];
    let d = unit();
    if (i >= N) { const th = NEIGH[i - N][2]; d = norm3([cu[0] * Math.cos(th) + cv[0] * Math.sin(th) + cdir[0] * 0.15, cu[1] * Math.cos(th) + cv[1] * Math.sin(th) + cdir[1] * 0.15, cu[2] * Math.cos(th) + cv[2] * Math.sin(th) + cdir[2] * 0.15]); }
    const pos = [d[0] * r, d[1] * r, d[2] * r];
    const tdir = norm3(cross(d, unit()));
    const vt = vc(r) * (0.45 + 0.5 * rnd()), vr = vc(r) * (rnd() - 0.5) * 0.7;
    const vel = [tdir[0] * vt + d[0] * vr, tdir[1] * vt + d[1] * vr, tdir[2] * vt + d[2] * vr];
    const rt = r * Math.cbrt(m / (3 * Menc(r)));                        // Jacobi tidal radius
    const csub = 13 * Math.pow(m / 1e10, -0.08);
    const r200s = Math.cbrt(3 * m / (4 * Math.PI * 200 * RHO_C));
    const rss = r200s / csub;
    const q = qOf(Menc(r) * 1.05 + m, r);
    const r_ = unit(); const qd = norm3([d[0] + 0.6 * r_[0], d[1] + 0.6 * r_[1], d[2] + 0.6 * r_[2]]);
    subs.push({ m, r0: r, pos, vel, rt, rss, cut: Math.min(rt, r200s) / rss, q, qd, psi: GRF(qd[0] * q, qd[1] * q, qd[2] * q), n: Math.round(clamp(5 * Math.pow(m / 1e8, 0.6), 6, 700) * Q) });
  }
  subs.neigh = NEIGH.map(x => x[0]);
  return subs;
})();
const subTexData = new Float32Array(SUB.length * 4);
const subTex = new THREE.DataTexture(subTexData, SUB.length, 1, THREE.RGBAFormat, THREE.FloatType);
subTex.needsUpdate = true;
function buildSubhaloParticles() {
  const total = SUB.reduce((s, x) => s + x.n, 0);
  const aSub = new Float32Array(total), aOff = new Float32Array(total * 3), aSz = new Float32Array(total);
  let k = 0;
  SUB.forEach((s, i) => {
    for (let j = 0; j < s.n; j++, k++) {
      const x = nfwX(s.cut), d = unit(), r = x * s.rss;
      aSub[k] = i; aOff.set([d[0] * r, d[1] * r, d[2] * r], k * 3);
      aSz[k] = clamp(0.9 * s.rt / Math.cbrt(s.n) * Math.pow(x / s.cut + 0.15, 0.6), 0.3, 14);
    }
  });
  const g = geom(total, { aSub: [aSub, 1], aOff: [aOff, 3], aSz: [aSz, 1] });
  const mat = pointsMaterial(/* glsl */`
    attribute float aSub; attribute vec3 aOff; attribute float aSz;
    uniform sampler2D uSubTex; uniform float uVis; uniform vec3 uSubCol;
    void main(){
      vec4 c = texelFetch(uSubTex, ivec2(int(aSub), 0), 0);
      vec3 world = c.xyz + aOff*c.w;
      float fade = smoothstep(1.5, 10.0, length(world - cameraPosition));
      emit(world, aSz*c.w, vec3(pow(aSz/3.0, -0.6)*fade*uVis));
    }`, { uSubTex: { value: subTex }, uVis: { value: 1 }, uSubCol: { value: new THREE.Color(0.55, 0.65, 1.0) } });
  return new THREE.Points(g, mat);
}

/* ---- 4d2. Neighbour galaxies: a small disk, a dwarf elliptical and a dwarf irregular, riding on the last three subhalos ---- */
function buildNeighbors() {
  const kinds = ['disk', 'sph', 'disk', 'sph', 'disk', 'disk', 'sph'];
  const specs = SUB.neigh.map((m, j) => {
    const idx = SUB.length - SUB.neigh.length + j, s = Math.pow(m / 1e11, 0.4);
    return kinds[j] === 'disk'
      ? { idx, kind: 'disk', Rd: 0.8 + 1.8 * s, h: 0.12 + 0.12 * s, n: Math.round((700 + 2500 * s) * Q), T: 5200 + 900 * (j % 3), lum: 0.9 }
      : { idx, kind: 'sph', a: 0.5 + 0.7 * s, q: 0.65 + 0.2 * rnd(), n: Math.round((600 + 1600 * s) * Q), T: 4500 + 300 * (j % 2), lum: 1.0 };
  });
  // Satellites: below ~1e11 Msun stellar mass falls steeply with halo mass (M* ~ Mh^2), so only the heaviest subhalos
  // hold a visible dwarf; the rest stay dark (the "missing satellites"). Light the ones above 3e9 Msun as dwarf spheroidals.
  for (let i = 0; i < SUB.length - SUB.neigh.length; i++) {
    const m = SUB[i].m; if (m < 3e9) continue;
    const s = Math.pow(m / 1e10, 0.5);
    specs.push({ idx: i, kind: 'sph', a: 0.25 + 0.35 * Math.pow(m / 1e10, 0.3), q: 0.6 + 0.35 * rnd(), n: Math.round(clamp(50 + 160 * s, 40, 600) * Q), T: 4500 + 500 * rnd(), lum: 0.55 });
  }
  SUB.lit = specs.length - SUB.neigh.length;
  const total = specs.reduce((s, x) => s + x.n, 0);
  const aSub = new Float32Array(total), aOff = new Float32Array(total * 3), col = new Float32Array(total * 3), aSz = new Float32Array(total);
  let k = 0;
  for (const s of specs) {
    const [u, v] = orbitBasis(unit()); const w = cross(u, v);
    for (let i = 0; i < s.n; i++, k++) {
      let x, y, z;
      if (s.kind === 'disk') { const R = -s.Rd * Math.log(rnd() * rnd()), ph = TAU * rnd(); x = R * Math.cos(ph); z = R * Math.sin(ph); y = gauss() * s.h; }
      else { const t = Math.sqrt(rnd() * 0.98), r = s.a * t / (1 - t), d = unit(); x = d[0] * r; y = d[1] * r * s.q; z = d[2] * r; }
      aSub[k] = s.idx;
      aOff.set([u[0] * x + w[0] * y + v[0] * z, u[1] * x + w[1] * y + v[1] * z, u[2] * x + w[2] * y + v[2] * z], k * 3);
      const c = kelvin(s.T + 900 * rnd()), l = s.lum * (0.5 + rnd());
      col.set([c[0] * l, c[1] * l, c[2] * l], k * 3); aSz[k] = 0.8 + 0.6 * rnd();
    }
  }
  const g = geom(total, { aSub: [aSub, 1], aOff: [aOff, 3], color: [col, 3], aSz: [aSz, 1] });
  const mat = pointsMaterial(/* glsl */`
    attribute float aSub; attribute vec3 aOff; attribute vec3 color; attribute float aSz;
    uniform sampler2D uSubTex; uniform float uVis;
    void main(){
      vec4 c = texelFetch(uSubTex, ivec2(int(aSub), 0), 0);
      vec3 world = c.xyz + aOff*c.w;
      float born = smoothstep(0.5, 0.75, uTau);
      emit(world, aSz*c.w, color*born*uVis);
    }`, { uSubTex: { value: subTex }, uVis: { value: 1 } });
  return new THREE.Points(g, mat);
}

/* ---- 4e. Cosmic web: filaments into the node + a Zel'dovich lattice (density from det(I + aJ)) ---- */
const FIL_DIRS = [[0.82, 0.35, 0.45], [-0.7, 0.2, 0.68], [-0.25, -0.55, -0.8], [0.35, -0.85, 0.1], [-0.6, 0.75, -0.3], [0.1, 0.95, 0.3], [0.9, -0.2, -0.4], [-0.95, -0.3, 0.1], [0.2, 0.1, -0.98]];
function buildWeb() {
  // calibrate the Zel'dovich amplitude so the field is well past shell crossing at a = 1
  let jr = 0; for (let i = 0; i < 300; i++) { const [, J] = GRF.jac((rnd() - .5) * 12000, (rnd() - .5) * 12000, (rnd() - .5) * 12000); jr += J[0] ** 2 + J[4] ** 2 + J[8] ** 2; }
  const AMP = 1.25 / Math.sqrt(jr / 900);
  const nl = Math.round(54 * Math.cbrt(Q)), box = 7200, sp = 2 * box / nl;   // 54^3 lattice: sharper sheets than the old 40^3
  const lattice = [];
  for (let i = 0; i < nl; i++) for (let j = 0; j < nl; j++) for (let k = 0; k < nl; k++) {
    const q = [-box + (i + 0.5 + (rnd() - .5) * 0.35) * sp, -box + (j + 0.5 + (rnd() - .5) * 0.35) * sp, -box + (k + 0.5 + (rnd() - .5) * 0.35) * sp];
    const rq = Math.hypot(...q); if (rq < 2400 || rq > 7600) continue;
    lattice.push(q);
  }
  const NF = Math.round(30000 * Q), N = NF + lattice.length;
  const aQ = new Float32Array(N * 3), aPsi = new Float32Array(N * 3), aSz = new Float32Array(N), aJ0 = new Float32Array(N * 3), aJ1 = new Float32Array(N * 3), aJ2 = new Float32Array(N * 3), aColl = new Float32Array(N * 4).fill(1e6);
  const FIL = [];
  const dirs = FIL_DIRS;
  dirs.forEach((d0, j) => {
    const d = norm3(d0); const off = unit();
    const L = (j < 5 ? 4800 : 3200) + 1500 * rnd();
    FIL.push({ ctrl: [d[0] * L * 0.5 + off[0] * 1700, d[1] * L * 0.5 + off[1] * 1700, d[2] * L * 0.5 + off[2] * 1700], end: [d[0] * L, d[1] * L, d[2] * L], knots: Array.from({ length: 9 }, () => 0.15 + 0.85 * rnd()), w: j < 3 ? 1 : j < 5 ? 0.7 : 0.45 });
  });
  const bez = (F, s) => { const b = 2 * (1 - s) * s, c = s * s; return [b * F.ctrl[0] + c * F.end[0], b * F.ctrl[1] + c * F.end[1], b * F.ctrl[2] + c * F.end[2]]; };
  for (let i = 0; i < NF; i++) {
    const F = FIL[Math.floor(Math.pow(rnd(), 1.4) * FIL.length)];
    const knot = rnd() < 0.2;
    let s = knot ? F.knots[Math.floor(rnd() * F.knots.length)] + gauss() * 0.004 : Math.pow(rnd(), 1.35);
    s = clamp(s, 0.07, 1);
    const c = bez(F, s), c2 = bez(F, Math.min(1, s + 0.01));
    const tan = norm3([c2[0] - c[0], c2[1] - c[1], c2[2] - c[2]]);
    const p1 = norm3(cross(tan, [0.3, 1, 0.2])), p2 = cross(tan, p1);
    const sigF = knot ? 28 : (70 + 230 * s) * F.w;                         // final cross-section (gaussian)
    const squeeze = knot ? 0.05 : 0.16;                                     // collapsed from a ~6x wider Lagrangian tube
    const ox = gauss() * sigF / squeeze, oy = gauss() * sigF / squeeze;
    const fin = [c[0] + (p1[0] * ox + p2[0] * oy) * squeeze, c[1] + (p1[1] * ox + p2[1] * oy) * squeeze, c[2] + (p1[2] * ox + p2[2] * oy) * squeeze];
    const along = 1.0 + 1.8 * (1 - s) ** 2;                                // inflow along the filament toward the node
    const q = [c[0] * along + p1[0] * ox + p2[0] * oy, c[1] * along + p1[1] * ox + p2[1] * oy, c[2] * along + p1[2] * ox + p2[2] * oy];
    const g = GRF(q[0], q[1], q[2]);
    aQ.set(q, i * 3);
    aPsi.set([fin[0] - q[0] + g[0] * 0.6, fin[1] - q[1] + g[1] * 0.6, fin[2] - q[2] + g[2] * 0.6], i * 3);
    aSz[i] = knot ? 22 : (40 + 70 * s) * Math.sqrt(F.w);
  }
  lattice.forEach((q, n) => {
    const i = NF + n; const [P, J] = GRF.jac(q[0], q[1], q[2]);
    aQ.set(q, i * 3); aPsi.set([P[0] * AMP, P[1] * AMP, P[2] * AMP], i * 3);
    aJ0.set([J[0] * AMP, J[1] * AMP, J[2] * AMP], i * 3); aJ1.set([J[3] * AMP, J[4] * AMP, J[5] * AMP], i * 3); aJ2.set([J[6] * AMP, J[7] * AMP, J[8] * AMP], i * 3);
    aSz[i] = -sp;                                                           // negative size marks a lattice particle
    // Adhesion: the sheet forms where det(I + D J) first vanishes, at D* = -1/lambda_min along its eigenvector.
    const [lam, vec] = eigSym3(J.map(x => x * AMP));
    let k = 0; for (let j = 1; j < 3; j++) if (lam[j] < lam[k]) k = j;
    let e = [vec[0][k], vec[1][k], vec[2][k]];
    if (e[0] * P[0] + e[1] * P[1] + e[2] * P[2] < 0) e = [-e[0], -e[1], -e[2]];   // oriented along the particle's motion
    aColl.set([e[0], e[1], e[2], lam[k] < -1e-9 ? -1 / lam[k] : 1e6], i * 4);
  });
  const geo = geom(N, { aQ: [aQ, 3], aPsi: [aPsi, 3], aSz: [aSz, 1], aJ0: [aJ0, 3], aJ1: [aJ1, 3], aJ2: [aJ2, 3], aColl: [aColl, 4] });
  const mat = pointsMaterial(/* glsl */`
    attribute vec3 aQ; attribute vec3 aPsi; attribute float aSz; attribute vec3 aJ0; attribute vec3 aJ1; attribute vec3 aJ2; attribute vec4 aColl;
    uniform float uVis, uIntro, uEdge, uD, uWebT;
    void main(){
      // D = a during the intro (linear growth in matter domination); after z = 0 the flow keeps running at a
      // (strongly) exaggerated rate so the web is seen to move: uD = 1 + flow.
      float D = uD;
      if (aSz > 0.0){
        // filament particles: Zel'dovich to their final tube, then keep draining along the filament into the node
        vec3 world = (aQ + min(D, 1.0)*aPsi)*exp(-max(D - 1.0, 0.0)*0.22);
        float b = mix(0.26*pow(aSz/30.0, -1.3), 0.05, uIntro);
        emit(world, aSz*(1.0 + uIntro), vec3(b*uVis));
      } else {
        // sheet particles: Zel'dovich until first shell crossing, then stick (adhesion) and oscillate through the pancake
        float Dc = min(D, aColl.w*0.9);
        vec3 world = aQ + Dc*aPsi;
        float past = max(D - aColl.w*0.9, 0.0);
        float hsh = hash13(aQ*0.001);
        float osc = smoothstep(0.0, 0.03, past)*90.0*sin(uWebT*(0.35 + 0.5*hsh) + 7.0*hsh)*exp(-past*0.3);
        world += aColl.xyz*osc;
        mat3 M = mat3(1.0) + Dc*mat3(aJ0, aJ1, aJ2);
        float rho = clamp(1.0/max(abs(determinant(M)), 1e-3), 0.06, 12.0);
        float edge = 1.0 - smoothstep(uEdge*0.62, uEdge, length(aQ));
        emit(world, -aSz*0.95*pow(rho, -0.333), vec3(0.026*pow(rho, 0.8)*edge*uVis));
      }
    }`, { uVis: { value: 1 }, uIntro: { value: 0 }, uEdge: { value: 7600 }, uD: { value: 1 }, uWebT: { value: 0 } });
  return new THREE.Points(geo, mat);
}

/* ---- 4e1. Field galaxies: a Schechter luminosity function, placed by the web's density ---------------------
   Count: n = phi* Gamma(alpha + 1, L_min/L*) with phi* = 0.0047 Mpc^-3 (Blanton et al. 2003, h = 0.68), a dwarf-rich faint
   end alpha = -1.3 down to 3e-4 L* (M ~ -12.5), inside the 7.6 Mpc web at 1 + delta = 6 (the Virgo Southern Extension).
   Positions are web particles drawn with weight rho^1.5 (galaxies are biased tracers), so they sit in sheets, filaments
   and knots and ride the same flow. Morphology follows density: red spheroids in the knots, blue disks in the field. */
const SCH = { phi: 0.0047, alpha: -1.3, lmin: 3e-4, delta: 5, R: 7.6 };
function schechterN() {
  let s = 0; const lo = Math.log(SCH.lmin), hi = Math.log(40), n = 4000, h = (hi - lo) / n;
  for (let i = 0; i <= n; i++) { const x = Math.exp(lo + i * h); s += Math.pow(x, SCH.alpha + 1) * Math.exp(-x) * (i === 0 || i === n ? 0.5 : 1); }
  return SCH.phi * s * h * (4 / 3) * Math.PI * SCH.R ** 3 * (1 + SCH.delta);
}
function sampleL() {                            // L / L* from the Schechter function: power law proposal, exp(-x) acceptance
  const a = SCH.alpha + 1, lo = Math.pow(SCH.lmin, a), hi = Math.pow(30, a);
  for (;;) { const x = Math.pow(lo + rnd() * (hi - lo), 1 / a); if (rnd() < Math.exp(-x)) return x; }
}
function buildFieldGalaxies(webPts) {
  const A = webPts.geometry.attributes, Qa = A.aQ.array, Pa = A.aPsi.array, Sa = A.aSz.array, Ca = A.aColl.array;
  const J0 = A.aJ0.array, J1 = A.aJ1.array, J2 = A.aJ2.array, n = Sa.length;
  const w = new Float64Array(n), rhoA = new Float32Array(n);
  let tot = 0;
  for (let i = 0; i < n; i++) {
    let rho, x, y, z;
    if (Sa[i] > 0) { rho = 5; x = Qa[i * 3] + Pa[i * 3]; y = Qa[i * 3 + 1] + Pa[i * 3 + 1]; z = Qa[i * 3 + 2] + Pa[i * 3 + 2]; }
    else {
      const D = Math.min(1, Ca[i * 4 + 3] * 0.9), k = i * 3;
      const m = [1 + D * J0[k], D * J0[k + 1], D * J0[k + 2], D * J1[k], 1 + D * J1[k + 1], D * J1[k + 2], D * J2[k], D * J2[k + 1], 1 + D * J2[k + 2]];
      const det = m[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * m[7] - m[4] * m[6]);
      rho = clamp(1 / Math.max(Math.abs(det), 1e-3), 0.06, 12);
      x = Qa[k] + D * Pa[k]; y = Qa[k + 1] + D * Pa[k + 1]; z = Qa[k + 2] + D * Pa[k + 2];
    }
    const r = Math.hypot(x, y, z);
    rhoA[i] = rho;
    w[i] = r < 500 || r > 7400 ? 0 : Math.pow(rho, 1.5);                 // not inside the Sombrero's own halo: its satellites are subhalos
    tot += w[i]; w[i] = tot;
  }
  const N = Math.round(schechterN() * Math.max(Q, 0.6));
  const aQ = new Float32Array(N * 3), aPsi = new Float32Array(N * 3), aColl = new Float32Array(N * 4), aKind = new Float32Array(N), aShp = new Float32Array(N * 4), col = new Float32Array(N * 3), aSz = new Float32Array(N);
  for (let g = 0; g < N; g++) {
    const t = rnd() * tot; let lo = 0, hi = n - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; w[mid] < t ? lo = mid + 1 : hi = mid; }
    const i = lo, jit = unit(), js = 25 + 40 * rnd();
    aQ.set([Qa[i * 3] + jit[0] * js, Qa[i * 3 + 1] + jit[1] * js, Qa[i * 3 + 2] + jit[2] * js], g * 3);
    aPsi.set([Pa[i * 3], Pa[i * 3 + 1], Pa[i * 3 + 2]], g * 3);
    aColl.set([Ca[i * 4], Ca[i * 4 + 1], Ca[i * 4 + 2], Ca[i * 4 + 3]], g * 4);
    aKind[g] = Sa[i] > 0 ? 1 : -1;
    const L = sampleL(), early = rnd() < clamp(0.12 + 0.16 * Math.log2(1 + rhoA[i]), 0.1, 0.8);
    const Re = early ? 2.6 * Math.pow(L, 0.55) : 4.0 * Math.pow(L, 0.35);   // size-luminosity relations, kpc
    const ang = TAU * rnd();
    aShp.set([early ? 0.6 + 0.4 * rnd() : 0.2 + 0.7 * rnd(), Math.cos(ang), Math.sin(ang), early ? 1 : 0], g * 4);
    const c = kelvin(early ? 4200 + 500 * rnd() : 5300 + 2200 * rnd());
    // Displayed total flux ~ L^0.5 (compressed from L so dwarfs stay visible; the ordering is kept), spread over the true size:
    // compact dwarfs become small bright knots, giants broad glows. Surface brightness is capped for close, resolved ones.
    const sz = Math.max(0.6, 4 * Re), sb = Math.min(256 * Math.sqrt(L) / (sz * sz), 1.5);
    col.set([c[0] * sb, c[1] * sb, c[2] * sb], g * 3); aSz[g] = sz;
  }
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...U, uVis: { value: 1 }, uLum: { value: 50 }, uD: webPts.material.uniforms.uD, uWebT: webPts.material.uniforms.uWebT },
    vertexShader: GLSL_COMMON + GLSL_POINT + /* glsl */`
      attribute vec3 aQ; attribute vec3 aPsi; attribute vec4 aColl; attribute float aKind; attribute vec4 aShp; attribute vec3 color; attribute float aSz;
      uniform float uVis, uLum, uD, uWebT, uTau; varying vec4 vShp;
      void main(){
        float D = uD; vec3 world;
        if (aKind > 0.0) world = (aQ + min(D, 1.0)*aPsi)*exp(-max(D - 1.0, 0.0)*0.22);      // same flow as the web's filaments
        else {                                                                               // and as its sticky sheets
          float Dc = min(D, aColl.w*0.9); world = aQ + Dc*aPsi;
          float past = max(D - aColl.w*0.9, 0.0), hsh = hash13(aQ*0.001);
          world += aColl.xyz*smoothstep(0.0, 0.03, past)*90.0*sin(uWebT*(0.35 + 0.5*hsh) + 7.0*hsh)*exp(-past*0.3);
        }
        float born = smoothstep(0.55, 0.85, uTau);
        vShp = aShp;
        emit(world, aSz, color*uLum*born*uVis);
      }`,
    fragmentShader: /* glsl */`varying vec3 vCol; varying vec4 vShp;
      void main(){
        vec2 c = gl_PointCoord*2.0 - 1.0;
        c = vec2(vShp.y*c.x - vShp.z*c.y, vShp.z*c.x + vShp.y*c.y); c.y /= vShp.x;
        float r2 = dot(c, c); if (r2 > 1.0) discard;
        float prof = vShp.w > 0.5 ? exp(-sqrt(r2)*7.0)*2.2 : exp(-r2*5.0) + 0.6*exp(-r2*40.0);   // de Vaucouleurs-ish cusp vs exponential disk + bulge
        gl_FragColor = vec4(vCol*prof*(1.0 - r2*r2), 1.0);
      }`,
    transparent: true, depthTest: false, depthWrite: false,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
  });
  const pts = new THREE.Points(geom(N, { aQ: [aQ, 3], aPsi: [aPsi, 3], aColl: [aColl, 4], aKind: [aKind, 1], aShp: [aShp, 4], color: [col, 3], aSz: [aSz, 1] }), mat);
  pts.count = N;
  return pts;
}

/* ---- 4e2. Large-scale structure: a node graph of filaments draining into knots, over a faint Zel'dovich lattice ten times larger ---- */
const LSS_BOX = 76000;
function* buildLSS() {                         // a generator: built in time slices so it never stalls a frame
  const box = LSS_BOX;
  const rnd = mulberry32(76000);                 // its own stream, so deferring it never reshuffles the rest of the scene
  const gauss = () => { let u = 0; while (u === 0) u = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * rnd()); };
  const unit = () => { const z = 2 * rnd() - 1, p = TAU * rnd(), s = Math.sqrt(1 - z * z); return [s * Math.cos(p), z, s * Math.sin(p)]; };
  // --- lattice: same adhesion rule as the inner web, resolving 7 Mpc waves with a 64^3 grid
  let jr = 0; for (let i = 0; i < 300; i++) { const [, J] = GRF2.jac((rnd() - .5) * 140000, (rnd() - .5) * 140000, (rnd() - .5) * 140000); jr += J[0] ** 2 + J[4] ** 2 + J[8] ** 2; }
  const AMP = 0.8 / Math.sqrt(jr / 900);                                   // still condensing at a = 1
  const nl = Math.round(64 * Math.cbrt(Q)), sp = 2 * box / nl;
  const pts = [];
  for (let i = 0; i < nl; i++) for (let j = 0; j < nl; j++) for (let k = 0; k < nl; k++) {
    const q = [-box + (i + 0.5 + (rnd() - .5) * 0.35) * sp, -box + (j + 0.5 + (rnd() - .5) * 0.35) * sp, -box + (k + 0.5 + (rnd() - .5) * 0.35) * sp];
    const rq = Math.hypot(...q); if (rq < 4500 || rq > box) continue;
    pts.push(q);
  }
  const N = pts.length;
  const aQ = new Float32Array(N * 3), aPsi = new Float32Array(N * 3), aJ0 = new Float32Array(N * 3), aJ1 = new Float32Array(N * 3), aJ2 = new Float32Array(N * 3), aColl = new Float32Array(N * 4);
  for (let i = 0; i < N; i++) {
    const q = pts[i];
    const [P, J] = GRF2.jac(q[0], q[1], q[2]);
    aQ.set(q, i * 3); aPsi.set([P[0] * AMP, P[1] * AMP, P[2] * AMP], i * 3);
    aJ0.set([J[0] * AMP, J[1] * AMP, J[2] * AMP], i * 3); aJ1.set([J[3] * AMP, J[4] * AMP, J[5] * AMP], i * 3); aJ2.set([J[6] * AMP, J[7] * AMP, J[8] * AMP], i * 3);
    const [lam, vec] = eigSym3(J.map(x => x * AMP));
    let k = 0; for (let j = 1; j < 3; j++) if (lam[j] < lam[k]) k = j;
    let e = [vec[0][k], vec[1][k], vec[2][k]];
    if (e[0] * P[0] + e[1] * P[1] + e[2] * P[2] < 0) e = [-e[0], -e[1], -e[2]];
    aColl.set([e[0], e[1], e[2], lam[k] < -1e-9 ? -1 / lam[k] : 1e6], i * 4);
    if ((i & 1023) === 1023) yield;
  }
  const lat = new THREE.Points(geom(N, { aQ: [aQ, 3], aPsi: [aPsi, 3], aJ0: [aJ0, 3], aJ1: [aJ1, 3], aJ2: [aJ2, 3], aColl: [aColl, 4] }), pointsMaterial(/* glsl */`
    attribute vec3 aQ; attribute vec3 aPsi; attribute vec3 aJ0; attribute vec3 aJ1; attribute vec3 aJ2; attribute vec4 aColl;
    uniform float uVis, uEdge, uD, uWebT, uSp;
    void main(){
      float D = uD;
      float Dc = min(D, aColl.w*0.9);
      vec3 world = aQ + Dc*aPsi;
      float past = max(D - aColl.w*0.9, 0.0);
      float hsh = hash13(aQ*0.0001);
      float osc = smoothstep(0.0, 0.03, past)*0.25*uSp*sin(uWebT*(0.35 + 0.5*hsh) + 7.0*hsh)*exp(-past*0.3);
      world += aColl.xyz*osc;
      mat3 M = mat3(1.0) + Dc*mat3(aJ0, aJ1, aJ2);
      float rho = clamp(1.0/max(abs(determinant(M)), 1e-3), 0.06, 16.0);
      float rq = length(aQ);
      float edge = (1.0 - smoothstep(uEdge*0.8, uEdge, rq))*smoothstep(4500.0, 9000.0, rq);   // hands over to the inner web
      emit(world, uSp*0.6*pow(rho, -0.4), vec3(0.028*pow(rho, 0.9)*edge*uVis));
    }`, { uVis: { value: 0 }, uEdge: { value: box }, uD: { value: 1 }, uWebT: { value: 0 }, uSp: { value: sp } }));

  // --- node graph: the Sombrero's node at the origin, its three strongest filaments continued to the nearest nodes, then a Poisson-disc field
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const nodes = [[0, 0, 0]];
  FIL_DIRS.slice(0, 3).forEach(d0 => { const d = norm3(d0), L = 14000 + 5000 * rnd(); nodes.push([d[0] * L, d[1] * L, d[2] * L]); });
  for (let t = 0; t < 120000 && nodes.length < 300; t++) {
    const p = [(rnd() - .5) * 2 * box, (rnd() - .5) * 2 * box, (rnd() - .5) * 2 * box]; const r = Math.hypot(...p);
    if (r > box * 0.97 || r < 12500) continue;
    if (nodes.every(n => dist(n, p) > 7200)) nodes.push(p);
  }
  const seen = new Set(), E = [];
  nodes.forEach((n, i) => {
    nodes.map((m, j) => [dist(n, m), j]).filter(x => x[1] !== i).sort((a, b) => a[0] - b[0]).slice(0, 4).forEach(([d, j]) => {
      const key = i < j ? `${i}-${j}` : `${j}-${i}`; if (seen.has(key) || d > 22000) return; seen.add(key);
      const A = nodes[i], B = nodes[j], mid = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2, (A[2] + B[2]) / 2];
      const tan = norm3([B[0] - A[0], B[1] - A[1], B[2] - A[2]]), n1 = norm3(cross(tan, unit())), n2 = cross(tan, n1);
      const bend = (rnd() - .5) * 0.5 * d, bend2 = (rnd() - .5) * 0.5 * d;
      E.push({ A, B, C: [mid[0] + n1[0] * bend + n2[0] * bend2, mid[1] + n1[1] * bend + n2[1] * bend2, mid[2] + n1[2] * bend + n2[2] * bend2], n1, n2, d, w: 0.6 + 0.8 * rnd() });
    });
  });
  // Every node gets a miniature web like the Sombrero's: radial filaments a few Mpc long with thin cross-sections and
  // knots, drawn at the same particle sizes as the inner web so they resolve into the same spindly structure when zoomed out.
  // budget: 260k filament particles + ~300 nodes x (1500 arm + 70 core + 90 halo), ~0.75 M points at Q = 1, nearly all 1-4 px sprites
  const NF = Math.round(260000 * Q), NK = Math.round(1500 * Q), NC = Math.round(70 * Q), NH = Math.round(90 * Q), sumD = E.reduce((s, e) => s + e.d, 0);
  const M = NF + (NK + NC + NH) * (nodes.length - 1);
  const P0 = new Float32Array(M * 3), P1 = new Float32Array(M * 3), P2 = new Float32Array(M * 3), N1 = new Float32Array(M * 3), N2 = new Float32Array(M * 3), MI = new Float32Array(M * 4), SZ = new Float32Array(M * 3);
  let k = 0;
  E.forEach(e => {
    const n = Math.round(NF * e.d / sumD);
    for (let i = 0; i < n && k < M; i++, k++) {
      const knot = rnd() < 0.22;                                               // galaxies strung along the filament, as point sources
      P0.set(e.A, k * 3); P1.set(e.C, k * 3); P2.set(e.B, k * 3); N1.set(e.n1, k * 3); N2.set(e.n2, k * 3);
      const sig = (knot ? 160 : 300) * e.w;
      MI.set([rnd(), gauss() * sig, gauss() * sig, 0], k * 4);
      SZ.set([(knot ? 200 : 150 + 220 * rnd()) * Math.sqrt(e.w), knot ? 1.0 : 0.5 * e.w, 0], k * 3);
    }
  });
  nodes.slice(1).forEach(nd => {
    const arms = [];
    const na = 6 + Math.floor(rnd() * 4);
    for (let j = 0; j < na; j++) {
      const d = unit(), L = 3000 + 4500 * rnd(), off = unit();
      const end = [nd[0] + d[0] * L, nd[1] + d[1] * L, nd[2] + d[2] * L];
      const ctrl = [nd[0] + d[0] * L * 0.5 + off[0] * L * 0.28, nd[1] + d[1] * L * 0.5 + off[1] * L * 0.28, nd[2] + d[2] * L * 0.5 + off[2] * L * 0.28];
      const n1 = norm3(cross(d, [0.3, 1, 0.2])), n2 = cross(d, n1);
      arms.push({ end, ctrl, n1, n2, w: j < 3 ? 1 : 0.55, knots: Array.from({ length: 5 }, () => 0.15 + 0.85 * rnd()) });
    }
    for (let i = 0; i < NK && k < M; i++, k++) {
      const a = arms[Math.floor(Math.pow(rnd(), 1.3) * arms.length)];
      const knot = rnd() < 0.2;
      let s = knot ? a.knots[Math.floor(rnd() * a.knots.length)] + gauss() * 0.01 : Math.pow(rnd(), 1.3);
      s = clamp(s, 0.03, 1);
      const sig = knot ? 45 : (70 + 220 * s) * a.w;
      P0.set(nd, k * 3); P1.set(a.ctrl, k * 3); P2.set(a.end, k * 3); N1.set(a.n1, k * 3); N2.set(a.n2, k * 3);
      MI.set([s, gauss() * sig, gauss() * sig, 0], k * 4);
      const sz = knot ? 24 : (40 + 70 * s) * Math.sqrt(a.w);
      SZ.set([sz, 1.2 * Math.pow(sz / 30, -1.3), 1], k * 3);                   // inner-web sizes; brighter per particle to match its 30k-particle density
    }
    const [u, v] = orbitBasis(unit());
    for (let i = 0; i < NC && k < M; i++, k++) {                                // a small dense core, like the halo at the node
      P0.set(nd, k * 3); P1.set(nd, k * 3); P2.set(nd, k * 3); N1.set(u, k * 3); N2.set(v, k * 3);
      const r = 380 * Math.pow(rnd(), 0.7); const d = unit();
      MI.set([0.0, d[0] * r, d[1] * r, d[2] * r], k * 4);
      SZ.set([120 + 120 * rnd(), 0.3, 1], k * 3);
    }
    for (let i = 0; i < NH && k < M; i++, k++) {                                // the diffuse halo the inner lattice gives our own node
      P0.set(nd, k * 3); P1.set(nd, k * 3); P2.set(nd, k * 3); N1.set(u, k * 3); N2.set(v, k * 3);
      const r = 5200 * Math.pow(rnd(), 0.5); const d = unit();
      MI.set([0.0, d[0] * r, d[1] * r, d[2] * r], k * 4);
      SZ.set([900 + 700 * rnd(), 0.3, 1], k * 3);
    }
  });
  const fil = new THREE.Points(geom(k, { aP0: [P0.subarray(0, k * 3), 3], aP1: [P1.subarray(0, k * 3), 3], aP2: [P2.subarray(0, k * 3), 3], aN1: [N1.subarray(0, k * 3), 3], aN2: [N2.subarray(0, k * 3), 3], aMi: [MI.subarray(0, k * 4), 4], aSz: [SZ.subarray(0, k * 3), 3] }), pointsMaterial(/* glsl */`
    attribute vec3 aP0; attribute vec3 aP1; attribute vec3 aP2; attribute vec3 aN1; attribute vec3 aN2; attribute vec4 aMi; attribute vec3 aSz;
    uniform float uVis, uFlow, uEdge;
    void main(){
      // matter drains along each filament toward the nearer node (or, on a node's own arms, into the node) and the filament thins
      float fl = uFlow;
      float radial = aSz.z;
      float s = mix(clamp(0.5 + (aMi.x - 0.5)*(1.0 + 0.55*fl), 0.0, 1.0), aMi.x*exp(-0.25*fl), radial);
      float moving = step(0.01, aMi.x);                                  // cores and halos (s0 = 0) stay put; arms and edge filaments drain
      float shrink = mix(1.0, max(exp(-0.22*fl), 0.3), moving);
      vec3 c = (1.0 - s)*(1.0 - s)*aP0 + 2.0*(1.0 - s)*s*aP1 + s*s*aP2;
      vec3 n3 = cross(aN1, aN2);
      vec3 world = c + (aN1*aMi.y + aN2*aMi.z + n3*aMi.w)*shrink;
      float edge = 1.0 - smoothstep(uEdge*0.85, uEdge, length(world));
      float ends = mix(0.35 + 0.65*smoothstep(0.0, 0.12, min(s, 1.0 - s)), 1.0, radial);   // edge filaments fade into the nodes instead of piling up as discs
      emit(world, aSz.x*(0.55 + 0.45*shrink), vec3(aSz.y*(1.0 + 0.25*fl*moving)*edge*ends*uVis));
    }`, { uVis: { value: 0 }, uFlow: { value: 0 }, uEdge: { value: box } }));
  return { lat, fil };
}

/* ---- 4f. Tidal stream: particle spray (Fardal et al. 2015) in the same potential ------- */
const STREAM = (() => {
  const N = Math.round(2600 * Q) & ~1;
  const pos = new Float32Array(N * 3), vel = new Float32Array(N * 3), alive = new Uint8Array(N);
  return { N, pos, vel, alive, ready: false };
})();
function leap(p, v, n, dt) {                                            // kick-drift-kick, n bodies, in place
  const a = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    const k = i * 3;
    accel(p[k], p[k + 1], p[k + 2], a);
    v[k] += a[0] * dt * 0.5; v[k + 1] += a[1] * dt * 0.5; v[k + 2] += a[2] * dt * 0.5;
    p[k] += v[k] * dt; p[k + 1] += v[k + 1] * dt; p[k + 2] += v[k + 2] * dt;
    accel(p[k], p[k + 1], p[k + 2], a);
    v[k] += a[0] * dt * 0.5; v[k + 1] += a[1] * dt * 0.5; v[k + 2] += a[2] * dt * 0.5;
  }
}
function* streamBuilder() {
  const T_BACK = 3200, DT = 1.0;
  const r0 = [46, 15, -24], rr = Math.hypot(...r0), rh = norm3(r0);
  const n = norm3([-0.35, 0.8, 0.5]); const tdir = norm3(cross(n, rh));
  const v0 = vc(rr) * 0.5;
  const p = [...r0], v = [-(tdir[0] * v0 - rh[0] * v0 * 0.15), -(tdir[1] * v0 - rh[1] * v0 * 0.15), -(tdir[2] * v0 - rh[2] * v0 * 0.15)];
  const hist = []; const nsteps = T_BACK / DT;
  for (let s = 0; s <= nsteps; s++) { hist.push([p[0], p[1], p[2], -v[0], -v[1], -v[2]]); leap(p, v, 1, DT); }
  hist.reverse();                                                       // hist[s] = state at t = -T_BACK + s*DT
  const NR = STREAM.N / 2, every = Math.floor(nsteps / NR);
  const pp = new Float64Array(3), vv = new Float64Array(3);
  for (let j = 0; j < NR; j++) {
    const s0 = j * every; const [x, y, z, vx, vy, vz] = hist[s0];
    const r = Math.hypot(x, y, z), rhat = [x / r, y / r, z / r];
    const msat = 9e9 * (1 - 0.7 * j / NR);
    const rt = r * Math.cbrt(msat / (3 * Menc(r)));
    const L = cross([x, y, z], [vx, vy, vz]); const Om = Math.hypot(...L) / (r * r);
    const vr = vx * rhat[0] + vy * rhat[1] + vz * rhat[2];
    const vt = norm3([vx - vr * rhat[0], vy - vr * rhat[1], vz - vr * rhat[2]]);
    for (const side of [-1, 1]) {
      const kR = 2.0 + gauss() * 0.4, kV = 0.3 + gauss() * 0.4;          // Fardal+15 offsets
      pp[0] = x + side * kR * rt * rhat[0]; pp[1] = y + side * kR * rt * rhat[1]; pp[2] = z + side * kR * rt * rhat[2];
      const dv = side * kV * Om * kR * rt, sig = 0.004 * 8;
      vv[0] = vx + dv * vt[0] + gauss() * sig * 0.1; vv[1] = vy + dv * vt[1] + gauss() * sig * 0.1; vv[2] = vz + dv * vt[2] + gauss() * sig * 0.1;
      for (let s = s0; s < nsteps; s++) leap(pp, vv, 1, DT);
      const k = (j * 2 + (side > 0 ? 1 : 0)) * 3;
      STREAM.pos.set(pp, k); STREAM.vel.set(vv, k); STREAM.alive[k / 3] = 1;
    }
    if (j % 40 === 39) yield j / NR;
  }
  STREAM.ready = true;
}
function buildStreamPoints() {
  const N = STREAM.N, col = new Float32Array(N * 3), seed = new Float32Array(N);
  for (let i = 0; i < N; i++) { col.set(kelvin(4400 + 900 * rnd()), i * 3); seed[i] = rnd(); }
  const g = geom(N, { color: [col, 3], aSeed: [seed, 1] });
  const mat = pointsMaterial(/* glsl */`
    attribute vec3 color; attribute float aSeed;
    uniform float uVis;
    void main(){
      vec3 p = position;
      float born = smoothstep(0.8, 0.95, uTau);
      emit(p/uA, 0.22/uA, color*0.9*born*uVis*step(0.5, length(p)));
    }`, { uVis: { value: 1 } });
  return new THREE.Points(g, mat);
}

/* ---- 4g. Foreground Milky Way stars & background galaxies ----------------------------- */
const HERO_FWD = (() => { const el = 6 * Math.PI / 180; return [0, -Math.sin(el), -Math.cos(el)]; })();   // where the hero camera looks
function dirNear(fwd, cosMax) {                 // uniform direction inside a cone about fwd
  const [u, v] = orbitBasis(fwd); const cz = cosMax + rnd() * (1 - cosMax), s = Math.sqrt(1 - cz * cz), ph = TAU * rnd();
  return [fwd[0] * cz + (u[0] * Math.cos(ph) + v[0] * Math.sin(ph)) * s, fwd[1] * cz + (u[1] * Math.cos(ph) + v[1] * Math.sin(ph)) * s, fwd[2] * cz + (u[2] * Math.cos(ph) + v[2] * Math.sin(ph)) * s];
}
function buildSky(N) {
  const NB = 14;                                 // bright foreground stars, the ones that get diffraction spikes
  const M = N + NB;
  const dir = new Float32Array(M * 3), col = new Float32Array(M * 3), sz = new Float32Array(M), shp = new Float32Array(M * 4);
  for (let i = 0; i < N; i++) {
    // 60% of the field is packed into the hero's cone of view so the plate is as busy as Hubble's
    const d = rnd() < 0.45 ? dirNear(HERO_FWD, Math.cos(24 * Math.PI / 180)) : unit();
    dir.set(d, i * 3);
    const inCone = d[0] * HERO_FWD[0] + d[1] * HERO_FWD[1] + d[2] * HERO_FWD[2] > Math.cos(24 * Math.PI / 180);
    const gal = rnd() < (inCone ? 0.38 : 0.62);   // distant (z ~ 0.3-1) galaxies dominate faint counts away from the Milky Way's stars
    if (gal) {                                   // background galaxies: elliptical smudges, red ellipticals and bluer disks
      const early = rnd() < 0.5;
      const c = kelvin(early ? 3900 + 600 * rnd() : 5200 + 2200 * rnd());
      const b = 0.02 + 0.07 * Math.pow(rnd(), 2);
      col.set(c.map(x => x * b), i * 3); sz[i] = 3 + 9 * Math.pow(rnd(), 1.6);
      const ang = TAU * rnd();
      shp.set([early ? 0.55 + 0.45 * rnd() : 0.25 + 0.6 * rnd(), Math.cos(ang), Math.sin(ang), 1], i * 4);
    } else {
      const c = kelvin(3200 + 9000 * Math.pow(rnd(), 2));
      const b = 0.006 + 0.16 * Math.pow(rnd(), 5);
      col.set(c.map(x => x * b), i * 3); sz[i] = 1.6 + 2.2 * rnd();
      shp.set([3.5, 0.0, 0.0, 0], i * 4);
    }
  }
  // angular offsets from the hero line of sight, in the hero camera's frame (right = +x, up ~ +y)
  const RIGHT = [1, 0, 0], UP = norm3(cross(RIGHT, HERO_FWD));
  const offs = (d) => { const f = d[0] * HERO_FWD[0] + d[1] * HERO_FWD[1] + d[2] * HERO_FWD[2]; return [Math.atan2(d[0] * RIGHT[0] + d[1] * RIGHT[1] + d[2] * RIGHT[2], f) * 180 / Math.PI, Math.atan2(d[0] * UP[0] + d[1] * UP[1] + d[2] * UP[2], f) * 180 / Math.PI]; };
  const onGalaxy = (d) => { const [x, y] = offs(d); return (x / 15.5) ** 2 + (y / 9.5) ** 2 < 1; };   // the brim spans ~13 deg, the glow ~8 deg
  for (let j = 0; j < NB; j++) {                 // modest foreground stars only: the very bright ones look wrong on a plate this size
    const i = N + j;
    let d; do { d = dirNear(HERO_FWD, Math.cos(22 * Math.PI / 180)); } while (onGalaxy(d));
    dir.set(d, i * 3);
    const b = j < 3 ? 3.0 + 1.4 * rnd() : 1.2 + 1.8 * rnd();
    const c = kelvin(3600 + 6500 * rnd());
    col.set(c.map(x => x * b), i * 3);
    sz[i] = j < 3 ? 11 : 9;
    shp.set([16, 0.005, 34, 0], i * 4);           // (core width, wing level, ring frequency, kind)
  }
  const g = geom(M, { aDir: [dir, 3], color: [col, 3], aSz: [sz, 1], aShp: [shp, 4] });
  const mat = new THREE.ShaderMaterial({
    uniforms: { uDpr: { value: 1 }, uSky: { value: 1 }, uPt: { value: 1 }, uSpk: { value: 0 } },
    vertexShader: /* glsl */`attribute vec3 aDir; attribute vec3 color; attribute float aSz; attribute vec4 aShp; uniform float uDpr, uSky, uPt, uSpk; varying vec3 vCol; varying vec4 vShp;
      void main(){ vec4 mv = viewMatrix*vec4(cameraPosition + aDir*1.0e6, 1.0); gl_Position = projectionMatrix*mv; gl_PointSize = mix(min(aSz*uDpr*uPt, 64.0), 5.0*uDpr*uPt, uSpk); vCol = color*uSky; vShp = mix(aShp, vec4(3.0, 0.0, 1.0, 0.0), uSpk); }`,
    fragmentShader: /* glsl */`varying vec3 vCol; varying vec4 vShp;
      void main(){
        vec2 c = gl_PointCoord*2.0 - 1.0;
        if (vShp.w > 0.5){
          c = vec2(vShp.y*c.x - vShp.z*c.y, vShp.z*c.x + vShp.y*c.y); c.y /= vShp.x;
          float r2 = dot(c, c); if (r2 > 1.0) discard;
          gl_FragColor = vec4(vCol*(exp(-r2*3.0) + 0.5*exp(-r2*16.0))*(1.0 - r2*r2), 1.0);
        } else {
          float r2 = dot(c, c); if (r2 > 1.0) discard;
          // PSF: gaussian core, Lorentzian wings with a faint Airy-like ripple
          float psf = exp(-r2*vShp.x) + vShp.y/(1.0 + r2*40.0)*(0.75 + 0.25*cos(sqrt(r2)*vShp.z));
          gl_FragColor = vec4(vCol*psf*(1.0 - r2*r2), 1.0);
        }
      }`, transparent: true, depthTest: false, depthWrite: false,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
  });
  return new THREE.Points(g, mat);
}

/* =====================================================================
   5. Emission-absorption raymarch: unresolved starlight and the dust lane
   ===================================================================== */
const FS_VERT = /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const volMat = new THREE.ShaderMaterial({
  uniforms: {
    uTime: U.uTime, uA: U.uA, uDust: U.uDust,
    uInvProj: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() }, uCamPos: { value: new THREE.Vector3() },
    uGal: { value: 1 }, uKappa: { value: 7.0 }, uBulgeCol: { value: new THREE.Vector3(...kelvin(5300)) },
    uDiskCol: { value: new THREE.Vector3(...kelvin(5500)) }, uEmit: { value: 0.11 }, uStars: { value: 1 }, uAmb: { value: 0.2 }, uAlbedo: { value: 0.6 },
  },
  vertexShader: FS_VERT,
  fragmentShader: GLSL_COMMON + /* glsl */`
    uniform mat4 uInvProj, uCamWorld; uniform vec3 uCamPos;
    uniform float uA, uDust, uGal, uKappa, uEmit, uStars, uAmb, uAlbedo; uniform vec3 uBulgeCol, uDiskCol;
    varying vec2 vUv;
    // Spheroid: Hernquist emissivity (the de Vaucouleurs analogue). Its flattening eases from the inner
    // lens (q = 0.60) to a rounder envelope (q = 0.84), as the Hubble isophotes do, and an r^-3 envelope carries the glow out.
    float spheroid(vec3 p){
      float r = length(p);
      float q = mix(0.60, 0.84, smoothstep(1.5, 12.0, r));
      float m = length(vec3(p.x, p.y/q, p.z))/AB;
      return 3.0/((m + 0.015)*pow(1.0 + m, 3.0)) + 0.009*pow(1.0 + r/5.0, -3.0);
    }
    vec3 emission(vec3 p, float t){
      float R = length(p.xz);
      float sc = 1.0/cosh(clamp(p.y/0.2, -20.0, 20.0)); float dz = sc*sc;
      float phi = atan(p.z, p.x);
      float sp = 0.5 + 0.5*cos(armPhase(R, phi, t) - 0.3);
      float arm = sp*sp;
      float rim = smoothstep(${f(DUST_R + 0.6)}, ${f(DUST_R - 1.2)}, R);
      float disk = (exp(-R/4.0)*(0.7 + 0.7*arm*smoothstep(2.5, 5.5, R)) + 0.45*exp(-0.5*sq((R - ${f(DUST_R - 2.2)})/1.3))*(0.6 + 0.8*arm))*dz*rim;
      return uBulgeCol*spheroid(p) + uDiskCol*disk*1.3;
    }
    // Mean intensity of spheroid light at p, for dust scattering: J ~ L / (4 pi^2 (r^2 + a^2))
    vec3 ambient(vec3 p){ float r2 = dot(p, p); return uBulgeCol*uAmb/(r2 + AB*AB); }
    void main(){
      vec2 ndc = vUv*2.0 - 1.0;
      vec4 v = uInvProj*vec4(ndc, -1.0, 1.0); v /= v.w;      // near plane: robust with a huge far/near ratio
      vec3 dir = normalize((uCamWorld*vec4(v.xyz, 0.0)).xyz);
      vec3 ro = uCamPos*uA;                                   // display (comoving) -> physical
      vec3 bmax = vec3(26.0, 20.0, 26.0);
      vec3 inv = 1.0/dir, t0 = (-bmax - ro)*inv, t1 = (bmax - ro)*inv;
      vec3 tmn = min(t0, t1), tmx = max(t0, t1);
      float tn = max(max(tmn.x, tmn.y), max(tmn.z, 0.0)), tf = min(min(tmx.x, tmx.y), tmx.z);
      if (tf <= tn){ gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
      float jit = fract(52.9829189*fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
      vec3 I = vec3(0.0), T = vec3(1.0);
      float tt = tn;
      float ady = max(abs(dir.y), 1e-3);
      bool first = true;
      for (int i = 0; i < 460; i++){
        vec3 p = ro + dir*tt;
        float r = length(p), R = length(p.xz);
        float ds = clamp((0.03 + 0.2*abs(p.y))/ady, 0.03, 0.22 + 0.05*R);
        ds = min(ds, 0.025 + 0.11*r);
        // inside the dust shell the step must resolve the cirrus (~0.3 kpc streaks), or the texture averages to noise
        float inDust = step(abs(p.y), 0.7)*step(${f(DUST_R - 2.6)}, R)*step(R, ${f(DUST_R + 2.1)});
        ds = mix(ds, min(ds, 0.055), inDust);
        ds *= 0.55 + 0.9*fract(jit + float(i)*0.618034);         // per-step jitter: no banding along the thin lane
        if (first){ tt += ds*jit; p = ro + dir*tt; first = false; }
        float dd = dustDensity(p, uTime, 3)*uDust;
        vec3 sig = dd*uKappa*vec3(1.32, 1.0, 0.74);
        vec3 j = emission(p, uTime)*uGal*uStars;
        // dust scatters the spheroid's light (albedo ~0.6, bluer): the brim glows grey-brown instead of going black
        j += sig*uAlbedo*vec3(1.04, 1.0, 0.94)*ambient(p)*uGal*uStars;   // grains in the brim look brown: reddened spheroid light scattered back
        vec3 att = exp(-sig*ds);
        I += T*j*mix(vec3(ds), (1.0 - att)/max(sig, vec3(1e-6)), step(vec3(1e-4), sig));
        T *= att;
        tt += ds;
        if (tt > tf || max(T.r, max(T.g, T.b)) < 0.004) break;
      }
      gl_FragColor = vec4(I*uEmit, dot(T, vec3(0.3333)));
    }`,
  depthTest: false, depthWrite: false,
});

/* =====================================================================
   6. Renderer, HDR targets, bloom, tone mapping
   ===================================================================== */
const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
renderer.autoClear = false;
renderer.setClearColor(0x000000, 1);
let DPR = params.has('dpr') ? clamp(+params.get('dpr') || 1, 0.3, 3) : 1;
let VOL_SCALE = params.has('vol') ? clamp(+params.get('vol') || 0.6, 0.15, 1) : small ? 0.4 : 0.45;
let SPK_SCALE = params.has('spk') ? clamp(+params.get('spk') || 1, 0.25, 1) : 0.5;
// Pixel budget: a 4K or ultrawide window at full size would cost 4-5x a 1080p one. Unless a ratio is forced (#dpr=),
// the render resolution is capped at ~2.4 M pixels and upscaled, which keeps the frame rate where Balanced was tuned.
const PIXEL_BUDGET = 2.4e6;
const effDpr = (W, H) => params.has('dpr') ? DPR : Math.min(DPR, Math.sqrt(PIXEL_BUDGET / Math.max(1, W * H)));
const camera = new THREE.PerspectiveCamera(22, innerWidth / innerHeight, 0.05, 5e7);
const rtOpts = { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false };
let hdrRT, volRT, dmRT, mips = [];
const quadGeo = new THREE.BufferGeometry();
quadGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
quadGeo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2));
const quad = new THREE.Mesh(quadGeo, volMat); quad.frustumCulled = false;
const quadScene = new THREE.Scene(); quadScene.add(quad);
const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
function pass(mat, target, clear = true) { quad.material = mat; renderer.setRenderTarget(target); if (clear) renderer.clear(); renderer.render(quadScene, quadCam); }

const volCompMat = new THREE.ShaderMaterial({
  uniforms: { tVol: { value: null } }, vertexShader: FS_VERT,
  fragmentShader: `uniform sampler2D tVol; varying vec2 vUv; void main(){ gl_FragColor = texture2D(tVol, vUv); }`,
  transparent: true, depthTest: false, depthWrite: false,
  blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.SrcAlphaFactor,
  blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
});
const downMat = new THREE.ShaderMaterial({
  uniforms: { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uFirst: { value: 0 } }, vertexShader: FS_VERT,
  fragmentShader: /* glsl */`uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uFirst; varying vec2 vUv;
    vec3 s(float x, float y){ vec3 c = texture2D(tSrc, vUv + vec2(x, y)*uTexel).rgb; if (uFirst > 0.5) c = c/(1.0 + max(c.r, max(c.g, c.b))*0.08); return c; }
    void main(){
      vec3 c = s(0.,0.)*0.125 + (s(-2.,2.)+s(2.,2.)+s(-2.,-2.)+s(2.,-2.))*0.03125 + (s(0.,2.)+s(-2.,0.)+s(2.,0.)+s(0.,-2.))*0.0625
             + (s(-1.,1.)+s(1.,1.)+s(-1.,-1.)+s(1.,-1.))*0.125;
      gl_FragColor = vec4(c, 1.0);
    }`, depthTest: false, depthWrite: false,
});
const upMat = new THREE.ShaderMaterial({
  uniforms: { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } }, vertexShader: FS_VERT,
  fragmentShader: /* glsl */`uniform sampler2D tSrc; uniform vec2 uTexel; varying vec2 vUv;
    vec3 s(float x, float y){ return texture2D(tSrc, vUv + vec2(x, y)*uTexel).rgb; }
    void main(){
      vec3 c = s(0.,0.)*4.0 + (s(-1.,0.)+s(1.,0.)+s(0.,-1.)+s(0.,1.))*2.0 + s(-1.,-1.)+s(1.,-1.)+s(-1.,1.)+s(1.,1.);
      gl_FragColor = vec4(c/16.0, 1.0);
    }`, depthTest: false, depthWrite: false, transparent: true,
  blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
});
/* Diffraction spikes: the PSF of a four-vane spider. Unresolved point sources above a threshold are streaked
   along two axes by three passes of a separable, geometrically decaying kernel (strides 1, 4, 16), with the
   chromatic dispersion of a real spike (red spreads further than blue) and the ripple of the vane's sinc^2. */
const spkMat = new THREE.ShaderMaterial({
  uniforms: { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uDir: { value: new THREE.Vector2(1, 0) }, uStride: { value: 1 }, uThr: { value: 0 }, uAtt: { value: 0.972 }, uLast: { value: 0 } },
  vertexShader: FS_VERT,
  fragmentShader: /* glsl */`uniform sampler2D tSrc; uniform vec2 uTexel, uDir; uniform float uStride, uThr, uAtt, uLast; varying vec2 vUv;
    void main(){
      vec3 acc = vec3(0.0);
      for (int i = -4; i <= 4; i++){
        float k = float(i), d = abs(k)*uStride;
        float w = pow(uAtt, d);
        vec3 c = max(texture2D(tSrc, vUv + uDir*k*uStride*uTexel).rgb - uThr, 0.0);
        vec3 tint = mix(vec3(1.0), mix(vec3(0.92, 0.97, 1.08), vec3(1.18, 0.90, 0.72), clamp(d/90.0, 0.0, 1.0)), uLast);
        float ripple = mix(1.0, 0.85 + 0.15*cos(d*0.7), step(3.5, uStride)*(1.0 - uLast));
        acc += c*w*tint*ripple;
      }
      gl_FragColor = vec4(acc*0.45, 1.0);
    }`, depthTest: false, depthWrite: false,
});
let spk = [];
function spikePasses() {                        // source in spk[0]; horizontal result lands in spk[1], vertical in spk[2]
  const run = (dir, chain) => {
    [1, 4, 16].forEach((stride, i) => {
      const src = spk[chain[i]], dst = spk[chain[i + 1]];
      spkMat.uniforms.tSrc.value = src.texture; spkMat.uniforms.uTexel.value.set(1 / src.width, 1 / src.height);
      spkMat.uniforms.uDir.value.copy(dir); spkMat.uniforms.uStride.value = stride;
      spkMat.uniforms.uThr.value = i === 0 ? 1.5 : 0; spkMat.uniforms.uLast.value = i === 2 ? 1 : 0;
      pass(spkMat, dst);
    });
  };
  run(spkDirH, [0, 1, 2, 1]); run(spkDirV, [0, 2, 0, 2]);
}
const spkDirH = new THREE.Vector2(1, 0), spkDirV = new THREE.Vector2(0, 1);

const finalMat = new THREE.ShaderMaterial({
  uniforms: { tScene: { value: null }, tBloom: { value: null }, tDM: { value: null }, tSpkH: { value: null }, tSpkV: { value: null }, uSpike: { value: 0.12 }, uStretch: { value: 5.5 }, uDMGain: { value: 6 }, uBloom: { value: 0.11 }, uExposure: { value: 1.0 }, uFade: { value: 0 }, uTimeS: { value: 0 }, uRes: { value: new THREE.Vector2() }, uDbg: { value: +(params.get('dbg') || 0) } },
  vertexShader: FS_VERT,
  fragmentShader: /* glsl */`uniform sampler2D tScene, tBloom, tDM, tSpkH, tSpkV; uniform float uBloom, uExposure, uFade, uTimeS, uDbg, uDMGain, uSpike, uStretch; uniform vec2 uRes; varying vec2 vUv;
    // projected density -> indigo voids, magenta filaments, orange-to-cream nodes
    vec3 cmap(float t){
      const vec3 c0 = vec3(0.00, 0.00, 0.02), c1 = vec3(0.05, 0.04, 0.19), c2 = vec3(0.15, 0.10, 0.45), c3 = vec3(0.40, 0.17, 0.68),
                 c4 = vec3(0.72, 0.28, 0.78), c5 = vec3(0.95, 0.47, 0.62), c6 = vec3(1.00, 0.72, 0.46), c7 = vec3(1.00, 0.96, 0.86);
      t = clamp(t, 0.0, 1.0);
      if (t < 0.12) return mix(c0, c1, t/0.12);
      if (t < 0.28) return mix(c1, c2, (t-0.12)/0.16);
      if (t < 0.45) return mix(c2, c3, (t-0.28)/0.17);
      if (t < 0.60) return mix(c3, c4, (t-0.45)/0.15);
      if (t < 0.74) return mix(c4, c5, (t-0.60)/0.14);
      if (t < 0.87) return mix(c5, c6, (t-0.74)/0.13);
      return mix(c6, c7, (t-0.87)/0.13);
    }
    vec3 aces(vec3 x){ return clamp((x*(2.51*x + 0.03))/(x*(2.43*x + 0.59) + 0.14), 0.0, 1.0); }
    float asinh_(float x){ return log(x + sqrt(x*x + 1.0)); }
    float h12(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y)*p3.z); }
    void main(){
      vec3 c = texture2D(tScene, vUv).rgb;
      vec3 b = texture2D(tBloom, vUv).rgb;
      if (uDbg == 1.0) { gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0); return; }
      if (uDbg == 2.0) { bool n = any(isnan(c)) || any(isinf(c)); gl_FragColor = vec4(n ? 1.0 : 0.0, c.g > 0.0001 ? 1.0 : 0.0, b.g > 0.0001 ? 1.0 : 0.0, 1.0); return; }
      vec3 s = (texture2D(tSpkH, vUv).rgb + texture2D(tSpkV, vUv).rgb)*uSpike;
      c = (mix(c, b, uBloom) + s)*uExposure;
      // Hubble-style display stretch: asinh on luminance with the hue kept (Lupton et al. 2004), then a filmic shoulder
      float L = dot(c, vec3(0.2126, 0.7152, 0.0722));
      float Ls = asinh_(L*uStretch)/asinh_(uStretch);
      c *= Ls/max(L, 1e-6);
      c = aces(c*1.15);
      vec2 q = vUv - 0.5; q.x *= uRes.x/uRes.y;
      c *= mix(1.0, smoothstep(1.2, 0.3, length(q)), 0.28);
      c = pow(c, vec3(1.0/2.2));
      float dm = texture2D(tDM, vUv).r;
      vec3 dmc = cmap(log2(1.0 + dm*uDMGain)/log2(1.0 + uDMGain*14.0));
      dmc *= 0.85*(1.0 - 0.8*clamp(dot(c, vec3(0.3, 0.55, 0.15)), 0.0, 1.0));   // starlight stays on top
      c = 1.0 - (1.0 - c)*(1.0 - dmc);
      c += (h12(gl_FragCoord.xy + fract(uTimeS)*917.0) - 0.5)*(1.6/255.0);
      gl_FragColor = vec4(c*uFade, 1.0);
    }`, depthTest: false, depthWrite: false,
});
let W = 1, H = 1;
function resize() {
  W = innerWidth; H = innerHeight;
  const dpr = effDpr(W, H);
  renderer.setPixelRatio(dpr); renderer.setSize(W, H, false);
  const bw = Math.floor(W * dpr), bh = Math.floor(H * dpr);
  hdrRT?.dispose(); volRT?.dispose(); dmRT?.dispose(); mips.forEach(m => m.dispose()); spk.forEach(m => m.dispose());
  const sw = SPK_SCALE; spk = [0, 1, 2].map(() => new THREE.WebGLRenderTarget(Math.max(2, Math.floor(bw * sw)), Math.max(2, Math.floor(bh * sw)), rtOpts));
  hdrRT = new THREE.WebGLRenderTarget(bw, bh, rtOpts);
  dmRT = new THREE.WebGLRenderTarget(Math.floor(bw * 0.75), Math.floor(bh * 0.75), rtOpts);
  volRT = new THREE.WebGLRenderTarget(Math.max(2, Math.floor(bw * VOL_SCALE)), Math.max(2, Math.floor(bh * VOL_SCALE)), rtOpts);
  mips = [];
  let mw = bw, mh = bh;
  for (let i = 0; i < 6; i++) { mw = Math.max(1, mw >> 1); mh = Math.max(1, mh >> 1); mips.push(new THREE.WebGLRenderTarget(mw, mh, rtOpts)); }
  camera.aspect = W / H;
  U.uPxScale.value = bh / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
  sky.material.uniforms.uDpr.value = dpr;
  finalMat.uniforms.uRes.value.set(bw, bh);
  annot.width = Math.floor(W * devicePixelRatio); annot.height = Math.floor(H * devicePixelRatio);
  computeStops();
}

/* =====================================================================
   7. Build the scene
   ===================================================================== */
const disk = buildDisk(Math.round(70000 * Q));
const bulge = buildSpheroid(Math.round(55000 * Q), bulgeSampler);
const gcs = buildSpheroid(1900, gcSampler);                              // the real count, ~1900
const halo = buildHalo(Math.round(90000 * Q));
const subs = buildSubhaloParticles();
const neighbors = buildNeighbors();
const web = buildWeb();
const field = buildFieldGalaxies(web);
let lssL = null, lssF = null;                                            // large-scale structure, built in the background (see pumpLSS)
const lssGen = buildLSS();
function pumpLSS(budgetMs) {
  if (lssL) return;
  const t0 = performance.now();
  while (performance.now() - t0 < budgetMs) {
    const r = lssGen.next();
    if (r.done) { ({ lat: lssL, fil: lssF } = r.value); [lssL, lssF].forEach(o => { o.frustumCulled = false; dmScene.add(o); }); return; }
  }
}
const streamPts = buildStreamPoints();
const sky = buildSky(small ? 6000 : 13000);
gcs.material.uniforms.uVis.value = 1;
const dmScene = new THREE.Scene();
[web, halo, subs].forEach(o => { o.frustumCulled = false; dmScene.add(o); });
[field, streamPts, gcs, bulge, disk, neighbors].forEach(o => { o.frustumCulled = false; scene.add(o); });
sky.frustumCulled = false; bgScene.add(sky);
const subP = new Float64Array(SUB.length * 3), subV = new Float64Array(SUB.length * 3);
SUB.forEach((s, i) => { subP.set(s.pos, i * 3); subV.set(s.vel, i * 3); });
const annot = document.getElementById('annot');
const actx = annot.getContext('2d');

/* =====================================================================
   8. Camera: scroll stops, intro path, drag
   ===================================================================== */
const STOPS = {                               // el = 6 deg is the Sombrero as seen from Earth, i = 84 deg
  hero:    { d: 52,    el: 6,  az: 0,    film: 0,     filmY: 0.07 },
  halo:    { d: 260,   el: 20, az: -28,  film: -0.15, filmY: 0 },
  subhalo: { d: 1900,  el: 32, az: -70,  film: -0.15, filmY: 0 },
  web:     { d: 15000, el: 46, az: -115, film: -0.13, filmY: 0 },
  lss:     { d: 150000, el: 36, az: -150, film: -0.13, filmY: 0 },
  model:   { d: 74,    el: 42, az: -160, film: -0.2,  filmY: 0 },
  cta:     { d: 56,    el: 11, az: -360, film: 0,     filmY: 0.06 },
};
const sections = [...document.querySelectorAll('[data-stop]')];
let stopAnchors = [];
function computeStops() { stopAnchors = sections.map(s => ({ y: s.offsetTop + s.offsetHeight / 2 - innerHeight / 2, k: s.dataset.stop })); }
const mixA = (a, b, t) => a + (b - a) * t;
function scrollTarget() {
  if (params.has('stop')) return { ...STOPS[params.get('stop')], ...(params.has('d') ? { d: +params.get('d') } : {}), ...(params.has('el') ? { el: +params.get('el') } : {}), scrim: 1 };
  const y = scrollY; const A = stopAnchors;
  if (!A.length) return { ...STOPS.hero, scrim: 0 };
  let i = 0; while (i < A.length - 2 && y > A[i + 1].y) i++;
  const t = smooth(0.12, 0.88, (y - A[i].y) / Math.max(1, A[i + 1].y - A[i].y));
  const p = STOPS[A[i].k], q = STOPS[A[i + 1].k];
  const sc = (k) => (k === 'hero' || k === 'cta') ? 0 : k === 'model' ? 0.4 : 1;
  return { d: Math.exp(mixA(Math.log(p.d), Math.log(q.d), t)), el: mixA(p.el, q.el, t), az: mixA(p.az, q.az, t), film: mixA(p.film, q.film, t), filmY: mixA(p.filmY, q.filmY, t), scrim: mixA(sc(A[i].k), sc(A[i + 1].k), t) };
}
// One continuous dolly from 26 Mpc to the hero, driven by the intro clock (not by cosmic time, which runs a^1.5):
// a constant rate in log distance, eased only at the two ends, so it never surges or stalls between scales.
const INTRO_FROM = { d: 26000, el: 38, az: 70, film: 0, filmY: 0 }, INTRO_TO = STOPS.hero;   // lands exactly on the hero framing, so the hand-off to scroll control is seamless
// Progress along the dolly: velocity ramps up and down with smoothstep shoulders, so speed and acceleration
// are both continuous and reach zero at the ends (no perceptible "stop" when the camera arrives).
const INTRO_EASE = (() => {
  const N = 2048, ta = 0.2, v = (s) => smooth(0, ta, s) * smooth(1, 1 - ta, s), cum = new Float64Array(N + 1);
  for (let i = 1; i <= N; i++) cum[i] = cum[i - 1] + (v((i - 0.5) / N)) / N;
  for (let i = 0; i <= N; i++) cum[i] /= cum[N];
  return (s) => { const x = clamp(s, 0, 1) * N, i = Math.min(N - 1, Math.floor(x)); return mixA(cum[i], cum[i + 1], x - i); };
})();
function introCam(s) {
  const t = INTRO_EASE(s);
  return { d: Math.exp(mixA(Math.log(INTRO_FROM.d), Math.log(INTRO_TO.d), t)), el: mixA(INTRO_FROM.el, INTRO_TO.el, t), az: mixA(INTRO_FROM.az, INTRO_TO.az, t), film: mixA(INTRO_FROM.film, INTRO_TO.film, t), filmY: mixA(INTRO_FROM.filmY, INTRO_TO.filmY, t), scrim: 0 };
}
const cam = params.has('stop') ? { ...STOPS[params.get('stop')] } : { ...STOPS.hero };
let webFlow = +(params.get('flow') || 0), webT = +(params.get('webt') || 0);   // exaggerated post-z=0 growth of the web, and its clock
let lssFlow = +(params.get('lflow') || 0), lssT = 0, lssAz = 0;   // lssAz: steady one-way camera drift at the largest scale, degrees                              // the large-scale lattice runs its own, faster clock
const user = { az: 0, el: 0 };
let drag = null;
canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, id: e.pointerId }; canvas.classList.add('dragging'); });
addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  user.az -= (e.clientX - drag.x) * 0.3; user.el = clamp(user.el + (e.clientY - drag.y) * 0.25 * (e.pointerType === 'touch' ? 0 : 1), -80, 80);
  drag.x = e.clientX; drag.y = e.clientY;
});
const endDrag = () => { drag = null; canvas.classList.remove('dragging'); };
addEventListener('pointerup', endDrag); addEventListener('pointercancel', endDrag);
canvas.addEventListener('dblclick', () => { user.az = 0; user.el = 0; });

/* =====================================================================
   9. Intro: z = 13 -> 0
   ===================================================================== */
const forcedTau = params.has('tau') ? clamp(parseFloat(params.get('tau')), 0.02, 1) : null;
const A0 = 0.07;
const INTRO_SECONDS = 8;
const intro = { s: 1, playing: false, speed: 1 / INTRO_SECONDS };
const skipBtn = document.getElementById('skip');
// The formation sequence doubles as the loading animation: it plays on arrival with the page copy hidden and scrolling
// locked at the top, and hands over to the hero once z = 0. Skip, a scroll or a swipe fast-forwards it.
const htmlEl = document.documentElement;
const REPLAY_SECONDS = 24;                                                // a replay is asked for, so it takes its time
function startIntro(seconds = INTRO_SECONDS) {
  Object.assign(cam, { d: 26000, el: 38, az: 70, filmY: 0 }); intro.s = 0; intro.playing = true; intro.speed = 1 / seconds; skipBtn.hidden = false;
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  scrollTo(0, 0); htmlEl.classList.add('intro-on');
}
function endIntro() { intro.s = 1; intro.playing = false; skipBtn.hidden = true; htmlEl.classList.remove('intro-on'); }
if (forcedTau !== null) { intro.s = (Math.pow(forcedTau, 2 / 3) - A0) / (1 - A0); }
else if (!reduceMotion && (params.has('intro') || !(params.has('stop') || params.has('nointro')))) startIntro();
skipBtn.addEventListener('click', () => { intro.speed = 1 / 1.2; });
addEventListener('wheel', () => { if (intro.playing) intro.speed = Math.max(intro.speed, 1 / 1.5); }, { passive: true });
addEventListener('touchmove', () => { if (intro.playing) intro.speed = Math.max(intro.speed, 1 / 1.5); }, { passive: true });
document.getElementById('replay').addEventListener('click', () => startIntro(REPLAY_SECONDS));
const PHASES = [[0.06, 'Linear growth · Zel’dovich displacements'], [0.2, 'Shell crossing · the web condenses'], [0.42, 'Turnaround · inner shells virialise first'], [0.62, 'Gas cools · the bulge forms'], [0.9, 'Inside-out disk growth'], [1.01, 'z = 0 · NGC 4594']];

/* =====================================================================
   10. Controls, HUD, form
   ===================================================================== */
const layers = { stars: true, dust: true, dm: false, sub: true, stream: true, gc: true, ann: true, spk: true };
const layerIds = { stars: 'L-stars', dust: 'L-dust', dm: 'L-dm', sub: 'L-sub', stream: 'L-stream', gc: 'L-gc', ann: 'L-ann', spk: 'L-spk' };
(params.get('off') || '').split(',').filter(Boolean).forEach(k => { if (k in layers) layers[k] = false; });
for (const [k, id] of Object.entries(layerIds)) {
  const b = document.getElementById(id);
  b.setAttribute('aria-pressed', String(layers[k]));
  b.addEventListener('click', () => { layers[k] = !layers[k]; b.setAttribute('aria-pressed', String(layers[k])); });
}
let rate = reduceMotion ? 0 : 0.5;                                      // Myr of galaxy time per second: 0, 500 kyr, 1 Myr, 5 Myr
const flowRate = () => rate > 0 ? clamp(1 + 0.25 * Math.log10(rate / 0.5), 0.5, 1.5) : 0;   // the (exaggerated) web flow follows the rate gently, 1 at the default
document.querySelectorAll('.rate button').forEach(b => {
  b.setAttribute('aria-pressed', String(+b.dataset.rate === rate));
  b.addEventListener('click', () => { rate = +b.dataset.rate; document.querySelectorAll('.rate button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); });
});
if (!small) document.getElementById('hud-more').open = true;
document.getElementById('access-form')?.addEventListener('submit', (e) => {
  e.preventDefault();
  const v = document.getElementById('email').value.trim(); const note = document.getElementById('form-note');
  note.textContent = /.+@.+\..+/.test(v) ? 'Signup isn’t connected in this preview. Point this form at your signup endpoint.' : 'Enter a work email, like you@company.com.';
});
const hud = { phase: $('#hud-phase'), z: $('#hud-z'), t: $('#hud-t'), i: $('#hud-i'), d: $('#hud-d'), bar: $('#hud-bar'), barL: $('#hud-bar-l') };
function $(s) { return document.querySelector(s); }
const fmtLen = (kpc, como) => { const u = como ? 'c' : ''; return kpc >= 1000 ? `${+(kpc / 1000).toPrecision(2)} ${u}Mpc` : `${+kpc.toPrecision(2)} ${u}kpc`; };
function updateHud(tau, a, d, el) {
  const z = 1 / a - 1;
  const ph = intro.s < 1 || forcedTau !== null ? PHASES.find(p => tau < p[0])[1] : '';
  if (hud.phase.textContent !== ph) hud.phase.textContent = ph;
  // write only on change: the HUD sits on a blurred panel, so every DOM write re-blurs that patch of the canvas
  const put = (e, v) => { if (e.textContent !== v) e.textContent = v; };
  put(hud.z, z.toFixed(z > 1 ? 2 : 3));
  put(hud.t, tau < 0.999 ? `${(tau * T0_GYR).toFixed(2)} Gyr` : (simT < 1 ? `t₀ + ${Math.round(simT * 1000)} kyr` : `t₀ + ${simT < 100 ? simT.toFixed(1) : Math.round(simT)} Myr`));
  put(hud.i, `${(90 - Math.abs(el)).toFixed(1)}°`);
  put(hud.d, fmtLen(d * a, false));
  const pxPerKpc = (innerHeight / 2) / (Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * d);
  const target = 110 / pxPerKpc; const p10 = Math.pow(10, Math.floor(Math.log10(target)));
  const nice = [1, 2, 5, 10].map(x => x * p10).reduce((b, x) => Math.abs(x - target) < Math.abs(b - target) ? x : b);
  const bw = `${Math.round(nice * pxPerKpc)}px`; if (hud.bar.style.width !== bw) hud.bar.style.width = bw;
  put(hud.barL, fmtLen(nice, tau < 0.999));
}
document.querySelectorAll('[data-scale]').forEach(el => { el.textContent = fmtLen(STOPS[el.dataset.scale].d, false); });

/* =====================================================================
   11. Annotations: characteristic radii of the halo
   ===================================================================== */
const R_TA = 2 * RSP;                                                      // turnaround: the shell now at R_sp virialised at r_ta / 2
const Q_LAG = qOf(M200, R200);                                              // comoving Lagrangian radius of the halo's mass
const RADII = [
  { r: RS, label: `${Math.round(RS)} kpc`, dash: [] },
  { r: R200, label: `${Math.round(R200)} kpc`, dash: [] },
  { r: RSP, label: `${Math.round(RSP)} kpc`, dash: [5, 5] },
  { r: R_TA, label: `${(R_TA / 1000).toFixed(2)} Mpc`, dash: [2, 6] },
  { r: Q_LAG, label: `${(Q_LAG / 1000).toFixed(1)} Mpc`, dash: [2, 6] },
  { r: 7600, label: `7.6 Mpc`, dash: [1, 7] },
  { r: 25000, label: `25 Mpc`, dash: [1, 7] },
  { r: LSS_BOX, label: `76 Mpc`, dash: [1, 7] },
];
const vOrigin = new THREE.Vector3();
function drawAnnotations(alpha, a) {
  const dpr = devicePixelRatio;
  actx.setTransform(1, 0, 0, 1, 0, 0); actx.clearRect(0, 0, annot.width, annot.height);
  if (alpha < 0.01) return;
  vOrigin.set(0, 0, 0).project(camera);
  const cx = (vOrigin.x * 0.5 + 0.5) * W, cy = (-vOrigin.y * 0.5 + 0.5) * H;
  const dist = camera.position.length();
  const k = (H / 2) / (Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * dist);
  actx.setTransform(dpr, 0, 0, dpr, 0, 0);
  actx.font = '500 11px "IBM Plex Mono", ui-monospace, monospace';
  for (const R of RADII) {
    const rp = R.r / a * k, mx = Math.max(W, H);
    const ar = alpha * smooth(14, 40, rp) * (1 - smooth(mx * 0.75, mx * 1.3, rp)); if (ar < 0.01) continue;
    actx.strokeStyle = `rgba(138,162,255,${0.55 * ar})`; actx.lineWidth = 1; actx.setLineDash(R.dash);
    actx.beginPath(); actx.arc(cx, cy, rp, 0, TAU); actx.stroke();
    const ang = -Math.PI / 5; const lx = cx + Math.cos(ang) * rp, ly = cy + Math.sin(ang) * rp;
    actx.setLineDash([]); actx.beginPath(); actx.moveTo(lx, ly); actx.lineTo(lx + 14, ly - 10); actx.stroke();
    actx.fillStyle = `rgba(236,230,218,${0.9 * ar})`; actx.fillText(R.label, lx + 18, ly - 12);
  }
}

/* =====================================================================
   12. Charts and the parameter table (computed from the same potential)
   ===================================================================== */
const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs, parent) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); parent?.appendChild(e); return e; };
function makeTip(fig) { const t = document.createElement('div'); t.className = 'tip'; t.hidden = true; fig.appendChild(t); return t; }
function rotationChart() {
  const svg = document.getElementById('rc-svg'), fig = document.getElementById('rc');
  const m = { l: 46, r: 74, t: 12, b: 36 }, w = 560 - m.l - m.r, hgt = 300 - m.t - m.b;
  const X = (x) => m.l + x / 40 * w, Y = (y) => m.t + hgt - y / 400 * hgt;
  const g = el('g', {}, svg);
  for (let y = 0; y <= 400; y += 100) {
    el('line', { x1: m.l, x2: m.l + w, y1: Y(y), y2: Y(y), stroke: '#262b3b', 'stroke-width': 1 }, g);
    el('text', { x: m.l - 8, y: Y(y) + 4, 'text-anchor': 'end', fill: '#9b9eae', 'font-size': 11, 'font-family': 'IBM Plex Mono, monospace' }, g).textContent = y;
  }
  for (let x = 0; x <= 40; x += 10) el('text', { x: X(x), y: m.t + hgt + 18, 'text-anchor': 'middle', fill: '#9b9eae', 'font-size': 11, 'font-family': 'IBM Plex Mono, monospace' }, g).textContent = x;
  el('text', { x: m.l + w, y: m.t + hgt + 33, 'text-anchor': 'end', fill: '#9b9eae', 'font-size': 11, 'font-family': 'IBM Plex Sans, sans-serif' }, g).textContent = 'R (kpc)';
  el('text', { x: m.l - 36, y: m.t + 2, fill: '#9b9eae', 'font-size': 11, 'font-family': 'IBM Plex Sans, sans-serif', transform: `rotate(-90 ${m.l - 36} ${m.t + 2})`, 'text-anchor': 'end' }, g).textContent = 'v (km/s)';
  // dust ring marker
  el('line', { x1: X(DUST_R), x2: X(DUST_R), y1: m.t, y2: m.t + hgt, stroke: '#262b3b', 'stroke-dasharray': '3 4' }, g);
  el('text', { x: X(DUST_R) + 5, y: m.t + 12, fill: '#9b9eae', 'font-size': 10, 'font-family': 'IBM Plex Mono, monospace' }, g).textContent = 'dust ring';
  const series = [['halo', 'var(--c-halo)', 2], ['disk', 'var(--c-disk)', 2], ['bulge', 'var(--c-bulge)', 2], ['total', 'var(--ink)', 2.5]];
  const pts = []; for (let x = 0.1; x <= 40.001; x += 0.25) pts.push([x, vcomp(x)]);
  const names = { total: 'Total', bulge: 'Bulge + BH', disk: 'Disk', halo: 'Halo' };
  for (const [k, c, sw] of series) {
    el('path', { d: pts.map((p, i) => `${i ? 'L' : 'M'}${X(p[0]).toFixed(1)},${Y(p[1][k]).toFixed(1)}`).join(''), fill: 'none', stroke: c, 'stroke-width': sw, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, g);
    const end = pts[pts.length - 1];
    el('text', { x: X(40) + 8, y: Y(end[1][k]) + 4, fill: '#ece6da', 'font-size': 11, 'font-family': 'IBM Plex Sans, sans-serif' }, g).textContent = names[k];
  }
  const cross = el('line', { y1: m.t, y2: m.t + hgt, stroke: '#9b9eae', 'stroke-width': 1, opacity: 0 }, g);
  const dots = series.map(([k, c]) => el('circle', { r: 4, fill: c, stroke: '#0b0d14', 'stroke-width': 2, opacity: 0 }, g));
  const hit = el('rect', { x: m.l, y: m.t, width: w, height: hgt, fill: 'transparent' }, g);
  const tip = makeTip(fig);
  const move = (e) => {
    const rect = svg.getBoundingClientRect(); const sx = (e.clientX - rect.left) / rect.width * 560;
    const R = clamp((sx - m.l) / w * 40, 0.2, 40); const v = vcomp(R);
    cross.setAttribute('x1', X(R)); cross.setAttribute('x2', X(R)); cross.setAttribute('opacity', 1);
    series.forEach(([k], i) => { dots[i].setAttribute('cx', X(R)); dots[i].setAttribute('cy', Y(v[k])); dots[i].setAttribute('opacity', 1); });
    tip.hidden = false;
    tip.innerHTML = `<div class="k">R = ${R.toFixed(1)} kpc</div><div>Total ${v.total.toFixed(0)} km/s</div><div class="k">Bulge ${v.bulge.toFixed(0)} · Disk ${v.disk.toFixed(0)} · Halo ${v.halo.toFixed(0)}</div>`;
    const fr = fig.getBoundingClientRect(); const px = e.clientX - fr.left; tip.style.left = `${Math.min(px + 14, fr.width - tip.offsetWidth - 4)}px`; tip.style.top = `${e.clientY - fr.top - 70}px`;
  };
  hit.addEventListener('pointermove', move);
  hit.addEventListener('pointerleave', () => { tip.hidden = true; cross.setAttribute('opacity', 0); dots.forEach(d => d.setAttribute('opacity', 0)); });
}
function massFunctionChart() {
  const svg = document.getElementById('mf-svg'), fig = document.getElementById('mf');
  const m = { l: 46, r: 20, t: 12, b: 36 }, w = 560 - m.l - m.r, hgt = 300 - m.t - m.b;
  const lx0 = 8, lx1 = 11.5, ly0 = 0, ly1 = 3;
  const X = (mm) => m.l + (Math.log10(mm) - lx0) / (lx1 - lx0) * w, Y = (n) => m.t + hgt - (Math.log10(n) - ly0) / (ly1 - ly0) * hgt;
  const g = el('g', {}, svg); const mono = { fill: '#9b9eae', 'font-size': 11, 'font-family': 'IBM Plex Mono, monospace' };
  for (let e = 0; e <= 3; e++) { el('line', { x1: m.l, x2: m.l + w, y1: Y(10 ** e), y2: Y(10 ** e), stroke: '#262b3b' }, g); el('text', { x: m.l - 8, y: Y(10 ** e) + 4, 'text-anchor': 'end', ...mono }, g).textContent = (10 ** e).toString(); }
  for (let e = 8; e <= 11; e++) el('text', { x: X(10 ** e), y: m.t + hgt + 18, 'text-anchor': 'middle', ...mono }, g).textContent = `10^${e}`;
  el('text', { x: m.l + w, y: m.t + hgt + 33, 'text-anchor': 'end', fill: '#9b9eae', 'font-size': 11, 'font-family': 'IBM Plex Sans, sans-serif' }, g).textContent = 'm (M☉)';
  const ms = SUB.map(s => s.m).sort((a, b) => b - a);
  const Ntot = ms.length;
  // analytic cumulative for a truncated power law, normalised to the catalogue
  const m1 = 3e8, m2 = 2.5e11, ex = -0.9;
  const Nan = (mm) => Ntot * (Math.pow(mm, ex) - Math.pow(m2, ex)) / (Math.pow(m1, ex) - Math.pow(m2, ex));
  let d = ''; for (let lm = Math.log10(m1); lm <= Math.log10(m2) - 0.02; lm += 0.02) { const n = Nan(10 ** lm); if (n >= 1) d += `${d ? 'L' : 'M'}${X(10 ** lm).toFixed(1)},${Y(n).toFixed(1)}`; }
  el('path', { d, fill: 'none', stroke: 'var(--ink)', 'stroke-width': 1.5, 'stroke-dasharray': '4 3' }, g);
  let sp = `M${X(ms[0]).toFixed(1)},${Y(1).toFixed(1)}`;
  ms.forEach((mm, i) => { sp += `L${X(mm).toFixed(1)},${Y(i + 1).toFixed(1)}`; if (i + 1 < ms.length) sp += `L${X(ms[i + 1]).toFixed(1)},${Y(i + 1).toFixed(1)}`; });
  el('path', { d: sp, fill: 'none', stroke: 'var(--c-halo)', 'stroke-width': 2, 'stroke-linejoin': 'round' }, g);
  el('text', { x: X(1.2e10), y: Y(Nan(1.2e10)) - 14, fill: '#ece6da', 'font-size': 11, 'font-family': 'IBM Plex Sans, sans-serif' }, g).textContent = 'slope −0.9';
  const dot = el('circle', { r: 4, fill: 'var(--c-halo)', stroke: '#0b0d14', 'stroke-width': 2, opacity: 0 }, g);
  const hit = el('rect', { x: m.l, y: m.t, width: w, height: hgt, fill: 'transparent' }, g);
  const tip = makeTip(fig);
  hit.addEventListener('pointermove', (e) => {
    const rect = svg.getBoundingClientRect(); const sx = (e.clientX - rect.left) / rect.width * 560;
    const mm = 10 ** clamp(lx0 + (sx - m.l) / w * (lx1 - lx0), Math.log10(ms[ms.length - 1]), Math.log10(ms[0]));
    const n = ms.filter(x => x >= mm).length;
    dot.setAttribute('cx', X(mm)); dot.setAttribute('cy', Y(Math.max(1, n))); dot.setAttribute('opacity', 1);
    tip.hidden = false; tip.innerHTML = `<div class="k">m &gt; ${mm.toExponential(1).replace('e+', '×10^')} M☉</div><div>${n} rendered</div><div class="k">power law ${Nan(mm).toFixed(0)}</div>`;
    const fr = fig.getBoundingClientRect(); tip.style.left = `${Math.min(e.clientX - fr.left + 14, fr.width - tip.offsetWidth - 4)}px`; tip.style.top = `${e.clientY - fr.top - 70}px`;
  });
  hit.addEventListener('pointerleave', () => { tip.hidden = true; dot.setAttribute('opacity', 0); });
}
function paramTable() {
  const e = (x, d = 2) => { const p = Math.floor(Math.log10(x)); return `${(x / 10 ** p).toFixed(d === 0 ? 0 : 1)}×10<sup>${p}</sup>`; };
  const vmax = Math.max(...Array.from({ length: 200 }, (_, i) => vcomp(0.2 + i * 0.2).total));
  const rows = [
    ['Dark matter halo', 'NFW, concentration from the c–M relation at z = 0', `M₂₀₀c = ${e(M200)} M☉ · c = ${CONC.toFixed(1)} · R₂₀₀c = ${Math.round(R200)} kpc · r<sub>s</sub> = ${Math.round(RS)} kpc`, 'Navarro, Frenk &amp; White 1997; Dutton &amp; Macciò 2014'],
    ['Halo shape', 'Triaxial, minor axis along the disk spin; rounder inside 0.3 R₂₀₀', `b/a = ${AX_BA} · c/a = ${AX_CA}`, 'Allgood et al. 2006; Kazantzidis et al. 2004'],
    ['Splashback', 'Apocentre pile-up of recently accreted orbits', `R₂₀₀m = ${Math.round(R200M)} kpc · Γ = ${GAMMA_ACC} → R<sub>sp</sub> = ${Math.round(RSP)} kpc`, 'Diemer &amp; Kravtsov 2014; More, Diemer &amp; Kravtsov 2015'],
    ['Subhalos', 'dN/dm ∝ m<sup>−1.9</sup>, Einasto radial profile, Jacobi tidal truncation, live leapfrog orbits', `${SUB.length} subhalos, ${e(3e8, 0)}–${e(2.5e11)} M☉ · α = 0.678 · r₋₂ = 0.81 R₂₀₀`, 'Springel et al. 2008'],
    ['Bulge', 'Hernquist sphere, flattened, mostly pressure supported', `M = ${e(MB)} M☉ · a = ${AB} kpc · q = 0.72`, 'Hernquist 1990'],
    ['Disk', 'Miyamoto–Nagai potential, epicyclic orbits (κ, ν from Φ), age–velocity relation σ ∝ τ<sup>0.35</sup>', `M = ${e(MD)} M☉ · a = ${AD} kpc · b = ${BD} kpc`, 'Miyamoto &amp; Nagai 1975'],
    ['Black hole', 'Softened point mass', `M• = ${e(MBH, 0)} M☉`, 'Kormendy et al. 1996'],
    ['Rotation', 'Ω(R) = v<sub>c</sub>/R from the summed potential', `v<sub>c,max</sub> ≈ ${Math.round(vmax)} km/s · V₂₀₀ = ${Math.round(Math.sqrt(GM200 / R200) / KMS)} km/s`, '—'],
    ['Spiral arms', 'm = 2 trailing density wave; OB stars and H II regions lit when orbits cross the crest', `pitch 15° · corotation ${R_CR} kpc · Ω<sub>p</sub> = ${(OMEGA_P / KMS).toFixed(1)} km/s/kpc`, 'Lin &amp; Shu 1964'],
    ['Field galaxies', 'Schechter luminosity function, placed on web particles with weight ρ<sup>1.5</sup>; red spheroids in knots, blue disks in the field; size–luminosity relations', `${field.count} galaxies · φ* = ${SCH.phi} Mpc<sup>−3</sup> · α = ${SCH.alpha} · L > ${SCH.lmin} L* · 1 + δ = ${1 + SCH.delta}`, 'Schechter 1976; Blanton et al. 2003; Dressler 1980'],
    ['Satellites', 'Only subhalos above 3×10<sup>9</sup> M☉ host a visible dwarf (M* ∝ M<sub>h</sub><sup>2</sup> at low mass); the rest stay dark', `${SUB.lit} lit of ${SUB.length - SUB.neigh.length} subhalos`, 'Moster, Naab &amp; White 2013; Behroozi et al. 2013'],
    ['Globular clusters', 'Bimodal: metal-poor (blue, extended) and metal-rich (red, concentrated)', '≈ 1900 clusters', 'Rhode &amp; Zepf 2004'],
    ['Stellar stream', 'Particle spray from a disrupting satellite, integrated in Φ', `${STREAM.N} particles, released over 3.2 Gyr`, 'Fardal, Huang &amp; Weinberg 2015; Martínez-Delgado et al. 2021'],
    ['Initial conditions', 'Zel’dovich displacements from a Gaussian random field, BBKS transfer function', `Ω<sub>m</sub> = ${OMEGA_M} · h = ${h} · n<sub>s</sub> = ${N_S}`, 'Zel’dovich 1970; Bardeen et al. 1986'],
    ['Halo assembly', 'Spherical collapse per shell; inner shells virialise first, at r<sub>ta</sub>/2', 'Lagrangian radius from enclosed mass and ρ̄<sub>m</sub>', 'Gunn &amp; Gott 1972; Bertschinger 1985'],
    ['Spheroid light', 'Hernquist emissivity (de Vaucouleurs analogue), flattening eases outward; r<sup>−3</sup> envelope', 'q = 0.60 → 0.84 · a = 2.2 kpc', 'Hernquist 1990; Gadotti &amp; Sánchez-Janssen 2012'],
    ['Dust brim', 'Sheared cirrus: domain-warped ridged noise stretched ~6:1 along the flow, modulated by soft kpc-scale clumps on a wandering centre line; absorbs and scatters', `R = ${DUST_R} kpc · h = 0.07 + 0.012 R kpc · albedo 0.6`, 'Bajaja et al. 1984; Emsellem 1995; Draine 2003'],
    ['Light', 'Emission–absorption raymarch; reddening per channel; SPH-like smoothing h ∝ ρ<sup>−1/3</sup> for dark matter', 'i = 84° · d = 9.55 Mpc', 'Cardelli, Clayton &amp; Mathis 1989'],
    ['Display', 'asinh stretch on luminance, hue preserved; filmic shoulder', 'β = 22', 'Lupton et al. 2004'],
    ['Optics', 'Four-vane spider PSF: separable streak filter on unresolved point sources, with chromatic dispersion and the vane sinc<sup>2</sup> ripple', 'two axes · three passes · strides 1, 4, 16', 'Krist, Hook &amp; Stoehr 2011 (Tiny Tim)'],
    ['Web flow', 'Zel’dovich with adhesion on two nested lattices (54³ to 7.6 Mpc, 64³ to 76 Mpc) plus a graph of ~300 nodes, four links each, with galaxies strung along the filaments and a miniature web at every node: sheets stick at first shell crossing and oscillate through the pancake; filaments drain into the node', 'inner ≈ 1 Gyr per 10 s on screen; outer ×4 (exaggerated)', 'Gurbatov, Saichev &amp; Shandarin 1989'],
  ];
  document.getElementById('ptable').innerHTML = rows.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td><td class="v">${r[2]}</td><td><cite>${r[3]}</cite></td></tr>`).join('');
}
rotationChart(); massFunctionChart(); paramTable();

/* =====================================================================
   13. Main loop
   ===================================================================== */
let camWasIntro = false, hudT = -1e9, simT = 0, subT = 0, streamT = 0, dPhysPrev = 52, streamOn = 0, lssOn = 0, fadeIn = 0, gcVis = 0, stVis = 0;
const gen = streamBuilder();
function stepStream() { if (!STREAM.ready) { gen.next(); return; } }
setTimeout(function chunk() { if (!STREAM.ready) { for (let i = 0; i < 1; i++) gen.next(); setTimeout(chunk, 0); } }, 300);
const scrimEl = document.querySelector('.scrim');
const camGal = new THREE.Vector3();
let last = performance.now(), ema = 16, perfChecked = false, perfT = 0;
function integrate(P, V, n, tCur, tTarget, maxSteps) {
  let steps = 0;
  while (tCur < tTarget - 1e-6 && steps < maxSteps) { const dt = Math.min(1.0, tTarget - tCur); leap(P, V, n, dt); tCur += dt; steps++; }
  return tCur;
}
function frame(now) {
  const dt = clamp((now - last) / 1000, 0, 0.1); last = now;
  ema = ema * 0.95 + dt * 1000 * 0.05;
  perfT += dt;
  if (!perfChecked && perfT > 4 && !params.has('dpr')) {
    perfChecked = true;
    if (ema > 30) { DPR = Math.max(1, DPR * 0.75); VOL_SCALE = 0.4; resize(); }
  }

  // --- cosmic time
  if (intro.playing) { intro.s += dt * intro.speed; if (intro.s >= 1) endIntro(); }
  const a = A0 + (1 - A0) * clamp(intro.s, 0, 1);
  const tau = a >= 0.9999 ? 1 : Math.pow(a, 1.5);
  const introOn = tau < 0.9999;
  simT += dt * rate;
  subT = integrate(subP, subV, SUB.length, subT, simT, 40);
  if (STREAM.ready) streamT = integrate(STREAM.pos, STREAM.vel, STREAM.N, streamT, simT, 6);
  streamPts.geometry.attributes.position.array.set(STREAM.pos);
  streamPts.geometry.attributes.position.needsUpdate = true;

  // --- subhalo centres (spherical infall during the intro, integrated orbits after)
  SUB.forEach((s, i) => {
    let x = subP[i * 3] / a, y = subP[i * 3 + 1] / a, z = subP[i * 3 + 2] / a;
    if (introOn) {
      const [rc, prog] = shell(s.q, s.r0, tau, a);
      const pd = norm3([s.q * s.qd[0] + a * s.psi[0], s.q * s.qd[1] + a * s.psi[1], s.q * s.qd[2] + a * s.psi[2]]);
      const w = smooth(0, 1, prog);
      x = mixA(rc * pd[0], x, w); y = mixA(rc * pd[1], y, w); z = mixA(rc * pd[2], z, w);
    }
    subTexData.set([x, y, z, 1 / a], i * 4);
  });
  subTex.needsUpdate = true;

  // --- camera
  const tgt = introOn || camWasIntro ? introCam(clamp(intro.s, 0, 1)) : scrollTarget();
  const k = introOn || camWasIntro ? 1 : 1 - Math.exp(-dt * 2.6);           // the frame the intro ends still lands exactly on its target
  camWasIntro = introOn;
  cam.d = Math.exp(mixA(Math.log(cam.d), Math.log(tgt.d), k));
  cam.el = mixA(cam.el, tgt.el, k); cam.az = mixA(cam.az, tgt.az, k); cam.film = mixA(cam.film, small ? 0 : tgt.film, k); cam.filmY = mixA(cam.filmY ?? 0, tgt.filmY ?? 0, k);
  scrimEl.style.setProperty('--scrim', (tgt.scrim ?? 0).toFixed(3));
  const aspectBoost = camera.aspect < 1 ? Math.min(2.2, 0.85 / camera.aspect) : 1;
  const d = cam.d * aspectBoost;
  const lssW = introOn ? 0 : smooth(25000, 90000, dPhysPrev);
  const webVis = introOn ? 0 : smooth(900, 6000, dPhysPrev) * (1 - lssW);   // the web-scale sway hands over to the one-way drift
  // drift ~0.4 deg/s at the default rate, one direction only; wrapped only when fully zoomed out (a 360 jump is invisible),
  // so zooming back in unwinds at most half a turn
  if (!introOn) { lssAz += dt * 0.4 * flowRate() * lssW; if (lssW > 0.99 && lssAz > 180) lssAz -= 360; if (lssW < 0.01) lssAz = 0; }
  const el = clamp(cam.el + user.el, -85, 85) * Math.PI / 180, az = (cam.az + user.az + 9 * Math.sin(webT * 0.12) * webVis + lssAz * lssW) * Math.PI / 180;
  camera.position.set(d * Math.cos(el) * Math.sin(az), d * Math.sin(el), d * Math.cos(el) * Math.cos(az));
  camera.up.set(0, 1, 0); camera.lookAt(0, 0, 0);
  if (Math.abs(cam.film) > 1e-3 || Math.abs(cam.filmY) > 1e-3) camera.setViewOffset(W, H, cam.film * W, cam.filmY * H, W, H); else camera.clearViewOffset();
  camera.updateProjectionMatrix(); camera.updateMatrixWorld();
  if (params.has('camlog')) (window.__camlog ||= []).push([+intro.s.toFixed(5), camera.position.x, camera.position.y, camera.position.z, cam.film, cam.filmY]);

  // --- uniforms
  const dPhys = d * a; dPhysPrev = dPhys;
  U.uTime.value = simT; U.uA.value = a; U.uTau.value = tau;
  // the web keeps flowing after z = 0 (sticky Zel'dovich), ~1 Gyr per 10 s at the default rate, only while it is on screen
  const lssVis = smooth(25000, 90000, dPhys);
  if (!introOn) {
    const rf = flowRate() * smooth(900, 6000, dPhys); webFlow = Math.min(webFlow + dt * 0.05 * rf, 2.5); webT += dt * rf;
    const rfL = flowRate() * lssVis * 4;                     // four times faster once the large-scale view is on screen
    lssFlow = Math.min(lssFlow + dt * 0.05 * rfL, 3); lssT += dt * rfL;
  }
  web.material.uniforms.uD.value = a + webFlow; web.material.uniforms.uWebT.value = webT;
  pumpLSS(lssVis > 0.001 ? 1e9 : 7);                                  // ~7 ms a frame in the background; all at once if it is needed on screen now
  if (lssL) {
    lssL.material.uniforms.uD.value = a + lssFlow; lssL.material.uniforms.uWebT.value = lssT;
    lssOn = Math.min(1, lssOn + dt / 2);                               // ease in over 2 s once the background build lands
    const lssShow = (introOn ? 0.5 * (1 - smooth(0.5, 0.8, tau)) : lssVis) * smooth(0, 1, lssOn);
    lssL.material.uniforms.uVis.value = lssShow; lssF.material.uniforms.uVis.value = lssShow; lssF.material.uniforms.uFlow.value = lssFlow;
  }
  camGal.copy(camera.position).multiplyScalar(a); U.uCamGal.value.copy(camGal);
  const lnD = Math.log(dPhys);
  // globulars and the stream: off at the closest stops, rising across the whole hero-to-halo zoom (log distance),
  // then low-passed in time (~0.7 s) so even a fast scroll fades them rather than switching them
  const nearOff = smooth(Math.log(58), Math.log(420), lnD), kVis = 1 - Math.exp(-dt * 1.4);
  gcVis += ((layers.gc ? nearOff : 0) - gcVis) * kVis;
  stVis += ((layers.stream ? nearOff * (1 - smooth(Math.log(1200), Math.log(7000), lnD)) : 0) - stVis) * kVis;
  if (STREAM.ready) streamOn = Math.min(1, streamOn + dt / 2);     // ease in over 2 s once the spray has been integrated
  const dustOn = layers.dust ? smooth(0.6, 0.95, tau) : 0;
  U.uDust.value = dustOn;
  const starsOn = layers.stars ? 1 : 0;
  disk.material.uniforms.uStars.value = starsOn * 0.022;
  bulge.material.uniforms.uVis.value = starsOn * 0.07;
  gcs.material.uniforms.uVis.value = 0.09 * gcVis;
  neighbors.material.uniforms.uVis.value = starsOn * 0.35;
  field.material.uniforms.uVis.value = starsOn * (1 - smooth(30000, 80000, dPhys));
  const introW = introOn ? 1 - smooth(0.55, 0.95, tau) : 0;
  const dmZoom = smooth(50, 420, dPhys);
  halo.material.uniforms.uVis.value = introOn ? mixA(0.025, 1.0, dmZoom) : layers.dm ? mixA(0.025, 1.0, dmZoom) : smooth(110, 420, dPhys);
  halo.material.uniforms.uIntro.value = introW;
  subs.material.uniforms.uVis.value = (layers.sub ? smooth(90, 600, dPhys) * 0.5 : 0) * (introOn ? smooth(0.15, 0.4, tau) : 1);
  web.material.uniforms.uVis.value = smooth(900, 6000, dPhys) * (1 - introW) + introW;
  web.material.uniforms.uIntro.value = introW;
  streamPts.material.uniforms.uVis.value = smooth(0, 1, streamOn) * stVis;
  volMat.uniforms.uGal.value = smooth(0.1, 0.7, tau);
  volMat.uniforms.uStars.value = starsOn;
  volMat.uniforms.uCamPos.value.copy(camera.position);
  volMat.uniforms.uInvProj.value.copy(camera.projectionMatrixInverse);
  volMat.uniforms.uCamWorld.value.copy(camera.matrixWorld);
  sky.material.uniforms.uSky.value = 1;
  finalMat.uniforms.uTimeS.value = now / 1000;
  fadeIn = Math.min(1, fadeIn + dt / 1.5);                            // the first frames rise out of black instead of popping
  finalMat.uniforms.uFade.value = smooth(0, 1, fadeIn);

  // --- render: volume -> HDR (sky, volume composite, particles) -> bloom -> tone map
  pass(volMat, volRT);
  renderer.setRenderTarget(hdrRT); renderer.clear();
  renderer.render(bgScene, camera);
  volCompMat.uniforms.tVol.value = volRT.texture; pass(volCompMat, hdrRT, false);
  renderer.setRenderTarget(hdrRT); if (!params.has('nopart')) renderer.render(scene, camera);
  renderer.setRenderTarget(dmRT); renderer.clear(); renderer.render(dmScene, camera);
  if (layers.spk) {
    sky.material.uniforms.uPt.value = small ? 0.5 : 1; sky.material.uniforms.uSpk.value = 1;   // point sources only, drawn as ~1 px cores
    renderer.setRenderTarget(spk[0]); renderer.clear(); renderer.render(bgScene, camera);
    sky.material.uniforms.uPt.value = 1; sky.material.uniforms.uSpk.value = 0;
    spikePasses();
  }
  finalMat.uniforms.uSpike.value = layers.spk ? 0.12 : 0;
  let src = hdrRT;
  mips.forEach((m, i) => { downMat.uniforms.tSrc.value = src.texture; downMat.uniforms.uTexel.value.set(1 / src.width, 1 / src.height); downMat.uniforms.uFirst.value = i === 0 ? 1 : 0; pass(downMat, m); src = m; });
  for (let i = mips.length - 1; i > 0; i--) { upMat.uniforms.tSrc.value = mips[i].texture; upMat.uniforms.uTexel.value.set(1 / mips[i].width, 1 / mips[i].height); pass(upMat, mips[i - 1], false); }
  finalMat.uniforms.tScene.value = hdrRT.texture; finalMat.uniforms.tDM.value = dmRT.texture; finalMat.uniforms.tBloom.value = mips[0].texture;
  finalMat.uniforms.tSpkH.value = spk[1].texture; finalMat.uniforms.tSpkV.value = spk[2].texture;
  pass(finalMat, null);

  drawAnnotations(layers.ann && !introOn ? smooth(110, 260, dPhys) : 0, a);
  if (now - hudT > 100) { hudT = now; updateHud(tau, a, d, cam.el + user.el); }   // 10 Hz is plenty for a readout
  requestAnimationFrame(frame);
}
addEventListener('resize', resize);
resize();
// Live performance controls for scaled.html (the other pages never call these).
window.galaxyPerf = {
  get dpr() { return DPR; }, get effDpr() { return effDpr(W, H); }, get vol() { return VOL_SCALE; }, get spk() { return SPK_SCALE; }, Q,
  set(o) { if (o.dpr) DPR = o.dpr; if (o.vol) VOL_SCALE = o.vol; if (o.spk) SPK_SCALE = o.spk; perfChecked = true; resize(); },
  points() { let n = 0; [scene, dmScene, bgScene].forEach(s => s.traverse(o => { if (o.isPoints) n += o.geometry.drawRange.count === Infinity ? o.geometry.attributes.position.count : o.geometry.drawRange.count; })); return n; },
};
requestAnimationFrame(frame);
if (params.has('debug')) setTimeout(() => {
  const rd = (rt) => { const b = new Float32Array(4); try { renderer.readRenderTargetPixels(rt, rt.width >> 1, rt.height >> 1, 1, 1, b); } catch (e) { return String(e); } return [...b].map(x => +x.toFixed(4)); };
  const gl = renderer.getContext();
  window.__log.push('hdr ' + rd(hdrRT) + ' vol ' + rd(volRT) + ' mip0 ' + rd(mips[0]) + ' glerr ' + gl.getError() + ' ' + renderer.capabilities.isWebGL2 + ' prog ' + renderer.info.programs.length + ' calls ' + renderer.info.render.calls);
  const diag = renderer.info.programs.map(p => p.name + ':' + (p.diagnostics ? JSON.stringify(p.diagnostics).slice(0, 600) : 'ok'));
  window.__log.push(...diag);
}, 2500);
window.__omnia = { R200, RS, RSP, R200M, CONC, OMEGA_P, vmax: vcomp(8).total };
}).catch((e) => { console.error(e); if (window.__log) window.__log.push('X ' + e.message); });
