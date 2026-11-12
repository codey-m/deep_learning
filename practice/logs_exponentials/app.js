/* Logs and exponentials refresher: page behaviour. */
(function () {
  'use strict';
  var K = window.RefresherKit, M = window.LogsModel, $ = function (id) { return document.getElementById(id); };
  var flow = K.Flow({ expose: true });
  var HINTS = [
    'Get the exponential term alone on one side first: undo the − 1, then the 3.',
    'ln undoes e. If eᵘ equals a number c, then u = ln c.',
    'Once you have −2t on one side and a number on the other, divide both sides by −2.'
  ];
  K.hints('hint-A', 'hints-A', HINTS);
  document.querySelectorAll('.line').forEach(function (l) { K.autosize(l); });

  function report(id, res) {
    if (!res.ok) { K.say('feedback-' + id, res.message, 'miss'); return false; }
    if (res.match) {
      var it = M.ITEMS[id], exact = Math.abs(it.lhs(res.value) - it.rhs) < 1e-9;
      K.say('feedback-' + id, 'Right. ' + (exact ? 'Substituting it back gives the right side exactly.' : 'It agrees with the exact answer to the rounding asked for.'), 'good');
      return true;
    }
    K.say('feedback-' + id, res.consequence + (res.slip ? ' ' + res.slip : ''), 'miss');
    return false;
  }
  function field(container, name) { return $(container).querySelector('input[data-field="' + name + '"]'); }

  // Case A
  $('check-A').addEventListener('click', function () {
    var res = M.checkEquation('A', field('entry-A', 't').value);
    var ok = report('A', res);
    if (ok && flow.state.recovery) collapseA();
    flow.solvedA(ok);
  });
  $('entry-A').addEventListener('input', function () { K.say('feedback-A', ''); flow.editA(); });
  function openA() {
    $('recovery-A').hidden = false;
    $('remind-A').setAttribute('aria-expanded', 'true');
    $('remind-A').textContent = 'Hide the reminder';
    flow.recovery();
  }
  function collapseA() {
    $('recovery-A').hidden = true;
    $('remind-A').setAttribute('aria-expanded', 'false');
    $('remind-A').textContent = 'Show the reminder again';
  }
  $('remind-A').addEventListener('click', function () { if ($('recovery-A').hidden) openA(); else collapseA(); });
  $('explain-A').addEventListener('toggle', function () { if ($('explain-A').open) flow.explained(); });
  $('hint-A').addEventListener('click', function () { flow.recovery(); });

  // Ladder: the first wrong line is marked and named; the rest wait.
  $('check-ladder').addEventListener('click', function () {
    var v = K.values($('ladder-A')), raws = ['s0', 's1', 's2', 's3'].map(function (k) { return v[k]; });
    var r = M.checkLadder(raws);
    if (r.first === -1) {
      K.mark($('ladder-A'), null);
      K.say('feedback-ladder', 'Every line is right, and the last one solves the equation.', 'good');
      field('entry-A', 't').value = raws[3];
      K.say('feedback-A', 'Right. Your last line solves it.', 'good');
      collapseA();
      flow.solvedA(true);
      return;
    }
    K.mark($('ladder-A'), 's' + r.first, !r.empty);
    K.say('feedback-ladder', 'Line ' + (r.first + 2) + ': ' + r.message + (r.first ? ' The lines above it are right.' : ''), 'miss');
  });
  $('ladder-A').addEventListener('input', function () { K.say('feedback-ladder', ''); K.mark($('ladder-A'), null); });

  // Case C
  $('check-C').addEventListener('click', function () { flow.solvedC(report('C', M.checkEquation('C', field('entry-C', 's').value))); });
  $('entry-C').addEventListener('input', function () { K.say('feedback-C', ''); flow.editC(); });
  $('stuck-C').addEventListener('click', function () { $('rules-C').hidden = false; $('stuck-C').disabled = true; flow.helpC(); });

  // Extension
  [['X1', 'k'], ['X2', 'w']].forEach(function (p) {
    $('check-' + p[0]).addEventListener('click', function () { report(p[0], M.checkEquation(p[0], field('item-' + p[0], p[1]).value)); });
    $('item-' + p[0]).addEventListener('input', function () { K.say('feedback-' + p[0], ''); });
  });
  $('check-X3').addEventListener('click', function () {
    var c = document.querySelector('input[name="nll"]:checked');
    var r = M.checkNll(c ? c.value : null, field('item-X3', 'gap').value);
    if (!r.ok) K.say('feedback-X3', r.message, 'miss');
    else if (r.match) K.say('feedback-X3', 'Right. −ln 0.02 − (−ln 0.05) = ln(0.05/0.02) = ln 2.5. The ratio of the probabilities sets the gap.', 'good');
    else K.say('feedback-X3', r.message, 'miss');
  });
  $('item-X3').addEventListener('input', function () { K.say('feedback-X3', ''); });
  $('item-X3').addEventListener('change', function () { K.say('feedback-X3', ''); });

  flow.render();
})();
