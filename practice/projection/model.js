/* Projection refresher: content and checks (no DOM). */
(function (root) {
  'use strict';
  var K = root.RefresherKit;
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1]]; }
  function scale(c, a) { return [c * a[0], c * a[1]]; }
  function sq(a) { return dot(a, a); }
  function solve(x, v) { var z = dot(x, v), xh = scale(z, v); return { z: z, xh: xh, err: sq(sub(x, xh)) }; }
  var CASES = {
    A: { x: [3, 1], v: [0.6, 0.8], demo: [1, 2], slider: [-1, 4], start: 0.5 },
    C: { x: [-1, 2], v: [0.8, -0.6], demo: [2, 1], slider: [-3, 3], start: 0.5 },
    X: { x: [2, 5], u: [3, 4] }
  };
  ['A', 'C'].forEach(function (k) { var c = CASES[k]; c.sol = solve(c.x, c.v); });
  (function () { var c = CASES.X, n = Math.sqrt(sq(c.u)); c.norm = n; c.v = scale(1 / n, c.u); c.sol = solve(c.x, c.v); })();

  function nums(raws) {
    var out = [];
    for (var i = 0; i < raws.length; i++) {
      var n = K.number(raws[i]);
      if (!n.ok) return { ok: false, index: i, message: n.empty ? 'Fill in every field.' : n.error };
      out.push(n.value);
    }
    return { ok: true, values: out };
  }
  // raws: [z, xh1, xh2, err]
  function check(id, raws) {
    var c = CASES[id], r = nums(raws);
    if (!r.ok) return r;
    var z = r.values[0], xh = [r.values[1], r.values[2]], err = r.values[3], s = c.sol, x = c.x, v = c.v;
    var zOk = K.near(z, s.z, 3), xhOk = K.near(xh[0], s.xh[0], 3) && K.near(xh[1], s.xh[1], 3), errOk = K.near(err, s.err, 3);
    var out = { ok: true, match: zOk && xhOk && errOk, parts: { z: zOk, xh: xhOk, err: errOk }, learnerXh: xh, messages: [] };
    var leftover = sub(x, xh), lv = dot(leftover, v), onLine = Math.abs(xh[0] * v[1] - xh[1] * v[0]) < 0.01;
    out.leftoverDotV = lv; out.onLine = onLine;
    if (!zOk) {
      if (K.near(z, x[0] * v[1] + x[1] * v[0], 3)) out.messages.push('z: this pairs the first coordinate of x with the second of v. Pair matching coordinates.');
      else if (K.near(z, -s.z, 3)) out.messages.push('z: the size is right but the sign isn’t. Recheck the signs of the two products.');
      else if (K.near(z, Math.sqrt(sq(x)), 3)) out.messages.push('z: this is the length of x. The coordinate along v is the dot product v · x.');
      else out.messages.push('z: the coordinate along a unit direction is the dot product v · x.');
    }
    if (!xhOk) {
      if (K.near(xh[0], z * x[0], 3) && K.near(xh[1], z * x[1], 3)) out.messages.push('x̂: this scales x. The reconstruction goes back along v: z times v.');
      else if (!onLine) out.messages.push('x̂: your point is not on the line through v. A reconstruction from one coordinate is a multiple of v.');
      else if (!(K.near(xh[0], z * v[0], 3) && K.near(xh[1], z * v[1], 3))) out.messages.push('x̂: your point is on the line, but it isn’t your z times v.');
    }
    if (!errOk) {
      var lo = sub(x, xh);
      if (K.near(err, sq(xh), 3)) out.messages.push('Error: this is the squared length of x̂. The error measures the leftover, x − x̂.');
      else if (K.near(err, Math.sqrt(sq(lo)), 3)) out.messages.push('Error: this is the length of the leftover. The question asks for its square.');
      else if (K.near(err, lo[0] + lo[1], 3)) out.messages.push('Error: square each coordinate of x − x̂ before adding.');
      else out.messages.push('Error: subtract x̂ from x coordinate by coordinate, then square each part and add.');
    }
    if (!out.match && (zOk || xhOk || errOk)) out.messages.push('The other parts are right.');
    return out;
  }
  function checkUnit(raws) {
    var c = CASES.X, r = nums(raws);
    if (!r.ok) return r;
    var n = r.values[0], z = r.values[1], err = r.values[2], msgs = [];
    if (!K.near(n, c.norm, 3)) msgs.push(K.near(n, sq(c.u), 3) ? '‖u‖: this is the squared length. Take its square root.' : '‖u‖: the length of (3, 4) is the square root of 3² + 4².');
    if (!K.near(z, c.sol.z, 3)) {
      if (K.near(z, 26, 3)) msgs.push('z: u isn’t a unit vector, so u · x is stretched by its length. Divide u by ‖u‖ first.');
      else if (K.near(z, 26 / 25, 3)) msgs.push('z: dividing by ‖u‖² gives the multiple of u, not the coordinate along the unit direction.');
      else msgs.push('z: find the unit direction v = u / ‖u‖, then take v · x.');
    }
    if (!K.near(err, c.sol.err, 3)) msgs.push('Error: rebuild x̂ = z v from the unit direction, then square the leftover x − x̂.');
    return { ok: true, match: msgs.length === 0, messages: msgs };
  }
  root.ProjectionModel = { CASES: CASES, dot: dot, sub: sub, scale: scale, sq: sq, solve: solve, check: check, checkUnit: checkUnit };
})(typeof window !== 'undefined' ? window : globalThis);
