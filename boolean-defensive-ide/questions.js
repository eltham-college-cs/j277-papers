/* Question data and auto-checkers for the Boolean logic, defensive design and IDE revision paper.
   Checkers return {marks, items:[{t, ok, k?}], note?}. They never return the correct answer. */
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
      { k: "c", t: "Line 2: the condition", ok: ["age>=14", "age>13", "14<=age", "13<age", "not(age<14)", "notage<14", "not(age<=13)", "notage<=13"].includes(c) },
      { k: "e", t: "Line 5: the statement in the else branch", ok: ["signup=false", "returnfalse"].includes(e) },
      { k: "r", t: "Line 7: the keyword", ok: ["return", "returnsignup"].includes(r) },
    ];
    return { marks: sum(items), items };
  }

  const checkType = (words, full) => (a) => {
    const v = norm(a.v).replace(/[^a-z0-9 ]/g, "");
    const ok = words.includes(v) || (v.length > 4 && lev(v, full) <= 2);
    return { marks: ok ? 1 : 0, items: [{ k: "v", t: "Data type", ok }] };
  };

  function checkTestPlan(a) {
    const strip = (s) => norm(s).replace(/^["']|["']$/g, "").trim();
    const nd = strip(a.nd), ed = strip(a.ed), bd = strip(a.bd), nr = norm(a.nr), er = norm(a.er);
    const described = (s) => /\d/.test(s) || /\b(any|number|value|below|above|over|under|less|more|than|age)\b/.test(s);
    const edNum = isNum(ed), edWrongType = !!ed && !edNum && !described(ed);
    const items = [
      { k: "nd", t: "Normal test data", ok: isNum(nd) && +nd >= 14 },
      { k: "ed", t: "Erroneous / invalid test data", ok: (edNum && +ed < 14) || edWrongType },
      { k: "bd", t: "Boundary test data", ok: isNum(bd) && +bd === 14 },
      { t: "Expected return values for the normal and erroneous rows", ok: nr === "true" && (er === "false" || (edWrongType && /error/.test(er))) },
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
    const condOk = ["read=false", "read==false", 'read="false"', "read='false'", 'read=="false"', "read=='false'", "notread", "not(read)", "read=nottrue", "read!=true", "read<>true", "readisfalse", "readisnottrue"].includes(cond);
    const order = kws.length === 3 && kws.map((x) => x.k).join() === "select,from,where" && kws[0].i === 0;
    const items = [
      { t: "SELECT clause lists the right fields in the right way", ok: sel != null && (strip(sel) === "*" || (fields.includes("sender") && fields.includes("datesent"))) },
      { t: "FROM clause names the right table", ok: frm != null && strip(frm) === "tblmessage" },
      { t: "WHERE keyword is used", ok: whr != null },
      { t: "The condition picks out the right records", ok: condOk },
    ];
    let marks = sum(items), note = "Field and table names must be spelled exactly as given.";
    if (marks === 4 && !order) { marks = 3; items.push({ t: "Keywords appear once each, in the correct order, with nothing extra", ok: false }); }
    return { marks, items, note };
  }

  function checkLogic(state) {
    const an = window.LogicBuilder.analyse(state, { inputs: ["A", "B", "C"], output: "P" });
    const want = (i) => (i === 6 ? 1 : 0);                 // inputs counted A B C, A is the most significant bit
    const full = !!an.table && an.table.every((v, i) => v === want(i)) && an.unused === 0;
    const not = an.gates.some((g) => g.type === "NOT" && g.ins[0] === "C");
    const ands = an.gates.filter((g) => g.type === "AND" && g.ins[0] && g.ins[1]).length;
    const items = full ? [
      { t: "NOT gate used correctly", ok: true }, { t: "Two-input gates combine the signals correctly", ok: true }, { t: "The whole circuit gives the correct output P for every combination of A, B and C", ok: true },
    ] : [
      { t: "A NOT gate is used on the correct input", ok: not },
      { t: "Gates of the correct type combine the signals, each with both inputs connected", ok: ands >= 2 },
      { t: "The whole circuit gives the correct output P for every combination of A, B and C, with no spare gates", ok: false },
    ];
    return { marks: full ? 3 : Math.min(2, (not ? 1 : 0) + Math.min(ands, 2)), items, note: full ? "" : "Use the test switches under the circuit to try it against the description." };
  }

  const checkGate = (a) => {
    const v = squash(a.v).replace(/gate/g, "").replace(/[^a-z]/g, "");
    const ok = v === "or" || v === "aorb";
    return { marks: ok ? 1 : 0, items: [{ k: "v", t: "Gate name", ok }] };
  };

  const checkRows = (key) => (a) => {
    const items = Object.keys(key).map((r) => ({ k: r, t: "Row: " + key[r].label, ok: key[r].ok.includes(a[r] || "") }));
    return { marks: sum(items), items };
  };

  /* ---------- figures ---------- */
  const FLOW = `<svg class="fc" viewBox="0 0 420 404" role="img" aria-label="Flowchart: Start, INPUT x, OUTPUT OK, x = x - 2, decision IS x less than 0. FALSE loops back to before OUTPUT OK. TRUE goes to End.">
<defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#0A1B2E"/></marker></defs>
<g fill="#ffffff" stroke="#0A1B2E" stroke-width="1.6">
<rect x="120" y="10" width="180" height="38" rx="19"/><polygon points="135,72 305,72 285,108 115,108"/><polygon points="135,138 305,138 285,174 115,174"/><rect x="125" y="198" width="170" height="40"/><polygon points="210,262 310,297 210,332 110,297"/><rect x="120" y="356" width="180" height="38" rx="19"/></g>
<g fill="none" stroke="#0A1B2E" stroke-width="1.6" marker-end="url(#arr)">
<path d="M210,48 V72"/><path d="M210,108 V138"/><path d="M210,174 V198"/><path d="M210,238 V262"/><path d="M210,332 V356"/><path d="M310,297 H370 V123 H211"/></g>
<g font-family="Courier New, Courier, monospace" font-size="14" fill="#0A1B2E" text-anchor="middle">
<text x="210" y="34">Start</text><text x="210" y="95">INPUT x</text><text x="210" y="161">OUTPUT "OK"</text><text x="210" y="223">x = x - 2</text><text x="210" y="302">IS x &lt; 0?</text><text x="210" y="380">End</text><text x="342" y="289">FALSE</text><text x="236" y="349">TRUE</text></g></svg>`;

  /* ---------- the paper ---------- */
  window.PAPER = {
    id: "boolean-defensive-ide-v1",
    title: "Boolean logic, defensive design and IDEs",
    subtitle: "J277/02 revision paper · 48 marks",
    file: "Boolean-Defensive-IDE-revision",
    questions: [
      {
        n: 1,
        stem: `<p>OCR-Now is a social media platform. Users can post comments, share photos and message other users.</p><p>Users have to be a minimum of 14 years old to sign up to OCR-Now.</p>`,
        parts: [
          { id: "1ai", label: "1(a)(i)", marks: 3, type: "blanks", check: checkBlanks,
            pre: `<p>The function <code>checkAge()</code>:</p><ul><li>takes the age of the user as a parameter</li><li>checks whether the user is 14 years old or over</li><li>returns True if the user meets the age criteria and False otherwise.</li></ul>`,
            prompt: `<p>Complete the design of the function <code>checkAge()</code></p>`,
            tpl: ["function checkAge(age)", "     if {c} then", "          signup = True", "     else", "          {e}", "     endif", "     {r} signup", "endfunction"],
            widths: { c: 16, e: 22, r: 12 } },
          { id: "1aii", label: "1(a)(ii)", marks: 1, type: "fields", check: checkType(["int", "integer", "integers", "int32", "long", "short"], "integer"),
            prompt: `<p>Give the most appropriate data type for <code>age</code></p>`, fields: [{ k: "v", short: true }] },
          { id: "1aiii", label: "1(a)(iii)", marks: 1, type: "fields", check: checkType(["bool", "boolean"], "boolean"),
            prompt: `<p>Give the most appropriate data type for <code>signup</code></p>`, fields: [{ k: "v", short: true }] },
          { id: "1aiv", label: "1(a)(iv)", marks: 4, type: "grid", check: checkTestPlan,
            prompt: `<p>Complete the test plan for <code>checkAge()</code></p>`,
            head: ["Test data", "Test type", "Expected return value"],
            rows: [[{ k: "nd" }, "Normal", { k: "nr" }], [{ k: "ed" }, "Erroneous / invalid", { k: "er" }], [{ k: "bd" }, "Boundary", "True"]] },
          { id: "1b", label: "1(b)", marks: 4, type: "fields", check: checkSql,
            pre: `<p>Data about the messages that users send to each other are stored in the database table <code>TblMessage</code></p><p>An example of some of the data is given:</p>
<table class="grid narrow"><caption>TblMessage</caption><thead><tr><th>Sender</th><th>To</th><th>DateSent</th><th>Read</th></tr></thead><tbody><tr><td>VE123</td><td>CC398</td><td>01/05/26</td><td>False</td></tr><tr><td>CC398</td><td>JP788</td><td>01/05/26</td><td>True</td></tr><tr><td>JP788</td><td>SM912</td><td>02/05/26</td><td>True</td></tr></tbody></table>
<p>The <code>Read</code> field indicates whether a message has been read (True) or not read (False).</p>`,
            prompt: `<p>Write an SQL statement to show the fields <code>Sender</code> and <code>DateSent</code> for all messages that have not been read.</p>`,
            fields: [{ k: "sql", rows: 4, mono: true }] },
          { id: "1ci", label: "1(c)(i)", marks: 3, type: "fields",
            pre: `<p>OCR-Now is designing an application (app) that will allow users to access the social media platform using their mobile device.</p>`,
            prompt: `<p>Give <b>three</b> inputs that could be included in the design of the app to authenticate the identity of a user.</p>`,
            fields: [{ k: "a", label: "1" }, { k: "b", label: "2" }, { k: "c", label: "3" }] },
          { id: "1cii", label: "1(c)(ii)", marks: 1, type: "fields",
            prompt: `<p>Give <b>one</b> example of input validation that could be used in the design of the app.</p>`, fields: [{ k: "v", rows: 2 }] },
        ],
      },
      {
        n: 2,
        stem: `<p>A school has two buildings, building A and building B. Students in year 7, 8 and 9 are taught in building A. Students in year 10 and 11 are taught in building B.</p><p>The following algorithm asks the student to input the year group they are in and outputs the building they are taught in.</p>
<pre class="listing">01 year = int(input("Enter your year group"))
02 if year &gt;= 7 then
03     building = "A"
04     print("building" + building)
05 endif
06 if year &gt;= 10 then
07     building = "B"
08     print("building" + building)
09 endif</pre><p>The algorithm contains a logic error when 10 or 11 is input.</p>`,
        parts: [
          { id: "2i", label: "2(i)", marks: 2, type: "fields", prompt: `<p>Describe the logic error that occurs when 10 or 11 is input.</p>`, fields: [{ k: "v", rows: 4 }] },
          { id: "2ii", label: "2(ii)", marks: 1, type: "fields", prompt: `<p>State <b>one</b> way that the logic error can be corrected.</p>`, fields: [{ k: "v", rows: 2 }] },
        ],
      },
      {
        n: 3,
        stem: ``,
        parts: [
          { id: "3a", label: "3(a)", marks: 3, type: "logic", check: checkLogic, inputs: ["A", "B", "C"], output: "P",
            pre: `<p>A factory uses a machine, (<b>P</b>), that operates when button (<b>A</b>) is pressed. The power switch (<b>B</b>) turns the machine on and off. The safety button (<b>C</b>) stops the machine when it is pressed.</p><p>This logic system is given in the table.</p>
<table class="grid"><thead><tr><th>Input</th><th>Description</th><th>0</th><th>1</th></tr></thead><tbody><tr><td>A</td><td>Button to operate machine</td><td>Button not pressed</td><td>Button pressed</td></tr><tr><td>B</td><td>Power switch</td><td>Power is OFF</td><td>Power is ON</td></tr><tr><td>C</td><td>Safety button</td><td>Button not pressed</td><td>Button pressed</td></tr></tbody></table>
<p><b>P</b> turns on (1) when <b>A</b> is pressed, power is ON and <b>C</b> is <b>not</b> pressed.</p>`,
            prompt: `<p>Draw the logic circuit for <b>P</b>.</p>` },
          { id: "3b", label: "3(b)", marks: 1, type: "fields", check: checkGate,
            prompt: `<p>Give the name of the logic gate that produces this truth table:</p>
<table class="grid narrow"><thead><tr><th>Input A</th><th>Input B</th><th>Output</th></tr></thead><tbody><tr><td>0</td><td>0</td><td>0</td></tr><tr><td>0</td><td>1</td><td>1</td></tr><tr><td>1</td><td>0</td><td>1</td></tr><tr><td>1</td><td>1</td><td>1</td></tr></tbody></table>`,
            fields: [{ k: "v", label: "Gate", short: true }] },
        ],
      },
      {
        n: 4,
        stem: `<p>A program asks a user to enter a number. Only integer values between 1 and 100 (inclusive) are accepted. The program is tested.</p>`,
        parts: [
          { id: "4", label: "4", marks: 4, type: "ticks", multi: true,
            check: checkRows({ r1: { label: "27", ok: ["n"] }, r2: { label: "“Hello”", ok: ["i"] }, r3: { label: "105", ok: ["i"] }, r4: { label: "100", ok: ["b", "b,n"] } }),
            prompt: `<p>Tick (✓) <b>one or more</b> boxes in each row to identify the type or types of test for each example of test data.</p>`,
            rowHead: "Example test data",
            cols: [{ k: "n", label: "Normal test data" }, { k: "b", label: "Boundary test data" }, { k: "i", label: "Invalid / erroneous test data" }],
            rows: [{ k: "r1", label: "27" }, { k: "r2", label: "“Hello”" }, { k: "r3", label: "105" }, { k: "r4", label: "100" }] },
        ],
      },
      {
        n: 5,
        stem: `<p>This flowchart uses iteration.</p>${FLOW}<p>A programmer implements the flowchart as a program in a high-level language using an Integrated Development Environment (IDE).</p>`,
        parts: [
          { id: "5", label: "5", marks: 4, type: "fields",
            prompt: `<p>Identify and describe <b>two</b> tools that the programmer could use in the IDE to create a program from the flowchart.</p>`,
            fields: [{ k: "t1", label: "Tool 1" }, { k: "d1", label: "Description", rows: 2 }, { k: "t2", label: "Tool 2" }, { k: "d2", label: "Description", rows: 2 }] },
        ],
      },
      {
        n: 6,
        stem: `<p>An algorithm stores the position of a character on a straight line as an integer. A user can move the character left or right.</p><p>The following algorithm:</p><ul><li>generates one random number between 1 and 512 (inclusive) to store as the position</li><li>prompts the user to input a direction to move (left or right)</li><li>takes a direction as input until a valid direction is input.</li></ul>
<pre class="listing">p = random(1, 512)
print("The position is ", p)
a = ""
while a != "left" and a != "right"
  a = input("Enter direction, left or right")
endwhile</pre>`,
        parts: [
          { id: "6", label: "6", marks: 4, type: "fields", prompt: `<p>Describe <b>two</b> ways to improve the maintainability of the algorithm.</p>`,
            fields: [{ k: "a", label: "1", rows: 3 }, { k: "b", label: "2", rows: 3 }] },
        ],
      },
      {
        n: 7, stem: ``,
        parts: [
          { id: "7", label: "7", marks: 2, type: "fields", prompt: `<p>State what is meant by the term <b>syntax error</b>. Give <b>one</b> example of a syntax error in a program.</p>`,
            fields: [{ k: "d", label: "Definition", rows: 2 }, { k: "e", label: "Example", rows: 2 }] },
        ],
      },
      {
        n: 8,
        stem: `<p>A program allows users to search for and watch videos. Users give a rating to the videos they watch.</p>`,
        parts: [
          { id: "8", label: "8", marks: 2, type: "fields", prompt: `<p>Describe <b>one</b> method of defensive design that can be used when creating the program.</p>`, fields: [{ k: "v", rows: 4 }] },
        ],
      },
      {
        n: 9, stem: ``,
        parts: [
          { id: "9a", label: "9(a)", marks: 2, type: "fields", prompt: `<p>Give <b>two</b> reasons why some programs are written in a low-level language.</p>`,
            fields: [{ k: "a", label: "1", rows: 2 }, { k: "b", label: "2", rows: 2 }] },
          { id: "9b", label: "9(b)", marks: 3, type: "fields", prompt: `<p>Describe the benefits of using a compiler instead of an interpreter when writing a program.</p>`, fields: [{ k: "v", rows: 6 }] },
        ],
      },
      {
        n: 10,
        stem: `<p>A programmer uses a high-level language and an Integrated Development Environment (IDE) to create a computer game.</p><p>The IDE includes a translator, such as a compiler or an interpreter.</p>`,
        parts: [
          { id: "10", label: "10", marks: 3, type: "ticks", multi: false,
            check: checkRows({ s1: { label: "statement 1", ok: ["b"] }, s2: { label: "statement 2", ok: ["c"] }, s3: { label: "statement 3", ok: ["i"] } }),
            prompt: `<p>Tick (✓) <b>one</b> box in each row to identify whether each statement describes the use of a compiler, an interpreter, or both.</p>`,
            rowHead: "Statement",
            cols: [{ k: "c", label: "Compiler" }, { k: "i", label: "Interpreter" }, { k: "b", label: "Both" }],
            rows: [{ k: "s1", label: "Translates high-level code to low-level instructions." }, { k: "s2", label: "Produces an executable file." }, { k: "s3", label: "Program needs to be translated every time it is run." }] },
        ],
      },
    ],
  };
})();
