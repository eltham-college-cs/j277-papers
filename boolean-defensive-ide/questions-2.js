/* Paper 2: original OCR-style questions on Boolean logic, defensive design, testing and IDEs.
   Same format as questions.js. Checkers return {marks, items:[{t, ok, k?}], note?} and never the answer. */
(() => {
  "use strict";

  /* ---------- helpers ---------- */
  const norm = (s) => String(s ?? "").toLowerCase().replace(/[“”]/g, '"').replace(/[‘’]/g, "'").trim();
  const squash = (s) => norm(s).replace(/\s+/g, "");
  const unparen = (s) => { let t = s; while (/^\(.*\)$/.test(t)) t = t.slice(1, -1); return t; };
  const lev = (a, b) => {
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[a.length][b.length];
  };
  const isNum = (s) => /^-?\d+(\.\d+)?$/.test(s);
  const sum = (items) => items.filter((i) => i.ok).length;

  /* ---------- checkers ---------- */
  function checkBlanks(a) {
    const c = unparen(squash(a.c)), e = squash(a.e), r = squash(a.r);
    const items = [
      { k: "c", t: "Line 2: the condition", ok: ["height<120", "height<=119", "120>height", "119>=height", "not(height>=120)", "notheight>=120", "not(height>119)", "notheight>119"].includes(c) },
      { k: "e", t: "Line 5: the statement in the else branch", ok: ["allowed=true", "returntrue"].includes(e) },
      { k: "r", t: "Line 7: the keyword", ok: ["return", "returnallowed"].includes(r) },
    ];
    return { marks: sum(items), items };
  }

  const checkBool = (a) => {
    const v = norm(a.v).replace(/[^a-z0-9 ]/g, "");
    const ok = ["bool", "boolean"].includes(v) || (v.length > 4 && lev(v, "boolean") <= 2);
    return { marks: ok ? 1 : 0, items: [{ k: "v", t: "Data type", ok }] };
  };

  const checkConstruct = (a) => {
    const v = norm(a.v);
    const ok = /selection|branch|conditional|\bif\b/.test(v) && !/iteration|loop|sequence|while|for\b/.test(v);
    return { marks: ok ? 1 : 0, items: [{ k: "v", t: "Programming construct", ok }] };
  };

  function checkTestPlan(a) {
    const strip = (s) => norm(s).replace(/^["']|["']$/g, "").trim();
    const nd = strip(a.nd), ed = strip(a.ed), bd = strip(a.bd), nr = norm(a.nr);
    const described = (s) => /\d/.test(s) || /\b(any|number|value|below|above|over|under|less|more|than|height)\b/.test(s);
    const ndOk = isNum(nd) && +nd > 0;
    const items = [
      { k: "nd", t: "Normal test data", ok: ndOk },
      { k: "nr", t: "Expected return value matches your normal test data", ok: ndOk && nr === (+nd >= 120 ? "true" : "false") },
      { k: "bd", t: "Boundary test data", ok: isNum(bd) && +bd === 120 },
      { k: "ed", t: "Erroneous / invalid test data", ok: (isNum(ed) && +ed <= 0) || (!!ed && !isNum(ed) && !described(ed)) },
    ];
    return { marks: sum(items), items, note: "Test data must be actual values, not descriptions." };
  }

  function checkSql(a) {
    const s = norm(a.sql).replace(/;+\s*$/, "").replace(/\s+/g, " ");
    const kws = [...s.matchAll(/\b(select|from|where)\b/g)].map((m) => ({ k: m[1], i: m.index, end: m.index + m[0].length }));
    const seg = (k) => { const n = kws.findIndex((x) => x.k === k); return n < 0 ? null : s.slice(kws[n].end, n + 1 < kws.length ? kws[n + 1].i : s.length).trim(); };
    const strip = (t) => t.replace(/["'`\[\]]/g, "").trim();
    const sel = seg("select"), frm = seg("from"), whr = seg("where");
    const fields = sel == null ? [] : sel.split(",").map(strip);
    const cond = whr == null ? "" : unparen(whr.replace(/\s+/g, ""));
    const condOk = ["minheight>120", "minheight>=121", "120<minheight", "121<=minheight", "not(minheight<=120)", "notminheight<=120", "not(minheight<121)", "notminheight<121"].includes(cond);
    const order = kws.length === 3 && kws.map((x) => x.k).join() === "select,from,where" && kws[0].i === 0;
    const items = [
      { t: "SELECT clause lists the right fields in the right way", ok: sel != null && (strip(sel) === "*" || (fields.includes("ridename") && fields.includes("minheight"))) },
      { t: "FROM clause names the right table", ok: frm != null && strip(frm) === "tblride" },
      { t: "WHERE keyword is used", ok: whr != null },
      { t: "The condition picks out the right records", ok: condOk },
    ];
    let marks = sum(items);
    if (marks === 4 && !order) { marks = 3; items.push({ t: "Keywords appear once each, in the correct order, with nothing extra", ok: false }); }
    return { marks, items, note: "Field and table names must be spelled exactly as given." };
  }

  function checkLogic(state) {
    const an = window.LogicBuilder.analyse(state, { inputs: ["A", "B", "C"], output: "Z" });
    const want = (i) => ([2, 4, 6].includes(i) ? 1 : 0);        // inputs counted A B C, A is the most significant bit
    const full = !!an.table && an.table.every((v, i) => v === want(i)) && an.unused === 0;
    const not = an.gates.some((g) => g.type === "NOT" && g.ins[0] === "C");
    const or = an.gates.some((g) => g.type === "OR" && g.ins[0] && g.ins[1]);
    const and = an.gates.some((g) => g.type === "AND" && g.ins[0] && g.ins[1]);
    const items = full ? [
      { t: "NOT gate used correctly", ok: true }, { t: "Two-input gates combine the signals correctly", ok: true }, { t: "The whole circuit gives the correct output Z for every combination of A, B and C", ok: true },
    ] : [
      { t: "A NOT gate is used on the correct input", ok: not },
      { t: "Two-input gates of the correct types are used, each with both inputs connected", ok: or && and },
      { t: "The whole circuit gives the correct output Z for every combination of A, B and C, with no spare gates", ok: false },
    ];
    return { marks: full ? 3 : Math.min(2, (not ? 1 : 0) + (or ? 1 : 0) + (and ? 1 : 0)), items, note: full ? "" : "Use the test switches under the circuit to try it against the description." };
  }

  const checkGate = (a) => {
    const v = squash(a.v).replace(/gate/g, "").replace(/[^a-z]/g, "");
    const ok = v === "and" || v === "aandb";
    return { marks: ok ? 1 : 0, items: [{ k: "v", t: "Gate name", ok }] };
  };

  const checkRows = (key) => (a) => {
    const items = Object.keys(key).map((r) => ({ k: r, t: "Row: " + key[r].label, ok: key[r].ok.includes(a[r] || "") }));
    return { marks: sum(items), items };
  };

  /* ---------- the paper ---------- */
  window.PAPER = {
    id: "boolean-defensive-ide-2-v1",
    title: "Boolean logic, defensive design and IDEs: Paper 2",
    subtitle: "J277/02 revision paper 2 · 50 marks",
    file: "Boolean-Defensive-IDE-revision-2",
    credit: "Original practice questions written in the style of OCR GCSE (9–1) Computer Science J277/02. Not an OCR paper.",
    questions: [
      {
        n: 1,
        stem: `<p>Thrill Valley is a theme park. Visitors use an app to see the rides and book time slots.</p><p>Riders must be at least 120 cm tall to go on the ride Sky Drop.</p>`,
        parts: [
          { id: "1ai", label: "1(a)(i)", marks: 3, type: "blanks", check: checkBlanks,
            pre: `<p>The function <code>canRide()</code>:</p><ul><li>takes the height of the visitor, in centimetres, as a parameter</li><li>checks whether the visitor is shorter than 120 cm</li><li>returns False if the visitor is too short and True otherwise.</li></ul>`,
            prompt: `<p>Complete the design of the function <code>canRide()</code></p>`,
            tpl: ["function canRide(height)", "     if {c} then", "          allowed = False", "     else", "          {e}", "     endif", "     {r} allowed", "endfunction"],
            widths: { c: 18, e: 22, r: 12 } },
          { id: "1aii", label: "1(a)(ii)", marks: 1, type: "fields", check: checkBool,
            prompt: `<p>Give the most appropriate data type for <code>allowed</code></p>`, fields: [{ k: "v", short: true }] },
          { id: "1aiii", label: "1(a)(iii)", marks: 1, type: "fields", check: checkConstruct,
            prompt: `<p>State the name of the programming construct that <code>canRide()</code> uses to decide which value is given to <code>allowed</code></p>`, fields: [{ k: "v", short: true }] },
          { id: "1aiv", label: "1(a)(iv)", marks: 4, type: "grid", check: checkTestPlan,
            prompt: `<p>Complete the test plan for <code>canRide()</code></p>`,
            head: ["Test data", "Test type", "Expected return value"],
            rows: [[{ k: "nd" }, "Normal", { k: "nr" }], [{ k: "bd" }, "Boundary", "True"], [{ k: "ed" }, "Erroneous / invalid", "Error message"]] },
          { id: "1b", label: "1(b)", marks: 4, type: "fields", check: checkSql,
            pre: `<p>Data about the rides is stored in the database table <code>TblRide</code></p><p>An example of some of the data is given:</p>
<table class="grid narrow"><caption>TblRide</caption><thead><tr><th>RideID</th><th>RideName</th><th>MinHeight</th><th>Open</th></tr></thead><tbody><tr><td>R01</td><td>Sky Drop</td><td>120</td><td>True</td></tr><tr><td>R02</td><td>Tea Cups</td><td>90</td><td>True</td></tr><tr><td>R03</td><td>Vortex</td><td>140</td><td>False</td></tr></tbody></table>
<p>The <code>MinHeight</code> field stores the minimum height, in centimetres, that a visitor must be to go on the ride.</p>`,
            prompt: `<p>Write an SQL statement to show the fields <code>RideName</code> and <code>MinHeight</code> for all rides that have a minimum height greater than 120.</p>`,
            fields: [{ k: "sql", rows: 4, mono: true }] },
          { id: "1ci", label: "1(c)(i)", marks: 3, type: "fields",
            pre: `<p>Visitors type their name, their email address and the number of people in their group into the app to book a time slot.</p>`,
            prompt: `<p>Give <b>three</b> different validation checks that could be used on the data that visitors enter.</p>`,
            fields: [{ k: "a", label: "1" }, { k: "b", label: "2" }, { k: "c", label: "3" }] },
          { id: "1cii", label: "1(c)(ii)", marks: 1, type: "fields",
            prompt: `<p>State what is meant by the term <b>authentication</b>.</p>`, fields: [{ k: "v", rows: 2 }] },
        ],
      },
      {
        n: 2,
        stem: `<p>A cinema charges different prices. Children under 5 are free. Children aged 5 to 15 pay 8 pounds. Everyone aged 16 or over pays 12 pounds.</p><p>The following algorithm asks for the age of the customer and outputs the price they pay.</p>
<pre class="listing">01 age = int(input("Enter your age"))
02 if age &lt; 16 then
03     price = 8
04 endif
05 if age &lt; 5 then
06     price = 0
07 endif
08 if age &gt; 16 then
09     price = 12
10 endif
11 print(price)</pre><p>The algorithm contains a logic error when 16 is input.</p>`,
        parts: [
          { id: "2i", label: "2(i)", marks: 2, type: "fields", prompt: `<p>Describe the logic error that occurs when 16 is input.</p>`, fields: [{ k: "v", rows: 4 }] },
          { id: "2ii", label: "2(ii)", marks: 1, type: "fields", prompt: `<p>State <b>one</b> way that the logic error can be corrected.</p>`, fields: [{ k: "v", rows: 2 }] },
        ],
      },
      {
        n: 3,
        stem: ``,
        parts: [
          { id: "3a", label: "3(a)", marks: 3, type: "logic", check: checkLogic, inputs: ["A", "B", "C"], output: "Z",
            pre: `<p>A car park has a barrier (<b>Z</b>). The barrier opens when a valid ticket is inserted (<b>A</b>) or a staff pass is scanned (<b>B</b>). A sensor (<b>C</b>) detects when the car park is full. The barrier does not open when the car park is full.</p><p>This logic system is given in the table.</p>
<table class="grid"><thead><tr><th>Input</th><th>Description</th><th>0</th><th>1</th></tr></thead><tbody><tr><td>A</td><td>Ticket machine</td><td>No valid ticket</td><td>Valid ticket inserted</td></tr><tr><td>B</td><td>Staff pass reader</td><td>No pass scanned</td><td>Pass scanned</td></tr><tr><td>C</td><td>Car park full sensor</td><td>Car park is not full</td><td>Car park is full</td></tr></tbody></table>
<p><b>Z</b> opens (1) when a valid ticket is inserted <b>or</b> a pass is scanned, <b>and</b> the car park is <b>not</b> full.</p>`,
            prompt: `<p>Draw the logic circuit for <b>Z</b>.</p>` },
          { id: "3b", label: "3(b)", marks: 1, type: "fields", check: checkGate,
            prompt: `<p>Give the name of the logic gate that produces this truth table:</p>
<table class="grid narrow"><thead><tr><th>Input A</th><th>Input B</th><th>Output</th></tr></thead><tbody><tr><td>0</td><td>0</td><td>0</td></tr><tr><td>0</td><td>1</td><td>0</td></tr><tr><td>1</td><td>0</td><td>0</td></tr><tr><td>1</td><td>1</td><td>1</td></tr></tbody></table>`,
            fields: [{ k: "v", label: "Gate", short: true }] },
        ],
      },
      {
        n: 4,
        stem: `<p>A program asks a user how many tickets they want to buy. Only integer values between 1 and 6 (inclusive) are accepted. The program is tested.</p>`,
        parts: [
          { id: "4", label: "4", marks: 4, type: "ticks", multi: true,
            check: checkRows({ r1: { label: "1", ok: ["b", "b,n"] }, r2: { label: "“six”", ok: ["i"] }, r3: { label: "4", ok: ["n"] }, r4: { label: "9", ok: ["i"] } }),
            prompt: `<p>Tick (✓) <b>one or more</b> boxes in each row to identify the type or types of test for each example of test data.</p>`,
            rowHead: "Example test data",
            cols: [{ k: "n", label: "Normal test data" }, { k: "b", label: "Boundary test data" }, { k: "i", label: "Invalid / erroneous test data" }],
            rows: [{ k: "r1", label: "1" }, { k: "r2", label: "“six”" }, { k: "r3", label: "4" }, { k: "r4", label: "9" }] },
        ],
      },
      {
        n: 5,
        stem: `<p>A programmer writes a program in a high-level language using an Integrated Development Environment (IDE). The program runs without crashing, but the total that it outputs is wrong.</p>`,
        parts: [
          { id: "5", label: "5", marks: 4, type: "fields",
            prompt: `<p>Identify and describe <b>two</b> tools in the IDE that the programmer could use to help find the error in the program.</p>`,
            fields: [{ k: "t1", label: "Tool 1" }, { k: "d1", label: "Description", rows: 2 }, { k: "t2", label: "Tool 2" }, { k: "d2", label: "Description", rows: 2 }] },
        ],
      },
      {
        n: 6,
        stem: `<p>A student is finding and fixing errors in a program.</p>`,
        parts: [
          { id: "6", label: "6", marks: 4, type: "ticks", multi: false,
            check: checkRows({ e1: { label: "error 1", ok: ["s"] }, e2: { label: "error 2", ok: ["l"] }, e3: { label: "error 3", ok: ["s"] }, e4: { label: "error 4", ok: ["l"] } }),
            prompt: `<p>Tick (✓) <b>one</b> box in each row to identify whether each error is a syntax error or a logic error.</p>`,
            rowHead: "Error",
            cols: [{ k: "s", label: "Syntax error" }, { k: "l", label: "Logic error" }],
            rows: [{ k: "e1", label: "The keyword print is typed as pritn" }, { k: "e2", label: "An average is calculated using total * count instead of total / count" }, { k: "e3", label: "A closing bracket is missing from the end of a line" }, { k: "e4", label: "A loop repeats one more time than it should" }] },
        ],
      },
      {
        n: 7,
        stem: `<p>A program calculates the cost of a group booking. Each ticket costs 12.50 pounds. Groups of more than 4 people get a 10% discount.</p>
<pre class="listing">x = input("Enter name")
y = int(input("Enter number of tickets"))
z = y * 12.5
if y &gt; 4 then
z = z * 0.9
endif
print(x, z)</pre>`,
        parts: [
          { id: "7", label: "7", marks: 4, type: "fields", prompt: `<p>Describe <b>two</b> ways to improve the maintainability of the program.</p>`,
            fields: [{ k: "a", label: "1", rows: 3 }, { k: "b", label: "2", rows: 3 }] },
        ],
      },
      {
        n: 8,
        stem: `<p>A website lets users create an account by entering a username and a password. Users can then post reviews of films.</p>`,
        parts: [
          { id: "8", label: "8", marks: 2, type: "fields", prompt: `<p>Describe <b>one</b> way that the programmer can anticipate misuse when creating the website.</p>`, fields: [{ k: "v", rows: 4 }] },
        ],
      },
      {
        n: 9, stem: ``,
        parts: [
          { id: "9a", label: "9(a)", marks: 2, type: "fields", prompt: `<p>Give <b>two</b> reasons why most programs are written in a high-level language.</p>`,
            fields: [{ k: "a", label: "1", rows: 2 }, { k: "b", label: "2", rows: 2 }] },
          { id: "9b", label: "9(b)", marks: 3, type: "fields", prompt: `<p>Describe the benefits of using an interpreter instead of a compiler while a program is being developed.</p>`, fields: [{ k: "v", rows: 6 }] },
        ],
      },
      {
        n: 10,
        stem: `<p>A programmer uses an Integrated Development Environment (IDE) to write a program in a high-level language.</p><p>The program must be translated before it can be run.</p>`,
        parts: [
          { id: "10", label: "10", marks: 3, type: "ticks", multi: false,
            check: checkRows({ s1: { label: "statement 1", ok: ["i"] }, s2: { label: "statement 2", ok: ["b"] }, s3: { label: "statement 3", ok: ["c"] } }),
            prompt: `<p>Tick (✓) <b>one</b> box in each row to identify whether each statement describes a compiler, an interpreter, or both.</p>`,
            rowHead: "Statement",
            cols: [{ k: "c", label: "Compiler" }, { k: "i", label: "Interpreter" }, { k: "b", label: "Both" }],
            rows: [{ k: "s1", label: "Translates and runs the program one line at a time." }, { k: "s2", label: "Is a type of translator." }, { k: "s3", label: "Translates the whole program before any of it is run." }] },
        ],
      },
    ],
  };
})();
