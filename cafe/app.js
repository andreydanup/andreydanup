/* Moth & Moka: three interactive Three.js scenes (latte cup, drink builder, roast lab). */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const damp = (dt, rate) => 1 - Math.exp(-dt * rate);
  const smoothstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let webgl = !!window.THREE;
  try {
    const c = document.createElement('canvas');
    webgl = webgl && !!(c.getContext('webgl') || c.getContext('experimental-webgl'));
  } catch (e) { webgl = false; }
  const lin = (hex) => new THREE.Color(hex).convertSRGBToLinear();

  /* ---------- shared helpers ---------- */
  const scenes = [];
  function makeRenderer(canvas) {
    const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.outputEncoding = THREE.sRGBEncoding;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.setClearColor(0x000000, 0);
    return r;
  }
  function register(s) {
    s.visible = true;
    scenes.push(s);
    if ('IntersectionObserver' in window) {
      new IntersectionObserver((e) => { s.visible = e[0].isIntersecting; }, { rootMargin: '120px' }).observe(s.canvas);
    }
    if ('ResizeObserver' in window) new ResizeObserver(() => s.resize()).observe(s.canvas);
    else window.addEventListener('resize', () => s.resize());
    s.resize();
  }
  function fitCanvas(renderer, camera, canvas) {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return false;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    return true;
  }
  /* warm "lamp-lit room" reflections */
  function warmEnvironment(renderer) {
    const env = new THREE.Scene();
    env.add(new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), new THREE.MeshBasicMaterial({ color: lin('#3a2a1e'), side: THREE.BackSide })));
    const panel = (w, h, pos, rot, hex, k) => {
      const m = new THREE.MeshBasicMaterial({ color: hex });
      m.color.multiplyScalar(k);
      const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
      p.position.set(...pos);
      p.rotation.set(...rot);
      env.add(p);
    };
    panel(3, 3, [-2.5, 4.9, 1], [Math.PI / 2, 0, 0], 0xffc27a, 6);   // the lamp
    panel(2, 5, [-4.9, 0.5, 1], [0, Math.PI / 2, 0], 0xffb066, 1.6); // warm wall bounce
    panel(1.2, 4, [4.9, 1, -1], [0, -Math.PI / 2, 0], 0x9fb4d6, 1.4); // cool window
    const pm = new THREE.PMREMGenerator(renderer);
    const t = pm.fromScene(env, 0.04).texture;
    pm.dispose();
    return t;
  }
  function radialTexture(inner, outer, size = 128) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gr.addColorStop(0, inner);
    gr.addColorStop(1, outer);
    g.fillStyle = gr;
    g.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(c);
  }
  /* drag-to-spin with inertia; tap (no movement) calls onTap */
  function spinControl(canvas, onTap) {
    const st = { vel: 0, angle: 0, dragging: false, lastX: 0, moved: 0 };
    canvas.addEventListener('pointerdown', (e) => {
      st.dragging = true; st.lastX = e.clientX; st.moved = 0;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!st.dragging) return;
      const dx = e.clientX - st.lastX;
      st.lastX = e.clientX;
      st.moved += Math.abs(dx);
      const d = dx * 0.012;
      st.angle += d;
      st.vel = d * 60;
    });
    const up = (e) => {
      if (!st.dragging) return;
      st.dragging = false;
      if (st.moved < 6 && e.type === 'pointerup' && onTap) onTap();
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    st.update = (dt, idle) => {
      if (!st.dragging) {
        st.angle += st.vel * dt;
        st.vel *= Math.exp(-dt * 2.2);
        if (!reduceMotion) st.angle += idle * dt;
      }
      return st.angle;
    };
    return st;
  }

  /* =====================================================================
     1. LATTE CUP
     ===================================================================== */
  const ARTS = ['Rosetta', 'Heart', 'Tulip'];
  function createCup() {
    const canvas = $('cup-canvas');
    const renderer = makeRenderer(canvas);
    const scene = new THREE.Scene();
    scene.environment = warmEnvironment(renderer);
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
    camera.position.set(0, 3.1, 6.4);
    camera.lookAt(0, 0.62, 0);

    scene.add(new THREE.HemisphereLight(0xffe2c0, 0x20140c, 0.35));
    const lamp = new THREE.PointLight(0xffb468, 1.4, 0, 2);
    lamp.position.set(-2.2, 3.6, 2.4);
    scene.add(lamp);
    const rim = new THREE.DirectionalLight(0xa9bfdc, 0.35);
    rim.position.set(3, 2, -3);
    scene.add(rim);

    const rig = new THREE.Group();
    scene.add(rig);
    const spinner = new THREE.Group();
    rig.add(spinner);

    const ceramic = new THREE.MeshPhysicalMaterial({ color: lin('#ebe1d1'), roughness: 0.38, clearcoat: 0.6, clearcoatRoughness: 0.18 });
    const V = (x, y) => new THREE.Vector2(x, y);

    // saucer
    spinner.add(new THREE.Mesh(new THREE.LatheGeometry([
      V(0, 0), V(0.9, 0), V(1.02, 0.02), V(1.36, 0.07), V(1.56, 0.13), V(1.62, 0.17), V(1.58, 0.19),
      V(1.34, 0.13), V(0.98, 0.09), V(0.64, 0.07), V(0, 0.07),
    ], 96), ceramic));

    // cup
    const cup = new THREE.Group();
    cup.position.y = 0.07;
    spinner.add(cup);
    cup.add(new THREE.Mesh(new THREE.LatheGeometry([
      V(0, 0), V(0.5, 0), V(0.56, 0.03), V(0.6, 0.1), V(0.72, 0.35), V(0.86, 0.7), V(0.95, 0.95), V(0.97, 1.0),
      V(0.94, 1.02), V(0.91, 0.99), V(0.83, 0.75), V(0.7, 0.42), V(0.58, 0.18), V(0.45, 0.12), V(0, 0.12),
    ], 96), ceramic));
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.055, 16, 48, Math.PI * 1.25), ceramic);
    handle.rotation.z = -Math.PI * 0.625;
    handle.position.set(1.02, 0.55, 0);
    cup.add(handle);

    // latte art surface
    const artCanvas = document.createElement('canvas');
    artCanvas.width = artCanvas.height = 512;
    const artTex = new THREE.CanvasTexture(artCanvas);
    artTex.encoding = THREE.sRGBEncoding;
    const surface = new THREE.Mesh(
      new THREE.CircleGeometry(0.868, 96).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ map: artTex, roughness: 0.32, metalness: 0 })
    );
    surface.position.y = 0.88;
    surface.rotation.y = Math.PI / 2; // pour line points toward the handle
    cup.add(surface);

    // soft floor shadow
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(4.6, 4.6).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: radialTexture('rgba(0,0,0,0.6)', 'rgba(0,0,0,0)'), transparent: true, depthWrite: false })
    );
    shadow.position.y = -0.01;
    rig.add(shadow);

    // steam
    const puff = radialTexture('rgba(255,244,230,0.9)', 'rgba(255,244,230,0)');
    const steam = [];
    for (let i = 0; i < 18; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puff, transparent: true, depthWrite: false, opacity: 0 }));
      s.userData = { phase: i / 18, seed: Math.random() * 10 };
      rig.add(s);
      steam.push(s);
    }

    // pour animation
    let artIndex = 0, pour = 1;
    function drawArt(progress) {
      const g = artCanvas.getContext('2d');
      const S = 512, c = 256;
      const base = g.createRadialGradient(c, c, 0, c, c, c);
      base.addColorStop(0, '#a9713f');
      base.addColorStop(0.65, '#7b4a26');
      base.addColorStop(1, '#4a2a14');
      g.fillStyle = base;
      g.fillRect(0, 0, S, S);
      const R = mulberry(7);
      g.fillStyle = 'rgba(255,220,170,0.06)';
      for (let i = 0; i < 400; i++) { g.beginPath(); g.arc(R() * S, R() * S, R() * 2.2, 0, Math.PI * 2); g.fill(); }

      g.save();
      g.beginPath();
      g.arc(c, c + 60, Math.max(1, progress * 420), 0, Math.PI * 2);
      g.clip();
      g.filter = 'blur(1.4px)';
      const milk = '#f4e9d8', crema = '#8a5530';
      const heart = (cx, cy, w, h) => {
        g.beginPath();
        g.moveTo(cx, cy + h * 0.55);
        g.bezierCurveTo(cx - w * 1.1, cy + h * 0.05, cx - w * 0.75, cy - h * 0.75, cx, cy - h * 0.28);
        g.bezierCurveTo(cx + w * 0.75, cy - h * 0.75, cx + w * 1.1, cy + h * 0.05, cx, cy + h * 0.55);
        g.fill();
      };
      const name = ARTS[artIndex];
      if (name === 'Heart') {
        g.fillStyle = milk;
        heart(c, c + 10, 150, 260);
        g.strokeStyle = crema; g.lineWidth = 5;
        g.beginPath(); g.moveTo(c, c - 70); g.lineTo(c, c + 150); g.stroke();
      } else if (name === 'Tulip') {
        g.fillStyle = milk;
        [[c + 95, 150, 170], [c + 10, 120, 140], [c - 70, 90, 110]].forEach(([y, w, h], i) => {
          heart(c, y, w, h);
          if (i < 2) { g.fillStyle = crema; heart(c, y - h * 0.32, w * 0.82, h * 0.6); g.fillStyle = milk; }
        });
        g.strokeStyle = milk; g.lineWidth = 6;
        g.beginPath(); g.moveTo(c, c - 150); g.lineTo(c, c + 170); g.stroke();
      } else {
        for (let i = 0; i < 8; i++) {
          const y = c + 120 - i * 34, w = 165 - i * 15, h = 46 - i * 2.5;
          g.fillStyle = milk;
          g.beginPath(); g.ellipse(c, y, w, h, 0, 0, Math.PI); g.fill();
          g.fillStyle = crema;
          g.beginPath(); g.ellipse(c, y - 2, w * 0.86, h * 0.62, 0, 0, Math.PI); g.fill();
        }
        g.fillStyle = milk;
        heart(c, c - 160, 62, 90);
        g.strokeStyle = milk; g.lineWidth = 6;
        g.beginPath(); g.moveTo(c, c - 200); g.quadraticCurveTo(c + 6, c, c, c + 175); g.stroke();
      }
      g.restore();
      artTex.needsUpdate = true;
    }
    function nextArt() {
      artIndex = (artIndex + 1) % ARTS.length;
      pour = 0;
      $('art-name').textContent = ARTS[artIndex];
    }
    drawArt(1);

    const spin = spinControl(canvas, nextArt);
    spin.angle = -0.6;
    canvas.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); nextArt(); }
      if (e.key === 'ArrowLeft') spin.vel -= 2;
      if (e.key === 'ArrowRight') spin.vel += 2;
    });

    return {
      canvas,
      resize() {
        if (!fitCanvas(renderer, camera, canvas)) return;
        rig.scale.setScalar(camera.aspect < 0.9 ? 0.85 : 1);
      },
      render(dt, time) {
        spinner.rotation.y = spin.update(dt, 0.25);
        if (pour < 1) {
          pour = Math.min(1, pour + dt / (reduceMotion ? 0.01 : 0.9));
          drawArt(1 - Math.pow(1 - pour, 2));
        }
        for (const s of steam) {
          const t = ((time * 0.16 + s.userData.phase) % 1);
          const sd = s.userData.seed;
          s.position.set(Math.sin(time * 0.8 + sd) * 0.22 * t + Math.sin(sd) * 0.22, 1.05 + t * 1.35, Math.cos(sd) * 0.22);
          s.scale.setScalar(0.4 + t * 0.9);
          s.material.opacity = reduceMotion ? 0.04 : Math.sin(Math.PI * t) * Math.pow(1 - t, 0.6) * 0.11;
        }
        renderer.render(scene, camera);
      },
    };
  }
  function mulberry(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* =====================================================================
     2. DRINK BUILDER
     ===================================================================== */
  const CAP = 360, SHOT_ML = 30, SYRUP_ML = 15, ICE_ML = 60, CAF_PER_SHOT = 63;
  const PRESETS = {
    espresso:   { name: 'Espresso',   price: 3.2, shots: 2, milk: 0,   foam: 0,  water: 0,   ice: false },
    cortado:    { name: 'Cortado',    price: 4.2, shots: 2, milk: 60,  foam: 0,  water: 0,   ice: false },
    flatwhite:  { name: 'Flat white', price: 4.8, shots: 2, milk: 120, foam: 10, water: 0,   ice: false },
    latte:      { name: 'Latte',      price: 5.2, shots: 2, milk: 200, foam: 20, water: 0,   ice: false },
    cappuccino: { name: 'Cappuccino', price: 4.9, shots: 2, milk: 90,  foam: 60, water: 0,   ice: false },
    americano:  { name: 'Americano',  price: 3.8, shots: 2, milk: 0,   foam: 0,  water: 180, ice: false },
    icedlatte:  { name: 'Iced latte', price: 5.2, shots: 2, milk: 180, foam: 0,  water: 0,   ice: true },
  };
  const SYRUPS = {
    none: null,
    vanilla: { label: 'vanilla', color: '#e9c46a' },
    caramel: { label: 'caramel', color: '#c27b2c' },
    brown: { label: 'brown sugar', color: '#7a4a1f' },
  };
  const drink = { shots: 2, milk: 120, foam: 10, water: 0, syrup: 'none', milkType: 'whole', ice: false, stirred: false };

  const volumeOf = (d) => d.shots * SHOT_ML + d.milk + d.foam + d.water + (d.syrup !== 'none' ? SYRUP_ML : 0) + (d.ice ? ICE_ML : 0);
  function matchPreset(d) {
    for (const key in PRESETS) {
      const p = PRESETS[key];
      if (p.shots === d.shots && p.milk === d.milk && p.foam === d.foam && p.water === d.water && p.ice === d.ice) return key;
    }
    return null;
  }
  function priceOf(d, key) {
    let p = key ? PRESETS[key].price
      : 2.0 + 0.6 * d.shots + (d.milk ? 0.8 + d.milk * 0.006 : 0) + d.foam * 0.004 + (d.water ? 0.4 : 0) + (d.ice ? 0.3 : 0);
    if (d.syrup !== 'none') p += 0.6;
    if (d.milk && d.milkType === 'oat') p += 0.7;
    return p;
  }

  function createGlass() {
    const canvas = $('glass-canvas');
    const renderer = makeRenderer(canvas);
    renderer.sortObjects = true;
    const scene = new THREE.Scene();
    scene.environment = warmEnvironment(renderer);
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);

    scene.add(new THREE.HemisphereLight(0xffe2c0, 0x20140c, 0.5));
    const lamp = new THREE.PointLight(0xffb468, 1.1, 0, 2);
    lamp.position.set(-2.4, 4, 3);
    scene.add(lamp);

    const rig = new THREE.Group();
    scene.add(rig);

    const V = (x, y) => new THREE.Vector2(x, y);
    const BASE = 0.14, TOP = 2.5, H_MAX = 2.2;
    const glass = new THREE.Mesh(
      new THREE.LatheGeometry([V(0, 0), V(0.86, 0), V(0.885, 0.03), V(1.0, TOP), V(0.965, TOP), V(0.845, BASE), V(0, BASE)], 96),
      new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.2, clearcoat: 1, side: THREE.DoubleSide, depthWrite: false })
    );
    glass.renderOrder = 3;
    rig.add(glass);
    const rimLine = new THREE.Mesh(new THREE.TorusGeometry(0.983, 0.012, 8, 96).rotateX(Math.PI / 2),
      new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, roughness: 0.05 }));
    rimLine.position.y = TOP;
    rig.add(rimLine);
    const innerR = (y) => 0.845 + (0.965 - 0.845) * (y - BASE) / (TOP - BASE) - 0.014;

    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(3.4, 3.4).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: radialTexture('rgba(0,0,0,0.55)', 'rgba(0,0,0,0)'), transparent: true, depthWrite: false })
    );
    shadow.position.y = -0.005;
    rig.add(shadow);

    const COLORS = {
      espresso: '#3b2314', water: '#b98652', foam: '#fbf5ec',
      milk: { whole: '#f1e7d8', oat: '#e6d2b0' },
    };
    const unit = new THREE.CylinderGeometry(1, 1, 1, 72).translate(0, 0.5, 0);
    const layers = {};
    for (const key of ['syrup', 'espresso', 'water', 'milk', 'foam']) {
      const mat = new THREE.MeshPhysicalMaterial({
        color: 0xffffff, roughness: key === 'foam' ? 0.9 : 0.45, clearcoat: 0, envMapIntensity: 0.3,
        transparent: key === 'water', opacity: key === 'water' ? 0.72 : 1,
      });
      const m = new THREE.Mesh(unit, mat);
      m.renderOrder = 1;
      m.visible = false;
      rig.add(m);
      layers[key] = { mesh: m, ml: 0, base: new THREE.Color(), shown: new THREE.Color() };
    }

    const ice = [];
    const iceMat = new THREE.MeshPhysicalMaterial({ color: lin('#d9ecf6'), roughness: 0.05, transparent: true, opacity: 0.38, clearcoat: 1, depthWrite: false });
    const R = mulberry(3);
    for (let i = 0; i < 5; i++) {
      const cube = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.34), iceMat);
      cube.renderOrder = 2;
      const a = (i / 5) * Math.PI * 2 + 0.4;
      cube.userData = { x: Math.cos(a) * (0.3 + R() * 0.25), z: Math.sin(a) * (0.3 + R() * 0.25), dy: R() * 0.5, rot: [R() * 3, R() * 3, R() * 3], seed: R() * 6 };
      rig.add(cube);
      ice.push(cube);
    }
    let iceAmt = 0, stir = 0;
    const mix = new THREE.Color();

    const spin = spinControl(canvas, null);
    spin.angle = 0.4;

    return {
      canvas,
      resize() {
        if (!fitCanvas(renderer, camera, canvas)) return;
        const back = camera.aspect < 1 ? 1 / Math.pow(camera.aspect, 0.6) : 1;
        camera.position.set(0, 4.3 * back, 7.3 * back);
        camera.lookAt(0, 1.1, 0);
      },
      render(dt, time) {
        const k = reduceMotion ? 1 : damp(dt, 5);
        const target = {
          syrup: drink.syrup !== 'none' ? SYRUP_ML : 0,
          espresso: drink.shots * SHOT_ML,
          water: drink.water,
          milk: drink.milk,
          foam: drink.foam,
        };
        const sy = SYRUPS[drink.syrup];
        layers.syrup.base.set(sy ? sy.color : '#c27b2c').convertSRGBToLinear();
        layers.espresso.base.set(COLORS.espresso).convertSRGBToLinear();
        layers.water.base.set(COLORS.water).convertSRGBToLinear();
        layers.milk.base.set(COLORS.milk[drink.milkType]).convertSRGBToLinear();
        layers.foam.base.set(COLORS.foam).convertSRGBToLinear();

        // stirred colour: volume-weighted average of everything but foam
        let tot = 0;
        mix.setRGB(0, 0, 0);
        for (const key of ['syrup', 'espresso', 'water', 'milk']) {
          const w = target[key] * (key === 'espresso' ? 2.2 : key === 'water' ? 0.25 : 1);
          mix.r += layers[key].base.r * w; mix.g += layers[key].base.g * w; mix.b += layers[key].base.b * w;
          tot += w;
        }
        if (tot) mix.multiplyScalar(1 / tot);
        stir += ((drink.stirred ? 1 : 0) - stir) * (reduceMotion ? 1 : damp(dt, 3));

        const order = drink.ice ? ['syrup', 'milk', 'water', 'espresso', 'foam'] : ['syrup', 'espresso', 'water', 'milk', 'foam'];
        let y = BASE + 0.002;
        for (const key of order) {
          const L = layers[key];
          L.ml += (target[key] - L.ml) * k;
          if (Math.abs(target[key] - L.ml) < 2) L.ml = target[key];
          const h = (L.ml / CAP) * H_MAX;
          L.mesh.visible = h > 0.004;
          if (L.mesh.visible) {
            const r = innerR(y + h / 2);
            L.mesh.position.y = y;
            L.mesh.scale.set(r, h, r);
            L.shown.copy(L.base);
            if (key !== 'foam') L.shown.lerp(mix, stir);
            L.mesh.material.color.copy(L.shown);
            if (key === 'water') L.mesh.material.opacity = 0.72 + 0.25 * stir;
          }
          y += h;
        }
        const liquidTop = y;

        iceAmt += ((drink.ice ? 1 : 0) - iceAmt) * k;
        ice.forEach((cube, i) => {
          const u = cube.userData;
          cube.visible = iceAmt > 0.02;
          const bob = reduceMotion ? 0 : Math.sin(time * 1.3 + u.seed) * 0.03;
          cube.position.set(u.x, Math.max(BASE + 0.25, liquidTop - 0.06 - u.dy * 0.35) + bob, u.z);
          cube.rotation.set(u.rot[0], u.rot[1] + time * 0.05, u.rot[2]);
          cube.scale.setScalar(0.001 + iceAmt);
        });

        rig.rotation.y = spin.update(dt, 0.15);
        renderer.render(scene, camera);
      },
    };
  }

  /* builder UI */
  const ui = {
    shotsOut: $('shots-out'), shotsMl: $('shots-ml'), shotsMinus: $('shots-minus'), shotsPlus: $('shots-plus'),
    milk: $('milk'), milkOut: $('milk-out'), foam: $('foam'), foamOut: $('foam-out'), water: $('water'), waterOut: $('water-out'),
    ice: $('ice'), name: $('drink-name'), price: $('drink-price'), vol: $('stat-vol'), caf: $('stat-caf'), ratio: $('stat-ratio'),
    warn: $('warn'), fill: $('fill-bar'), stir: $('stir-btn'), toast: $('toast'),
  };
  let warnTimer = null;
  function flashWarn() {
    ui.warn.hidden = false;
    clearTimeout(warnTimer);
    warnTimer = setTimeout(() => { ui.warn.hidden = true; }, 2600);
  }
  /* set one field, clamped so the glass never overflows */
  function setField(field, value) {
    const prev = drink[field];
    drink[field] = value;
    if (volumeOf(drink) > CAP) {
      drink[field] = prev;
      if (typeof value === 'number') {
        const room = CAP - volumeOf(drink);
        const step = field === 'shots' ? 1 : 10;
        const add = field === 'shots' ? Math.floor(room / SHOT_ML) : Math.floor(room / step) * step;
        drink[field] = prev + Math.max(0, Math.min(add, value - prev));
      }
      flashWarn();
    }
    syncBuilder();
  }
  function syncBuilder() {
    const d = drink;
    const key = matchPreset(d);
    const extras = [];
    if (d.milk && d.milkType === 'oat') extras.push('oat');
    if (d.syrup !== 'none') extras.push(SYRUPS[d.syrup].label);
    ui.name.textContent = (key ? PRESETS[key].name : 'Your own drink') + (extras.length ? ' · ' + extras.join(', ') : '');
    ui.price.textContent = '$' + priceOf(d, key).toFixed(2);
    const vol = volumeOf(d);
    ui.vol.textContent = vol + ' / ' + CAP + ' ml';
    ui.caf.textContent = d.shots * CAF_PER_SHOT + ' mg';
    const rest = d.milk + d.water + d.foam;
    ui.ratio.textContent = rest ? '1 : ' + (rest / (d.shots * SHOT_ML)).toFixed(1) : 'Straight';
    ui.fill.style.height = (vol / CAP * 100).toFixed(1) + '%';
    ui.fill.classList.toggle('full', vol >= CAP);

    ui.shotsOut.textContent = d.shots;
    ui.shotsMl.textContent = d.shots * SHOT_ML + ' ml';
    ui.shotsMinus.disabled = d.shots <= 1;
    ui.shotsPlus.disabled = d.shots >= 4;
    ui.milk.value = d.milk; ui.milkOut.textContent = d.milk + ' ml';
    ui.foam.value = d.foam; ui.foamOut.textContent = d.foam + ' ml';
    ui.water.value = d.water; ui.waterOut.textContent = d.water + ' ml';
    ui.ice.checked = d.ice;
    document.querySelectorAll('[data-preset]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.preset === key)));
    document.querySelectorAll('[data-milk]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.milk === d.milkType)));
    document.querySelectorAll('[data-syrup]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.syrup === d.syrup)));
    ui.stir.setAttribute('aria-pressed', String(d.stirred));
    ui.stir.textContent = d.stirred ? 'Show the layers' : 'Stir it';
  }
  document.querySelectorAll('[data-preset]').forEach((b) => b.addEventListener('click', () => {
    const p = PRESETS[b.dataset.preset];
    Object.assign(drink, { shots: p.shots, milk: p.milk, foam: p.foam, water: p.water, ice: p.ice });
    if (volumeOf(drink) > CAP) drink.syrup = 'none';
    syncBuilder();
  }));
  ui.shotsMinus.addEventListener('click', () => setField('shots', Math.max(1, drink.shots - 1)));
  ui.shotsPlus.addEventListener('click', () => setField('shots', Math.min(4, drink.shots + 1)));
  ui.milk.addEventListener('input', () => setField('milk', +ui.milk.value));
  ui.foam.addEventListener('input', () => setField('foam', +ui.foam.value));
  ui.water.addEventListener('input', () => setField('water', +ui.water.value));
  ui.ice.addEventListener('change', () => setField('ice', ui.ice.checked));
  document.querySelectorAll('[data-milk]').forEach((b) => b.addEventListener('click', () => setField('milkType', b.dataset.milk)));
  document.querySelectorAll('[data-syrup]').forEach((b) => b.addEventListener('click', () => setField('syrup', b.dataset.syrup)));
  ui.stir.addEventListener('click', () => { drink.stirred = !drink.stirred; syncBuilder(); });

  let orderCount = 0;
  const pill = $('order-pill');
  $('add-order').addEventListener('click', () => {
    orderCount++;
    $('order-count').textContent = orderCount;
    ui.toast.textContent = ui.name.textContent + ' added. ' + orderCount + (orderCount === 1 ? ' drink' : ' drinks') + ' in your order (demo).';
    pill.classList.add('bump');
    setTimeout(() => pill.classList.remove('bump'), 700);
  });
  syncBuilder();

  /* =====================================================================
     3. ROAST LAB
     ===================================================================== */
  const STAGES = [
    { to: 165, name: 'Drying', notes: 'Grassy and hay-like. The bean is still green, dense and full of water.' },
    { to: 185, name: 'Yellowing', notes: 'Smells like bread crust and toasted grain as the Maillard reaction starts.' },
    { to: 196, name: 'Browning', notes: 'Sugars begin to caramelise. The aroma turns sweet and the bean swells.' },
    { to: 205, name: 'First crack · Light roast', notes: 'Steam bursts the cell walls with a pop. Bright acidity, citrus and florals.' },
    { to: 215, name: 'Medium roast', notes: 'Balanced and round: caramel, stone fruit and milk chocolate. Our house blend lives here.' },
    { to: 224, name: 'Medium-dark roast', notes: 'Dark chocolate, toasted nuts and a heavier body. Acidity fades.' },
    { to: 235, name: 'Second crack · Dark roast', notes: 'A quieter, faster crackle. Oils rise to the surface; bittersweet and smoky.' },
    { to: 241, name: 'French roast', notes: 'Charred and glossy. Very little of the origin is left to taste.' },
  ];
  const COLOR_STOPS = [
    [150, '#8fa36b'], [165, '#b8b070'], [180, '#c8a060'], [190, '#a8743f'], [196, '#93603a'],
    [205, '#7a4a2a'], [215, '#5c341c'], [224, '#432513'], [235, '#2b170c'], [240, '#1e1109'],
  ].map(([t, c]) => [t, window.THREE ? lin(c) : null]);
  function roastColor(T, out) {
    for (let i = 0; i < COLOR_STOPS.length - 1; i++) {
      const [t0, c0] = COLOR_STOPS[i], [t1, c1] = COLOR_STOPS[i + 1];
      if (T <= t1) return out.copy(c0).lerp(c1, clamp((T - t0) / (t1 - t0), 0, 1));
    }
    return out.copy(COLOR_STOPS[COLOR_STOPS.length - 1][1]);
  }

  function makeBeanGeometry(seg) {
    const g = new THREE.SphereGeometry(1, seg, Math.round(seg * 0.75));
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i) * 0.78, y = p.getY(i) * 0.58, z = p.getZ(i) * 1.12;
      if (y > 0) {
        y *= 0.55;
        const d = x - 0.06 * Math.sin(z * 2.4);
        const along = Math.sqrt(Math.max(0, 1 - (z / 1.12) * (z / 1.12)));
        y -= 0.15 * Math.exp(-(d * d) / 0.006) * along;
      }
      p.setXYZ(i, x, y, z);
    }
    g.computeVertexNormals();
    return g;
  }

  const roast = { temp: 150, shown: 150, playing: false };
  function createRoast() {
    const canvas = $('bean-canvas');
    const renderer = makeRenderer(canvas);
    const scene = new THREE.Scene();
    scene.environment = warmEnvironment(renderer);
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 50);

    scene.add(new THREE.HemisphereLight(0xffe2c0, 0x1a1009, 0.45));
    const lamp = new THREE.PointLight(0xffb468, 1.3, 0, 2);
    lamp.position.set(-2.5, 3.5, 3);
    scene.add(lamp);
    const rim = new THREE.DirectionalLight(0xa9bfdc, 0.5);
    rim.position.set(3, 1, -3);
    scene.add(rim);

    const mat = new THREE.MeshPhysicalMaterial({ roughness: 0.7, clearcoat: 0, clearcoatRoughness: 0.25 });
    const hero = new THREE.Mesh(makeBeanGeometry(96), mat);
    const heroPivot = new THREE.Group();
    heroPivot.add(hero);
    hero.rotation.set(-0.9, 0, 0.35);
    scene.add(heroPivot);

    const N = 64;
    const small = new THREE.InstancedMesh(makeBeanGeometry(24), mat, N);
    scene.add(small);
    const R = mulberry(11);
    const beans = Array.from({ length: N }, (_, i) => ({
      a: (i / N) * Math.PI * 2 + R() * 0.2,
      r: 2.6 + R() * 1.0,
      y: (R() - 0.5) * 2.2,
      s: 0.14 + R() * 0.06,
      rx: R() * 6, ry: R() * 6,
      spin: 0.4 + R() * 1.2,
      jump: 0, vy: 0,
    }));
    const dummy = new THREE.Object3D();
    const col = new THREE.Color();

    const spin = spinControl(canvas, null);
    let lastShown = roast.shown;

    return {
      canvas,
      kick(strength) { for (const b of beans) if (R() < 0.55) b.vy = strength * (0.6 + R() * 0.8); },
      resize() {
        if (!fitCanvas(renderer, camera, canvas)) return;
        const back = camera.aspect < 1 ? 1 / Math.pow(camera.aspect, 0.7) : 1;
        camera.position.set(0, 2.0 * back, 8.2 * back);
        camera.lookAt(0, 0, 0);
      },
      render(dt, time) {
        const T = roast.shown;
        roastColor(T, col);
        mat.color.copy(col);
        mat.roughness = T < 224 ? 0.72 - 0.22 * smoothstep(196, 224, T) : 0.5 - 0.3 * smoothstep(224, 240, T);
        mat.clearcoat = 0.9 * smoothstep(220, 240, T);
        const grow = 1 + 0.2 * smoothstep(165, 235, T);

        heroPivot.rotation.y = spin.update(dt, 0.3);
        heroPivot.rotation.x = Math.sin(time * 0.4) * 0.12;
        hero.scale.setScalar(1.15 * grow);

        const drum = reduceMotion ? 0 : time * 0.12;
        beans.forEach((b, i) => {
          b.vy -= 9 * dt;
          b.jump = Math.max(0, b.jump + b.vy * dt);
          if (b.jump === 0) b.vy = Math.max(0, b.vy);
          const a = b.a + drum;
          dummy.position.set(Math.cos(a) * b.r, b.y + b.jump, Math.sin(a) * b.r * 0.55 - 1.2);
          dummy.rotation.set(b.rx + time * b.spin * (reduceMotion ? 0 : 0.3), b.ry + a, 0);
          dummy.scale.setScalar(b.s * grow);
          dummy.updateMatrix();
          small.setMatrixAt(i, dummy.matrix);
        });
        small.instanceMatrix.needsUpdate = true;

        if (lastShown < 196 && T >= 196) { this.kick(3.2); showCrack('First crack'); }
        if (lastShown < 224 && T >= 224) { this.kick(2.2); showCrack('Second crack'); }
        lastShown = T;
        renderer.render(scene, camera);
      },
    };
  }

  const tempInput = $('roast-temp');
  let crackTimer = null;
  function showCrack(text) {
    const el = $('crack');
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(crackTimer);
    crackTimer = setTimeout(() => el.classList.remove('show'), 1400);
  }
  function syncRoast() {
    const T = roast.temp;
    $('temp-c').textContent = Math.round(T) + ' °C';
    $('temp-f').textContent = Math.round(T * 9 / 5 + 32) + ' °F';
    const secs = Math.round(((T - 150) / 90) * 12 * 60);
    $('temp-t').textContent = Math.floor(secs / 60) + ':' + String(secs % 60).padStart(2, '0') + ' in the drum';
    const st = STAGES.find((s) => T < s.to) || STAGES[STAGES.length - 1];
    $('stage-name').textContent = st.name;
    $('stage-notes').textContent = st.notes;
    tempInput.value = Math.round(T);
  }
  tempInput.addEventListener('input', () => { roast.temp = +tempInput.value; stopRoast(); syncRoast(); });
  const playBtn = $('roast-play');
  function stopRoast() { roast.playing = false; playBtn.textContent = 'Run a full roast'; }
  playBtn.addEventListener('click', () => {
    if (roast.playing) { stopRoast(); return; }
    if (roast.temp >= 239) { roast.temp = 150; roast.shown = 150; }
    roast.playing = true;
    playBtn.textContent = 'Pause the roast';
  });
  syncRoast();

  /* ---------- boot ---------- */
  let roastScene = null;
  if (webgl) {
    register(createCup());
    register(createGlass());
    roastScene = createRoast();
    register(roastScene);
  } else {
    document.documentElement.classList.add('no-webgl');
  }

  let last = performance.now();
  const t0 = last;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const time = (now - t0) / 1000;

    if (roast.playing) {
      roast.temp = Math.min(240, roast.temp + dt * (reduceMotion ? 90 : 6.5));
      syncRoast();
      if (roast.temp >= 240) stopRoast();
    }
    roast.shown += (roast.temp - roast.shown) * (reduceMotion ? 1 : damp(dt, 6));
    if (!webgl && roast.shown !== roast.temp) roast.shown = roast.temp;

    for (const s of scenes) if (s.visible) s.render(dt, time);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
