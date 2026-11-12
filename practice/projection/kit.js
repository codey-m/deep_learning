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

  root.RefresherKit = { parse: parse, number: number, near: near, fmt: fmt, Flow: Flow, el: el, say: say, hints: hints, autosize: autosize, values: values, mark: mark };
})(typeof window !== 'undefined' ? window : globalThis);
