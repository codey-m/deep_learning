# -*- coding: utf-8 -*-
"""Early-exit instrument for the M3 pilot: exit heads, policies, and real cost.

The question is whether spending compute *per example* beats spending it uniformly. A
static network gives every image the same depth. A dynamic policy stops early on easy
images and keeps going on hard ones, and the comparison worth making is at **matched
average cost**: given the same budget, does allocating it unevenly buy accuracy?

Two design points matter more than the rest.

**Cost is measured, not assumed.** Codex's review of the original proposal made the
point that zeroing heads or masking layers does not reduce latency unless execution
actually changes. Stage costs here are timed on the device with synchronisation, and
``verify_savings_materialise`` re-times a genuinely truncated batch to check the
predicted saving shows up in the clock rather than only in the arithmetic.

**Exit heads are trained once and shared.** If each policy trained its own heads, a
policy would be competing with a different model rather than a different rule.
"""
from __future__ import annotations

import statistics
import time

import torch
import torch.nn as nn

STAGES = ("layer1", "layer2", "layer3", "layer4")


def stage_modules(backbone):
    """The trunk split into a stem plus the four residual stages."""
    stem = nn.Sequential(backbone.conv1, backbone.bn1, backbone.relu, backbone.maxpool)
    return stem, [backbone.layer1, backbone.layer2, backbone.layer3, backbone.layer4]


@torch.no_grad()
def stage_features(stem, stages, images, device):
    """Pooled features after each stage, for a batch already on ``device``."""
    h = stem(images)
    out = []
    for stage in stages:
        h = stage(h)
        out.append(nn.functional.adaptive_avg_pool2d(h, 1).flatten(1).cpu())
    return out


@torch.no_grad()
def _time_stages(stem, stages, device, side, batch, repeats) -> list:
    probe = torch.randn(batch, 3, side, side, device=device)

    def sync():
        if device.type == "cuda":
            torch.cuda.synchronize()
        elif device.type == "mps":
            torch.mps.synchronize()

    cumulative = []
    for depth in range(1, len(stages) + 1):
        timings = []
        for repeat in range(repeats + 1):
            sync()
            start = time.perf_counter()
            h = stem(probe)
            for stage in stages[:depth]:
                h = stage(h)
            nn.functional.adaptive_avg_pool2d(h, 1)
            sync()
            if repeat:                      # discard the warm-up
                timings.append((time.perf_counter() - start) * 1000.0 / batch)
        cumulative.append(statistics.median(timings))
    return cumulative


def measure_stage_costs(stem, stages, device, side=160, batch=64, repeats=5,
                        attempts=3) -> list:
    """Cumulative milliseconds to reach the end of each stage.

    Timed on the device with synchronisation, discarding a warm-up pass. These are the
    weights the cost model uses, so the model is grounded in the clock rather than in a
    FLOP count that may not reflect what the hardware does.

    Reaching a deeper stage cannot cost less than reaching a shallower one, so a
    non-monotone reading is not a result, it is a machine too busy to time on. Shared
    GPUs produce exactly that, and the consequence downstream is subtle rather than
    loud: the budget is derived from the two deepest costs, so an inverted pair puts
    the target beyond what any policy can spend, every condition saturates at its
    deepest exit, and the run fails a cost-matching check several minutes later for
    reasons that look nothing like the cause. Measuring harder usually fixes it, so
    that is tried before giving up.
    """
    for attempt in range(attempts):
        cumulative = _time_stages(stem, stages, device, side, batch,
                                  repeats * (2 ** attempt))
        if all(earlier < later for earlier, later in zip(cumulative, cumulative[1:])):
            return cumulative
    raise RuntimeError(
        f"stage costs came back non-monotone after {attempts} attempts: "
        f"{[round(c, 4) for c in cumulative]}. Reaching a deeper stage cannot be "
        f"cheaper than reaching a shallower one, so this machine is too contended to "
        f"time reliably. Restart the runtime and run this cell again before going on; "
        f"every number in this project is derived from these costs.")


SCORES = ("max_softmax", "margin", "negative_entropy")


def exit_scores(heads, features, score="max_softmax"):
    """A confidence score and prediction at each exit, given cached features.

    Which score to trust is a real design choice, not a detail. Max softmax probability
    is the default signal; the margin between the top two classes ignores how the rest
    of the mass is spread; negative entropy uses the whole distribution. A policy built
    on one can route differently from a policy built on another at the same budget.
    """
    if score not in SCORES:
        raise ValueError(f"{score!r} is not one of {SCORES}")
    out = []
    for head, feature in zip(heads, features):
        probability = head(feature).softmax(dim=1)
        top = probability.topk(2, dim=1)
        prediction = top.indices[:, 0]
        if score == "max_softmax":
            value = top.values[:, 0]
        elif score == "margin":
            value = top.values[:, 0] - top.values[:, 1]
        else:
            value = -(-(probability.clamp_min(1e-12).log() * probability).sum(dim=1))
        out.append((value, prediction))
    return out


def confidences(heads, features):
    """Backwards-compatible alias for the default max-softmax score."""
    return exit_scores(heads, features, "max_softmax")


def apply_policy(per_exit, thresholds):
    """Exit at the first stage whose confidence clears that stage's threshold.

    ``thresholds`` has one entry per stage; the last is forced to zero so every example
    exits somewhere. Returns the chosen depth (0-indexed) and prediction per example.
    """
    count = len(per_exit[0][0])
    depth = torch.full((count,), len(per_exit) - 1, dtype=torch.long)
    prediction = per_exit[-1][1].clone()
    decided = torch.zeros(count, dtype=torch.bool)
    for index, (confidence, predicted) in enumerate(per_exit):
        if index == len(per_exit) - 1:
            take = ~decided
        else:
            take = (~decided) & (confidence >= thresholds[index])
        depth[take] = index
        prediction[take] = predicted[take]
        decided |= take
    return depth, prediction


def realized_cost(depth, stage_costs) -> float:
    weights = torch.tensor(stage_costs, dtype=torch.float)
    return float(weights[depth].mean())


def accuracy(prediction, truth) -> float:
    return float((prediction == truth).float().mean())


def calibrate_to_budget(per_exit, stage_costs, target_cost, stages_used=None,
                        tolerance=1e-3, steps=60):
    """Find a single confidence threshold whose average cost hits ``target_cost``.

    Cost-matching is what makes the comparison fair: policies are only comparable when
    they are spending the same average budget, so the threshold is solved for rather
    than chosen.

    The search runs over the range the scores actually occupy rather than over [0, 1],
    so an authored score is not required to be a probability. A score bounded elsewhere
    (negative entropy, a logit gap, a disagreement count) calibrates the same way. The
    bracket is widened by one step at each end so the extreme thresholds, where every
    example exits at the first or the last stage, are both reachable.
    """
    count = len(per_exit)
    observed = torch.cat([value for value, _ in per_exit])
    low, high = float(observed.min()), float(observed.max())
    pad = max((high - low) * 1e-3, 1e-6)
    low, high = low - pad, high + pad
    for _ in range(steps):
        mid = (low + high) / 2
        thresholds = [mid] * (count - 1) + [0.0]
        depth, _ = apply_policy(per_exit, thresholds)
        cost = realized_cost(depth, stage_costs)
        if abs(cost - target_cost) < tolerance:
            break
        # A higher threshold means fewer early exits, so more cost.
        if cost > target_cost:
            high = mid
        else:
            low = mid
    return [mid] * (count - 1) + [0.0]


@torch.no_grad()
def verify_savings_materialise(stem, stages, depth_counts, stage_costs, device,
                               side=160, repeats=3) -> dict:
    """Does a genuinely truncated batch run as fast as the cost model predicts?

    Executes each depth bucket for real, on its actual number of examples, and compares
    total measured time against the model. A policy whose savings exist only in a
    spreadsheet fails here.
    """
    def sync():
        if device.type == "cuda":
            torch.cuda.synchronize()
        elif device.type == "mps":
            torch.mps.synchronize()

    total = sum(depth_counts)
    predicted = sum(count * stage_costs[index]
                    for index, count in enumerate(depth_counts)) / max(1, total)
    timings = []
    for repeat in range(repeats + 1):
        sync()
        start = time.perf_counter()
        for index, count in enumerate(depth_counts):
            if not count:
                continue
            probe = torch.randn(count, 3, side, side, device=device)
            h = stem(probe)
            for stage in stages[:index + 1]:
                h = stage(h)
            nn.functional.adaptive_avg_pool2d(h, 1)
        sync()
        if repeat:
            timings.append((time.perf_counter() - start) * 1000.0 / max(1, total))
    measured = statistics.median(timings)
    return {"predicted_ms": predicted, "measured_ms": measured,
            "ratio": measured / predicted if predicted else float("nan")}


def self_check(stage_costs=(1.0, 2.0, 3.0, 4.0)) -> dict:
    """Verify the policy machinery on constructed cases before it measures anything."""
    count = 100
    high = (torch.ones(count), torch.zeros(count, dtype=torch.long))
    low = (torch.zeros(count), torch.ones(count, dtype=torch.long))
    checks = {}

    # Everything confident at exit 0 must exit at 0 and cost the least.
    depth, prediction = apply_policy([high, low, low, low], [0.5, 0.5, 0.5, 0.0])
    checks["confident_exits_first"] = bool((depth == 0).all())
    checks["cheapest_cost"] = realized_cost(depth, stage_costs) == stage_costs[0]
    checks["uses_first_prediction"] = bool((prediction == 0).all())

    # Nothing confident anywhere must fall through to the last exit.
    depth, _ = apply_policy([low, low, low, low], [0.5, 0.5, 0.5, 0.0])
    checks["unconfident_falls_through"] = bool((depth == 3).all())
    checks["dearest_cost"] = realized_cost(depth, stage_costs) == stage_costs[-1]

    # Cost must rise monotonically with the threshold: stricter means fewer early exits.
    mixed = [(torch.rand(count, generator=torch.Generator().manual_seed(i)),
              torch.zeros(count, dtype=torch.long)) for i in range(4)]
    costs = [realized_cost(apply_policy(mixed, [t] * 3 + [0.0])[0], stage_costs)
             for t in (0.1, 0.5, 0.9)]
    checks["cost_monotone_in_threshold"] = costs[0] <= costs[1] <= costs[2]

    # Calibration must land on the requested budget.
    target = 2.5
    thresholds = calibrate_to_budget(mixed, stage_costs, target)
    achieved = realized_cost(apply_policy(mixed, thresholds)[0], stage_costs)
    checks["calibration_hits_budget"] = abs(achieved - target) < 0.05
    return checks


if __name__ == "__main__":
    results = self_check()
    for name, ok in results.items():
        print(f"  {name:<32} {'ok' if ok else 'FAILED'}")
    print("all earlyexit self-checks passed" if all(results.values())
          else "SELF-CHECK FAILED")
