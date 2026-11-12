/* Projection refresher: page behaviour and the plane figure. */
(function () {
  'use strict';
  var K = window.RefresherKit, M = window.ProjectionModel, NS = 'http://www.w3.org/2000/svg', $ = function (id) { return document.getElementById(id); };
  var flow = K.Flow({ expose: true });
  function s(tag, a, txt) { var e = document.createElementNS(NS, tag); for (var k in a) e.setAttribute(k, a[k]); if (txt !== undefined) e.textContent = txt; return e; }
  function f(v) { return K.fmt(v, 2); }

  // Plane with equal unit scales on both axes (build standard).
  function Figure(id) {
    var c = M.CASES[id], wx = [-2.5, 4], wy = [-1.5, 3], U = 60, W = (wx[1] - wx[0]) * U, H = (wy[1] - wy[0]) * U;
    function X(x) { return (x - wx[0]) * U; } function Y(y) { return H - (y - wy[0]) * U; }
    var svg = s('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-labelledby': 'fig' + id + '-desc' });
    var defs = s('defs', {}), mk = s('marker', { id: 'arrow' + id, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' });
    mk.appendChild(s('path', { d: 'M0,0 L10,5 L0,10 z', fill: '#0b6e75' })); defs.appendChild(mk); svg.appendChild(defs);
    for (var gx = Math.ceil(wx[0]); gx <= wx[1]; gx++) svg.appendChild(s('line', { x1: X(gx), y1: 0, x2: X(gx), y2: H, stroke: '#e3eaec' }));
    for (var gy = Math.ceil(wy[0]); gy <= wy[1]; gy++) svg.appendChild(s('line', { x1: 0, y1: Y(gy), x2: W, y2: Y(gy), stroke: '#e3eaec' }));
    svg.appendChild(s('line', { x1: 0, y1: Y(0), x2: W, y2: Y(0), stroke: '#33464c', 'stroke-width': 1.2 }));
    [-2, -1, 1, 2, 3].forEach(function (k) { svg.appendChild(s('text', { x: X(k), y: Y(0) + 18, 'text-anchor': 'middle', class: 'tick' }, K.fmt(k, 0))); });
    [-1, 1, 2].forEach(function (k) { svg.appendChild(s('text', { x: X(0) - 7, y: Y(k) + 5, 'text-anchor': 'end', class: 'tick' }, K.fmt(k, 0))); });
    svg.appendChild(s('line', { x1: X(0), y1: 0, x2: X(0), y2: H, stroke: '#33464c', 'stroke-width': 1.2 }));
    var v = c.v, L = 12;
    svg.appendChild(s('line', { x1: X(-L * v[0]), y1: Y(-L * v[1]), x2: X(L * v[0]), y2: Y(L * v[1]), stroke: '#0b6e75', 'stroke-width': 1.5, 'stroke-dasharray': '6 4' }));
    svg.appendChild(s('line', { x1: X(0), y1: Y(0), x2: X(v[0]), y2: Y(v[1]), stroke: '#0b6e75', 'stroke-width': 3.5, 'marker-end': 'url(#arrow' + id + ')' }));
    var nv = [-v[1] * 0.32, v[0] * 0.32];
    svg.appendChild(s('text', { x: X(0.85 * v[0] + nv[0]), y: Y(0.85 * v[1] + nv[1]) + 5, 'text-anchor': 'middle', class: 'lab', fill: '#084f55' }, 'v'));
    var learner = s('g', {}), slide = s('g', {});
    svg.appendChild(learner); svg.appendChild(slide);
    svg.appendChild(s('circle', { cx: X(c.x[0]), cy: Y(c.x[1]), r: 6.5, fill: '#16242a' }));
    svg.appendChild(s('text', { x: X(c.x[0]), y: Y(c.x[1]) + 28, 'text-anchor': 'middle', class: 'lab' }, 'x = (' + f(c.x[0]) + ', ' + f(c.x[1]) + ')'));
    svg.appendChild(s('style', {}, 'text{font:15px system-ui,-apple-system,"Segoe UI",sans-serif;fill:#16242a}.lab{font-size:16px;font-weight:600;paint-order:stroke;stroke:#fff;stroke-width:3px}.tick{font-size:14px;fill:#47595f}'));
    $('fig-' + id).appendChild(svg);
    var desc = K.el('p', { id: 'fig' + id + '-desc', class: 'figdesc' }, 'Figure: the plane with equal scales on both axes. The point x = (' + f(c.x[0]) + ', ' + f(c.x[1]) + ') is a dot. The unit direction v = (' + f(v[0]) + ', ' + f(v[1]) + ') is an arrow from the origin, extended as a dashed line in both directions.');
    $('fig-' + id).parentNode.insertBefore(desc, $('fig-' + id).nextSibling);
    var legend = K.el('p', { class: 'legend', hidden: '' }, 'Hollow diamond and dotted segment: your x̂ and the leftover x − x̂.');
    desc.parentNode.insertBefore(legend, desc.nextSibling);
    function rightAngle(p, q) {
      // Small square marker at p, aligned with v and the perpendicular towards q.
      var a = 0.18, n = [-v[1], v[0]], d = M.sub(q, p); if (M.dot(d, n) < 0) n = [-n[0], -n[1]];
      var p1 = [p[0] + a * v[0], p[1] + a * v[1]], p2 = [p1[0] + a * n[0], p1[1] + a * n[1]], p3 = [p[0] + a * n[0], p[1] + a * n[1]];
      return s('polyline', { points: [p1, p2, p3].map(function (q) { return X(q[0]) + ',' + Y(q[1]); }).join(' '), fill: 'none', stroke: '#16242a', 'stroke-width': 1.5 });
    }
    return {
      learner: function (xh) {
        while (learner.firstChild) learner.removeChild(learner.firstChild);
        legend.hidden = !xh;
        if (!xh) return;
        learner.appendChild(s('line', { x1: X(c.x[0]), y1: Y(c.x[1]), x2: X(xh[0]), y2: Y(xh[1]), stroke: '#9a4a00', 'stroke-width': 2.5, 'stroke-dasharray': '2 5', 'stroke-linecap': 'round' }));
        var px = X(xh[0]), py = Y(xh[1]);
        learner.appendChild(s('polygon', { points: [[px, py - 8], [px + 8, py], [px, py + 8], [px - 8, py]].map(function (q) { return q.join(','); }).join(' '), fill: '#fff', stroke: '#9a4a00', 'stroke-width': 2.5 }));
      },
      // The slider works on a separate practice point, so it demonstrates the method without the task's numbers.
      slide: function (cv) {
        while (slide.firstChild) slide.removeChild(slide.firstChild);
        if (cv === null) return;
        var q = c.demo, p = M.scale(cv, v);
        slide.appendChild(s('circle', { cx: X(q[0]), cy: Y(q[1]), r: 6.5, fill: '#fff', stroke: '#5a2b00', 'stroke-width': 2.5 }));
        slide.appendChild(s('text', { x: X(q[0]) + (q[0] >= 0 ? -12 : 12), y: Y(q[1]) - 10, 'text-anchor': q[0] >= 0 ? 'end' : 'start', class: 'lab', fill: '#5a2b00' }, 'p'));
        slide.appendChild(s('line', { x1: X(q[0]), y1: Y(q[1]), x2: X(p[0]), y2: Y(p[1]), stroke: '#16242a', 'stroke-width': 2 }));
        slide.appendChild(s('rect', { x: X(p[0]) - 6, y: Y(p[1]) - 6, width: 12, height: 12, fill: '#16242a' }));
        if (Math.abs(M.dot(M.sub(q, p), v)) < 0.06) slide.appendChild(rightAngle(p, q));
      }
    };
  }
  var figs = { A: Figure('A'), C: Figure('C') };
  function wireSlider(id) {
    var c = M.CASES[id], r = $('range-' + id);
    function text(cv) {
      var q = c.demo, p = M.scale(cv, c.v), d = M.sq(M.sub(q, p)), perp = Math.abs(M.dot(M.sub(q, p), c.v)) < 0.06;
      return 'At c = ' + f(cv) + ', the point c v (square) is at squared distance ' + f(d) + ' from p.' +
        (perp ? ' The segment to p meets the line at a right angle here, and this is the smallest distance. Compare c with v \u00b7 p = (' + f(c.v[0]) + ')(' + f(q[0]) + ') + (' + f(c.v[1]) + ')(' + f(q[1]) + ').' : '');
    }
    function draw() { var cv = parseFloat(r.value); $('range-' + id + '-val').textContent = f(cv); $('range-' + id + '-read').textContent = text(cv); figs[id].slide(cv); }
    r.addEventListener('input', draw);
    r.addEventListener('change', function () { $('range-' + id + '-status').textContent = text(parseFloat(r.value)); });
    return function () { $('slider-' + id).hidden = false; draw(); r.focus(); };
  }
  var showA = wireSlider('A'), showC = wireSlider('C');
  document.querySelectorAll('.line').forEach(function (l) { K.autosize(l); });
  K.hints('hint-A', 'hints-A', [
    'v has length 1, so the coordinate of x along v is a dot product: multiply matching coordinates and add.',
    'Decoding goes back along v: multiply each coordinate of v by z. The result must lie on the dashed line.',
    'For the error, subtract x̂ from x coordinate by coordinate, square each part, and add.'
  ]);
  function raws(scope) { var v = K.values($(scope)); return [v.z, v.h1, v.h2, v.err]; }
  function run(id, done) {
    var r = M.check(id, raws('entry-' + id));
    figs[id].learner(null);
    if (!r.ok) { K.say('feedback-' + id, r.message, 'miss'); done(false); return; }
    if (r.match) { K.say('feedback-' + id, 'All three are right.', 'good'); done(true); return; }
    figs[id].learner(r.learnerXh);
    // Qualitative only: with x̂ = (0, 0) the exact dot product would equal z itself. Exact numbers stay with the practice point.
    var angle = r.onLine && Math.abs(r.leftoverDotV) > 0.01 ? ' Your leftover x − x̂ is not at a right angle to v, so your x̂ is not the closest point on the line.' : '';
    K.say('feedback-' + id, r.messages.join(' ') + angle, 'miss');
    done(false);
  }
  $('check-A').addEventListener('click', function () { run('A', function (ok) { if (ok && flow.state.recovery) collapseA(); flow.solvedA(ok); }); });
  $('entry-A').addEventListener('input', function () { K.say('feedback-A', ''); figs.A.learner(null); flow.editA(); });
  function openA() { $('recovery-A').hidden = false; $('remind-A').setAttribute('aria-expanded', 'true'); $('remind-A').textContent = 'Hide the reminder'; flow.recovery(); showA(); }
  function collapseA() { $('recovery-A').hidden = true; $('slider-A').hidden = true; figs.A.slide(null); $('remind-A').setAttribute('aria-expanded', 'false'); $('remind-A').textContent = 'Show the reminder again'; }
  $('remind-A').addEventListener('click', function () { if ($('recovery-A').hidden) openA(); else collapseA(); });
  $('explain-A').addEventListener('toggle', function () { if ($('explain-A').open) flow.explained(); });
  $('check-C').addEventListener('click', function () { run('C', function (ok) { flow.solvedC(ok); }); });
  $('entry-C').addEventListener('input', function () { K.say('feedback-C', ''); figs.C.learner(null); flow.editC(); });
  $('stuck-C').addEventListener('click', function () { $('stuck-C').disabled = true; flow.helpC(); showC(); });
  $('check-X').addEventListener('click', function () {
    var v = K.values($('item-X')), r = M.checkUnit([v.n, v.z, v.err]);
    K.say('feedback-X', !r.ok ? r.message : r.match ? 'All three are right. Dividing by the length first keeps z a coordinate along a unit direction.' : r.messages.join(' '), r.ok && r.match ? 'good' : 'miss');
  });
  $('item-X').addEventListener('input', function () { K.say('feedback-X', ''); });
  flow.render();
})();
