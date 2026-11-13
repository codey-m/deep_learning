/* Gradient paths: page behaviour. The graph is part of the task; path highlights and edge derivatives appear only with the reminder. */
(function () {
  'use strict';
  var K = window.RefresherKit, M = window.GradientPathsModel, $ = function (id) { return document.getElementById(id); };
  var NS = 'http://www.w3.org/2000/svg';
  function s(tag, attrs, text) { var e = document.createElementNS(NS, tag); for (var k in attrs) e.setAttribute(k, attrs[k]); if (text !== undefined) e.textContent = text; return e; }
  var P = { a: [60, 50], b: [60, 170], q: [230, 50], s: [370, 120], L: [500, 120] };
  var EDGES = [
    { from: 'a', to: 'q' },
    { from: 'b', to: 'q', label: '∂q/∂b = a', at: [135, 102], anchor: 'end', path: 1 },
    { from: 'q', to: 's', label: '∂s/∂q = 1', at: [328, 60], anchor: 'start', path: 1 },
    { from: 'b', to: 's', label: '∂s/∂b = 1', at: [215, 190], path: 2 },
    { from: 's', to: 'L', label: '∂L/∂s = 2s', at: [448, 88], path: 3 }
  ];
  // Text is sized in viewBox units so it stays at least 12 px when the figure scales down to a phone width.
  var FONT = 'font-size:24px';
  function draw(reminder) {
    var svg = $('graph-A'); svg.textContent = '';
    EDGES.forEach(function (e) {
      var A = P[e.from], B = P[e.to];
      svg.appendChild(s('line', { x1: A[0], y1: A[1], x2: B[0], y2: B[1], class: reminder && e.path ? 'path-hi' : 'edge', 'data-edge': e.from + e.to }));
    });
    Object.keys(P).forEach(function (n) {
      svg.appendChild(s('circle', { cx: P[n][0], cy: P[n][1], r: 24, class: 'node' }));
      svg.appendChild(s('text', { x: P[n][0], y: P[n][1] + 8, 'text-anchor': 'middle', 'font-style': 'italic', style: FONT }, n));
    });
    if (reminder) EDGES.forEach(function (e) { if (e.label) svg.appendChild(s('text', { x: e.at[0], y: e.at[1], 'text-anchor': e.anchor || 'middle', class: 'edge-label', style: FONT }, e.label)); });
    $('graph-A-desc').textContent = 'Computation graph: a and b feed q; q and b feed s; s feeds L. So b is used twice.' +
      (reminder ? ' Highlighted: the two paths from b to L, b → q → s → L and b → s → L. Local derivatives: ∂q/∂b = a, ∂s/∂q = 1, ∂s/∂b = 1, ∂L/∂s = 2s.' : '');
  }
  draw(false);
  var page = K.wire(M, { open: function () { draw(true); } });
  $('remind-A').addEventListener('click', function () { draw(!$('recovery-A').hidden); });
  $('check-A').addEventListener('click', function () { draw(!$('recovery-A').hidden); });
  $('check-ladder').addEventListener('click', function () { draw(!$('recovery-A').hidden); });
})();
