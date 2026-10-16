// Offline export: renders every frame of index.html in headless Chromium and pipes PNGs into ffmpeg.
//   node render.cjs video [out.mp4] [fps]      -> silent H.264 video
//   node render.cjs stills <dir> t1,t2,...     -> PNG stills at the given times (for review)
// Needs the `playwright` package (npm i -D playwright) and ffmpeg on PATH.
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

(async () => {
  const [mode = 'video', a1, a2] = process.argv.slice(2);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  page.on('pageerror', e => console.error('page error:', e.message));
  await page.goto('file://' + path.join(__dirname, 'index.html') + '?render');
  await page.waitForFunction(() => window.HF_READY === true, null, { timeout: 60000 });
  const duration = await page.evaluate(() => HF.DURATION);
  const frame = t => page.evaluate(x => window.HF_FRAME(x), t).then(b => Buffer.from(b, 'base64'));

  if (mode === 'stills') {
    fs.mkdirSync(a1, { recursive: true });
    for (const t of a2.split(',').map(Number)) {
      fs.writeFileSync(path.join(a1, `t${t.toFixed(2).padStart(5, '0')}.png`), await frame(t));
    }
  } else {
    const out = a1 || 'video-silent.mp4', fps = +(a2 || 60), n = Math.round(duration * fps);
    const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'png', '-i', '-',
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '15', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
    const started = Date.now();
    for (let i = 0; i < n; i++) {
      const buf = await frame(i / fps);
      if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
      if (i % fps === 0) process.stdout.write(`frame ${i}/${n}  ${((Date.now() - started) / 1000).toFixed(0)}s\n`);
    }
    ff.stdin.end();
    await new Promise(r => ff.on('close', r));
    console.log('wrote', out);
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
