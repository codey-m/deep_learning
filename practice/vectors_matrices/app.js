/* Vectors and matrices refresher: page behaviour. */
(function () {
  'use strict';
  var K = window.RefresherKit, M = window.VectorsModel, $ = function (id) { return document.getElementById(id); };
  var flow = K.Flow({ expose: true });
  function num(v) { return v < 0 ? '−' + Math.abs(v) : String(v); }

  // Notation drawn from the model, so the page and the checks use the same numbers.
  function drawMatrix(id, W) {
    var m = $(id); m.style.gridTemplateColumns = 'repeat(' + W[0].length + ', auto)';
    W.forEach(function (row, i) { row.forEach(function (v, j) { m.appendChild(K.el('span', { 'data-r': i, 'data-c': j }, num(v))); }); });
  }
  function drawVector(id, x) { var m = $(id); m.style.gridTemplateColumns = 'auto'; x.forEach(function (v, j) { m.appendChild(K.el('span', { 'data-r': j }, num(v))); }); }
  ['A', 'C'].forEach(function (id) { drawMatrix('mat-' + id, M.CASES[id].W); drawVector('vec-' + id, M.CASES[id].x); });

  // Row highlighting: one purposeful action, one visible consequence (which numbers pair up).
  function wireRows(id) {
    var c = M.CASES[id], box = $('rows-' + id);
    c.W.forEach(function (row, i) {
      var b = K.el('button', { type: 'button', 'aria-pressed': 'false' }, 'Row ' + (i + 1));
      b.addEventListener('click', function () {
        box.querySelectorAll('button').forEach(function (o) { o.setAttribute('aria-pressed', 'false'); });
        b.setAttribute('aria-pressed', 'true');
        document.querySelectorAll('#mat-' + id + ' span, #vec-' + id + ' span').forEach(function (s) { s.classList.remove('hl'); });
        document.querySelectorAll('#mat-' + id + ' span[data-r="' + i + '"], #vec-' + id + ' span').forEach(function (s) { s.classList.add('hl'); });
        var pairs = row.map(function (w, j) { return num(w) + ' with ' + num(c.x[j]); }).join(', ');
        $('row-read-' + id).textContent = 'Entry ' + (i + 1) + ' of W x pairs row ' + (i + 1) + ' of W with x: ' + pairs + '. Multiply each pair, then add.';
      });
      box.appendChild(b);
    });
  }
  wireRows('A'); wireRows('C');

  // Shape figure: rectangles sized by the model's dimensions, inner sides labelled.
  (function shapeFigure() {
    var L = M.CASES.A.shape.left, R = M.CASES.A.shape.right, u = 20, NS = 'http://www.w3.org/2000/svg';
    function s(tag, a, txt) { var e = document.createElementNS(NS, tag); for (var k in a) e.setAttribute(k, a[k]); if (txt !== undefined) e.textContent = txt; return e; }
    var W = 30 + L[1] * u + 44 + R[1] * u + 56 + R[1] * u + 12, H = 40 + L[0] * u + 34;
    var svg = s('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-labelledby': 'shapefig-A-desc' }), x0 = 30, y0 = 30;
    function rect(x, y, w, h, label, fill) {
      svg.appendChild(s('rect', { x: x, y: y, width: w, height: h, fill: fill, stroke: '#16242a', 'stroke-width': 1.5, rx: 3 }));
      svg.appendChild(s('text', { x: x + w / 2, y: y + h / 2 + 5, 'text-anchor': 'middle', 'font-size': 18, 'font-weight': 700 }, label));
    }
    rect(x0, y0, L[1] * u, L[0] * u, 'A', '#d6ecee');
    svg.appendChild(s('text', { x: x0 - 6, y: y0 + L[0] * u / 2 + 5, 'text-anchor': 'end', 'font-size': 18 }, String(L[0])));
    svg.appendChild(s('text', { x: x0 + L[1] * u / 2, y: y0 - 8, 'text-anchor': 'middle', 'font-size': 18, 'font-weight': 700, fill: '#9a4a00' }, String(L[1])));
    var x1 = x0 + L[1] * u + 44;
    rect(x1, y0, R[1] * u, R[0] * u, 'B', '#e8eef0');
    svg.appendChild(s('text', { x: x1 - 6, y: y0 + R[0] * u / 2 + 5, 'text-anchor': 'end', 'font-size': 18, 'font-weight': 700, fill: '#9a4a00' }, String(R[0])));
    svg.appendChild(s('text', { x: x1 + R[1] * u / 2, y: y0 - 8, 'text-anchor': 'middle', 'font-size': 18 }, String(R[1])));
    var x2 = x1 + R[1] * u + 56;
    svg.appendChild(s('text', { x: x2 - 28, y: y0 + L[0] * u / 2 + 5, 'text-anchor': 'middle', 'font-size': 22 }, '='));
    rect(x2, y0, R[1] * u, L[0] * u, 'AB', '#fff');
    svg.appendChild(s('text', { x: x2 + R[1] * u / 2, y: y0 + L[0] * u + 24, 'text-anchor': 'middle', 'font-size': 18 }, '? × ?'));
    svg.appendChild(s('style', {}, 'text{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;fill:#16242a}'));
    $('shapefig-A').appendChild(svg);
    $('shapefig-A-desc').textContent = 'Figure: A drawn as ' + L[0] + ' rows by ' + L[1] + ' columns, B as ' + R[0] + ' rows by ' + R[1] + ' columns. The matching inner sizes, ' + L[1] + ' and ' + R[0] + ', are marked. The product AB is drawn with A’s height and B’s width, its size left for you to read.';
  })();

  // The extension's choice list comes from the model.
  M.CASES.C.defined.options.forEach(function (o) {
    var l = K.el('label'); var r = K.el('input', { type: 'radio', name: 'defined', value: o[0] }); l.appendChild(r); l.appendChild(document.createTextNode(' ' + o[1])); $('defined-C').appendChild(l);
  });

  document.querySelectorAll('.line, .eq').forEach(function (l) { K.autosize(l); });
  var HINTS = [
    'Entry 1 of W x uses only row 1 of W. Pair its first number with the first number of x, and so on.',
    'Multiply each pair and add the products. Do the same with row 2 for entry 2.',
    'For the shape, line the sizes up as (4 × 2)(2 × 5). The middle two must match; the outer two remain.'
  ];
  K.hints('hint-A', 'hints-A', HINTS);

  function prodRaws(scope, n) { var v = K.values($(scope)); var out = []; for (var i = 0; i < n; i++) out.push(v['e' + i]); return out; }
  function shapeRaws(scope) { var v = K.values($(scope)); return [v.r, v.c]; }

  $('check-A').addEventListener('click', function () {
    var p = M.checkProduct('A', prodRaws('entry-A1', 2)), sh = M.checkShape(shapeRaws('entry-A2')[0], shapeRaws('entry-A2')[1], M.CASES.A.shape.left, M.CASES.A.shape.right);
    var msgs = [];
    if (!p.ok || !p.match) msgs.push('Part 1: ' + p.message);
    if (!sh.ok || !sh.match) msgs.push('Part 2: ' + sh.message);
    var ok = p.ok && p.match && sh.ok && sh.match;
    K.say('feedback-A', ok ? 'Both parts are right.' : msgs.join(' '), ok ? 'good' : 'miss');
    if (ok && flow.state.recovery) collapseA();
    flow.solvedA(ok);
  });
  ['entry-A1', 'entry-A2'].forEach(function (id) { $(id).addEventListener('input', function () { K.say('feedback-A', ''); flow.editA(); }); });
  function openA() { $('recovery-A').hidden = false; $('remind-A').setAttribute('aria-expanded', 'true'); $('remind-A').textContent = 'Hide the reminder'; flow.recovery(); }
  function collapseA() { $('recovery-A').hidden = true; $('remind-A').setAttribute('aria-expanded', 'false'); $('remind-A').textContent = 'Show the reminder again'; }
  $('remind-A').addEventListener('click', function () { if ($('recovery-A').hidden) openA(); else collapseA(); });
  $('explain-A').addEventListener('toggle', function () { if ($('explain-A').open) flow.explained(); });
  $('check-ladder').addEventListener('click', function () {
    var v = K.values($('ladder-A')), r = M.checkRowSteps([v.p0, v.p1, v.p2, v.p3], 0);
    if (r.first === -1) { K.mark($('ladder-A'), null); K.say('feedback-ladder', 'Row 1 is right. Put its sum in entry 1 above, then do row 2.', 'good'); return; }
    K.mark($('ladder-A'), 'p' + r.first, !r.empty);
    K.say('feedback-ladder', r.message, 'miss');
  });
  $('ladder-A').addEventListener('input', function () { K.say('feedback-ladder', ''); K.mark($('ladder-A'), null); });

  $('check-C').addEventListener('click', function () {
    var p = M.checkProduct('C', prodRaws('entry-C1', 3)), msgs = [], d = M.CASES.C.defined;
    var choice = document.querySelector('input[name="defined"]:checked');
    if (!p.ok || !p.match) msgs.push('Part 1: ' + p.message);
    var dOk = false;
    if (!choice) msgs.push('Part 2: choose a product.');
    else if (choice.value !== d.answer) msgs.push('Part 2: for each product, compare the inner sizes: the columns of the left matrix and the rows of the right one.');
    else {
      var sh = shapeRaws('entry-C2'), s = M.checkShape(sh[0], sh[1], [2, 3], [3, 2]);
      if (!s.ok || !s.match) msgs.push('Part 2: ' + s.message); else dOk = true;
    }
    var ok = p.ok && p.match && dOk;
    K.say('feedback-C', ok ? 'Both parts are right.' : msgs.join(' '), ok ? 'good' : 'miss');
    flow.solvedC(ok);
  });
  ['entry-C1', 'entry-C2'].forEach(function (id) { $(id).addEventListener('input', function () { K.say('feedback-C', ''); flow.editC(); }); });
  $('defined-C').addEventListener('change', function () { K.say('feedback-C', ''); flow.editC(); });
  $('stuck-C').addEventListener('click', function () { $('support-C').hidden = false; $('stuck-C').disabled = true; flow.helpC(); });

  $('check-X1').addEventListener('click', function () { var r = M.checkSquaredNorm(K.values($('item-X1')).n); K.say('feedback-X1', r.match ? 'Right: 4 + 1 + 9 + 0 = 14.' : r.message, r.match ? 'good' : 'miss'); });
  $('item-X1').addEventListener('input', function () { K.say('feedback-X1', ''); });
  $('check-X2').addEventListener('click', function () {
    var v = K.values($('item-X2')), r = M.checkTranspose([v.a, v.b, v.c, v.d, v.e, v.f]);
    K.say('feedback-X2', !r.ok ? r.message : r.match ? 'Right. X Xᵀ compares examples with each other (32 × 32); Xᵀ X compares features (10 × 10).' : r.message, r.ok && r.match ? 'good' : 'miss');
  });
  $('item-X2').addEventListener('input', function () { K.say('feedback-X2', ''); });
  flow.render();
})();
