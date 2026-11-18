/* Interactive exam paper engine. Questions and mark scheme arrive encrypted in data.js. */
(() => {
  "use strict";
  const P = window.PAPER, KEY = "exam:" + P.id;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

  /* ---------- state ---------- */
  let S = (() => { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } })();
  if (!S || typeof S !== "object") S = {};
  for (const k of ["answers", "flags", "self", "query", "tests"]) S[k] = S[k] || {};
  let saveT = null;
  const saveNow = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* storage unavailable */ } };
  const save = () => { clearTimeout(saveT); saveT = setTimeout(saveNow, 250); };

  let START = null;      // decrypted paper: {durationMin, extra, html, given}
  let M = null;          // decrypted mark scheme
  const editors = {};    // field -> CodeMirror
  const starters = {};   // field -> starter code
  let parts = [];        // [{id,label,marks,spec,section,el,fields}]

  /* ---------- crypto ---------- */
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const normCode = (c) => String(c).toUpperCase().replace(/\s+/g, "");
  async function unseal(code, box) {
    const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(normCode(code)), "PBKDF2", false, ["deriveKey"]);
    const key = await crypto.subtle.deriveKey({ name: "PBKDF2", salt: unb64(box.s), iterations: P.iter, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(box.i) }, key, unb64(box.c));
    return JSON.parse(new TextDecoder().decode(pt));
  }
  async function openStart(code) {
    for (const box of P.start) { try { return await unseal(code, box); } catch { /* try next */ } }
    return null;
  }

  /* ---------- time ---------- */
  const endsAt = () => S.startedAt + S.durationMin * 60000;
  const hhmm = (t) => new Date(t).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const fmtLeft = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0"); };
  let tick = null;
  function startClock() {
    const t = $("#timer"), bar = $("#bar");
    const step = () => {
      if (S.submittedAt) { clearInterval(tick); return; }
      const left = endsAt() - Date.now();
      t.textContent = fmtLeft(left);
      bar.classList.toggle("warn", left <= 10 * 60000 && left > 5 * 60000);
      bar.classList.toggle("crit", left <= 5 * 60000);
      const used = (Date.now() - S.startedAt) / 60000;
      $("#advice").textContent = S.extra ? "" : used < 50 ? "Section A: about 50 minutes" : "You should now be on Section B";
      if (left <= 0) submit("time");
    };
    step(); tick = setInterval(step, 500);
  }

  /* ---------- fields ---------- */
  function fieldValue(name) {
    if (editors[name]) return editors[name].getValue();
    const els = $$(`[data-field="${name}"]`);
    if (!els.length) return S.answers[name] || "";
    if (els[0].type === "radio") { const c = els.find((e) => e.checked); return c ? c.value : ""; }
    return els[0].value;
  }
  function answered(name) {
    const v = (S.answers[name] ?? "").trim();
    if (!v) return false;
    if (name in starters) return v !== starters[name].trim();
    return true;
  }
  function record(name) {
    if (S.submittedAt) return;                      // locked: nothing is stored after submission
    S.answers[name] = fieldValue(name); save(); refreshNav();
  }
  function restore() {
    for (const e of $$("[data-field]")) {
      const n = e.dataset.field, v = S.answers[n];
      if (e.classList.contains("code")) continue;
      if (e.type === "radio") e.checked = v === e.value; else if (v != null) e.value = v;
    }
  }

  /* ---------- build the paper ---------- */
  function buildPaper() {
    const host = $("#paper"); host.innerHTML = START.html;
    for (const t of $$("table[data-trace]", host)) {
      const p = t.dataset.trace, body = $("tbody", t);
      for (let r = 1; r <= +t.dataset.rows; r++) body.insertAdjacentHTML("beforeend",
        `<tr>${["x", "y", "o"].map((c) => `<td><input class="cell" data-field="${p}_${c}${r}" maxlength="6" aria-label="${c === "o" ? "output" : c} row ${r}"></td>`).join("")}</tr>`);
    }
    parts = $$(".part", host).map((pe) => {
      const id = pe.dataset.part, q = pe.closest("section.q");
      const head = el("div", "phead", `<span class="plabel">${esc(pe.dataset.label)}</span><span class="pmarks">[${pe.dataset.marks}]</span><button type="button" class="flag" aria-pressed="false" title="Flag this question to come back to">⚑ Flag</button>`);
      pe.prepend(head); pe.id = "p-" + id;
      $(".flag", head).addEventListener("click", () => { if (S.submittedAt) return; S.flags[id] = !S.flags[id]; save(); refreshNav(); });
      return { id, label: pe.dataset.label, marks: +pe.dataset.marks, spec: pe.dataset.spec, section: q.id === "q8" ? "B" : "A", el: pe, fields: [...new Set($$("[data-field]", pe).map((e) => e.dataset.field))] };
    });
    for (const box of $$(".code", host)) {
      const n = box.dataset.field, starter = box.dataset.starter || ""; starters[n] = starter;
      if (START.given && START.given[n]) box.insertAdjacentHTML("beforebegin", `<div class="given"><span>Already in your program (read only)</span><pre class="listing">${esc(START.given[n])}</pre></div>`);
      const cm = CodeMirror(box, { value: S.answers[n] ?? starter, mode: "text/x-csharp", lineNumbers: true, indentUnit: 4, tabSize: 4, matchBrackets: true, autoCloseBrackets: true, viewportMargin: Infinity,
        extraKeys: { Tab: (c) => c.somethingSelected() ? c.indentSelection("add") : c.replaceSelection("    ", "end"), "Shift-Tab": (c) => c.indentSelection("subtract") } });
      cm.getWrapperElement().style.minHeight = (+box.dataset.rows || 10) * 1.5 + "em";
      cm.on("change", () => record(n)); editors[n] = cm;
    }
    restore();
    host.addEventListener("input", (e) => { const f = e.target.dataset && e.target.dataset.field; if (f) record(f); });
    host.addEventListener("change", (e) => { const f = e.target.dataset && e.target.dataset.field; if (f) record(f); });
    const nav = $("#navlist"); nav.innerHTML = "";
    for (const p of parts) { const b = el("button", "chip", esc(p.label)); b.type = "button"; b.dataset.part = p.id; b.addEventListener("click", () => { p.el.scrollIntoView({ behavior: "smooth", block: "center" }); }); nav.append(b); }
    refreshNav();
  }
  const partAnswered = (p) => p.fields.some(answered);
  function refreshNav() {
    let done = 0;
    for (const p of parts) {
      const a = partAnswered(p), f = !!S.flags[p.id]; if (a) done++;
      const chip = $(`#navlist [data-part="${p.id}"]`);
      if (chip) { chip.classList.toggle("done", a); chip.classList.toggle("flagged", f); }
      const fb = $(".flag", p.el); if (fb) { fb.classList.toggle("on", f); fb.setAttribute("aria-pressed", f); }
    }
    $("#progress").textContent = `${done} of ${parts.length} answered`;
  }

  /* ---------- submit and lock ---------- */
  function submit(how) {
    if (S.submittedAt) return;
    for (const n of Object.keys(editors)) S.answers[n] = editors[n].getValue();
    for (const p of parts) for (const f of p.fields) if (!editors[f]) S.answers[f] = fieldValue(f);
    S.submittedAt = Math.min(Date.now(), endsAt()); S.how = how; saveNow(); lock();
  }
  function lock() {
    document.body.classList.add("locked"); clearInterval(tick);
    for (const e of $$("#paper input, #paper textarea")) { e.disabled = true; }
    for (const cm of Object.values(editors)) cm.setOption("readOnly", "nocursor");
    $("#timer").textContent = "Submitted"; $("#advice").textContent = ""; $("#finish").hidden = true;
    $("#bar").classList.remove("warn", "crit");
    const mins = Math.round((S.submittedAt - S.startedAt) / 60000);
    $("#subinfo").innerHTML = `Submitted at <b>${hhmm(S.submittedAt)}</b> ${S.how === "time" ? "when the time ran out" : `after ${mins} minute${mins === 1 ? "" : "s"}`}. Your answers are locked and saved on this device.`;
    $("#after").hidden = false; $("#modal").hidden = true;
    if (!M) $("#after").scrollIntoView({ block: "start" });
  }

  /* ---------- marking ---------- */
  const norm = (v) => String(v ?? "").toLowerCase().replace(/\s+/g, "").replace(/;+$/, "");
  const ans = (f) => S.answers[f] ?? "";
  const matches = (v, pats) => { const n = norm(v); return n !== "" && pats.some((p) => new RegExp(p).test(n)); };

  function evalPoint(pid, pt, i) {
    const rows = [];
    if (pt.t === "regex") rows.push({ k: "auto", ok: matches(ans(pt.field), pt.pats), text: pt.text, your: ans(pt.field) });
    else if (pt.t === "choice") rows.push({ k: "auto", ok: pt.values.includes(ans(pt.field)), text: pt.text, your: ans(pt.field) });
    else if (pt.t === "range") { const raw = ans(pt.field).trim(), n = Number(raw); rows.push({ k: "auto", ok: raw !== "" && Number.isFinite(n) && (n < pt.below || n > pt.above), text: pt.text, your: raw }); }
    else if (pt.t === "set") { const seen = new Set(); for (const f of pt.fields) { const n = norm(ans(f)); const ok = matches(ans(f), pt.accept) && !seen.has(n); if (ok) seen.add(n); rows.push({ k: "auto", ok, text: "One of: " + pt.text, your: ans(f) }); } }
    else if (pt.t === "self") { const id = pid + ":" + i; rows.push({ k: "self", id, ok: !!S.self[id], text: pt.text }); }
    else if (pt.t === "trace") {
      const col = (c) => { const o = []; for (let r = 1; r <= pt.rows; r++) { const v = ans(`${pt.prefix}_${c}${r}`).trim(); if (v !== "") o.push(Number(v)); } return o; };
      const xs = col("x"), ys = col("y"), os = col("o");
      const seg = ([a, b]) => { for (let r = a; r < b; r++) if (xs[r] !== pt.x[r] || ys[r] !== pt.y[r]) return false; return true; };
      const names = ["First row: x = 15, y = 0", "Rows 2 and 3 correct", "Rows 4, 5 and 6 correct"];
      pt.groups.forEach((g, gi) => rows.push({ k: "auto", ok: seg(g), text: names[gi] || "Rows correct", your: xs.slice(g[0], g[1]).map((x, j) => `${x}, ${ys[g[0] + j] ?? "?"}`).join(" | ") }));
      rows.push({ k: "auto", ok: os.length === pt.out.length && os.every((v, j) => v === pt.out[j]), text: `Output: ${pt.out.join(", ")} (the only value in the output column)`, your: os.join(", ") });
    } else if (pt.t === "testpair") {
      const cls = (raw) => { let v = raw.trim(); if (!v) return null; let len;
        if (/^(""|''|“”|\(?\s*(an? )?(empty|blank|nothing|no input|just press enter)\b.*)$/i.test(v)) len = 0; else { v = v.replace(/^["'“‘](.*)["'”’]$/, "$1"); len = v.length; }
        return len >= pt.min && len <= pt.max ? "valid" : "invalid"; };
      const outOk = (c, raw) => { const n = raw.toLowerCase().replace(/[^a-z]/g, ""); return c === "valid" ? new RegExp(pt.validOut).test(n) : c === "invalid" ? new RegExp(pt.invalidOut).test(n) : false; };
      const c1 = cls(ans(pt.d[0])), c2 = cls(ans(pt.d[1]));
      rows.push({ k: "auto", ok: !!c1, text: "Test data 1 tests one branch" + (c1 ? ` (${c1} name)` : ""), your: ans(pt.d[0]) });
      rows.push({ k: "auto", ok: outOk(c1, ans(pt.o[0])), text: "Correct output for test data 1", your: ans(pt.o[0]) });
      rows.push({ k: "auto", ok: !!c2 && !!c1 && c2 !== c1, text: "Test data 2 tests the other branch" + (c2 ? ` (${c2} name)` : ""), your: ans(pt.d[1]) });
      rows.push({ k: "auto", ok: outOk(c2, ans(pt.o[1])), text: "Correct output for test data 2", your: ans(pt.o[1]) });
    } else if (pt.t === "code") {
      const T = S.tests[pt.field], pass = !!(T && T.done && T.allOk);
      pt.bullets.forEach((b, j) => { const id = pid + ":" + i + ":" + j; rows.push(pass ? { k: "auto", ok: true, text: b } : { k: "self", id, ok: !!S.self[id], text: b }); });
      rows.code = { pt, T, pass };
    }
    return rows;
  }
  function evalPart(p) {
    const def = M.parts[p.id]; let rows = [], code = null;
    def.points.forEach((pt, i) => { const r = evalPoint(p.id, pt, i); if (r.code) code = r.code; rows = rows.concat(r); });
    const raw = rows.filter((r) => r.ok).length;
    return { def, rows, code, score: Math.min(def.max, raw), max: def.max, self: rows.some((r) => r.k === "self") };
  }

  function renderPart(p) {
    const R = evalPart(p); let box = $(".mark", p.el); if (!box) { box = el("div", "mark"); p.el.append(box); }
    const li = (r) => r.k === "self"
      ? `<li class="self"><label><input type="checkbox" data-self="${esc(r.id)}" ${r.ok ? "checked" : ""}> ${esc(r.text)}</label></li>`
      : `<li class="${r.ok ? "ok" : "no"}"><span class="ic">${r.ok ? "✓" : "✗"}</span><span>${esc(r.text)}${r.your !== undefined && !r.ok ? `<small>Your answer: ${r.your === "" ? "<i>blank</i>" : esc(r.your)}</small>` : ""}</span></li>`;
    let h = `<div class="mkhead"><b>Mark scheme</b><span class="score ${R.score === R.max ? "full" : ""}">${R.score} / ${R.max}</span></div>`;
    if (R.code) h += testsHtml(R.code);
    if (R.self) h += `<p class="selfnote">${R.code ? "Not every test passed, so mark it yourself. " : ""}Tick each point your answer earns${R.rows.filter((r) => r.k === "self").length > R.max ? ` (maximum ${R.max})` : ""}.</p>`;
    h += `<ul class="pts">${R.rows.map(li).join("")}</ul>`;
    if (R.def.guide) h += `<p class="guide"><b>Guidance:</b> ${esc(R.def.guide)}</p>`;
    if (R.def.model) h += `<details><summary>Example answer</summary><pre class="listing">${esc(R.def.model)}</pre></details>`;
    h += `<label class="query"><input type="checkbox" data-query="${esc(p.id)}" ${S.query[p.id] ? "checked" : ""}> Ask my teacher to check this mark</label>`;
    box.innerHTML = h; return R;
  }
  function testsHtml({ pt, T }) {
    if (!answered(pt.field)) return `<p class="tests none">No program was written, so there is nothing to test.</p>`;
    if (!T || !T.done) return `<p class="tests wait" data-wait="${esc(pt.field)}">Unit tests: waiting to run…</p>`;
    const n = T.results.filter((r) => r.ok).length;
    return `<div class="tests"><b>Unit tests: ${n} of ${T.results.length} passed</b><ul>${T.results.map((r) => `<li class="${r.ok ? "ok" : "no"}"><span class="ic">${r.ok ? "✓" : "✗"}</span><span>${esc(r.name)}${r.msg ? `<small>${esc(r.msg)}</small>` : ""}</span></li>`).join("")}</ul></div>`;
  }
  function renderAllMarks() {
    document.body.classList.add("marked");
    const tot = { all: 0, A: 0, B: 0, Amax: 0, Bmax: 0, spec: {} }; const per = [];
    for (const p of parts) {
      const R = renderPart(p); per.push({ p, R }); tot.all += R.score; tot[p.section] += R.score; tot[p.section + "max"] += R.max;
      const s = (tot.spec[p.spec] = tot.spec[p.spec] || { got: 0, max: 0 }); s.got += R.score; s.max += R.max;
    }
    const names = { "2.1": "2.1 Algorithms", "2.2": "2.2 Programming fundamentals", "2.3": "2.3 Producing robust programs", "2.4": "2.4 Boolean logic", "2.5": "2.5 Languages and IDEs" };
    $("#results").hidden = false; $("#release").hidden = true;
    $("#total").innerHTML = `<b>${tot.all}</b> / ${P.total}<small>${Math.round((tot.all / P.total) * 100)}%</small>`;
    $("#breakdown").innerHTML = `<div><span>Section A</span><b>${tot.A} / ${tot.Amax}</b></div><div><span>Section B</span><b>${tot.B} / ${tot.Bmax}</b></div>` +
      Object.keys(tot.spec).sort().map((k) => `<div><span>${names[k] || k}</span><b>${tot.spec[k].got} / ${tot.spec[k].max}</b><i style="--w:${Math.round((tot.spec[k].got / tot.spec[k].max) * 100)}%"></i></div>`).join("");
    return { tot, per, names };
  }
  document.addEventListener("change", (e) => {
    const t = e.target; if (!M || !t.dataset) return;
    if (t.dataset.self) { S.self[t.dataset.self] = t.checked; saveNow(); renderAllMarks(); }
    if (t.dataset.query) { S.query[t.dataset.query] = t.checked; saveNow(); }
  });

  /* ---------- C# unit tests (in the browser) ---------- */
  const PRELUDE = "global using System; global using System.Collections.Generic; global using System.Linq; global using System.Text; ";
  let SHIM = null, W = null, Wready = null, pending = null, seq = 0;
  function boot() {
    W = new Worker("csworker.js", { type: "module" });
    Wready = new Promise((res, rej) => {
      W.onmessage = (e) => { const d = e.data;
        if (d.type === "ready") res(); else if (d.type === "initerror") rej(new Error(d.message));
        else if (d.type === "progress") { const s = $("#csstatus"); if (s && d.total) s.textContent = `Loading the C# compiler… ${Math.min(100, Math.round((d.loaded / d.total) * 100))}%`; }
        else if (d.type === "result" && pending && pending.id === d.id) pending.done(d); };
      W.onerror = () => rej(new Error("The C# compiler could not be loaded"));
    });
    return Wready;
  }
  async function runCs(src, ms) {
    if (!W) boot();
    await Wready;
    return new Promise((res) => {
      const id = ++seq;
      const t = setTimeout(() => { W.terminate(); W = null; pending = null; res({ timeout: true }); }, ms);
      pending = { id, done: (d) => { clearTimeout(t); pending = null; res(d); } };
      W.postMessage({ id, code: src });
    });
  }
  const friendly = { FormatException: "it tried to convert text that is not a number", NullReferenceException: "it asked for more input than the test provides (or used an empty value)", ArgumentNullException: "it asked for more input than the test provides", IndexOutOfRangeException: "it used an array index that does not exist", ArgumentOutOfRangeException: "a Substring or index went past the end of the text", DivideByZeroException: "it divided by zero", InvalidCastException: "it converted a value to the wrong type", OverflowException: "a number became too large" };
  function judge(d, test, head, code) {
    if (d.timeout) return { ok: false, msg: "The program did not finish. Check for an infinite loop." };
    if (d.error || !d.res) return { ok: false, msg: "The program could not be run." };
    const r = d.res;
    if (!r.success) { const er = (r.diagnostics || []).find((x) => x.severity === "Error");
      if (!er) return { ok: false, msg: "The program does not compile." };
      const off = er.location.start - head.length; let where = "";
      if (off >= 0 && off <= code.length) where = `line ${code.slice(0, off).split("\n").length}: `;
      return { ok: false, compile: true, msg: `Does not compile: ${where}${er.message}` }; }
    const out = r.stdOut || "", shown = out.trim() ? `Your program printed: ${out.trim().replace(/\s*\n\s*/g, " ⏎ ").slice(0, 160)}` : "Your program printed nothing.";
    if (r.stdErr && r.stdErr.trim()) { const m = /--->\s*System\.(\w+)/.exec(r.stdErr) || /System\.(\w+Exception)/.exec(r.stdErr); const ex = m ? m[1] : "an error";
      return { ok: false, msg: `Crashed with ${ex}${friendly[ex] ? ": " + friendly[ex] : ""}. ${shown}` }; }
    const ex = test.expect || {}, low = out.toLowerCase(), nums = (out.match(/-?\d+(\.\d+)?/g) || []).map(Number);
    let ok = true;
    if (ex.nums) { let j = 0; for (const n of nums) if (j < ex.nums.length && n === ex.nums[j]) j++; if (j < ex.nums.length) ok = false; }
    if (ex.forbid && ex.forbid.some((n) => nums.includes(n))) ok = false;
    if (ex.contains && !ex.contains.every((s) => low.replace(/\s+/g, " ").includes(s))) ok = false;
    if (ex.not && ex.not.some((s) => low.includes(s))) ok = false;
    return { ok, msg: ok ? "" : `Input: ${test.stdin.length ? test.stdin.join(", ") : "none"}. ${shown}` };
  }
  async function runTestsFor(pt) {
    const code = S.answers[pt.field] || ""; const results = []; let stop = null;
    const redeclared = pt.redeclare && new RegExp(pt.redeclare).test(code);
    for (const rq of pt.require || []) results.push({ name: "Your program " + rq.why, ok: new RegExp(rq.pat).test(code.replace(/\/\/.*$/gm, "")), msg: "" });
    for (const test of pt.tests) {
      if (stop) { results.push({ name: test.name, ok: false, msg: stop }); continue; }
      if (test.givenText && redeclared) { results.push({ name: test.name, ok: false, msg: "You declared the array yourself, so this test could not swap in different data." }); continue; }
      const given = redeclared ? "" : test.givenText || (pt.given ? START.given[pt.given] : "");
      const head = PRELUDE + given;
      const src = head + code + SHIM.replace("__STDIN__", "new string[]{" + test.stdin.map((x) => JSON.stringify(x)).join(",") + "}");
      let d; try { d = await runCs(src, 12000); } catch (e) { d = { error: String(e.message || e) }; stop = "The C# compiler could not be loaded on this device, so mark this question yourself."; }
      const j = stop ? { ok: false, msg: stop } : judge(d, test, head, code);
      if (j.compile) stop = j.msg;
      if (d && d.timeout) stop = j.msg;
      results.push({ name: test.name, ok: j.ok, msg: j.msg });
    }
    S.tests[pt.field] = { done: true, results, allOk: results.every((r) => r.ok) }; saveNow();
  }
  async function runAllTests(force) {
    const todo = [];
    for (const p of parts) for (const pt of M.parts[p.id].points) if (pt.t === "code" && answered(pt.field) && (force || !(S.tests[pt.field] && S.tests[pt.field].done))) todo.push(pt);
    const st = $("#csstatus"), btn = $("#rerun"); if (!todo.length) { st.textContent = ""; return; }
    btn.disabled = true; st.textContent = "Loading the C# compiler (about 30 MB the first time)…";
    try { if (!SHIM) SHIM = await (await fetch("cs-shim.txt")).text(); }
    catch { st.textContent = "The C# test files could not be loaded. Mark the programming questions yourself."; btn.disabled = false; return; }
    let i = 0;
    for (const pt of todo) { const w = $(`[data-wait="${pt.field}"]`); if (w) w.textContent = "Unit tests: running…";
      await runTestsFor(pt); i++; st.textContent = `Running unit tests… ${i} of ${todo.length} programs`; renderAllMarks(); }
    st.textContent = "Unit tests finished."; btn.disabled = false;
  }

  /* ---------- report ---------- */
  function buildReport() {
    const { tot, per, names } = renderAllMarks(); const d = new Date(S.startedAt);
    const used = Math.round((S.submittedAt - S.startedAt) / 60000);
    const showAns = (p) => p.fields.map((f) => { const v = (S.answers[f] ?? "").trim(); return v ? (editors[f] || v.includes("\n") ? `<pre>${esc(v)}</pre>` : `<span class="a">${esc(v)}</span>`) : ""; }).filter(Boolean).join(" ") || "<i>No answer</i>";
    const rows = per.map(({ p, R }) => { const T = R.code && S.tests[R.code.pt.field];
      return `<tr><td>${esc(p.label)}</td><td>${p.spec}</td><td class="n">${R.score} / ${R.max}</td><td>${R.code ? (T && T.done ? `tests ${T.results.filter((r) => r.ok).length}/${T.results.length}` + (T.allOk ? "" : ", self-marked") : "self-marked") : R.self ? (R.rows.some((r) => r.k === "auto") ? "auto + self" : "self-marked") : "auto"}${S.query[p.id] ? ' <b class="q">CHECK REQUESTED</b>' : ""}</td><td>${showAns(p)}</td></tr>`; }).join("");
    return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${esc(S.name)} · ${esc(P.title)}</title><style>
body{font:14px/1.45 Arial,sans-serif;color:#1A1D21;max-width:1000px;margin:24px auto;padding:0 16px}h1,h2{font-family:Georgia,serif;color:#0A1B2E;font-weight:400;margin:0 0 6px}h1{font-size:26px}h2{font-size:19px;margin-top:22px}
.top{border-bottom:4px solid #C89B3C;padding-bottom:10px;margin-bottom:14px}.kv{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:6px 18px}.kv b{display:block;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#8A6520}
.big{font:400 40px Georgia,serif;color:#0A1B2E}table{border-collapse:collapse;width:100%}th{background:#0A1B2E;color:#fff;text-align:left;padding:6px 8px;font-size:12px}td{border-bottom:1px solid #E3E8EF;padding:6px 8px;vertical-align:top}td.n{white-space:nowrap;font-weight:700}
pre{font:12px/1.4 Menlo,Consolas,monospace;background:#F7F8FA;border:1px solid #E3E8EF;border-radius:6px;padding:6px 8px;margin:2px 0;white-space:pre-wrap}.a{display:inline-block;background:#F7F8FA;border:1px solid #E3E8EF;border-radius:4px;padding:0 5px;margin:1px}.q{color:#B3261E;font-size:11px}.note{color:#555D68;font-size:12px}
</style></head><body><div class="top"><h1>${esc(P.title)}</h1><div>${esc(P.subtitle)} · completion report</div></div>
<div class="kv"><div><b>Name</b>${esc(S.name)}</div><div><b>Class</b>${esc(S.cls)}</div><div><b>Date</b>${d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</div><div><b>Started</b>${hhmm(S.startedAt)}</div><div><b>Submitted</b>${hhmm(S.submittedAt)} (${S.how === "time" ? "time ran out" : "by student"})</div><div><b>Time used</b>${used} of ${S.durationMin} minutes${S.extra ? " (extra time)" : ""}</div></div>
<h2>Result</h2><div class="big">${tot.all} / ${P.total} <span style="font-size:20px">(${Math.round((tot.all / P.total) * 100)}%)</span></div>
<table><tr><th>Area</th><th>Marks</th></tr><tr><td>Section A</td><td class="n">${tot.A} / ${tot.Amax}</td></tr><tr><td>Section B</td><td class="n">${tot.B} / ${tot.Bmax}</td></tr>${Object.keys(tot.spec).sort().map((k) => `<tr><td>${names[k] || k}</td><td class="n">${tot.spec[k].got} / ${tot.spec[k].max}</td></tr>`).join("")}</table>
<h2>Question by question</h2><table><tr><th>Question</th><th>Spec</th><th>Mark</th><th>How marked</th><th>Answer</th></tr>${rows}</table>
<p class="note">Self-marked questions were marked by the student against the OCR mark scheme. Report generated ${new Date().toLocaleString("en-GB")}.</p></body></html>`;
  }
  function download() {
    const blob = new Blob([buildReport()], { type: "text/html" }), a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `${P.id}-${(S.name || "report").trim().replace(/[^a-z0-9]+/gi, "-")}.html`;
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  /* ---------- screens ---------- */
  async function tryRelease(code, quiet) {
    try { M = await unseal(code, P.marks); } catch { M = null; if (!quiet) { $("#relmsg").textContent = "That code is not right. Check with your teacher."; } return false; }
    S.release = normCode(code); saveNow(); renderAllMarks(); runAllTests(false); return true;
  }
  function showExam() {
    $("#gate").hidden = true; $("#exam").hidden = false; $("#bar").hidden = false;
    $("#who").textContent = `${S.name} · ${S.cls}`;
    buildPaper();
    if (!S.submittedAt && Date.now() >= endsAt()) submit("time");
    if (S.submittedAt) { lock(); if (S.release) tryRelease(S.release, true); } else startClock();
  }
  async function begin() {
    const name = $("#stuName").value.trim(), cls = $("#stuClass").value.trim(), code = $("#startCode").value, msg = $("#gatemsg");
    if (!name || !cls) { msg.textContent = "Enter your name and class first."; return; }
    if (!code.trim()) { msg.textContent = "Enter the start code from your teacher."; return; }
    $("#begin").disabled = true; msg.textContent = "Checking…";
    START = await openStart(code); $("#begin").disabled = false;
    if (!START) { msg.textContent = "That start code is not right."; return; }
    S = { name, cls, code: normCode(code), startedAt: Date.now(), durationMin: START.durationMin, extra: START.extra, answers: {}, flags: {}, self: {}, query: {}, tests: {} };
    saveNow(); showExam(); window.scrollTo(0, 0);
  }
  async function init() {
    $("#ptitle").textContent = P.title; $("#psub").textContent = P.subtitle; document.title = P.title;
    $("#pfacts").innerHTML = `<li>Time allowed: <b>${P.durationMin} minutes</b></li><li>Total marks: <b>${P.total}</b></li><li>Answer <b>all</b> the questions.</li><li>Do <b>not</b> use a calculator.</li>`;
    $("#begin").addEventListener("click", begin);
    $("#startCode").addEventListener("keydown", (e) => { if (e.key === "Enter") begin(); });
    $("#navbtn").addEventListener("click", () => { const n = $("#nav"); n.hidden = !n.hidden; });
    $("#finish").addEventListener("click", () => {
      const un = parts.filter((p) => !partAnswered(p)), fl = parts.filter((p) => S.flags[p.id]);
      $("#modaltext").innerHTML = `${un.length ? `You have <b>${un.length}</b> unanswered question part${un.length === 1 ? "" : "s"}: ${un.map((p) => esc(p.label)).join(", ")}.<br>` : "You have answered every question part.<br>"}${fl.length ? `Flagged to check: ${fl.map((p) => esc(p.label)).join(", ")}.<br>` : ""}You have <b>${fmtLeft(endsAt() - Date.now())}</b> left. Once you submit you cannot change your answers.`;
      $("#modal").hidden = false; $("#cancel").focus();
    });
    $("#cancel").addEventListener("click", () => { $("#modal").hidden = true; });
    $("#confirm").addEventListener("click", () => submit("student"));
    $("#relbtn").addEventListener("click", () => tryRelease($("#relCode").value));
    $("#relCode").addEventListener("keydown", (e) => { if (e.key === "Enter") tryRelease($("#relCode").value); });
    $("#rerun").addEventListener("click", () => runAllTests(true));
    $("#dl").addEventListener("click", download);
    $("#print").addEventListener("click", () => { const w = window.open("", "_blank"); if (w) { w.document.write(buildReport()); w.document.close(); w.focus(); w.print(); } });
    if (S.code && S.startedAt) { START = await openStart(S.code); if (START) { showExam(); return; } }
    $("#gate").hidden = false;
  }
  init();
})();
