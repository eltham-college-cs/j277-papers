/* Logic circuit builder: AND, OR and NOT gates on an SVG canvas with fixed inputs and one output.
   State: { gates:[{id,type,x,y}], wires:[{from, to, pin}] }  (from = input name or gate id; to = gate id or output name) */
(() => {
  "use strict";
  const NS = "http://www.w3.org/2000/svg";
  const W = 760, H = 360, GW = 70, GH = 50, NAVY = "#0A1B2E", GOLD = "#C89B3C", ON = "#1F7A4D", RED = "#B3261E";
  const PINS = { AND: 2, OR: 2, NOT: 1 };
  const SHAPES = {
    AND: `<path d="M0,14 H10 M0,36 H10 M55,25 H70" fill="none"/><path d="M10,5 H35 A20,20 0 0 1 35,45 H10 Z"/>`,
    OR: `<path d="M0,14 H13 M0,36 H13 M56,25 H70" fill="none"/><path d="M8,5 Q22,25 8,45 Q38,45 56,25 Q38,5 8,5 Z"/>`,
    NOT: `<path d="M0,25 H12 M58,25 H70" fill="none"/><path d="M12,7 L48,25 L12,43 Z"/><circle cx="53" cy="25" r="5"/>`,
  };
  const empty = () => ({ gates: [], wires: [] });
  const clean = (s) => (s && Array.isArray(s.gates) && Array.isArray(s.wires) ? s : empty());

  /* ---------- pure logic (no DOM) ---------- */
  const gateOf = (st, id) => st.gates.find((g) => g.id === id);
  const feed = (st, to, pin) => { const w = st.wires.find((x) => x.to === to && x.pin === pin); return w ? w.from : null; };
  function value(st, cfg, src, vals, seen = []) {
    if (src == null) return null;
    if (cfg.inputs.includes(src)) return vals[src] ? 1 : 0;
    const g = gateOf(st, src);
    if (!g || seen.includes(src)) return null;
    const ins = []; for (let p = 0; p < PINS[g.type]; p++) ins.push(value(st, cfg, feed(st, g.id, p), vals, [...seen, src]));
    if (ins.includes(null)) return null;
    return g.type === "AND" ? ins[0] & ins[1] : g.type === "OR" ? ins[0] | ins[1] : 1 - ins[0];
  }
  function expr(st, cfg, src, seen = [], top = true) {
    if (src == null) return "?";
    if (cfg.inputs.includes(src)) return src;
    const g = gateOf(st, src);
    if (!g || seen.includes(src)) return "?";
    const sub = (p) => expr(st, cfg, feed(st, g.id, p), [...seen, src], false);
    const s = g.type === "NOT" ? `NOT ${sub(0)}` : `${sub(0)} ${g.type} ${sub(1)}`;
    return top ? s : `(${s})`;
  }
  function analyse(state, cfg) {
    const st = clean(state), n = cfg.inputs.length, out = feed(st, cfg.output, 0);
    const reach = new Set();
    (function walk(src) { const g = gateOf(st, src); if (!g || reach.has(src)) return; reach.add(src); for (let p = 0; p < PINS[g.type]; p++) walk(feed(st, g.id, p)); })(out);
    let table = [];
    for (let i = 0; i < 1 << n; i++) { const vals = {}; cfg.inputs.forEach((nm, j) => { vals[nm] = (i >> (n - 1 - j)) & 1; }); table.push(value(st, cfg, out, vals)); }
    if (table.includes(null)) table = null;
    return {
      connected: out != null, table, unused: st.gates.length - reach.size,
      gates: st.gates.map((g) => ({ id: g.id, type: g.type, ins: Array.from({ length: PINS[g.type] }, (_, p) => feed(st, g.id, p)) })),
      expr: out == null ? null : `${cfg.output} = ${expr(st, cfg, out)}`,
    };
  }

  /* ---------- widget ---------- */
  function LogicBuilder(host, opts) {
    const cfg = { inputs: opts.inputs, output: opts.output };
    let st = JSON.parse(JSON.stringify(clean(opts.state)));
    let sel = null, pending = null, drag = null;
    const test = {}; cfg.inputs.forEach((n) => { test[n] = 0; });

    host.classList.add("lb");
    host.innerHTML = `<div class="lbtools"><span class="lblab">Add a gate</span>${Object.keys(PINS).map((t) => `<button type="button" class="lbadd" data-add="${t}"><svg viewBox="-2 0 74 50" aria-hidden="true"><g fill="#fff" stroke="${NAVY}" stroke-width="2.2">${SHAPES[t]}</g></svg>${t}</button>`).join("")}<span class="grow"></span><button type="button" class="lbbtn" data-act="del">Delete selected</button><button type="button" class="lbbtn" data-act="clear">Clear</button></div>
<svg class="lbsvg" viewBox="0 0 ${W} ${H}" tabindex="0" role="application" aria-label="Logic circuit drawing area"></svg>
<p class="lbhint" role="status"></p>
<div class="lbtest"><span class="lblab">Test your circuit</span><span class="lbsw"></span><span class="lbout"></span><span class="lbkey">Green wire = 1</span></div>`;
    const svg = host.querySelector("svg.lbsvg"), hint = host.querySelector(".lbhint"), sw = host.querySelector(".lbsw"), outEl = host.querySelector(".lbout");
    const HINT = "Drag from the dot on the right of an input or gate to a dot on the left of a gate, or to P. You can also tap one dot, then the other. Drag gates to move them.";

    const iy = (i) => Math.round((H * (i + 1)) / (cfg.inputs.length + 1));
    const srcPos = (src) => { const i = cfg.inputs.indexOf(src); if (i >= 0) return { x: 66, y: iy(i) }; const g = gateOf(st, src); return g ? { x: g.x + GW, y: g.y + 25 } : null; };
    const dstPos = (to, pin) => { if (to === cfg.output) return { x: W - 66, y: H / 2 }; const g = gateOf(st, to); return g ? { x: g.x, y: g.y + (g.type === "NOT" ? 25 : pin ? 36 : 14) } : null; };
    const wirePath = (a, b) => { const dx = Math.max(30, Math.abs(b.x - a.x) / 2); return `M${a.x},${a.y} C${a.x + dx},${a.y} ${b.x - dx},${b.y} ${b.x},${b.y}`; };
    const allDst = () => [...st.gates.flatMap((g) => Array.from({ length: PINS[g.type] }, (_, p) => ({ to: g.id, pin: p }))), { to: cfg.output, pin: 0 }];

    function markup(live) {
      let h = `<rect x="50" y="6" width="${W - 100}" height="${H - 12}" rx="6" fill="#FBFCFD" stroke="#B9C3CF" stroke-width="1.5"/>`;
      const label = (x, y, t) => `<text x="${x}" y="${y + 6}" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" font-weight="700" fill="${NAVY}">${t}</text>`;
      cfg.inputs.forEach((n, i) => { h += label(26, iy(i), n) + `<path d="M50,${iy(i)} H66" stroke="${NAVY}" stroke-width="2"/>`; });
      h += label(W - 26, H / 2, cfg.output) + `<path d="M${W - 66},${H / 2} H${W - 50}" stroke="${NAVY}" stroke-width="2"/>`;
      st.wires.forEach((w, i) => {
        const a = srcPos(w.from), b = dstPos(w.to, w.pin); if (!a || !b) return;
        const on = live && value(st, cfg, w.from, test) === 1, picked = live && sel && sel.wire === i;
        h += `<path d="${wirePath(a, b)}" fill="none" stroke="${picked ? RED : on ? ON : NAVY}" stroke-width="${picked ? 3.5 : 2.2}"/>`;
        if (live) h += `<path d="${wirePath(a, b)}" fill="none" stroke="transparent" stroke-width="16" data-role="wire" data-i="${i}" style="cursor:pointer"/>`;
      });
      for (const g of st.gates) {
        const picked = live && sel && sel.gate === g.id;
        h += `<g transform="translate(${g.x},${g.y})"><g fill="#ffffff" stroke="${NAVY}" stroke-width="2">${SHAPES[g.type]}</g><text x="${g.type === "NOT" ? 26 : 30}" y="29" text-anchor="middle" font-family="Arial, sans-serif" font-size="${g.type === "NOT" ? 9 : 11}" font-weight="700" fill="${NAVY}">${g.type}</text>`;
        if (picked) h += `<rect x="-4" y="-3" width="${GW + 8}" height="${GH + 6}" rx="6" fill="none" stroke="${RED}" stroke-width="1.5" stroke-dasharray="5 4"/>`;
        if (live) h += `<rect x="8" y="0" width="${GW - 20}" height="${GH}" fill="transparent" data-role="gate" data-id="${g.id}" style="cursor:move"/>`;
        h += `</g>`;
      }
      if (!live) return h;
      if (drag && drag.type === "wire" && drag.moved) h += `<path d="${wirePath(srcPos(drag.src), drag.cur)}" fill="none" stroke="${GOLD}" stroke-width="2.5" stroke-dasharray="6 4"/>`;
      for (const s of [...cfg.inputs, ...st.gates.map((g) => g.id)]) {
        const p = srcPos(s), hot = pending === s || (drag && drag.src === s);
        h += `<circle cx="${p.x}" cy="${p.y}" r="${hot ? 8 : 6}" fill="${hot ? GOLD : NAVY}" stroke="#ffffff" stroke-width="1.5"/><circle cx="${p.x}" cy="${p.y}" r="14" fill="transparent" data-role="out" data-src="${s}" style="cursor:crosshair"/>`;
      }
      for (const d of allDst()) {
        const p = dstPos(d.to, d.pin), armed = pending || (drag && drag.type === "wire");
        h += `<circle cx="${p.x}" cy="${p.y}" r="6" fill="#ffffff" stroke="${armed ? GOLD : NAVY}" stroke-width="${armed ? 3 : 2}"/><circle cx="${p.x}" cy="${p.y}" r="14" fill="transparent" data-role="in" data-to="${d.to}" data-pin="${d.pin}" style="cursor:pointer"/>`;
      }
      return h;
    }
    function render() {
      svg.innerHTML = markup(true);
      sw.innerHTML = cfg.inputs.map((n) => `<button type="button" class="lbtog${test[n] ? " on" : ""}" data-tog="${n}" aria-pressed="${!!test[n]}">${n} = ${test[n]}</button>`).join("");
      const v = value(st, cfg, feed(st, cfg.output, 0), test);
      outEl.textContent = `${cfg.output} = ${v == null ? "? (circuit not complete)" : v}`;
      outEl.classList.toggle("on", v === 1);
    }
    const say = (t) => { hint.textContent = t || HINT; };
    const changed = () => { if (opts.onChange) opts.onChange(JSON.parse(JSON.stringify(st))); };

    function connect(src, to, pin) {
      if (src === to) return say("A gate cannot be wired to itself.");
      try { (function up(s, seen) { if (s == null) return; if (s === to) throw new Error("loop"); const g = gateOf(st, s); if (!g || seen.has(s)) return; seen.add(s); for (let p = 0; p < PINS[g.type]; p++) up(feed(st, g.id, p), seen); })(src, new Set()); }
      catch { return say("That wire would make a loop, so it was not added."); }
      st.wires = st.wires.filter((w) => !(w.to === to && w.pin === pin));
      st.wires.push({ from: src, to, pin }); sel = null; say(); changed();
    }
    function remove() {
      if (!sel) return say("Tap a gate or a wire to select it first.");
      if (sel.gate) { st.gates = st.gates.filter((g) => g.id !== sel.gate); st.wires = st.wires.filter((w) => w.from !== sel.gate && w.to !== sel.gate); }
      else st.wires.splice(sel.wire, 1);
      sel = null; say(); changed(); render();
    }
    function add(type) {
      const n = st.gates.length, id = "g" + (Math.max(0, ...st.gates.map((g) => +g.id.slice(1) || 0)) + 1);
      st.gates.push({ id, type, x: 190 + (n % 4) * 110, y: 30 + ((n * 2) % 5) * 58 });
      sel = { gate: id }; say(); changed(); render();
    }
    const pt = (e) => { const m = svg.getScreenCTM(); return { x: (e.clientX - m.e) / m.a, y: (e.clientY - m.f) / m.d }; };

    svg.addEventListener("pointerdown", (e) => {
      const t = e.target.closest("[data-role]"), p = pt(e), role = t && t.dataset.role;
      if (role === "out") { drag = { type: "wire", src: t.dataset.src, start: p, cur: p, moved: false }; svg.setPointerCapture(e.pointerId); }
      else if (role === "in") {
        if (pending) { connect(pending, t.dataset.to, +t.dataset.pin); pending = null; }
        else { const i = st.wires.findIndex((w) => w.to === t.dataset.to && w.pin === +t.dataset.pin); sel = i >= 0 ? { wire: i } : null; if (i < 0) say("Start a wire from a dot on the right of an input or gate."); }
      }
      else if (role === "gate") { const g = gateOf(st, t.dataset.id); pending = null; sel = { gate: g.id }; drag = { type: "gate", id: g.id, dx: p.x - g.x, dy: p.y - g.y, moved: false }; svg.setPointerCapture(e.pointerId); }
      else if (role === "wire") { pending = null; sel = { wire: +t.dataset.i }; }
      else { sel = null; pending = null; say(); }
      e.preventDefault(); svg.focus({ preventScroll: true }); render();
    });
    svg.addEventListener("pointermove", (e) => {
      if (!drag) return;
      const p = pt(e);
      if (drag.type === "wire") { drag.cur = p; if (Math.hypot(p.x - drag.start.x, p.y - drag.start.y) > 6) drag.moved = true; }
      else { const g = gateOf(st, drag.id); g.x = Math.round(Math.min(W - 90 - GW, Math.max(80, p.x - drag.dx))); g.y = Math.round(Math.min(H - 10 - GH, Math.max(10, p.y - drag.dy))); drag.moved = true; }
      render();
    });
    const finish = (e) => {
      if (!drag) return;
      const d = drag; drag = null;
      if (d.type === "wire") {
        if (!d.moved) { pending = pending === d.src ? null : d.src; say(pending ? "Now tap a dot on the left of a gate, or the dot next to " + cfg.output + "." : ""); }
        else {
          const p = pt(e); let best = null, bd = 26;
          for (const x of allDst()) { const q = dstPos(x.to, x.pin), dist = Math.hypot(q.x - p.x, q.y - p.y); if (dist < bd) { bd = dist; best = x; } }
          pending = null; if (best) connect(d.src, best.to, best.pin); else say("Drop the wire on a dot on the left of a gate, or the dot next to " + cfg.output + ".");
        }
      } else if (d.moved) changed();
      render();
    };
    svg.addEventListener("pointerup", finish); svg.addEventListener("pointercancel", finish);
    svg.addEventListener("keydown", (e) => { if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); remove(); } });
    host.addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.add) add(b.dataset.add);
      else if (b.dataset.act === "del") remove();
      else if (b.dataset.act === "clear") { if (st.gates.length || st.wires.length) { st = empty(); sel = pending = null; say(); changed(); render(); } }
      else if (b.dataset.tog) { test[b.dataset.tog] ^= 1; render(); }
    });
    say(); render();

    return {
      getState: () => JSON.parse(JSON.stringify(st)),
      setState: (s) => { st = JSON.parse(JSON.stringify(clean(s))); sel = pending = drag = null; render(); },
      analyse: () => analyse(st, cfg),
      exportSvg: () => { const s = document.createElementNS(NS, "svg"); s.setAttribute("viewBox", `0 0 ${W} ${H}`); s.innerHTML = markup(false); return s; },
    };
  }
  LogicBuilder.analyse = analyse;
  window.LogicBuilder = LogicBuilder;
})();
