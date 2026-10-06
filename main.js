/* VESPER H1 — procedural headphone model + scroll-driven staging (Three.js r128). */
(() => {
  'use strict';

  const canvas = document.getElementById('stage');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (!window.THREE) { document.documentElement.classList.add('no-webgl'); return; }

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch (err) {
    document.documentElement.classList.add('no-webgl');
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  camera.position.set(0, 0, 9);

  const lin = (hex) => new THREE.Color(hex).convertSRGBToLinear();
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const smooth = (t) => t * t * (3 - 2 * t);
  const damp = (dt, rate) => 1 - Math.exp(-dt * rate);

  /* ---------- studio environment (soft boxes baked into a PMREM) ---------- */
  function buildEnvironment() {
    const env = new THREE.Scene();
    env.add(new THREE.Mesh(
      new THREE.BoxGeometry(10, 10, 10),
      new THREE.MeshBasicMaterial({ color: lin(0x5d6169), side: THREE.BackSide })
    ));
    const panel = (w, h, pos, rot, intensity) => {
      const m = new THREE.MeshBasicMaterial({ color: 0xffffff });
      m.color.setScalar(intensity);
      const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
      p.position.set(...pos);
      p.rotation.set(...rot);
      env.add(p);
    };
    panel(6, 2.4, [0, 4.9, 0.5], [Math.PI / 2, 0, 0], 7);       // overhead softbox
    panel(2, 6, [-4.9, 0.5, 1], [0, Math.PI / 2, 0], 4.5);      // left strip
    panel(1.2, 6, [4.9, 0, -1.5], [0, -Math.PI / 2, 0], 3);     // right kicker
    panel(5, 1.6, [0, -1, -4.9], [0, 0, 0], 1.4);               // back fill
    const pmrem = new THREE.PMREMGenerator(renderer);
    const tex = pmrem.fromScene(env, 0.035).texture;
    pmrem.dispose();
    return tex;
  }
  scene.environment = buildEnvironment();

  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f99, 0.35));
  const key = new THREE.DirectionalLight(0xffffff, 1.1);
  key.position.set(3, 5, 4);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xc4d2ff, 0.9);
  rim.position.set(-4, 2, -3);
  scene.add(rim);

  /* ---------- textures ---------- */
  function fabricTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = '#9a9a9a';
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#5a5a5a';
    for (let y = 0; y < 128; y += 8) {
      for (let x = (y / 8) % 2 ? 4 : 0; x < 128; x += 8) {
        g.beginPath();
        g.arc(x + 2, y + 2, 1.6, 0, Math.PI * 2);
        g.fill();
      }
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(6, 6);
    t.encoding = THREE.sRGBEncoding;
    return t;
  }

  function shadowTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    grad.addColorStop(0, 'rgba(17,19,24,0.55)');
    grad.addColorStop(0.45, 'rgba(17,19,24,0.22)');
    grad.addColorStop(1, 'rgba(17,19,24,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
    return new THREE.CanvasTexture(c);
  }

  /* ---------- materials ---------- */
  const M = {
    shell: new THREE.MeshPhysicalMaterial({ roughness: 0.4, metalness: 0.2, clearcoat: 0.6, clearcoatRoughness: 0.22 }),
    band: new THREE.MeshPhysicalMaterial({ roughness: 0.5, metalness: 0.1, clearcoat: 0.3, clearcoatRoughness: 0.4 }),
    cushion: new THREE.MeshStandardMaterial({ roughness: 0.78, metalness: 0 }),
    metal: new THREE.MeshStandardMaterial({ roughness: 0.24, metalness: 1 }),
    fabric: new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0, map: fabricTexture() }),
    accent: new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0, emissiveIntensity: 1.6 }),
    driver: new THREE.MeshStandardMaterial({ color: lin(0xc3c8cf), roughness: 0.32, metalness: 0.9, side: THREE.DoubleSide }),
    dark: new THREE.MeshStandardMaterial({ color: lin(0x17181c), roughness: 0.55, metalness: 0.4 }),
  };
  const ringMats = [];

  const COLORWAYS = {
    grafit:  { name: 'Grafit',  note: 'aluminium anodized gelap, aksen jingga', shell: 0x2a2d33, band: 0x24262b, cushion: 0x1b1c20, metal: 0xb4b9c1, accent: 0xff6a3d },
    gletser: { name: 'Gletser', note: 'putih es dengan aksen biru kobalt',      shell: 0xe4e8ec, band: 0xd5dbe1, cushion: 0xc4cad2, metal: 0xc9ced5, accent: 0x4b72ff },
    bara:    { name: 'Bara',    note: 'merah anggur, logam sampanye',           shell: 0x6e1c22, band: 0x56161b, cushion: 0x2a1315, metal: 0xd6b88e, accent: 0xf2b874 },
    lumut:   { name: 'Lumut',   note: 'hijau lumut matte, aksen krem',          shell: 0x5f6b58, band: 0x4f5949, cushion: 0x2f352c, metal: 0xc2c3b8, accent: 0xe8e1c8 },
  };
  const target = {};
  function setColorway(id, instant) {
    const cw = COLORWAYS[id];
    target.shell = lin(cw.shell);
    target.band = lin(cw.band);
    target.cushion = lin(cw.cushion);
    target.metal = lin(cw.metal);
    target.accent = lin(cw.accent);
    document.documentElement.style.setProperty('--glow', '#' + new THREE.Color(cw.accent).getHexString());
    if (instant) applyColors(1);
  }
  function applyColors(k) {
    M.shell.color.lerp(target.shell, k);
    M.band.color.lerp(target.band, k);
    M.cushion.color.lerp(target.cushion, k);
    M.fabric.color.lerp(target.cushion, k);
    M.metal.color.lerp(target.metal, k);
    M.accent.color.lerp(target.accent, k);
    M.accent.emissive.lerp(target.accent, k);
    for (const m of ringMats) m.color.lerp(target.accent, k);
  }

  /* ---------- geometry helpers (all cup parts are built along +X = outward) ---------- */
  const cylX = (r, h, seg = 96) => new THREE.CylinderGeometry(r, r, h, seg).rotateZ(-Math.PI / 2);
  const torusX = (r, t, arc = Math.PI * 2, seg = 96) => new THREE.TorusGeometry(r, t, 24, seg, arc).rotateY(Math.PI / 2);
  const mesh = (geo, mat, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    return m;
  };

  /* ---------- model ---------- */
  const rig = new THREE.Group();     // screen position + scale
  const model = new THREE.Group();   // rotation
  const inner = new THREE.Group();   // centring offset
  inner.position.y = -0.15;
  rig.add(model);
  model.add(inner);
  scene.add(rig);

  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(4.4, 2.2),
    new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -1.85;
  rig.add(shadow);

  // headband
  const band = new THREE.Group();
  band.position.y = 0.35;
  inner.add(band);
  const arc = mesh(new THREE.TorusGeometry(1.25, 0.055, 24, 160, Math.PI), M.band);
  arc.scale.z = 2.1;
  band.add(arc);
  const pad = mesh(new THREE.TorusGeometry(1.17, 0.05, 20, 120, Math.PI * 0.62), M.cushion);
  pad.rotation.z = Math.PI * 0.19;
  pad.scale.z = 1.8;
  band.add(pad);
  const stitch = mesh(new THREE.TorusGeometry(1.255, 0.006, 8, 160, Math.PI * 0.9), M.accent);
  stitch.rotation.z = Math.PI * 0.05;
  stitch.position.z = 0.118;
  band.add(stitch);
  for (const side of [-1, 1]) {
    const sleeve = mesh(new THREE.CylinderGeometry(0.062, 0.062, 0.22, 32), M.band, side * 1.25, -0.04, 0);
    sleeve.scale.z = 1.9;
    band.add(sleeve);
    band.add(mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.46, 20), M.metal, side * 1.25, -0.24, 0));
  }
  const bandAnchor = new THREE.Object3D();
  bandAnchor.position.set(-0.55, 1.18, 0.1);
  band.add(bandAnchor);

  // ear cups
  function makeCup(side) {
    const g = new THREE.Group();
    g.position.set(side * 1.25, -0.75, 0);
    g.scale.x = side; // mirror the left cup
    inner.add(g);

    const yoke = mesh(torusX(0.68, 0.034, Math.PI, 64), M.metal);
    g.add(yoke);
    g.add(mesh(new THREE.SphereGeometry(0.05, 20, 16), M.metal, 0, 0, 0.68));
    g.add(mesh(new THREE.SphereGeometry(0.05, 20, 16), M.metal, 0, 0, -0.68));

    const shell = new THREE.Group();
    g.add(shell);
    shell.add(mesh(cylX(0.6, 0.3), M.shell));
    shell.add(mesh(torusX(0.585, 0.025), M.shell, 0.15));
    shell.add(mesh(torusX(0.585, 0.025), M.shell, -0.15));
    shell.add(mesh(new THREE.SphereGeometry(0.022, 16, 12), M.accent, 0.05, -0.43, 0.42)); // status LED

    const cap = new THREE.Group();
    cap.position.x = 0.18;
    g.add(cap);
    cap.add(mesh(cylX(0.5, 0.05), M.metal));
    cap.add(mesh(torusX(0.5, 0.02), M.metal));
    cap.add(mesh(torusX(0.36, 0.005), M.accent, 0.026));
    for (const a of [0.5, 2.6, 4.4]) { // mic ports
      cap.add(mesh(cylX(0.016, 0.012, 16), M.dark, 0.027, Math.sin(a) * 0.43, Math.cos(a) * 0.43));
    }

    const driver = new THREE.Group();
    driver.position.x = -0.04;
    g.add(driver);
    const cone = new THREE.LatheGeometry([
      new THREE.Vector2(0.05, 0.09), new THREE.Vector2(0.1, 0.074), new THREE.Vector2(0.16, 0.05),
      new THREE.Vector2(0.22, 0.026), new THREE.Vector2(0.28, 0.006), new THREE.Vector2(0.3, 0),
    ], 72).rotateZ(-Math.PI / 2);
    driver.add(mesh(cone, M.driver));
    driver.add(mesh(new THREE.SphereGeometry(0.065, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2).rotateZ(Math.PI / 2), M.driver, 0.075));
    driver.add(mesh(torusX(0.3, 0.02), M.dark));
    driver.add(mesh(cylX(0.15, 0.12), M.dark, 0.15));
    driver.add(mesh(cylX(0.2, 0.02), M.metal, 0.22));

    const fabric = mesh(new THREE.CircleGeometry(0.34, 64).rotateY(-Math.PI / 2), M.fabric, -0.19);
    g.add(fabric);
    const cushion = mesh(torusX(0.45, 0.13), M.cushion, -0.25);
    cushion.scale.x = 0.8;
    g.add(cushion);

    const rings = [];
    for (let i = 0; i < 3; i++) {
      const mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
      ringMats.push(mat);
      const r = mesh(new THREE.RingGeometry(0.97, 1, 96).rotateY(Math.PI / 2), mat, 0.24);
      g.add(r);
      rings.push(r);
    }

    const cushionAnchor = new THREE.Object3D();
    cushionAnchor.position.set(0, 0.5, 0.2);
    cushion.add(cushionAnchor);

    return { side, g, shell, cap, driver, fabric, cushion, rings, cushionAnchor };
  }
  const cups = [makeCup(-1), makeCup(1)];

  const anchors = {
    band: bandAnchor,
    cap: cups[0].cap,
    driver: cups[1].driver,
    cushion: cups[1].cushionAnchor,
  };

  function applyExplode(e, anc, time) {
    band.position.y = 0.35 + 0.55 * e;
    for (const c of cups) {
      c.g.position.x = c.side * (1.25 + 0.3 * e);
      c.shell.position.x = 0.5 * e;
      c.cap.position.x = 0.18 + 0.95 * e;
      c.driver.position.x = -0.04 + 0.08 * e;
      c.fabric.position.x = -0.19 - 0.38 * e;
      c.cushion.position.x = -0.25 - 0.55 * e;
      c.rings.forEach((r, i) => {
        const p = reduceMotion ? (i + 0.5) / 3 : ((time * 0.45 + i / 3) % 1);
        const s = 0.62 + p * 1.25;
        r.position.x = c.cap.position.x + 0.06 + p * 0.25;
        r.scale.set(1, s, s);
        r.material.opacity = anc * Math.pow(1 - p, 1.4) * 0.75;
        r.visible = anc > 0.01;
      });
    }
  }

  /* ---------- scroll staging ---------- */
  // x / y are fractions of the visible half-width / half-height; s multiplies the fitted scale.
  const STATES = {
    hero:    { d: { x: 0.44, y: 0.0,  rx: 0.2,   ry: -0.55, s: 1.0,  e: 0, a: 0, spin: 0 },
               m: { x: 0,    y: 0.42, rx: 0.18,  ry: -0.5,  s: 0.95, e: 0, a: 0, spin: 0 } },
    sound:   { d: { x: -0.42, y: 0.0, rx: 0.12,  ry: -0.3,  s: 0.66, e: 1, a: 0, spin: 0 },
               m: { x: 0,    y: 0.42, rx: 0.12,  ry: -0.3,  s: 0.62, e: 1, a: 0, spin: 0 } },
    anc:     { d: { x: 0.44, y: 0.0,  rx: 0.06,  ry: -1.2,  s: 0.95, e: 0, a: 1, spin: 0 },
               m: { x: 0,    y: 0.4,  rx: 0.06,  ry: -1.15, s: 0.9,  e: 0, a: 1, spin: 0 } },
    comfort: { d: { x: -0.44, y: 0.04, rx: -0.42, ry: 0.75, s: 1.0,  e: 0, a: 0, spin: 0 },
               m: { x: 0,    y: 0.42, rx: -0.42, ry: 0.75,  s: 0.95, e: 0, a: 0, spin: 0 } },
    colors:  { d: { x: 0,    y: 0.34, rx: 0.12,  ry: -0.4,  s: 0.72, e: 0, a: 0, spin: 1 },
               m: { x: 0,    y: 0.42, rx: 0.12,  ry: -0.4,  s: 0.95, e: 0, a: 0, spin: 1 } },
    specs:   { d: { x: 0.6,  y: 0.0,  rx: 0.25,  ry: -0.9,  s: 0.62, e: 0, a: 0, spin: 0.4 },
               m: { x: 0,    y: 0.55, rx: 0.25,  ry: -0.9,  s: 0.6,  e: 0, a: 0, spin: 0.4 } },
    buy:     { d: { x: 0,    y: 0.4,  rx: 0.15,  ry: -0.3,  s: 0.66, e: 0, a: 0, spin: 1 },
               m: { x: 0,    y: 0.42, rx: 0.15,  ry: -0.3,  s: 0.9,  e: 0, a: 0, spin: 1 } },
  };
  const KEYS = ['x', 'y', 'rx', 'ry', 's', 'e', 'a', 'spin'];

  const sections = Array.from(document.querySelectorAll('[data-state]'));
  let marks = [];
  let view = { w: 1, h: 1, halfW: 1, halfH: 1, mobile: false, fit: 1 };

  function measure() {
    const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    marks = sections.map((el) => {
      const r = el.getBoundingClientRect();
      const top = r.top + window.scrollY;
      return { key: el.dataset.state, y: clamp(top + r.height / 2 - window.innerHeight / 2, 0, maxScroll) };
    });
  }

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z;
    const halfW = halfH * camera.aspect;
    const mobile = w <= 760 || camera.aspect < 0.8;
    const MODEL_W = 3.0, MODEL_H = 3.0;
    const fit = mobile
      ? Math.min((halfH * 0.95) / MODEL_H, (halfW * 2 * 0.84) / MODEL_W)
      : Math.min((halfH * 2 * 0.6) / MODEL_H, (halfW * 2 * 0.46) / MODEL_W);
    view = { w, h, halfW, halfH, mobile, fit };
    measure();
  }

  function stateAtScroll() {
    const y = window.scrollY;
    const set = view.mobile ? 'm' : 'd';
    let i = 0;
    while (i < marks.length - 1 && y >= marks[i + 1].y) i++;
    const A = STATES[marks[i].key][set];
    const nextMark = marks[Math.min(i + 1, marks.length - 1)];
    const B = STATES[nextMark.key][set];
    const span = nextMark.y - marks[i].y;
    let t = span > 0 ? clamp((y - marks[i].y) / span, 0, 1) : 0;
    t = smooth(clamp((t - 0.18) / 0.64, 0, 1)); // hold each pose briefly
    const out = {};
    for (const k of KEYS) out[k] = A[k] + (B[k] - A[k]) * t;
    return out;
  }

  /* ---------- input ---------- */
  const pointer = { x: 0, y: 0, cx: 0, cy: 0 };
  window.addEventListener('pointermove', (ev) => {
    pointer.x = (ev.clientX / window.innerWidth) * 2 - 1;
    pointer.y = (ev.clientY / window.innerHeight) * 2 - 1;
  }, { passive: true });

  /* ---------- colour picker + cart ---------- */
  const nameEl = document.getElementById('color-name');
  document.querySelectorAll('.swatch').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.color;
      document.querySelectorAll('.swatch').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
      setColorway(id, false);
      const cw = COLORWAYS[id];
      nameEl.innerHTML = '<b>' + cw.name + '</b> — ' + cw.note;
    });
  });
  const buyBtn = document.getElementById('buy-btn');
  const buyStatus = document.getElementById('buy-status');
  buyBtn.addEventListener('click', () => {
    const active = document.querySelector('.swatch[aria-pressed="true"]');
    const cw = COLORWAYS[active ? active.dataset.color : 'grafit'];
    buyBtn.textContent = 'Ada di keranjang';
    buyStatus.textContent = 'VESPER H1 ' + cw.name + ' ditambahkan ke keranjang (demo).';
  });

  /* ---------- callouts ---------- */
  const calloutEls = Array.from(document.querySelectorAll('.callout')).map((el) => ({ el, obj: anchors[el.dataset.anchor] }));
  const glowEl = document.getElementById('glow');
  const tmp = new THREE.Vector3();

  function toScreen(obj) {
    tmp.setFromMatrixPosition(obj.matrixWorld).project(camera);
    return { x: (tmp.x + 1) / 2 * view.w, y: (1 - tmp.y) / 2 * view.h };
  }

  /* ---------- loop ---------- */
  setColorway('grafit', true);
  resize();
  const cur = stateAtScroll();
  let spin = 0;
  let intro = reduceMotion ? 1 : 0;
  let last = performance.now();
  const start = last;

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const time = (now - start) / 1000;

    const tgt = stateAtScroll();
    const k = reduceMotion ? 1 : damp(dt, 4.5);
    for (const key of KEYS) cur[key] += (tgt[key] - cur[key]) * k;
    applyColors(damp(dt, 4));

    pointer.cx += (pointer.x - pointer.cx) * damp(dt, 3);
    pointer.cy += (pointer.y - pointer.cy) * damp(dt, 3);

    if (!reduceMotion) {
      spin += dt * 0.5 * cur.spin;
      if (cur.spin < 0.05) {
        const home = Math.round(spin / (Math.PI * 2)) * Math.PI * 2;
        spin += (home - spin) * damp(dt, 2.5);
      }
      intro = Math.min(1, intro + dt / 1.8);
    }
    const ie = 1 - Math.pow(1 - intro, 3);

    const bob = reduceMotion ? 0 : Math.sin(time * 1.1) * 0.035;
    rig.position.set(cur.x * view.halfW, cur.y * view.halfH + bob - (1 - ie) * 0.9, 0);
    rig.scale.setScalar(view.fit * cur.s * (0.82 + 0.18 * ie));
    model.rotation.set(
      cur.rx + pointer.cy * 0.12,
      cur.ry + spin + pointer.cx * 0.22 - (1 - ie) * 2.4,
      0
    );
    shadow.material.opacity = 0.85 * (1 - cur.e * 0.5) * ie;

    applyExplode(cur.e, cur.a, time);
    renderer.render(scene, camera);

    // HTML overlays follow the model
    const c = toScreen(rig);
    glowEl.style.transform = 'translate(' + c.x.toFixed(1) + 'px,' + c.y.toFixed(1) + 'px)';
    const show = clamp((cur.e - 0.55) / 0.4, 0, 1);
    for (const co of calloutEls) {
      if (show <= 0.001) { co.el.style.opacity = '0'; continue; }
      const p = toScreen(co.obj);
      co.el.classList.toggle('left', p.x > view.w * 0.55);
      co.el.style.opacity = show.toFixed(3);
      co.el.style.transform = 'translate(' + clamp(p.x, 8, view.w - 8).toFixed(1) + 'px,' + clamp(p.y, 60, view.h - 8).toFixed(1) + 'px)';
    }

    requestAnimationFrame(frame);
  }

  window.addEventListener('resize', resize);
  window.addEventListener('load', measure);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
  requestAnimationFrame(frame);
})();
