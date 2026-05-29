// ============================================================================
// tabs/earth.js — Earth in Your Hands. Three.js (dynamic import; OFFLINE flag
// in config.js switches CDN<->local). One hand rotates; two hands zoom/twist;
// pinch heals brown "scar" patches to green via a painted mask texture.
// Procedural base texture fallback so it works with ZERO downloaded assets.
// ============================================================================
import { PATHS } from '../config.js';
import { clamp, lerp, mapLinear } from '../util.js';

export class EarthTab {
  constructor() {
    this.ready = false; this.loading = false; this.active = false;
    this.THREE = null;
    this.targetRot = { x: 0, y: 0, z: 0 };
    this.camZ = 3.2; this.targetCamZ = 3.2;
    this.prevCursor = null;
    this.healedPct = 0; this._lastReadback = 0;
    this.particles = null; this.pIndex = 0;
    this.hints = { palm: 'Spin globe', point: 'Heal a spot', peace: 'Mega-heal' };
  }

  activate(env) {
    this.active = true;
    if (!this.ready && !this.loading) this._load(env);
  }
  deactivate() { this.active = false; }

  resize(env) {
    if (!this.ready) return;
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }

  async _load(env) {
    this.loading = true;
    try {
      const THREE = await import(/* @vite-ignore */ PATHS.three);
      this.THREE = THREE;
      this._build(env, THREE);
      this.ready = true;
    } catch (e) {
      console.error('[earth] three.js failed to load', e);
      env.hud.nudge('3D view unavailable — check vendor/three for offline mode', 4000);
    } finally { this.loading = false; }
  }

  _build(env, THREE) {
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x06121f, 1);
    env.threeMount.innerHTML = '';
    env.threeMount.appendChild(renderer.domElement);
    this.renderer = renderer;

    const scene = new THREE.Scene();
    this.scene = scene;
    const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(0, 0, this.camZ);
    this.camera = camera;

    const loader = new THREE.TextureLoader();
    const maxAniso = renderer.capabilities.getMaxAnisotropy();

    // heal mask (1 = healthy, 0 = scarred). Start mostly healthy with scars.
    this.maskCanvas = document.createElement('canvas');
    this.maskCanvas.width = 1024; this.maskCanvas.height = 512;
    this.maskCtx = this.maskCanvas.getContext('2d', { willReadFrequently: true });
    this._seedScars();
    this.maskTex = new THREE.CanvasTexture(this.maskCanvas);

    const uniforms = {
      map: { value: this._proceduralEarth(THREE) }, // replaced by the real map when it loads
      specMap: { value: null },
      hasSpec: { value: 0 },
      mask: { value: this.maskTex },
      uSun: { value: new THREE.Vector3(0.75, 0.35, 0.55).normalize() },
      uTime: { value: 0 },
    };
    this.uniforms = uniforms;
    this.material = new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG });

    const earth = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 128), this.material);
    scene.add(earth);
    this.earth = earth;

    // Load the real Blue-Marble maps (replace the procedural fallback on success)
    loader.load(PATHS.earthTexture, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = maxAniso;
      uniforms.map.value = tex;
    }, undefined, () => { /* keep procedural fallback */ });
    loader.load(PATHS.earthSpecular, (tex) => {
      tex.anisotropy = maxAniso; uniforms.specMap.value = tex; uniforms.hasSpec.value = 1;
    }, undefined, () => {});

    // Drifting cloud layer (own sun-lit shader so clouds fade on the night side)
    this.clouds = null; this.cloudDrift = 0;
    loader.load(PATHS.earthClouds, (tex) => {
      tex.anisotropy = maxAniso;
      const cloudMat = new THREE.ShaderMaterial({
        uniforms: { clouds: { value: tex }, uSun: uniforms.uSun },
        vertexShader: VERT, fragmentShader: CLOUD_FRAG,
        transparent: true, depthWrite: false,
      });
      this.clouds = new THREE.Mesh(new THREE.SphereGeometry(1.012, 96, 96), cloudMat);
      scene.add(this.clouds);
    }, undefined, () => {});

    // Atmosphere (back-side Fresnel shell)
    const atmo = new THREE.Mesh(
      new THREE.SphereGeometry(1.06, 64, 64),
      new THREE.ShaderMaterial({ uniforms: { uColor: { value: new THREE.Color(0x5ab6ff) } }, vertexShader: ATMO_VERT, fragmentShader: ATMO_FRAG, side: THREE.BackSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    scene.add(atmo); this.atmo = atmo;

    // starfield backdrop so the globe doesn't float in a flat void
    scene.add(this._stars(THREE));

    // heal particles (one reused buffer)
    this._buildParticles(THREE);

    // raycaster
    this.raycaster = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();

    // instruction strip
    env.hud.nudge('🖐️ move = spin · 🖐️🖐️ apart = zoom · 🤏 pinch a brown patch to heal', 4000);
  }

  _proceduralEarth(THREE) {
    // Only used as a fallback if the real CDN/local map fails to load.
    const c = document.createElement('canvas'); c.width = 2048; c.height = 1024;
    const ctx = c.getContext('2d');
    const og = ctx.createLinearGradient(0, 0, 0, 1024);
    og.addColorStop(0, '#0b3a5e'); og.addColorStop(0.5, '#0e63a0'); og.addColorStop(1, '#0b3a5e');
    ctx.fillStyle = og; ctx.fillRect(0, 0, 2048, 1024);
    let s = 12345; const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
    // soft, clustered landmasses (overlapping blobs read as continents, not dots)
    for (let cl = 0; cl < 10; cl++) {
      const ox = rnd() * 2048, oy = 200 + rnd() * 620;
      for (let i = 0; i < 14; i++) {
        const x = ox + (rnd() - 0.5) * 360, y = oy + (rnd() - 0.5) * 220, r = 50 + rnd() * 130;
        const g = ctx.createRadialGradient(x, y, 2, x, y, r);
        const green = `hsl(${95 + rnd() * 35}, 45%, ${26 + rnd() * 14}%)`;
        g.addColorStop(0, green); g.addColorStop(0.75, green); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      }
    }
    // polar ice
    const ice = (y0, y1) => { const g = ctx.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, 'rgba(238,246,250,0.95)'); g.addColorStop(1, 'rgba(238,246,250,0)'); ctx.fillStyle = g; ctx.fillRect(0, Math.min(y0, y1), 2048, Math.abs(y1 - y0)); };
    ice(0, 90); ice(1024, 934);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; return tex;
  }

  // simple starfield sphere (points) so the globe sits in space, not a void
  _stars(THREE) {
    const N = 1200; const pos = new Float32Array(N * 3);
    let s = 99; const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
    for (let i = 0; i < N; i++) {
      const u = rnd() * 2 - 1, th = rnd() * Math.PI * 2, r = 40 + rnd() * 20;
      const sq = Math.sqrt(1 - u * u);
      pos[i * 3] = r * sq * Math.cos(th); pos[i * 3 + 1] = r * u; pos[i * 3 + 2] = r * sq * Math.sin(th);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color: 0xbcd3ff, size: 0.22, sizeAttenuation: true, transparent: true, opacity: 0.7 });
    return new THREE.Points(geo, mat);
  }

  _seedScars() {
    const ctx = this.maskCtx, W = 1024, H = 512;
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H); // healthy
    ctx.fillStyle = '#000000';
    let s = 777; const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
    for (let i = 0; i < 14; i++) {
      const x = rnd() * W, y = 80 + rnd() * 350, r = 30 + rnd() * 70;
      const g = ctx.createRadialGradient(x, y, 2, x, y, r);
      g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.7, 'rgba(0,0,0,0.9)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    if (this.maskTex) this.maskTex.needsUpdate = true;
  }

  _buildParticles(THREE) {
    const N = 1000; this.pN = N;
    const pos = new Float32Array(N * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.pState = new Array(N).fill(null).map(() => ({ life: 0, vx: 0, vy: 0, vz: 0 }));
    const sprite = this._dot(THREE);
    const mat = new THREE.PointsMaterial({ size: 0.06, map: sprite, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: 0x8fe388 });
    this.particles = new THREE.Points(geo, mat); this.particles.frustumCulled = false;
    this.scene.add(this.particles);
  }
  _dot(THREE) {
    const c = document.createElement('canvas'); c.width = c.height = 32; const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16); g.addColorStop(0, '#fff'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 32, 32); const t = new THREE.CanvasTexture(c); return t;
  }

  // heal at a normalized-device-coords point (works for pinch OR one-finger point)
  _heal(env, ndc, radius = 60) {
    if (!ndc) return;
    this.ndc.set(ndc.x, ndc.y);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const hits = this.raycaster.intersectObject(this.earth);
    if (!hits.length || !hits[0].uv) return;
    const uv = hits[0].uv;
    const mx = uv.x * 1024, my = (1 - uv.y) * 512;
    const ctx = this.maskCtx;
    const g = ctx.createRadialGradient(mx, my, 0, mx, my, radius);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.6, 'rgba(255,255,255,0.9)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(mx, my, radius, 0, Math.PI * 2); ctx.fill();
    this.maskTex.needsUpdate = true;
    this._spawn(hits[0].point, radius > 100 ? 110 : 50);
    env.hud.add('earth', radius > 100 ? 30 : 10, { silent: env.isAttract, minGap: 150 });
    if (!env.isAttract) env.sound.heal();
  }

  // ✌️ two fingers: a big mega-heal at the pointed spot
  _megaHeal(env, ndc) { this._heal(env, ndc, 150); if (!env.isAttract) env.hud.banner('🌿 Mega-heal!', 1200); }

  _spawn(point, n) {
    const pos = this.particles.geometry.attributes.position.array;
    for (let i = 0; i < n; i++) {
      const idx = this.pIndex; this.pIndex = (this.pIndex + 1) % this.pN;
      const st = this.pState[idx]; st.life = 1;
      const a = Math.random() * Math.PI * 2, b = Math.random() * Math.PI;
      const sp = 0.004 + Math.random() * 0.01;
      st.vx = Math.sin(b) * Math.cos(a) * sp; st.vy = Math.cos(b) * sp; st.vz = Math.sin(b) * Math.sin(a) * sp;
      pos[idx * 3] = point.x; pos[idx * 3 + 1] = point.y; pos[idx * 3 + 2] = point.z;
    }
  }

  onFrame(gs, dt, env) {
    if (!this.ready) return;
    const t = performance.now();
    this.material.uniforms.uTime.value = t * 0.001;

    if (gs.present) {
      // ✋ palm move = rotate (gated to palm so pointing/healing doesn't spin it)
      if (!gs.twoHand.present && gs.openPalm && gs.cursor) {
        if (this.prevCursor) {
          const dx = (gs.cursor.x - this.prevCursor.x) / window.innerWidth;
          const dy = (gs.cursor.y - this.prevCursor.y) / window.innerHeight;
          this.targetRot.y += dx * 6; this.targetRot.x += dy * 6;
          this.targetRot.x = clamp(this.targetRot.x, -1.2, 1.2);
        }
        this.prevCursor = { x: gs.cursor.x, y: gs.cursor.y };
      } else this.prevCursor = null;

      if (gs.twoHand.present) {
        this.targetCamZ = clamp(this.camZ / Math.max(0.4, gs.twoHand.distRatio), 1.6, 4.5);
        this.targetRot.z = gs.twoHand.twistDelta * 0.8;
      }
      if (gs.pinch.startEdge) this._heal(env, gs.pinch.ndc);   // 🤏 pinch heals
      if (gs.pointEdge) this._heal(env, gs.cursorNdc);          // ☝️ one finger heals a spot
      if (gs.peaceEdge) this._megaHeal(env, gs.cursorNdc);      // ✌️ two fingers mega-heal
    } else {
      this.prevCursor = null;
      this.targetRot.y += 0.0008 * dt; // idle auto-spin
    }

    // damp
    this.earth.rotation.y = lerp(this.earth.rotation.y, this.targetRot.y, 0.12);
    this.earth.rotation.x = lerp(this.earth.rotation.x, this.targetRot.x, 0.12);
    this.earth.rotation.z = lerp(this.earth.rotation.z, this.targetRot.z, 0.1);
    this.atmo.rotation.copy(this.earth.rotation);
    if (this.clouds) {
      this.cloudDrift += dt * 0.00002; // clouds drift slightly faster for parallax
      this.clouds.rotation.set(this.earth.rotation.x, this.earth.rotation.y + this.cloudDrift, this.earth.rotation.z);
    }
    this.camZ = lerp(this.camZ, this.targetCamZ, 0.1);
    this.camera.position.z = this.camZ;

    // particles
    this._stepParticles(dt);

    // global warmth: read back mask occasionally
    if (t - this._lastReadback > 500) { this._lastReadback = t; this._readback(env); }

    this.renderer.render(this.scene, this.camera);
  }

  _stepParticles(dt) {
    const pos = this.particles.geometry.attributes.position.array;
    let any = false;
    for (let i = 0; i < this.pN; i++) {
      const st = this.pState[i]; if (st.life <= 0) continue; any = true;
      st.life -= dt * 0.0012;
      pos[i * 3] += st.vx * dt; pos[i * 3 + 1] += st.vy * dt; pos[i * 3 + 2] += st.vz * dt;
      if (st.life <= 0) { pos[i * 3] = pos[i * 3 + 1] = pos[i * 3 + 2] = 9999; }
    }
    if (any) this.particles.geometry.attributes.position.needsUpdate = true;
  }

  _readback(env) {
    // average a 64x32 sample of the mask -> healed fraction
    const ctx = this.maskCtx;
    const data = ctx.getImageData(0, 0, 1024, 512); // full read at 2Hz is acceptable here on a coarse canvas
    // sample sparsely
    let sum = 0, n = 0;
    const d = data.data;
    for (let y = 0; y < 512; y += 16) for (let x = 0; x < 1024; x += 16) { sum += d[(y * 1024 + x) * 4]; n++; }
    const pct = sum / n / 255;
    this.healedPct = lerp(this.healedPct, pct, 0.3);
    const warm = clamp(mapLinear(this.healedPct, 0.55, 1, 0, 1), 0, 1);
    this.renderer.setClearColor(this._mixHex(0x06121f, 0x0d3a3a, warm), 1);
    this.atmo.material.uniforms.uColor.value.setHex(warm > 0.5 ? 0x6fe3c0 : 0x4f80a0);

    if (this.healedPct > 0.965 && !this._finale) {
      this._finale = true;
      env.hud.banner('🌍 THE PLANET IS IN OUR HANDS', 3000);
      if (!env.isAttract) env.sound.chime();
      setTimeout(() => { this._seedScars(); this._finale = false; }, 5000);
    }
    if (this.healedPct < 0.8) this._finale = false;
  }

  _mixHex(a, b, t) {
    const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
    const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
    return ((Math.round(lerp(ar, br, t)) << 16) | (Math.round(lerp(ag, bg, t)) << 8) | Math.round(lerp(ab, bb, t)));
  }
}

// ---- shaders ----
const VERT = `
varying vec2 vUv; varying vec3 vNormal; varying vec3 vView;
void main(){
  vUv = uv;
  vNormal = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(position,1.0);
  vView = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = `
uniform sampler2D map; uniform sampler2D mask; uniform sampler2D specMap;
uniform float hasSpec; uniform vec3 uSun; uniform float uTime;
varying vec2 vUv; varying vec3 vNormal; varying vec3 vView;
void main(){
  vec3 base = texture2D(map, vUv).rgb;
  float m = texture2D(mask, vUv).r;                 // 1 = healthy, 0 = scarred
  float lum = dot(base, vec3(0.299,0.587,0.114));
  vec3 damaged = mix(vec3(lum), vec3(0.40,0.32,0.20), 0.72); // desaturated brown/haze
  vec3 albedo = mix(damaged, base, m);
  vec3 N = normalize(vNormal);
  vec3 L = normalize(uSun);
  vec3 V = normalize(vView);
  float ndl = dot(N, L);
  float day = clamp(ndl, 0.0, 1.0);
  // soft terminator + ambient fill
  float lightAmt = 0.16 + 1.04 * smoothstep(-0.18, 0.35, ndl);
  vec3 col = albedo * lightAmt;
  // ocean sun-glint (specMap is bright on water)
  if (hasSpec > 0.5) {
    float ocean = texture2D(specMap, vUv).r;
    vec3 R = reflect(-L, N);
    float spec = pow(max(dot(R, V), 0.0), 28.0) * ocean * day;
    col += vec3(1.0, 0.95, 0.82) * spec * 1.1;
  }
  // atmospheric Fresnel rim, brighter toward the sun
  float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  col += vec3(0.30, 0.62, 0.95) * fres * (0.35 + 0.65 * day);
  gl_FragColor = vec4(col, 1.0);
}`;

const CLOUD_FRAG = `
uniform sampler2D clouds; uniform vec3 uSun;
varying vec2 vUv; varying vec3 vNormal; varying vec3 vView;
void main(){
  float c = texture2D(clouds, vUv).r;
  float day = clamp(dot(normalize(vNormal), normalize(uSun)) * 0.5 + 0.5, 0.0, 1.0);
  float a = c * 0.7 * smoothstep(0.08, 0.55, day);
  vec3 col = vec3(1.0) * (0.55 + 0.45 * day);
  gl_FragColor = vec4(col, a);
}`;

const ATMO_VERT = `
varying vec3 vNormal; varying vec3 vView;
void main(){
  vNormal = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(position,1.0);
  vView = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const ATMO_FRAG = `
uniform vec3 uColor; varying vec3 vNormal; varying vec3 vView;
void main(){
  float intensity = pow(0.7 - dot(vNormal, vView), 3.0);
  gl_FragColor = vec4(uColor, 1.0) * clamp(intensity, 0.0, 1.0);
}`;
