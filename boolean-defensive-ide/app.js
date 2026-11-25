/* Interactive revision paper engine: renders window.PAPER, saves answers, checks the auto-checked parts
   (marks only, never the answer) and exports the questions with the student's answers as a PDF. */
(() => {
  "use strict";
  const P = window.PAPER, KEY = "revision:" + P.id;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

  /* ---------- state ---------- */
  let S = (() => { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } })();
  if (!S || typeof S !== "object") S = {};
  S.answers = S.answers || {}; S.checks = S.checks || {};
  let saveT = null;
  const saveNow = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* storage unavailable */ } };
  const save = () => { clearTimeout(saveT); saveT = setTimeout(saveNow, 250); };
  window.addEventListener("pagehide", saveNow);

  const parts = P.questions.flatMap((q) => q.parts.map((p) => Object.assign(p, { q })));
  const byId = Object.fromEntries(parts.map((p) => [p.id, p]));
  const TOTAL = parts.reduce((t, p) => t + p.marks, 0);
  const AUTO = parts.filter((p) => p.check).reduce((t, p) => t + p.marks, 0);
  const builders = {};
  const marksWord = (n) => `${n} mark${n === 1 ? "" : "s"}`;

  const ans = (p) => (S.answers[p.id] = S.answers[p.id] || (p.type === "logic" ? { gates: [], wires: [] } : {}));
  const answered = (p) => { const a = S.answers[p.id]; if (!a) return false; return p.type === "logic" ? !!((a.gates || []).length || (a.wires || []).length) : Object.values(a).some((v) => String(v ?? "").trim()); };
  const result = (p) => (S.checks[p.id] || {}).res || null;

  /* ---------- build the paper ---------- */
  function widget(p) {
    const a = ans(p), v = (k) => esc(a[k] ?? "");
    if (p.type === "fields") return p.fields.map((f) => {
      const cls = (f.mono ? " mono" : ""), lab = f.label ? `<label class="n" for="f-${p.id}-${f.k}">${esc(f.label)}</label>` : "";
      const aria = f.label ? "" : ` aria-label="Answer to question ${esc(p.label)}"`;
      return lab + (f.rows > 1
        ? `<textarea id="f-${p.id}-${f.k}" class="${cls.trim()}" rows="${f.rows}" data-k="${f.k}" spellcheck="${f.mono ? "false" : "true"}"${aria}>${v(f.k)}</textarea>`
        : `<input id="f-${p.id}-${f.k}" class="line${f.short ? " short" : ""}${cls}" data-k="${f.k}" autocomplete="off" value="${v(f.k)}"${aria}>`);
    }).join("");
    if (p.type === "blanks") return `<div class="codefill">${p.tpl.map((ln) => esc(ln).replace(/\{(\w+)\}/g, (_, k) => `<input class="blank" data-k="${k}" style="width:${p.widths[k]}ch" autocomplete="off" autocapitalize="off" spellcheck="false" value="${v(k)}" aria-label="Missing code, blank ${k}">`)).join("\n")}</div>`;
    if (p.type === "grid") return `<table class="grid"><thead><tr>${p.head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${p.rows.map((r) => `<tr>${r.map((c, i) => typeof c === "string" ? `<td class="${i === 1 ? "rowh" : ""}">${esc(c)}</td>` : `<td><input class="cell" data-k="${c.k}" autocomplete="off" value="${v(c.k)}" aria-label="${esc(p.head[i])}, ${esc(r[1])} row"></td>`).join("")}</tr>`).join("")}</tbody></table>`;
    if (p.type === "ticks") return `<table class="grid"><thead><tr><th>${esc(p.rowHead)}</th>${p.cols.map((c) => `<th>${esc(c.label)}</th>`).join("")}</tr></thead><tbody>${p.rows.map((r) => {
      const on = String(a[r.k] || "").split(",");
      return `<tr data-row="${r.k}"><td class="rowh">${esc(r.label)}</td>${p.cols.map((c) => `<td><input type="${p.multi ? "checkbox" : "radio"}" name="t-${p.id}-${r.k}" data-row="${r.k}" data-col="${c.k}"${on.includes(c.k) ? " checked" : ""} aria-label="${esc(r.label)}: ${esc(c.label)}"></td>`).join("")}</tr>`;
    }).join("")}</tbody></table>`;
    return `<div class="lbhost"></div>`;
  }

  function buildPaper() {
    const host = $("#paper");
    for (const q of P.questions) {
      const qm = q.parts.reduce((t, p) => t + p.marks, 0);
      const sec = el("section", "q", `<header><span class="num">${q.n}</span><h2>Question ${q.n}</h2><span class="qmarks">${marksWord(qm)}</span></header>${q.stem ? `<div class="stem">${q.stem}</div>` : ""}`);
      sec.id = "q" + q.n;
      for (const p of q.parts) {
        const pe = el("div", "part", `${p.pre ? `<div class="stem">${p.pre}</div>` : ""}
<div class="phead"><span class="plabel">${esc(p.label)}</span><span class="pmarks">[${marksWord(p.marks)}]</span><span class="badge${p.check ? " auto" : ""}">${p.check ? "Auto-checked" : "Teacher assessed"}</span></div>
<div class="prompt">${p.prompt}</div><div class="ans">${widget(p)}</div>
${p.check ? `<div class="checkrow"><button type="button" class="btn check">Check my answer</button><div class="fbhost" role="status" aria-live="polite"></div></div>` : `<p class="tnote">Your teacher will mark this question out of ${p.marks}.</p>`}`);
        pe.id = "p-" + p.id; pe.dataset.part = p.id; p.el = pe; sec.append(pe);
        if (p.type === "logic") builders[p.id] = window.LogicBuilder($(".lbhost", pe), { inputs: p.inputs, output: p.output, state: ans(p), onChange: (st) => { S.answers[p.id] = st; touched(p); } });
        if (p.check) $(".check", pe).addEventListener("click", () => check(p));
      }
      host.append(sec);
    }
    host.addEventListener("input", (e) => {
      const pe = e.target.closest(".part"); if (!pe || e.target.closest(".lb")) return;
      const p = byId[pe.dataset.part], a = ans(p), t = e.target;
      if (t.dataset.k) a[t.dataset.k] = t.value;
      else if (t.dataset.row) a[t.dataset.row] = $$(`input[data-row="${t.dataset.row}"]:checked`, pe).map((x) => x.dataset.col).sort().join(",");
      touched(p);
    });
    $("#navlist").innerHTML = parts.map((p) => `<button type="button" class="chip" data-go="${p.id}">${esc(p.label)}</button>`).join("");
    $("#navlist").addEventListener("click", (e) => { const b = e.target.closest("[data-go]"); if (!b) return; byId[b.dataset.go].el.scrollIntoView({ behavior: "smooth", block: "start" }); });
    for (const p of parts) if (result(p)) showResult(p);
  }

  /* ---------- checking ---------- */
  function clearMarks(p) { for (const e of $$(".good,.bad", p.el)) e.classList.remove("good", "bad"); }
  function touched(p) {                        // answer changed: the last check no longer applies
    if (S.checks[p.id] && S.checks[p.id].res) { S.checks[p.id].res = null; clearMarks(p); $(".fbhost", p.el).innerHTML = `<div class="fb part">Answer changed. Check it again when you are ready.</div>`; }
    else if (p.check && $(".fb.warn", p.el)) $(".fbhost", p.el).innerHTML = "";
    save(); refresh();
  }
  function check(p) {
    if (!answered(p)) { $(".fbhost", p.el).innerHTML = `<div class="fb warn">Answer the question first, then check it.</div>`; return; }
    const c = (S.checks[p.id] = S.checks[p.id] || { n: 0 });
    c.n = (c.n || 0) + 1; c.res = p.check(ans(p));
    saveNow(); showResult(p); refresh();
  }
  function showResult(p) {
    const r = result(p), full = r.marks === p.marks;
    clearMarks(p);
    for (const it of r.items) if (it.k) for (const e of $$(`[data-k="${it.k}"],tr[data-row="${it.k}"]`, p.el)) e.classList.add(it.ok ? "good" : "bad");
    $(".fbhost", p.el).innerHTML = `<div class="fb ${full ? "ok" : "part"}"><b class="score">${full ? "Correct" : "Not there yet"}: ${r.marks} / ${p.marks} ${p.marks === 1 ? "mark" : "marks"}</b>
${p.marks > 1 || !full ? `<ul>${r.items.map((it) => `<li class="${it.ok ? "y" : "x"}">${esc(it.t)}</li>`).join("")}</ul>` : ""}
${full ? "" : `<p class="small">${esc(r.note || "")} Change your answer and check again.</p>`}</div>`;
  }
  function refresh() {
    const got = parts.reduce((t, p) => t + (result(p) ? result(p).marks : 0), 0), done = parts.filter(answered).length;
    $("#score").textContent = `${got} / ${AUTO}`;
    $("#progress").textContent = `Answered ${done} of ${parts.length}`;
    $("#total").innerHTML = `${got} / ${AUTO}<small>auto-checked marks so far</small>`;
    $("#doneinfo").textContent = `The paper is out of ${TOTAL} marks: ${AUTO} auto-checked and ${TOTAL - AUTO} marked by your teacher. You have answered ${done} of ${parts.length} question parts.`;
    for (const b of $$("#navlist .chip")) { const p = byId[b.dataset.go], r = result(p); b.classList.toggle("done", answered(p)); b.classList.toggle("full", !!r && r.marks === p.marks); b.classList.toggle("teacher", !p.check); }
  }

  /* ---------- PDF ---------- */
  const pdfText = (s) => String(s ?? "").replace(/\s*\(\u2713\)/g, "").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[–—]/g, "-").replace(/✓/g, "tick").replace(/ /g, " ").replace(/[^\x09\x0A\x20-\x7E£©·]/g, "?");
  const flat = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
  function svgToPng(svg, scale = 2) {
    return new Promise((res) => {
      const c = svg.cloneNode(true), vb = c.getAttribute("viewBox").split(/\s+/).map(Number);
      c.setAttribute("xmlns", "http://www.w3.org/2000/svg"); c.setAttribute("width", vb[2]); c.setAttribute("height", vb[3]);
      const img = new Image();
      img.onload = () => { try { const cv = document.createElement("canvas"); cv.width = vb[2] * scale; cv.height = vb[3] * scale; const g = cv.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(img, 0, 0, cv.width, cv.height); res({ url: cv.toDataURL("image/png"), w: vb[2], h: vb[3] }); } catch { res(null); } };
      img.onerror = () => res(null);
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(new XMLSerializer().serializeToString(c));
    });
  }

  async function downloadPdf() {
    const msg = $("#dlmsg"); msg.textContent = "";
    if (!flat(S.name)) { msg.textContent = "Enter your name at the top of the page first."; $("#stuName").focus(); return; }
    if (!(window.jspdf && window.jspdf.jsPDF)) { msg.textContent = "The PDF library did not load. Check that the vendor folder is next to this page."; return; }
    const doc = new window.jspdf.jsPDF({ unit: "pt", format: "a4" });
    const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), L = 40, R = W - 40, BOT = H - 50;
    const navy = [10, 27, 46], gold = [200, 155, 60], ink = [26, 29, 33], muted = [85, 93, 104];
    const final = {}; for (const p of parts) if (p.check) final[p.id] = answered(p) ? p.check(ans(p)) : { marks: 0, items: [] };
    const autoGot = Object.values(final).reduce((t, r) => t + r.marks, 0);
    let y = 0;
    const need = (h) => { if (y + h > BOT) { doc.addPage(); y = 50; } };
    const text = (str, o = {}) => {
      const size = o.size || 10.5, ind = o.indent || 0, lh = size * 1.35;
      doc.setFont(o.font || "helvetica", o.style || "normal"); doc.setFontSize(size); doc.setTextColor(...(o.color || ink));
      for (const ln of doc.splitTextToSize(pdfText(str), R - L - ind)) { need(lh); doc.text(ln, L + ind, y + size); y += lh; }
      y += o.gap == null ? 4 : o.gap;
    };
    const mono = (str, ind = 0) => {
      doc.setFont("courier", "normal"); doc.setFontSize(9.5);
      const lines = pdfText(str).replace(/\n+$/, "").split("\n").flatMap((l) => doc.splitTextToSize(l || " ", R - L - ind - 16)), lh = 13, h = lines.length * lh + 10;
      need(h); doc.setFillColor(244, 246, 249); doc.rect(L + ind, y, R - L - ind, h, "F"); doc.setFillColor(42, 90, 140); doc.rect(L + ind, y, 3, h, "F");
      doc.setFont("courier", "normal"); doc.setFontSize(9.5); doc.setTextColor(...ink);
      lines.forEach((l, i) => doc.text(l, L + ind + 10, y + 14 + i * lh)); y += h + 8;
    };
    const table = (head, body, o = {}) => {
      doc.autoTable(Object.assign({ startY: y, margin: { left: L + (o.indent || 0), right: 40, bottom: 50, top: 50 }, theme: "grid", head: head ? [head.map(pdfText)] : undefined, body: body.map((r) => r.map(pdfText)),
        styles: { fontSize: 9.5, cellPadding: 4, textColor: ink, lineColor: [185, 195, 207], lineWidth: 0.5, overflow: "linebreak" }, headStyles: { fillColor: navy, textColor: 255, fontStyle: "bold", fontSize: 9 } }, o.at || {}));
      y = doc.lastAutoTable.finalY + 8;
    };
    const image = (im, maxW, ind = 0) => { if (!im) return; const w = Math.min(maxW, R - L - ind), h = (w * im.h) / im.w; need(h + 6); doc.addImage(im.url, "PNG", L + ind, y, w, h); y += h + 8; };
    const stem = async (html, ind = 0) => {
      const d = el("div", "", html);
      for (const n of d.children) {
        const tag = n.tagName.toUpperCase();
        if (tag === "UL") for (const li of n.children) text("-  " + flat(li.textContent), { indent: ind + 10, gap: li.nextElementSibling ? 1 : 8 });
        else if (tag === "PRE") mono(n.textContent, ind);
        else if (tag === "TABLE") { const cap = $("caption", n); if (cap) text(flat(cap.textContent), { font: "courier", style: "bold", size: 9.5, indent: ind, gap: 2 }); table($$("thead th", n).map((c) => flat(c.textContent)), $$("tbody tr", n).map((r) => [...r.children].map((c) => flat(c.textContent))), { indent: ind, at: { tableWidth: Math.min(R - L - ind, 110 * $$("thead th", n).length), styles: { fontSize: 9, cellPadding: 3.5, halign: "center", textColor: ink, lineColor: [185, 195, 207], lineWidth: 0.5 } } }); }
        else if (tag === "SVG") image(await svgToPng(n), 250, ind + 60);
        else text(flat(n.textContent), { indent: ind });
      }
    };
    const NONE = "(no answer)";
    const answer = async (p) => {
      const a = ans(p), v = (k) => flat(a[k]) || NONE, ansStyle = { fillColor: [251, 252, 253] };
      need(p.type === "logic" && answered(p) ? 250 : p.type === "blanks" ? 140 : 64);
      text("Student answer", { size: 8, style: "bold", color: [138, 101, 32], gap: 2 });
      if (p.type === "fields") {
        const labelled = p.fields.some((f) => f.label);
        table(null, p.fields.map((f) => { const val = f.mono ? (String(a[f.k] ?? "").trim() || NONE) : v(f.k); return labelled ? [f.label || "", val] : [val]; }),
          { at: { styles: Object.assign({ fontSize: 10, cellPadding: 5, textColor: ink, lineColor: [185, 195, 207], lineWidth: 0.5, font: p.fields[0].mono ? "courier" : "helvetica" }, ansStyle), columnStyles: labelled ? { 0: { cellWidth: 80, fontStyle: "bold", textColor: navy } } : {} } });
      } else if (p.type === "blanks") mono(p.tpl.map((ln) => ln.replace(/\{(\w+)\}/g, (_, k) => `[ ${flat(a[k]) || "________"} ]`)).join("\n"));
      else if (p.type === "grid") table(p.head, p.rows.map((r) => r.map((c) => (typeof c === "string" ? c : v(c.k)))), { at: { bodyStyles: ansStyle } });
      else if (p.type === "ticks") table([p.rowHead, ...p.cols.map((c) => c.label)], p.rows.map((r) => [r.label, ...p.cols.map((c) => (String(a[r.k] || "").split(",").includes(c.k) ? "X" : ""))]), { at: { columnStyles: Object.fromEntries(p.cols.map((_, i) => [i + 1, { halign: "center", fontStyle: "bold" }])) } });
      else if (p.type === "logic") {
        if (!answered(p)) text("(no circuit drawn)", { color: muted });
        else { image(await svgToPng(builders[p.id].exportSvg()), 420); const an = builders[p.id].analyse(); text("Circuit as an expression: " + (an.expr || "output " + p.output + " is not connected") + (an.unused ? `   (${an.unused} gate${an.unused === 1 ? "" : "s"} not connected to the output)` : ""), { font: "courier", size: 9.5 }); }
      }
    };

    /* cover */
    doc.setFillColor(...navy); doc.rect(0, 0, W, 74, "F"); doc.setFillColor(...gold); doc.rect(0, 74, W, 4, "F");
    doc.setTextColor(255); doc.setFont("times", "normal"); doc.setFontSize(18); doc.text(pdfText(P.title), L, 34);
    doc.setFont("helvetica", "normal"); doc.setFontSize(10.5); doc.text(pdfText("OCR GCSE (9-1) Computer Science · " + P.subtitle + " · questions and student answers"), L, 54);
    y = 92;
    table(null, [["Name", flat(S.name)], ["Class", flat(S.cls) || "-"], ["Date", new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })],
      ["Auto-checked", `${autoGot} / ${AUTO}`], ["Teacher assessed", `_______ / ${TOTAL - AUTO}`], ["Total", `_______ / ${TOTAL}`]],
      { at: { theme: "plain", tableWidth: 330, styles: { fontSize: 10.5, cellPadding: 3, textColor: ink }, columnStyles: { 0: { fontStyle: "bold", cellWidth: 110, textColor: [138, 101, 32] } } } });
    y += 6;
    table(["Question", "Marks", "Marked by", "Mark awarded", "On-screen checks"], parts.map((p) => [p.label, String(p.marks), p.check ? "Auto-checked" : "Teacher", p.check ? `${final[p.id].marks} / ${p.marks}` : `        / ${p.marks}`, p.check ? String((S.checks[p.id] || {}).n || 0) : ""]),
      { at: { tableWidth: 400, styles: { fontSize: 9, cellPadding: 3, textColor: ink, lineColor: [185, 195, 207], lineWidth: 0.5 }, columnStyles: { 1: { halign: "center" }, 3: { halign: "center" }, 4: { halign: "center" } } } });

    /* questions */
    for (const q of P.questions) {
      const qm = q.parts.reduce((t, p) => t + p.marks, 0);
      if (q.n === 1) { doc.addPage(); y = 50; } else { y += 18; need(190); }
      doc.setFillColor(...gold); doc.rect(L, y, 4, 22, "F");
      doc.setFont("times", "normal"); doc.setFontSize(17); doc.setTextColor(...navy); doc.text(`Question ${q.n}`, L + 12, y + 17);
      doc.setFont("helvetica", "bold"); doc.setFontSize(10.5); doc.text(`[${marksWord(qm)}]`, R, y + 16, { align: "right" }); y += 34;
      if (q.stem) await stem(q.stem);
      for (const p of q.parts) {
        need(70); y += 4; doc.setDrawColor(227, 232, 239); doc.line(L, y, R, y); y += 10;
        if (p.pre) await stem(p.pre);
        need(60);
        doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(...navy); doc.text(pdfText(p.label), L, y + 11); doc.text(`[${marksWord(p.marks)}]`, R, y + 11, { align: "right" }); y += 20;
        await stem(p.prompt);
        await answer(p);
        need(18);
        doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(...navy);
        if (p.check) {
          const r = final[p.id], n = (S.checks[p.id] || {}).n || 0;
          doc.text(`Auto-checked: ${r.marks} / ${p.marks}`, R, y + 10, { align: "right" }); y += 16;
          for (const it of r.items) text(`${it.ok ? "[met]" : "[not met]"}  ${it.t}`, { size: 8.5, color: muted, gap: 0 });
          text(`Checked on screen ${n} time${n === 1 ? "" : "s"}.`, { size: 8.5, color: muted, gap: 6 });
        } else { doc.text(`Teacher mark:  ________ / ${p.marks}`, R, y + 10, { align: "right" }); y += 22; }
      }
    }
    const n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i++) { doc.setPage(i); doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(...muted); doc.text(pdfText(`${flat(S.name)}${flat(S.cls) ? " · " + flat(S.cls) : ""} · ${P.title}`), L, H - 24); doc.text(`Page ${i} of ${n}`, R, H - 24, { align: "right" }); }
    doc.save(`${P.file}_${flat(S.name).replace(/[^A-Za-z0-9]+/g, "-")}.pdf`);
  }
  const runPdf = async (btn) => { btn.disabled = true; try { await downloadPdf(); } catch (e) { console.error(e); $("#dlmsg").textContent = "Sorry, the PDF could not be made. Try again."; } btn.disabled = false; if ($("#dlmsg").textContent) $("#done").scrollIntoView({ behavior: "smooth", block: "center" }); };

  /* ---------- start ---------- */
  document.title = P.title + " · revision paper";
  $("#ptitle").textContent = P.title; $("#psub").textContent = P.subtitle;
  $("#stuName").value = S.name || ""; $("#stuClass").value = S.cls || "";
  $("#stuName").addEventListener("input", (e) => { S.name = e.target.value; $("#dlmsg").textContent = ""; save(); });
  $("#stuClass").addEventListener("input", (e) => { S.cls = e.target.value; save(); });
  $("#navbtn").addEventListener("click", () => { const n = $("#nav"); n.hidden = !n.hidden; $("#navbtn").setAttribute("aria-expanded", String(!n.hidden)); });
  $("#dl").addEventListener("click", (e) => runPdf(e.currentTarget)); $("#dlbar").addEventListener("click", (e) => runPdf(e.currentTarget));
  $("#again").addEventListener("click", () => { $("#againmodal").hidden = false; $("#againcancel").focus(); });
  $("#againcancel").addEventListener("click", () => { $("#againmodal").hidden = true; });
  $("#againconfirm").addEventListener("click", () => { clearTimeout(saveT); S = { name: S.name, cls: S.cls, answers: {}, checks: {} }; saveNow(); location.reload(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") $("#againmodal").hidden = true; });
  buildPaper(); refresh();
  window.__paper = { parts, S: () => S, downloadPdf };   // for testing
})();
