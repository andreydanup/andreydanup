/* Three interactive WebGL scenes (Cover Flow, Spatial Audio stage, lossless spectrogram) + player UI. */
(() => {
  'use strict';

  const { ALBUMS, INSTRUMENTS, drawCover } = window.MusicData;
  const engine = window.MusicEngine;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const root = document.documentElement;
  const $ = (id) => document.getElementById(id);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const damp = (dt, rate) => 1 - Math.exp(-dt * rate);

  const coverCanvases = ALBUMS.map((a, i) => drawCover(a, i, 512));
  const coverURLs = coverCanvases.map((c) => {
    const s = document.createElement('canvas');
    s.width = s.height = 112;
    s.getContext('2d').drawImage(c, 0, 0, 112, 112);
    return s.toDataURL('image/png');
  });

  /* ---------- shared renderer factory ---------- */
  const scenes = [];
  function makeRenderer(canvas) {
    const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.outputEncoding = THREE.sRGBEncoding;
    r.setClearColor(0x000000, 0);
    return r;
  }
  function register(scene) {
    scene.visible = true;
    scenes.push(scene);
    if ('IntersectionObserver' in window) {
      new IntersectionObserver((entries) => { scene.visible = entries[0].isIntersecting; }, { rootMargin: '100px' })
        .observe(scene.canvas);
    }
    const ro = 'ResizeObserver' in window ? new ResizeObserver(() => scene.resize()) : null;
    if (ro) ro.observe(scene.canvas); else window.addEventListener('resize', () => scene.resize());
    scene.resize();
  }

  let webgl = true;
  try {
    const test = document.createElement('canvas');
    webgl = !!(window.THREE && (test.getContext('webgl') || test.getContext('experimental-webgl')));
  } catch (e) { webgl = false; }

  /* =====================================================================
     1. COVER FLOW
     ===================================================================== */
  let focused = 0;
  function createCoverFlow() {
    const canvas = $('flow');
    const renderer = makeRenderer(canvas);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
    camera.position.set(0, 0.15, 6.4);
    camera.lookAt(0, -0.35, 0);
    const group = new THREE.Group();
    scene.add(group);

    const fade = document.createElement('canvas');
    fade.width = 4; fade.height = 128;
    const fg = fade.getContext('2d');
    const grad = fg.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0, '#000');
    grad.addColorStop(0.55, '#000');
    grad.addColorStop(1, '#fff');
    fg.fillStyle = grad;
    fg.fillRect(0, 0, 4, 128);
    const fadeTex = new THREE.CanvasTexture(fade);

    const plane = new THREE.PlaneGeometry(2, 2);
    const covers = ALBUMS.map((a, i) => {
      const tex = new THREE.CanvasTexture(coverCanvases[i]);
      tex.encoding = THREE.sRGBEncoding;
      tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
      const holder = new THREE.Group();
      const front = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
      front.userData.index = i;
      const refl = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({
        map: tex, alphaMap: fadeTex, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false,
      }));
      refl.scale.y = -1;
      refl.position.y = -2.03;
      holder.add(front, refl);
      group.add(holder);
      return { holder, front };
    });

    const flow = { cur: 0, target: 0 };
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let drag = null;

    function layout(d) {
      const a = Math.abs(d), sg = Math.sign(d), near = Math.min(a, 1), far = Math.max(a - 1, 0);
      return { x: sg * (near * 1.5 + far * 0.6), z: -near * 1.2 - far * 0.12, ry: sg * near * 0.95 };
    }

    function pick(ev) {
      const r = canvas.getBoundingClientRect();
      ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObjects(covers.map((c) => c.front))[0];
      return hit ? hit.object.userData.index : -1;
    }

    canvas.addEventListener('pointerdown', (ev) => {
      drag = { x: ev.clientX, start: flow.target, moved: false, id: ev.pointerId };
      canvas.setPointerCapture(ev.pointerId);
    });
    canvas.addEventListener('pointermove', (ev) => {
      if (!drag) return;
      const dx = ev.clientX - drag.x;
      if (Math.abs(dx) > 5) drag.moved = true;
      flow.target = clamp(drag.start - dx / Math.max(110, canvas.clientWidth * 0.11), 0, ALBUMS.length - 1);
    });
    const end = (ev) => {
      if (!drag) return;
      const moved = drag.moved;
      drag = null;
      if (!moved && ev.type === 'pointerup') {
        const i = pick(ev);
        if (i >= 0) {
          if (i === focused) togglePlayFocused();
          else setFocus(i);
          return;
        }
      }
      setFocus(Math.round(flow.target));
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('wheel', (ev) => {
      if (Math.abs(ev.deltaX) <= Math.abs(ev.deltaY)) return;
      ev.preventDefault();
      flow.target = clamp(flow.target + ev.deltaX / 160, 0, ALBUMS.length - 1);
      clearTimeout(flow.snap);
      flow.snap = setTimeout(() => setFocus(Math.round(flow.target)), 140);
    }, { passive: false });
    canvas.addEventListener('keydown', (ev) => {
      if (ev.key === 'ArrowRight') { setFocus(focused + 1); ev.preventDefault(); }
      else if (ev.key === 'ArrowLeft') { setFocus(focused - 1); ev.preventDefault(); }
      else if (ev.key === 'Enter' || ev.key === ' ') { togglePlayFocused(); ev.preventDefault(); }
    });

    return {
      canvas,
      setTarget(i) { flow.target = i; },
      resize() {
        const w = canvas.clientWidth, h = canvas.clientHeight;
        if (!w || !h) return;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        const halfW = Math.tan(THREE.MathUtils.degToRad(16)) * 6.4 * camera.aspect;
        group.scale.setScalar(Math.min(1, halfW / 2.3));
      },
      render(dt, time) {
        flow.cur += (flow.target - flow.cur) * (reduceMotion ? 1 : damp(dt, 9));
        const lvl = engine.playing && engine.albumIndex === focused ? bassPulse() : 0;
        covers.forEach((c, i) => {
          const L = layout(i - flow.cur);
          c.holder.position.set(L.x, 0, L.z);
          c.holder.rotation.y = L.ry;
          const centre = 1 - Math.min(Math.abs(i - flow.cur), 1);
          const s = 1 + centre * lvl * 0.07;
          c.holder.scale.setScalar(s);
          c.holder.position.y = centre * (reduceMotion ? 0 : Math.sin(time * 1.4) * 0.03);
        });
        renderer.render(scene, camera);
      },
    };
  }

  /* bass energy from the master analyser (0..1) */
  let freqBuf = null;
  function bassPulse() {
    if (!engine.analyser) return 0;
    if (!freqBuf) freqBuf = new Uint8Array(engine.analyser.frequencyBinCount);
    engine.analyser.getByteFrequencyData(freqBuf);
    let s = 0;
    for (let i = 1; i < 8; i++) s += freqBuf[i];
    return clamp((s / 7 / 255 - 0.35) * 1.8, 0, 1);
  }

  /* =====================================================================
     2. SPATIAL AUDIO STAGE
     ===================================================================== */
  const ORBS = {
    drums:  { label: 'Drum',   color: '#ff9f0a', angle: 0.45 },
    bass:   { label: 'Bass',   color: '#30d158', angle: -0.6 },
    chords: { label: 'Akor',   color: '#64d2ff', angle: -1.9 },
    lead:   { label: 'Melodi', color: '#ff375f', angle: 1.75 },
  };
  const ORB_R = 2.2;
  for (const name of INSTRUMENTS) {
    const o = ORBS[name];
    o.x = Math.sin(o.angle) * ORB_R;
    o.z = -Math.cos(o.angle) * ORB_R;
    engine.setPosition(name, o.x, o.z);
  }

  function createSpatial() {
    const canvas = $('spatial-canvas');
    const renderer = makeRenderer(canvas);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 60);
    camera.position.set(0, 5.6, 5.4);
    camera.lookAt(0, 0, -0.25);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x302840, 0.9));
    const key = new THREE.DirectionalLight(0xffffff, 0.9);
    key.position.set(2, 6, 3);
    scene.add(key);

    // floor rings + spokes
    const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.1 });
    for (const r of [1, 2, 3]) {
      const pts = [];
      for (let i = 0; i <= 96; i++) { const a = (i / 96) * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r)); }
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat));
    }
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(Math.cos(a) * 0.8, 0, Math.sin(a) * 0.8), new THREE.Vector3(Math.cos(a) * 3.2, 0, Math.sin(a) * 3.2),
      ]), lineMat));
    }
    // front marker
    const arrow = new THREE.Mesh(
      new THREE.ConeGeometry(0.12, 0.3, 3).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 })
    );
    arrow.position.set(0, 0, -3.45);
    scene.add(arrow);

    // listener: head + headphones
    const head = new THREE.Group();
    head.position.y = 0.5;
    scene.add(head);
    head.add(new THREE.Mesh(new THREE.SphereGeometry(0.46, 48, 32), new THREE.MeshStandardMaterial({ color: 0xe9e9ee, roughness: 0.45 })));
    const hp = new THREE.MeshStandardMaterial({ color: 0xfa2d48, roughness: 0.35, metalness: 0.2 });
    head.add(new THREE.Mesh(new THREE.TorusGeometry(0.53, 0.04, 12, 48, Math.PI), hp));
    for (const s of [-1, 1]) {
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.13, 32).rotateZ(Math.PI / 2), hp);
      cup.position.x = s * 0.53;
      head.add(cup);
    }
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 12), new THREE.MeshStandardMaterial({ color: 0xd8d8de }));
    nose.position.set(0, -0.02, -0.46);
    head.add(nose);

    // glow sprite texture
    const gc = document.createElement('canvas');
    gc.width = gc.height = 128;
    const gg = gc.getContext('2d');
    const rg = gg.createRadialGradient(64, 64, 0, 64, 64, 64);
    rg.addColorStop(0, 'rgba(255,255,255,1)');
    rg.addColorStop(0.25, 'rgba(255,255,255,0.45)');
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    gg.fillStyle = rg;
    gg.fillRect(0, 0, 128, 128);
    const glowTex = new THREE.CanvasTexture(gc);

    const labelsEl = $('orb-labels');
    const frontLabel = document.createElement('span');
    frontLabel.className = 'orb-label front';
    frontLabel.textContent = 'Depan';
    labelsEl.appendChild(frontLabel);

    const orbs = INSTRUMENTS.map((name) => {
      const o = ORBS[name];
      const col = new THREE.Color(o.color);
      const g = new THREE.Group();
      g.position.set(o.x, 0, o.z);
      scene.add(g);
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.2, 32, 20), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.7, roughness: 0.3 }));
      ball.position.y = 0.55;
      g.add(ball);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: col, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
      glow.position.y = 0.55;
      glow.scale.setScalar(1.1);
      g.add(glow);
      const stem = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.55, 0)]),
        new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.5 })
      );
      g.add(stem);
      const dot = new THREE.Mesh(new THREE.CircleGeometry(0.16, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.35 }));
      dot.position.y = 0.01;
      g.add(dot);
      const hit = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 8), new THREE.MeshBasicMaterial({ visible: false }));
      hit.position.y = 0.45;
      hit.userData.name = name;
      g.add(hit);
      const label = document.createElement('span');
      label.className = 'orb-label';
      label.innerHTML = '<b style="background:' + o.color + '"></b>' + o.label;
      labelsEl.appendChild(label);
      return { name, g, ball, glow, hit, label, level: 0 };
    });

    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hitPt = new THREE.Vector3();
    let dragging = null;
    let orbit = false;

    function setRay(ev) {
      const r = canvas.getBoundingClientRect();
      ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
    }
    function orbAt(ev) {
      setRay(ev);
      const h = ray.intersectObjects(orbs.map((o) => o.hit))[0];
      return h ? orbs.find((o) => o.name === h.object.userData.name) : null;
    }
    function moveOrb(o, x, z) {
      const r = Math.hypot(x, z);
      const rr = clamp(r, 0.85, 3.2);
      x = r ? (x / r) * rr : 0; z = r ? (z / r) * rr : -rr;
      o.g.position.set(x, 0, z);
      ORBS[o.name].x = x; ORBS[o.name].z = z;
      ORBS[o.name].angle = Math.atan2(x, -z);
      engine.setPosition(o.name, x, z);
    }

    canvas.addEventListener('touchstart', (ev) => {
      const t = ev.touches[0];
      if (t && orbAt(t)) ev.preventDefault();
    }, { passive: false });
    canvas.addEventListener('touchmove', (ev) => { if (dragging) ev.preventDefault(); }, { passive: false });
    canvas.addEventListener('pointerdown', (ev) => {
      const o = orbAt(ev);
      if (!o) return;
      dragging = o;
      canvas.setPointerCapture(ev.pointerId);
      canvas.style.cursor = 'grabbing';
      engine.ensure();
    });
    canvas.addEventListener('pointermove', (ev) => {
      if (dragging) {
        setRay(ev);
        if (ray.ray.intersectPlane(floor, hitPt)) moveOrb(dragging, hitPt.x, hitPt.z);
      } else {
        canvas.style.cursor = orbAt(ev) ? 'grab' : 'default';
      }
    });
    const release = () => { dragging = null; canvas.style.cursor = 'default'; };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);

    const v = new THREE.Vector3();
    function place(el, obj, yOff) {
      v.setFromMatrixPosition(obj.matrixWorld);
      v.y += yOff;
      v.project(camera);
      el.style.transform = 'translate(' + ((v.x + 1) / 2 * canvas.clientWidth).toFixed(1) + 'px,' + ((1 - v.y) / 2 * canvas.clientHeight).toFixed(1) + 'px) translate(-50%, 0)';
    }

    return {
      canvas,
      setOrbit(on) { orbit = on; },
      resize() {
        const w = canvas.clientWidth, h = canvas.clientHeight;
        if (!w || !h) return;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.position.set(0, 5.6, 5.4).multiplyScalar(camera.aspect < 1.1 ? 1.1 / Math.pow(camera.aspect, 0.5) : 1);
        camera.lookAt(0, 0, -0.25);
        camera.updateProjectionMatrix();
      },
      render(dt, time) {
        if (orbit && !reduceMotion) {
          for (const o of orbs) {
            if (o === dragging) continue;
            const a = ORBS[o.name].angle + dt * 0.45;
            const r = Math.hypot(ORBS[o.name].x, ORBS[o.name].z);
            moveOrb(o, Math.sin(a) * r, -Math.cos(a) * r);
          }
        }
        for (const o of orbs) {
          const lv = clamp(engine.level(o.name) * 5, 0, 1);
          o.level += (lv - o.level) * damp(dt, 14);
          const bob = reduceMotion ? 0 : Math.sin(time * 1.6 + ORBS[o.name].angle * 2) * 0.04;
          o.ball.position.y = 0.55 + bob;
          o.glow.position.y = 0.55 + bob;
          o.ball.scale.setScalar(1 + o.level * 0.45);
          o.glow.scale.setScalar(1.0 + o.level * 1.6);
          o.glow.material.opacity = 0.45 + o.level * 0.55;
        }
        head.rotation.y = reduceMotion ? 0 : Math.sin(time * 0.5) * 0.06;
        renderer.render(scene, camera);
        for (const o of orbs) place(o.label, o.ball, 0.32);
        place(frontLabel, arrow, -0.35);
      },
    };
  }

  /* =====================================================================
     3. LOSSLESS SPECTROGRAM TERRAIN
     ===================================================================== */
  function createLossless() {
    const canvas = $('lossless-canvas');
    const renderer = makeRenderer(canvas);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 60);

    const COLS = 128, ROWS = 64;
    const geo = new THREE.PlaneGeometry(12, 8, COLS - 1, ROWS - 1).rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const hist = new Float32Array(COLS * ROWS);

    const points = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.035, vertexColors: true, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    const wire = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      vertexColors: true, wireframe: true, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    scene.add(wire, points);
    wire.position.z = points.position.z = -2.6;

    const stops = [new THREE.Color('#2a1260'), new THREE.Color('#7b2ff7'), new THREE.Color('#fa2d48'), new THREE.Color('#ffb36b'), new THREE.Color('#fff4e6')];
    const tmpC = new THREE.Color();
    function ramp(t) {
      t = clamp(t, 0, 1) * (stops.length - 1);
      const i = Math.min(Math.floor(t), stops.length - 2);
      return tmpC.copy(stops[i]).lerp(stops[i + 1], t - i);
    }

    let fb = null, acc = 0;
    const row = new Float32Array(COLS);
    function sample(time) {
      if (engine.playing && engine.analyser) {
        if (!fb) fb = new Uint8Array(engine.analyser.frequencyBinCount);
        engine.analyser.getByteFrequencyData(fb);
        const minB = 2, maxB = fb.length * 0.55;
        for (let c = 0; c < COLS; c++) {
          const b = Math.floor(minB * Math.pow(maxB / minB, c / (COLS - 1)));
          const v = (fb[b] + fb[b + 1]) / 510;
          row[c] = Math.pow(v, 1.6) * (0.8 + c / COLS * 0.6);
        }
      } else {
        for (let c = 0; c < COLS; c++) {
          const x = c / COLS;
          row[c] = clamp(0.12 + 0.12 * Math.sin(x * 9 + time * 1.3) * Math.sin(time * 0.6 + x * 3) + 0.08 * Math.sin(x * 23 - time * 2.1), 0, 1);
        }
      }
    }

    return {
      canvas,
      resize() {
        const w = canvas.clientWidth, h = canvas.clientHeight;
        if (!w || !h) return;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        const back = camera.aspect < 1 ? 1.5 : 1;
        camera.position.set(0, 3.0 * back, 6.4 * back);
        camera.lookAt(0, 1.6, -2.6);
        camera.updateProjectionMatrix();
      },
      render(dt, time) {
        acc += dt;
        if (acc >= 1 / 40) {
          acc = 0;
          hist.copyWithin(COLS, 0, COLS * (ROWS - 1));
          sample(time);
          hist.set(row, 0);
          for (let r = 0; r < ROWS; r++) {
            const gr = ROWS - 1 - r; // newest row nearest the camera
            const fadeRow = 1 - r / ROWS;
            for (let c = 0; c < COLS; c++) {
              const i = gr * COLS + c;
              const h = hist[r * COLS + c];
              pos.setY(i, h * 1.7);
              const col = ramp(h * 1.3 + 0.08);
              colors[i * 3] = col.r * fadeRow;
              colors[i * 3 + 1] = col.g * fadeRow;
              colors[i * 3 + 2] = col.b * fadeRow;
            }
          }
          pos.needsUpdate = true;
          geo.attributes.color.needsUpdate = true;
        }
        scene.rotation.y = reduceMotion ? 0 : Math.sin(time * 0.15) * 0.08;
        renderer.render(scene, camera);
      },
    };
  }

  /* =====================================================================
     UI wiring
     ===================================================================== */
  let flowScene = null, spatialScene = null;

  function setFocus(i) {
    focused = clamp(i, 0, ALBUMS.length - 1);
    if (flowScene) flowScene.setTarget(focused);
    const a = ALBUMS[focused];
    $('flow-title').textContent = a.title;
    $('flow-artist').textContent = a.artist;
    $('flow-genre').textContent = a.genre;
    root.style.setProperty('--c1', a.colors[0]);
    root.style.setProperty('--c2', a.colors[1]);
    root.style.setProperty('--c3', a.colors[2]);
    syncButtons();
  }
  function togglePlayFocused() { engine.toggle(focused); }

  function syncButtons() {
    const a = engine.album;
    const flowPlaying = engine.playing && engine.albumIndex === focused;
    $('flow-play').classList.toggle('is-playing', flowPlaying);
    $('flow-play').querySelector('span').textContent = flowPlaying ? 'Jeda' : 'Putar';
    $('pl-play').classList.toggle('is-playing', engine.playing);
    $('pl-play').setAttribute('aria-label', engine.playing ? 'Jeda' : 'Putar');
    $('player-title').textContent = a.title;
    $('player-artist').textContent = a.artist + ' · ' + a.genre;
    $('player-art').src = coverURLs[engine.albumIndex];
    $('player-art').alt = 'Sampul ' + a.title;
    $('pl-total').textContent = fmt(engine.loopSeconds);
    $('lyrics-now').textContent = a.title + ' · ' + a.artist;
    $('spatial-play').hidden = engine.playing;
    buildLyrics();
  }
  function fmt(s) { s = Math.floor(s); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }

  let lyricsFor = -1, lyricEls = [], lyricIdx = -1;
  function buildLyrics() {
    if (lyricsFor === engine.albumIndex) return;
    lyricsFor = engine.albumIndex;
    const box = $('lyric-lines');
    box.textContent = '';
    lyricEls = engine.album.lyrics.map((line) => {
      const p = document.createElement('p');
      p.textContent = line;
      box.appendChild(p);
      return p;
    });
    lyricIdx = -1;
  }
  function updateLyrics(step) {
    const idx = engine.playing ? Math.floor(step / 32) % 4 : 0;
    if (idx === lyricIdx) return;
    lyricIdx = idx;
    lyricEls.forEach((p, i) => {
      p.classList.toggle('active', i === idx);
      p.classList.toggle('past', i < idx);
    });
  }

  $('flow-prev').addEventListener('click', () => setFocus(focused - 1));
  $('flow-next').addEventListener('click', () => setFocus(focused + 1));
  $('flow-play').addEventListener('click', togglePlayFocused);
  $('pl-play').addEventListener('click', () => engine.toggle());
  $('pl-prev').addEventListener('click', () => { engine.ensure(); engine.load(engine.albumIndex - 1); setFocus(engine.albumIndex); });
  $('pl-next').addEventListener('click', () => { engine.ensure(); engine.load(engine.albumIndex + 1); setFocus(engine.albumIndex); });
  $('pl-vol').addEventListener('input', (e) => engine.setVolume(parseFloat(e.target.value)));
  $('spatial-play').addEventListener('click', () => engine.play(focused));

  const modeSp = $('mode-spatial'), modeSt = $('mode-stereo');
  function setMode(on) {
    engine.setSpatial(on);
    modeSp.setAttribute('aria-pressed', String(on));
    modeSt.setAttribute('aria-pressed', String(!on));
  }
  modeSp.addEventListener('click', () => setMode(true));
  modeSt.addEventListener('click', () => setMode(false));
  $('orbit-toggle').addEventListener('change', (e) => { if (spatialScene) spatialScene.setOrbit(e.target.checked); });

  document.addEventListener('keydown', (ev) => {
    if (ev.code === 'Space' && ev.target === document.body) { ev.preventDefault(); engine.toggle(); }
  });

  engine.on(syncButtons);

  /* ---------- boot ---------- */
  if (webgl) {
    flowScene = createCoverFlow();
    spatialScene = createSpatial();
    register(flowScene);
    register(spatialScene);
    register(createLossless());
  } else {
    root.classList.add('no-webgl');
  }
  setFocus(0);
  syncButtons();

  let last = performance.now();
  const t0 = last;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const time = (now - t0) / 1000;
    for (const s of scenes) if (s.visible) s.render(dt, time);

    const step = engine.currentStep();
    const prog = engine.playing || step ? step / 128 : 0;
    $('pl-bar').style.width = (prog * 100).toFixed(2) + '%';
    $('pl-time').textContent = fmt(prog * engine.loopSeconds);
    updateLyrics(step);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
