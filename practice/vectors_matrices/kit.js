/* Refresher kit: shared parser, flow and helpers for the step-entry refreshers.
   Authoring source. Copies in each refresher's dist/ are checked by sync.py; do not hand-edit them. */
(function (root) {
  'use strict';

  // ---------------------------------------------------------------- expressions
  // Numbers, named variables, + - * / ^, parentheses, implicit products (2t, 3ln(2)),
  // functions ln exp sqrt abs min max, and the constant e. "log" is refused so base 10 is never assumed.
  var FUNCS = { ln: [1, Math.log], exp: [1, Math.exp], sqrt: [1, Math.sqrt], abs: [1, Math.abs], min: [2, Math.min], max: [2, Math.max] };
  function tokenize(src) {
    var s = String(src).replace(/[−–]/g, '-').replace(/[×·]/g, '*').replace(/÷/g, '/');
    var re = /\s*(\d+\.?\d*|\.\d+|[A-Za-z]+|[-+*\/^(),])/y, out = [], m;
    re.lastIndex = 0;
    while (re.lastIndex < s.length) {
      if (/^\s*$/.test(s.slice(re.lastIndex))) break;
      var at = re.lastIndex;
      m = re.exec(s);
      if (!m) throw new Error('I can’t read “' + s.slice(at).trim().charAt(0) + '”.');
      out.push(m[1]);
    }
    if (!out.length) throw new Error('This field is empty.');
    return out;
  }
  function parse(src, opts) {
    var allowed = (opts && opts.vars) || [], t = tokenize(src), i = 0, used = {};
    function peek() { return t[i]; }
    function startsAtom(tok) { return tok !== undefined && (/^[\d.]/.test(tok) || /^[A-Za-z]/.test(tok) || tok === '('); }
    function expr() { var a = term(); while (peek() === '+' || peek() === '-') { var op = t[i++], b = term(); a = bin(op, a, b); } return a; }
    function term() {
      var a = unary();
      for (;;) {
        if (peek() === '*' || peek() === '/') { var op = t[i++], b = unary(); a = bin(op, a, b); }
        else if (startsAtom(peek())) a = bin('*', a, unary());
        else return a;
      }
    }
    function unary() { if (peek() === '-') { i++; var a = unary(); return function (e) { return -a(e); }; } if (peek() === '+') { i++; return unary(); } return power(); }
    function power() { var a = atom(); if (peek() === '^') { i++; var b = unary(); return function (e) { return Math.pow(a(e), b(e)); }; } return a; }
    function atom() {
      var tok = t[i++];
      if (tok === undefined) throw new Error('This stops partway through.');
      if (/^[\d.]/.test(tok)) { var v = parseFloat(tok); return function () { return v; }; }
      if (tok === '(') { var a = expr(); if (t[i++] !== ')') throw new Error('A parenthesis is not closed.'); return a; }
      if (/^[A-Za-z]/.test(tok)) {
        var name = tok.toLowerCase();
        if (allowed.indexOf(name) !== -1) { used[name] = true; return function (e) { return e[name]; }; }
        if (name === 'e') return function () { return Math.E; };
        if (name === 'log') throw new Error('Write ln for the natural log.');
        if (FUNCS[name]) {
          if (t[i++] !== '(') throw new Error('Write ' + name + '(…) with parentheses.');
          var args = [expr()];
          while (peek() === ',') { i++; args.push(expr()); }
          if (t[i++] !== ')') throw new Error('A parenthesis is not closed.');
          if (args.length !== FUNCS[name][0]) throw new Error(name + ' takes ' + FUNCS[name][0] + (FUNCS[name][0] === 1 ? ' value.' : ' values.'));
          var f = FUNCS[name][1];
          return function (e) { return f.apply(null, args.map(function (g) { return g(e); })); };
        }
        // Split run-together letters like "et" or "eln" only into known names, otherwise refuse.
        throw new Error('I don’t know “' + tok + '”.' + (allowed.length ? ' Use ' + allowed.join(', ') + ', numbers, e and ln.' : ' Use numbers, e, ln and exp.'));
      }
      throw new Error('I didn’t expect “' + tok + '” there.');
    }
    function bin(op, a, b) {
      if (op === '+') return function (e) { return a(e) + b(e); };
      if (op === '-') return function (e) { return a(e) - b(e); };
      if (op === '*') return function (e) { return a(e) * b(e); };
      return function (e) { return a(e) / b(e); };
    }
    var fn = expr();
    if (i < t.length) throw new Error('I didn’t expect “' + t[i] + '” there.');
    return { fn: fn, vars: Object.keys(used) };
  }
  // A numeric answer: an expression with no variables. Returns {ok, value} or {ok:false, error}.
  function number(src) {
    if (src === undefined || /^\s*$/.test(src)) return { ok: false, empty: true, error: 'Fill in this field.' };
    try {
      var v = parse(src).fn({});
      if (!isFinite(v)) return { ok: false, error: 'This has no finite value.' };
      return { ok: true, value: v };
    } catch (err) { return { ok: false, error: err.message }; }
  }
  // Answers typed as decimals are accepted to the rounding the page asks for; exact forms must agree closely.
  function near(v, target, decimals) {
    var tol = Math.max(0.5 * Math.pow(10, -(decimals === undefined ? 3 : decimals)), 1e-9 * Math.abs(target));
    return Math.abs(v - target) <= tol + 1e-12;
  }
  function fmt(v, d) {
    var p = Math.pow(10, d === undefined ? 3 : d), s = (Math.round(v * p) / p).toFixed(d === undefined ? 3 : d);
    s = s.indexOf('.') >= 0 ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
    return s === '-0' ? '0' : s.replace('-', '−');
  }

  // ---------------------------------------------------------------- page flow
  // Quick route: the diagnostic is correct before any support is opened.
  // Recovery route: any support opened -> the changed case decides completion.
  // Completion is recomputed from current answers on every change.
  function Flow(o) {
    var s = { recovery: false, aDone: false, quick: false, cDone: false, cHelp: false, explained: false };
    var $ = function (id) { return document.getElementById(id); };
    function complete() { return (s.aDone && s.quick) || s.cDone; }
    function render() {
      var p = $('progress'), done = complete();
      if (done && s.cDone) p.textContent = s.cHelp ? 'Done. You solved a new case, using its reminder.' : 'Done. You solved a new case on your own.';
      else if (done) p.textContent = 'Done. You did this without the reminder. The extra practice at the end is optional.';
      else if (s.aDone || s.explained) p.textContent = 'One step left: the next case, on your own.';
      else if (s.recovery) p.textContent = 'Reminder open. Finish this case, then do one more on your own.';
      else p.textContent = 'Start with the task below. If you get it right, you are done.';
      // Once the quick route is earned, opening help afterwards is reference only: no new requirement appears.
      $('case-C').hidden = !(s.recovery && (s.aDone || s.explained) && !s.quick);
      $('done').hidden = !done;
      if (done) $('done-text').textContent = s.cDone
        ? (s.cHelp ? 'You worked a case you had not seen, with its reminder open.' : 'You worked a case you had not seen, without the walkthrough.')
        : 'You worked this correctly without the reminder.';
      $('case-X').hidden = !done;
    }
    var api = {
      state: s, render: render,
      recovery: function () { s.recovery = true; render(); },
      explained: function () { if (!s.explained) { s.explained = true; s.recovery = true; render(); } },
      solvedA: function (ok) { s.aDone = ok; s.quick = ok && !s.recovery; render(); },
      solvedC: function (ok) { s.cDone = ok; render(); },
      helpC: function () { s.cHelp = true; render(); },
      editA: function () { s.aDone = false; s.quick = false; render(); },
      editC: function () { s.cDone = false; render(); }
    };
    if (o && o.expose) root.__refresherState = s; // read by browser tests only
    return api;
  }

  // ---------------------------------------------------------------- DOM helpers
  function el(tag, attrs, text) {
    var e = document.createElement(tag);
    for (var k in (attrs || {})) e.setAttribute(k, attrs[k]);
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function say(id, text, kind) { var f = document.getElementById(id); f.textContent = text; f.className = 'feedback' + (kind ? ' ' + kind : ''); }
  // Staged hints: one per click, then the button stops.
  function hints(buttonId, listId, list) {
    var n = 0, b = document.getElementById(buttonId);
    b.addEventListener('click', function () {
      if (n < list.length) document.getElementById(listId).appendChild(el('li', {}, list[n++]));
      if (n === list.length) { b.disabled = true; b.textContent = 'No more hints'; }
    });
  }
  // Inputs widen to fit what is typed.
  function autosize(container) {
    container.addEventListener('input', function (ev) {
      var t = ev.target;
      if (t && t.classList && t.classList.contains('blank')) t.style.width = Math.max(2.6, Math.min(10, t.value.length * 0.58 + 0.9)) + 'em';
    });
  }
  function values(container) {
    var out = {};
    container.querySelectorAll('input.blank').forEach(function (i) { out[i.getAttribute('data-field')] = i.value; });
    return out;
  }
  function mark(container, field, bad) {
    container.querySelectorAll('input.blank').forEach(function (i) {
      if (i.getAttribute('data-field') === field && bad) i.setAttribute('aria-invalid', 'true'); else i.removeAttribute('aria-invalid');
    });
  }

  // ---------------------------------------------------------------- generic items (calculus pages, 2026-11-13)
  // Typed math is normalized first: θ → theta, superscript digits → ^n. Existing pages call parse() directly and are unaffected.
  var SUP = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9' };
  function normalize(src) {
    return String(src === undefined ? '' : src).replace(/θ/g, 'theta').replace(/λ/g, 'lambda')
      .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, function (m) { return '^' + m.split('').map(function (c) { return SUP[c]; }).join(''); });
  }
  // Two functions agree if they match at every sample point where the target is defined.
  function agrees(fn, target, samples) {
    var used = 0;
    for (var i = 0; i < samples.length; i++) {
      var t = target(samples[i]); if (!isFinite(t)) continue;
      var v = fn(samples[i]); used++;
      if (!isFinite(v) || Math.abs(v - t) > 1e-7 * Math.max(1, Math.abs(t))) return false;
    }
    return used > 0;
  }
  // item.kind: 'number' {answer, decimals, slips:[{value,msg}], consequence(v)}
  //            'expr'   {vars, target(e), samples:[e], slips:[{fn(e),msg}]}
  //            'choice' {answer, msgs:{key: msg}}
  // Returns {ok:false, empty?, message} for unreadable input, else {ok:true, match, message, slip}.
  function checkItem(item, raw) {
    var miss = item.miss || 'Not yet. Compare your answer with the method in the reminder.';
    if (item.kind === 'choice') {
      if (!raw) return { ok: false, empty: true, message: 'Choose an answer.' };
      if (raw === item.answer) return { ok: true, match: true };
      return { ok: true, match: false, message: (item.msgs && item.msgs[raw]) || miss };
    }
    if (raw === undefined || /^\s*$/.test(raw)) return { ok: false, empty: true, message: 'Fill in this field.' };
    var src = normalize(raw);
    if (item.kind === 'number') {
      var r = number(src);
      if (!r.ok) return { ok: false, message: r.error };
      if (near(r.value, item.answer, item.decimals)) return { ok: true, match: true, value: r.value };
      var slip = (item.slips || []).filter(function (s) { return near(r.value, s.value, item.decimals); })[0];
      var said = item.consequence ? item.consequence(r.value) : '';
      return { ok: true, match: false, value: r.value, slip: slip, message: (said ? said + ' ' : '') + (slip ? slip.msg : (said ? '' : miss)) };
    }
    var p;
    try { p = parse(src, { vars: item.vars }); } catch (err) { return { ok: false, message: err.message }; }
    if (agrees(p.fn, item.target, item.samples)) return { ok: true, match: true };
    var s2 = (item.slips || []).filter(function (s) { return agrees(p.fn, s.fn, item.samples); })[0];
    var said2 = item.consequence ? item.consequence(p.fn) : '';
    return { ok: true, match: false, slip: s2, message: (said2 ? said2 + ' ' : '') + (s2 ? s2.msg : (said2 ? '' : miss)) };
  }
  // Ladder: check lines in order and report the first that is wrong or unreadable.
  function ladder(items, raws) {
    for (var i = 0; i < items.length; i++) {
      var r = checkItem(items[i], raws[i]);
      if (!r.ok || !r.match) return { first: i, empty: !!r.empty, message: r.message || (items[i].msg) };
    }
    return { first: -1 };
  }
  // Solution so far: reveal the worked steps one at a time. onFirst runs when the first step is shown.
  function solution(buttonId, listId, steps, onFirst) {
    var n = 0, b = document.getElementById(buttonId), list = document.getElementById(listId);
    b.textContent = 'Show the first step of the solution';
    b.addEventListener('click', function () {
      if (n === 0 && onFirst) onFirst();
      if (n < steps.length) { var li = el('li'); li.innerHTML = steps[n++]; list.appendChild(li); }
      if (n === steps.length) { b.disabled = true; b.textContent = 'That is the whole solution'; }
      else b.textContent = 'Show the next step';
    });
  }
  // Opened from a problem set's entry check after a miss: start with the reminder open.
  function fromEntry() { return typeof location !== 'undefined' && /[?&]from=entry(&|$)/.test(location.search); }

  // Wire a calculus page. Markup contract (ids): case-A, entry-A [data-field=a], check-A, remind-A, recovery-A,
  // ladder-A [data-field=s0..sN, or radio name=sN], check-ladder, feedback-ladder, hint-A, hints-A, solution-A (button), steps-A (ol),
  // case-C, entry-C [data-field=c], check-C, stuck-C, rules-C, feedback-C; optional extension items item-<id> with [data-field=v] or radio name=<id>.
  // M: { A, C, ladder:[items], X:{id:item}, hints:[...], steps:[html...], fill: index of the ladder line that answers A (optional) }
  function wire(M, hooks) {
    hooks = hooks || {};
    var $ = function (id) { return document.getElementById(id); }, flow = Flow({ expose: true });
    function raw(scope, field) {
      var box = $(scope), inp = box.querySelector('input[data-field="' + field + '"]');
      if (inp) return inp.value;
      var r = box.querySelector('input[name="' + field + '"]:checked'); return r ? r.value : null;
    }
    function report(fid, item, res) {
      if (!res.ok) { say(fid, res.message, 'miss'); return false; }
      if (res.match) { say(fid, item.good || 'Right.', 'good'); return true; }
      say(fid, res.message, 'miss'); return false;
    }
    hints('hint-A', 'hints-A', M.hints);
    solution('solution-A', 'steps-A', M.steps, function () { flow.explained(); });
    document.querySelectorAll('.line').forEach(function (l) { autosize(l); });
    function openA() { $('recovery-A').hidden = false; $('remind-A').setAttribute('aria-expanded', 'true'); $('remind-A').textContent = 'Hide the reminder'; flow.recovery(); if (hooks.open) hooks.open(); }
    function collapseA() { $('recovery-A').hidden = true; $('remind-A').setAttribute('aria-expanded', 'false'); $('remind-A').textContent = 'Show the reminder again'; }
    $('remind-A').addEventListener('click', function () { if ($('recovery-A').hidden) openA(); else collapseA(); });
    $('hint-A').addEventListener('click', function () { flow.recovery(); });
    $('check-A').addEventListener('click', function () {
      var v = raw('entry-A', 'a'), res = checkItem(M.A, v), ok = report('feedback-A', M.A, res);
      if (hooks.checkA) hooks.checkA(res, v);
      if (ok && flow.state.recovery) collapseA();
      flow.solvedA(ok);
    });
    $('entry-A').addEventListener('input', function () { say('feedback-A', ''); flow.editA(); });
    $('check-ladder').addEventListener('click', function () {
      var raws = M.ladder.map(function (_, i) { return raw('ladder-A', 's' + i); }), r = ladder(M.ladder, raws);
      mark($('ladder-A'), null);
      if (r.first === -1) {
        say('feedback-ladder', 'Every line is right.' + (M.fill !== undefined ? ' Your answer is now in the task above.' : ''), 'good');
        if (M.fill !== undefined) {
          var inp = $('entry-A').querySelector('input[data-field="a"]'); inp.value = raws[M.fill];
          say('feedback-A', 'Right. Your steps solve it.', 'good'); collapseA(); flow.solvedA(true);
        }
        return;
      }
      mark($('ladder-A'), 's' + r.first, !r.empty);
      say('feedback-ladder', 'Line ' + (r.first + 1) + ': ' + r.message + (r.first ? ' The lines above it are right.' : ''), 'miss');
    });
    $('ladder-A').addEventListener('input', function () { say('feedback-ladder', ''); mark($('ladder-A'), null); });
    $('ladder-A').addEventListener('change', function () { say('feedback-ladder', ''); });
    $('check-C').addEventListener('click', function () { flow.solvedC(report('feedback-C', M.C, checkItem(M.C, raw('entry-C', 'c')))); });
    $('entry-C').addEventListener('input', function () { say('feedback-C', ''); flow.editC(); });
    $('entry-C').addEventListener('change', function () { say('feedback-C', ''); flow.editC(); });
    $('stuck-C').addEventListener('click', function () { $('rules-C').hidden = false; $('stuck-C').disabled = true; flow.helpC(); });
    Object.keys(M.X || {}).forEach(function (id) {
      var box = $('item-' + id); if (!box) return;
      $('check-' + id).addEventListener('click', function () { report('feedback-' + id, M.X[id], checkItem(M.X[id], raw('item-' + id, box.querySelector('input[data-field="v"]') ? 'v' : id))); });
      box.addEventListener('input', function () { say('feedback-' + id, ''); });
      box.addEventListener('change', function () { say('feedback-' + id, ''); });
    });
    flow.render();
    if (fromEntry()) openA();
    return { flow: flow, openA: openA, collapseA: collapseA };
  }

  root.RefresherKit = { parse: parse, number: number, near: near, fmt: fmt, Flow: Flow, el: el, say: say, hints: hints, autosize: autosize, values: values, mark: mark,
    normalize: normalize, agrees: agrees, checkItem: checkItem, ladder: ladder, solution: solution, fromEntry: fromEntry, wire: wire };
})(typeof window !== 'undefined' ? window : globalThis);
