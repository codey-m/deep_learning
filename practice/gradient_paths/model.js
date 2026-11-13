/* Gradient paths, DL copy of the chain rule: content and checks (no DOM). Catalog topics R3 and R8.
   Spine: multiply local derivatives along a path, add over paths. Also the design for the DL "gradient paths" spiral review. */
(function (root) {
  'use strict';
  // Case A: a = 3, b = 2. q = a·b, s = q + b, L = s². b reaches L along b→q→s→L and b→s→L.
  var a = 3, b = 2, q = a * b, s = q + b, L = s * s;
  var dLds = 2 * s, viaQ = dLds * 1 * a, direct = dLds * 1, dLdb = viaQ + direct;    // 16, 48, 16, 64
  // Case C: x = 2, y = 1. u = x + y, v = x·u, L = 4v. x reaches v directly and through u.
  var x = 2, y = 1, u = x + y, dLdv = 4, cDirect = dLdv * u, cViaU = dLdv * x * 1, dLdx = cDirect + cViaU;  // 12, 8, 20
  function nudge(trueGrad, name) {
    return function (v) {
      if (Math.abs(v - trueGrad) < 1e-9) return '';
      return v < trueGrad ? 'Nudging ' + name + ' up by a small amount changes L by more than your value predicts, so some of ' + name + '’s influence is missing.'
                          : 'Nudging ' + name + ' up by a small amount changes L by less than your value predicts.';
    };
  }
  var A = {
    kind: 'number', answer: dLdb, decimals: 3,
    good: 'Right. Both paths from b to L contribute, and their contributions add.',
    consequence: nudge(dLdb, 'b'),
    slips: [
      { value: viaQ, msg: 'This counts the path through q only. b also feeds s directly.' },
      { value: direct, msg: 'This counts the direct path b → s only. b also reaches s through q.' },
      { value: viaQ * direct, msg: 'Contributions from different paths are added, not multiplied.' },
      { value: s * (a + 1), msg: 'Check ∂L/∂s: the derivative of s² is 2s.' },
      { value: s * a, msg: 'Two things: ∂L/∂s is 2s, and b also feeds s directly.' },
      { value: a + 1, msg: 'This adds the local derivatives at s and q, but leaves out ∂L/∂s. Multiply along each path all the way to L.' }
    ]
  };
  var C = {
    kind: 'number', answer: dLdx, decimals: 3,
    good: 'Right. x reaches v directly and through u, and the two contributions add.',
    consequence: nudge(dLdx, 'x'),
    slips: [
      { value: cDirect, msg: 'This counts x’s direct effect on v only. x also changes u, which v uses.' },
      { value: cViaU, msg: 'This counts the path through u only. v also uses x directly.' },
      { value: cDirect * cViaU, msg: 'Contributions from different paths are added, not multiplied.' },
      { value: u + x, msg: 'Include ∂L/∂v on every path: multiply along each path all the way to L.' }
    ]
  };
  var ladder = [
    { kind: 'number', answer: dLds, decimals: 3, miss: 'L = s², so ∂L/∂s = 2s. Use the forward-pass value of s.',
      slips: [{ value: s, msg: 'The derivative of s² is 2s, not s.' }, { value: L, msg: 'This is L itself. Differentiate s² with respect to s.' }] },
    { kind: 'number', answer: viaQ, decimals: 3, miss: 'Multiply the local derivatives along b → q → s → L: ∂q/∂b, then ∂s/∂q, then ∂L/∂s.',
      slips: [{ value: dLds + 1 + a, msg: 'Along one path the local derivatives multiply.' }] },
    { kind: 'number', answer: direct, decimals: 3, miss: 'Multiply along b → s → L: ∂s/∂b, then ∂L/∂s.' },
    { kind: 'number', answer: dLdb, decimals: 3, miss: 'b reaches L along two paths. Add their contributions.',
      slips: [{ value: viaQ * direct, msg: 'Different paths add.' }] }
  ];
  var X = {
    X1: { kind: 'number', answer: 4, decimals: 3, good: 'Right. Holding b fixed, ∂/∂a (a²b + 3b) = 2ab = 4 at (2, 1).',
          slips: [{ value: 2, msg: 'Hold b fixed but keep it: ∂/∂a (a²b) = 2ab.' }, { value: 7, msg: 'This is ∂f/∂b. For ∂f/∂a, hold b fixed and differentiate in a.' }] },
    X2: { kind: 'number', answer: 7, decimals: 3, good: 'Right. Holding a fixed, ∂/∂b (a²b + 3b) = a² + 3 = 7 at (2, 1).',
          slips: [{ value: 4, msg: 'Treat a² as a constant multiplying b: ∂/∂b (a²b) = a². Add the 3 from 3b.' }, { value: 3, msg: 'Include ∂/∂b (a²b) = a².' }] }
  };
  var HINTS = [
    'Trace every way b reaches L. b feeds q, and it also feeds s directly.',
    'Along one path, multiply the local derivatives: for b → q → s → L that is ∂q/∂b · ∂s/∂q · ∂L/∂s.',
    'Add the contributions of the two paths. Use the forward-pass values: q = 6, s = 8.'
  ];
  var STEPS = [
    'Forward pass: <span class="math"><i>q</i> = 3 · 2 = 6</span>, <span class="math"><i>s</i> = 6 + 2 = 8</span>, <span class="math"><i>L</i> = 64</span>. Local derivatives: <span class="math">∂<i>q</i>/∂<i>b</i> = <i>a</i> = 3</span>, <span class="math">∂<i>s</i>/∂<i>q</i> = 1</span>, <span class="math">∂<i>s</i>/∂<i>b</i> = 1</span>, <span class="math">∂<i>L</i>/∂<i>s</i> = 2<i>s</i> = 16</span>.',
    'Path <span class="math"><i>b</i> → <i>q</i> → <i>s</i> → <i>L</i></span>: multiply along it, <span class="math">3 · 1 · 16 = 48</span>.',
    'Path <span class="math"><i>b</i> → <i>s</i> → <i>L</i></span>: <span class="math">1 · 16 = 16</span>.',
    'Add over paths: <span class="math">∂<i>L</i>/∂<i>b</i> = 48 + 16 = 64</span>. A check: nudging <i>b</i> from 2 to 2.001 moves <i>L</i> from 64 to about 64.064.'
  ];
  root.GradientPathsModel = { A: A, C: C, ladder: ladder, fill: 3, X: X, hints: HINTS, steps: STEPS,
    forward: { a: a, b: b, q: q, s: s, L: L }, Lof: function (aa, bb) { var s2 = aa * bb + bb; return s2 * s2; },
    LofC: function (xx, yy) { return 4 * xx * (xx + yy); } };
})(typeof window !== 'undefined' ? window : globalThis);
