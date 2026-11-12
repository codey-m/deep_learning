/* Logs and exponentials refresher: content and checks (no DOM). */
(function (root) {
  'use strict';
  var K = root.RefresherKit;
  var L2 = Math.log(2), L3 = Math.log(3);

  // Each equation item: lhs(v) evaluates the learner's answer in the equation; slips name common wrong values.
  var ITEMS = {
    A: {
      variable: 't', rhs: 5, answer: -L2 / 2, decimals: 3,
      lhs: function (t) { return 3 * Math.exp(-2 * t) - 1; },
      slips: [
        { value: L2 / 2, msg: 'The sign is off. Look again at dividing both sides by −2.' },
        { value: -2 * L2, msg: 'This multiplies by −2. Divide by −2 instead.' },
        { value: -Math.log(2 / 3) / 2, msg: 'Check the order of the first two steps: undo the − 1 before dividing by 3.' },
        { value: -Math.log(6) / 2, msg: 'The 3 is still attached. Divide both sides by 3 before taking the log.' },
        { value: -Math.log(5 / 3) / 2, msg: 'The − 1 needs undoing too, before the 3.' },
        { value: -Math.log10(2) / 2, msg: 'This matches a base-10 log. Use the natural log, ln.' }
      ],
      // Recovery ladder: one operation per line.
      steps: [
        { answer: 6, msg: 'Undo the − 1 first: add 1 to both sides.' },
        { answer: 2, msg: 'Now undo the 3: divide both sides by 3.' },
        { answer: L2, msg: 'ln undoes e. If eᵘ = c, then u = ln c.' },
        { answer: -L2 / 2, msg: 'Divide both sides by −2.' }
      ]
    },
    C: {
      variable: 's', rhs: 12, answer: 2 * L3, decimals: 3,
      lhs: function (s) { return 5 * Math.exp(0.5 * s) - 3; },
      slips: [
        { value: L3 / 2, msg: 'Dividing by 0.5 doubles a number. Check that last step.' },
        { value: L3, msg: 'The exponent is 0.5s, not s. One more step is needed after taking the log.' },
        { value: -2 * L3, msg: 'The sign is off. The exponent here is +0.5s.' },
        { value: 2 * Math.log(12 / 5), msg: 'The − 3 needs undoing before you divide by 5.' },
        { value: 2 * Math.log(15), msg: 'The 5 is still attached. Divide both sides by 5 before taking the log.' },
        { value: 2 * Math.log10(3), msg: 'This matches a base-10 log. Use the natural log, ln.' }
      ]
    },
    X1: {
      variable: 'k', rhs: 0.3, answer: Math.log(10 / 0.3) / L2, decimals: 3,
      lhs: function (k) { return 10 * Math.pow(2, -k); },
      slips: [
        { value: -Math.log(10 / 0.3) / L2, msg: 'The sign is off. 2⁻ᵏ shrinks as k grows, and it has to shrink from 10 to 0.3.' },
        { value: Math.log(10 / 0.3), msg: 'This is ln(10/0.3), the log of the factor. The base is 2, so divide by ln 2.' },
        { value: (10 - 0.3) / 2, msg: 'This treats the power like a product. Take ln of both sides and use ln(2⁻ᵏ) = −k ln 2.' }
      ]
    },
    X2: {
      variable: 'w', rhs: 3, answer: (Math.exp(3) - 1) / 2, decimals: 3,
      lhs: function (w) { return 2 * w + 1 > 0 ? Math.log(2 * w + 1) : NaN; },
      slips: [
        { value: 1, msg: 'This treats ln as if it weren’t there. Undo ln first: if ln(u) = 3, then u = e³.' },
        { value: Math.exp(3) / 2 - 1, msg: 'Close. Undo the + 1 before dividing by 2.' },
        { value: (Math.log(3) - 1) / 2, msg: 'This takes ln of 3. To undo ln, raise e to the power instead: u = e³.' }
      ]
    }
  };
  // NLL comparison (extension).
  var NLL = { pA: 0.02, pB: 0.05, lower: 'B', gap: Math.log(0.05 / 0.02) };

  function checkEquation(id, raw) {
    var it = ITEMS[id], n = K.number(raw);
    if (!n.ok) return { ok: false, empty: !!n.empty, message: n.empty ? 'Enter a value for ' + it.variable + ' first.' : n.error };
    var v = n.value, right = K.near(v, it.answer, it.decimals);
    if (right) return { ok: true, match: true, value: v };
    var got = it.lhs(v), slip = null;
    for (var i = 0; i < it.slips.length; i++) if (K.near(v, it.slips[i].value, it.decimals)) { slip = it.slips[i].msg; break; }
    var consequence = isFinite(got)
      ? 'With ' + it.variable + ' = ' + K.fmt(v) + ', the left side comes to ' + K.fmt(got) + ', not ' + K.fmt(it.rhs) + '.'
      : 'With ' + it.variable + ' = ' + K.fmt(v) + ', the left side has no value.';
    return { ok: true, match: false, value: v, got: got, slip: slip, consequence: consequence };
  }
  // Ladder: returns index of the first wrong or empty step (or -1 if all right).
  function checkLadder(raws) {
    var st = ITEMS.A.steps;
    for (var i = 0; i < st.length; i++) {
      var n = K.number(raws[i]);
      if (!n.ok) return { first: i, empty: !!n.empty, message: n.empty ? 'Fill in this line.' : n.error };
      if (!K.near(n.value, st[i].answer, 3)) return { first: i, message: st[i].msg };
    }
    return { first: -1 };
  }
  function checkNll(choice, rawGap) {
    if (!choice) return { ok: false, message: 'Choose a model first.' };
    var n = K.number(rawGap);
    if (!n.ok) return { ok: false, message: n.empty ? 'Enter the difference too.' : n.error };
    var rightChoice = choice === NLL.lower, rightGap = K.near(n.value, NLL.gap, 3);
    if (rightChoice && rightGap) return { ok: true, match: true };
    if (!rightChoice) return { ok: true, match: false, message: 'A larger probability gives a smaller −ln p. Which model gives this image the larger probability?' };
    if (K.near(n.value, -NLL.gap, 3)) return { ok: true, match: false, message: 'The size is right but the sign isn’t: B’s NLL is lower, so A’s minus B’s is positive.' };
    if (K.near(n.value, 0.03, 3)) return { ok: true, match: false, message: 'This is the difference in probabilities. The question asks for the difference in NLL, −ln p.' };
    return { ok: true, match: false, message: 'Work out −ln 0.02 and −ln 0.05, or use ln a − ln b = ln(a/b).' };
  }

  root.LogsModel = { ITEMS: ITEMS, NLL: NLL, checkEquation: checkEquation, checkLadder: checkLadder, checkNll: checkNll };
})(typeof window !== 'undefined' ? window : globalThis);
