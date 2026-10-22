// A minimal 2D-context mock that rasterises fillRect and fillCircle into an
// ImageData-like buffer, so a transport's real render() can be decoded back in
// Node without a browser.

export function mockCanvas(size) {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = data[i + 1] = data[i + 2] = 255;
    data[i + 3] = 255;
  }
  let fill = [0, 0, 0];
  let circle = null;

  const parse = (s) => {
    if (typeof s !== 'string') return [0, 0, 0];
    if (s[0] === '#') {
      if (s.length === 4) {
        return [parseInt(s[1] + s[1], 16), parseInt(s[2] + s[2], 16), parseInt(s[3] + s[3], 16)];
      }
      return [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
    }
    const m = s.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    return m ? [+m[1], +m[2], +m[3]] : [0, 0, 0];
  };
  const put = (px, py) => {
    if (px < 0 || py < 0 || px >= size || py >= size) return;
    const i = (py * size + px) * 4;
    data[i] = fill[0];
    data[i + 1] = fill[1];
    data[i + 2] = fill[2];
    data[i + 3] = 255;
  };

  const ctx = {
    get fillStyle() {
      return fill;
    },
    set fillStyle(v) {
      fill = parse(v);
    },
    fillRect(x, y, w, h) {
      const x0 = Math.max(0, Math.round(x));
      const y0 = Math.max(0, Math.round(y));
      const x1 = Math.min(size, Math.round(x + w));
      const y1 = Math.min(size, Math.round(y + h));
      for (let py = y0; py < y1; py++) for (let px = x0; px < x1; px++) put(px, py);
    },
    beginPath() {
      circle = null;
    },
    arc(cx, cy, r) {
      circle = { cx, cy, r };
    },
    fill() {
      if (!circle) return;
      const { cx, cy, r } = circle;
      const r2 = r * r;
      const x0 = Math.max(0, Math.floor(cx - r));
      const x1 = Math.min(size, Math.ceil(cx + r));
      const y0 = Math.max(0, Math.floor(cy - r));
      const y1 = Math.min(size, Math.ceil(cy + r));
      for (let py = y0; py < y1; py++) {
        for (let px = x0; px < x1; px++) {
          const dx = px + 0.5 - cx;
          const dy = py + 0.5 - cy;
          if (dx * dx + dy * dy <= r2) put(px, py);
        }
      }
      circle = null;
    },
  };

  return { ctx, image: () => ({ data, width: size, height: size }) };
}
