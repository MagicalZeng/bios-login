// Each strip twists around a moving spline. Its fine contour lines share the
// same surface as the glints, so the highlights travel with the folds.
const strips = [
  { offset: -.21, phase: 1.85, roll: 2.4, width: .24, light: .57, tint: [175,196,215] },
  { offset: .13, phase: -.64, roll: -.87, width: .21, light: .66, tint: [188,210,219] },
  { offset: .01, phase: .31, roll: .90, width: .29, light: 1, tint: [221,232,240] }
];
const steps = 100;
const fibers = 66;

function spine(strip, time, width, height) {
  const points = [];
  const drift = Math.sin(time * .19 + strip.phase) * .25;
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    const arch = Math.sin(Math.PI * u);
    const wave = u * 8.6 + strip.phase + drift;
    const turn = u * 8.4 + strip.roll - .4 * Math.sin(time * .16);
    const taper = .40 + .60 * arch;
    points.push({
      x: width * (-.10 + u * 1.20),
      y: height * (.50 + strip.offset + .125 * Math.sin(wave) + .079 * Math.sin(u * 13.3 + strip.phase * 2 + drift)),
      side: width * .073 * Math.cos(turn) * taper,
      lift: height * strip.width * Math.sin(turn) * taper,
      fold: height * strip.width * .56 * Math.cos(turn) * taper,
      ripple: Math.sin(u * 26 + drift * 3 + strip.roll) * height * .008
    });
  }
  return points;
}

function thread(points, v) {
  const ridge = 1 - v * v;
  return points.map(p => [
    p.x + p.side * v,
    p.y + p.lift * v + p.fold * ridge + p.ripple * ridge * Math.sin(v * 10)
  ]);
}

function filament(ctx, line) {
  ctx.beginPath();
  ctx.moveTo(...line[0]);
  for (let i = 1; i < line.length; i++) ctx.lineTo(...line[i]);
  ctx.stroke();
}

function paint(canvas, time) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const width = canvas.clientWidth, height = canvas.clientHeight;
  if (!width || !height) return;
  const scale = Math.min(window.devicePixelRatio || 1, 1.75);
  if (canvas.width !== Math.round(width * scale) || canvas.height !== Math.round(height * scale)) {
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
  }
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.clearRect(0, 0, width, height);
  for (const strip of strips) {
    const spinePoints = spine(strip, time, width, height);
    const color = strip.tint.join(",");
    const sheen = ctx.createLinearGradient(0, 0, width, height * .12);
    for (const [at, opacity] of [[0,.08],[.17,.46],[.34,.92],[.50,.50],[.69,1],[.85,.53],[1,.08]]) {
      sheen.addColorStop(at, "rgba(" + color + "," + opacity * strip.light + ")");
    }
    ctx.strokeStyle = sheen;
    const upper = thread(spinePoints, -1), lower = thread(spinePoints, 1);
    ctx.beginPath();
    ctx.moveTo(...upper[0]);
    for (const point of upper) ctx.lineTo(...point);
    for (let i = lower.length - 1; i >= 0; i--) ctx.lineTo(...lower[i]);
    ctx.closePath();
    ctx.fillStyle = "rgba(" + color + "," + .052 * strip.light + ")";
    ctx.fill();
    for (let i = 0; i <= fibers; i++) {
      const v = i / fibers * 2 - 1;
      const crease = Math.pow((1 + Math.cos(v * 9.6 + strip.roll)) / 2, 7);
      const rim = Math.pow(Math.abs(v), 8);
      ctx.globalAlpha = .20 + .30 * crease + .42 * rim;
      ctx.lineWidth = .55 + .22 * rim;
      filament(ctx, thread(spinePoints, v));
    }
    ctx.globalAlpha = 1;
    // Sparse points catch the light between fine strands of the mesh.
    for (let i = 0; i < 40; i++) {
      const k = (i * 37 + 13) % steps;
      const v = Math.sin(i * 17.37 + strip.roll);
      const [x, y] = thread([spinePoints[k]], v)[0];
      ctx.fillStyle = "rgba(185,225,243," + (.14 + .32 * Math.pow(Math.sin(i + time * .31), 4)) + ")";
      ctx.beginPath();
      ctx.arc(x, y, .45 + .34 * Math.abs(v), 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

class BiosRibbons extends HTMLElement {
  connectedCallback() {
    if (this.canvas) return;
    this.canvas = document.createElement("canvas");
    this.append(this.canvas);
    this.time = 0;
    this.visible = false;
    this.still = matchMedia("(prefers-reduced-motion: reduce), (prefers-contrast: more), (prefers-reduced-transparency: reduce), (forced-colors: active)");
    this.update = () => {
      clearTimeout(this.next);
      if (!this.isConnected || document.hidden || !this.visible) return;
      paint(this.canvas, this.time);
      if (this.still.matches) return;
      this.next = setTimeout(() => { this.time += .08; this.update(); }, 80);
    };
    this.size = new ResizeObserver(this.update);
    this.size.observe(this);
    this.intersection = new IntersectionObserver(([entry]) => {
      this.visible = entry.isIntersecting;
      this.update();
    });
    this.intersection.observe(this);
    this.still.addEventListener("change", this.update);
    document.addEventListener("visibilitychange", this.update);
  }

  disconnectedCallback() {
    clearTimeout(this.next);
    this.size.disconnect();
    this.intersection.disconnect();
    this.still.removeEventListener("change", this.update);
    document.removeEventListener("visibilitychange", this.update);
    this.canvas.remove();
    this.canvas = null;
  }
}
customElements.define("bios-ribbons", BiosRibbons);
