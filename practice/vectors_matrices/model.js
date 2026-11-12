/* Vectors and matrices refresher: content and checks (no DOM). */
(function (root) {
  'use strict';
  var K = root.RefresherKit;
  function matvec(W, x) { return W.map(function (r) { return r.reduce(function (s, w, j) { return s + w * x[j]; }, 0); }); }
  var CASES = {
    A: { W: [[1, 0, -2], [3, 1, 1]], x: [2, -1, 1], shape: { left: [4, 2], right: [2, 5] } },
    C: { W: [[2, -1], [0, 3], [-1, 1]], x: [4, 2], defined: { options: [['a', '(2×3)(2×3)'], ['b', '(2×3)(3×2)'], ['c', '(3×2)(3×2)']], answer: 'b', shape: [2, 2] } },
    X1: { w: [2, -1, 3, 0] },
    X2: { X: [32, 10] }
  };
  Object.keys(CASES).forEach(function (k) { var c = CASES[k]; if (c.W) c.Wx = matvec(c.W, c.x); });
  CASES.X1.sq = CASES.X1.w.reduce(function (s, v) { return s + v * v; }, 0);

  function readNums(raws) {
    var out = [];
    for (var i = 0; i < raws.length; i++) {
      var n = K.number(raws[i]);
      if (!n.ok) return { ok: false, index: i, empty: !!n.empty, message: n.empty ? 'Fill in every entry.' : n.error };
      out.push(n.value);
    }
    return { ok: true, values: out };
  }
  // Matrix-vector product: which entries differ, plus named slips that explain a whole answer.
  function checkProduct(id, raws) {
    var c = CASES[id], r = readNums(raws);
    if (!r.ok) return r;
    var v = r.values, want = c.Wx, wrong = [];
    v.forEach(function (val, i) { if (!K.near(val, want[i], 3)) wrong.push(i); });
    if (!wrong.length) return { ok: true, match: true };
    var slip = null;
    var swapped = want.slice().reverse();
    if (want.length === 2 && v.every(function (val, i) { return K.near(val, swapped[i], 3); })) slip = 'You have the right numbers in the wrong places. Entry i comes from row i of W.';
    var totals = c.W.map(function (row) { return row.reduce(function (a, b) { return a + b; }, 0) * c.x.reduce(function (a, b) { return a + b; }, 0); });
    if (v.every(function (val, i) { return K.near(val, totals[i], 3); })) slip = 'This multiplies the row’s total by the vector’s total. Multiply entry by entry first, then add.';
    var noSigns = c.W.map(function (row) { return row.reduce(function (s, w, j) { return s + Math.abs(w * c.x[j]); }, 0); });
    if (!slip && wrong.every(function (i) { return K.near(v[i], noSigns[i], 3); })) slip = 'Check the signs: a negative times a positive is negative.';
    if (!slip && wrong.every(function (i) { return want[i] !== 0 && K.near(v[i], -want[i], 3); })) slip = 'The size is right but the sign isn\u2019t. Recheck the signs of the products before adding.';
    var where = wrong.length === 1 ? 'Entry ' + (wrong[0] + 1) + ' differs.' : 'Entries ' + wrong.map(function (i) { return i + 1; }).join(' and ') + ' differ.';
    return { ok: true, match: false, wrong: wrong, message: where + (slip ? ' ' + slip : ' Each entry is one row of W dotted with x.') };
  }
  function checkShape(rows, cols, left, right) {
    var r = readNums([rows, cols]);
    if (!r.ok) return r;
    var m = left[0], n = left[1], p = right[1];
    if (r.values[0] === m && r.values[1] === p) return { ok: true, match: true };
    var a = r.values[0], b = r.values[1], msg;
    if (a === n && b === n) msg = 'These are the inner sizes. They have to match, and then they drop out; the result keeps the outer sizes.';
    else if (a === p && b === m) msg = 'Right sizes, wrong order: the rows come from the left matrix and the columns from the right one.';
    else if (a === m && b === n) msg = 'This is the shape of the left matrix. The product takes its columns from the right matrix.';
    else msg = 'For (m × n)(n × p), read the rows from the left matrix and the columns from the right.';
    return { ok: true, match: false, message: msg };
  }
  function checkRowSteps(raws, row) {
    // Recovery ladder for one row: three products, then their sum.
    var c = CASES.A, want = c.W[row].map(function (w, j) { return w * c.x[j]; }).concat([c.Wx[row]]);
    for (var j = 0; j < want.length; j++) {
      var n = K.number(raws[j]);
      if (!n.ok) return { first: j, empty: !!n.empty, message: n.empty ? 'Fill in this step next.' : n.error };
      if (!K.near(n.value, want[j], 3)) return { first: j, message: j < 3 ? 'Multiply the matching pair: entry ' + (j + 1) + ' of the row times entry ' + (j + 1) + ' of x.' : 'Add the three products, keeping their signs.' };
    }
    return { first: -1 };
  }
  function checkSquaredNorm(raw) {
    var n = K.number(raw), c = CASES.X1;
    if (!n.ok) return { ok: false, message: n.empty ? 'Enter a value.' : n.error };
    if (K.near(n.value, c.sq, 3)) return { ok: true, match: true };
    var plain = c.w.reduce(function (a, b) { return a + b; }, 0);
    if (K.near(n.value, plain, 3)) return { ok: true, match: false, message: 'This adds the entries. The squared norm squares each entry first: w · w.' };
    if (K.near(n.value, Math.sqrt(c.sq), 3)) return { ok: true, match: false, message: 'This is the norm itself. The question asks for its square, w · w.' };
    if (K.near(n.value, Math.pow(plain, 2), 3)) return { ok: true, match: false, message: 'This squares the total. Square each entry, then add.' };
    return { ok: true, match: false, message: 'Square each entry, then add.' };
  }
  function checkTranspose(raws) {
    var B = CASES.X2.X[0], D = CASES.X2.X[1], want = [D, B, B, B, D, D];
    var r = readNums(raws);
    if (!r.ok) return r;
    var labels = ['Xᵀ', 'Xᵀ', 'X Xᵀ', 'X Xᵀ', 'Xᵀ X', 'Xᵀ X'];
    for (var i = 0; i < 6; i += 2) if (r.values[i] !== want[i] || r.values[i + 1] !== want[i + 1]) {
      return { ok: true, match: false, message: 'Check the shape of ' + labels[i] + '. A transpose swaps rows and columns; a product keeps the outer sizes.' };
    }
    return { ok: true, match: true };
  }
  root.VectorsModel = { CASES: CASES, matvec: matvec, checkProduct: checkProduct, checkShape: checkShape, checkRowSteps: checkRowSteps, checkSquaredNorm: checkSquaredNorm, checkTranspose: checkTranspose };
})(typeof window !== 'undefined' ? window : globalThis);
