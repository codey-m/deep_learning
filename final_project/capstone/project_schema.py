# -*- coding: utf-8 -*-
"""Track-agnostic experiment schema and contracts for the capstone portfolio.

The three-track capstone hardcoded every invariant into one ``execution_contract``,
so adding a metric meant editing the contract, the report-audit mock and three test
suites at once. This module separates what is true of *any* controlled experiment from
what is true of one project path.

Generic here:  a plan, a run record, and checks for split integrity, matched seeds,
grid completeness, single-factor discipline, paired comparison and resolvability.
Path-specific elsewhere: see ``abstention_adapter.py`` for one adapter's invariants.

Nothing in this module trains anything or imports torch. It operates on records, so it
is testable without a GPU and without a dataset.
"""
from __future__ import annotations

import hashlib
import json
import math
import statistics
from dataclasses import asdict, dataclass, field
from typing import Sequence


# --------------------------------------------------------------------------- schema

@dataclass(frozen=True)
class Contrast:
    """A comparison the plan commits to before measuring.

    Ordinal sweeps can be read as adjacent steps along their own axis. Categorical
    conditions cannot: ranking "random", "loss baseline" and "learner method" along a
    line would invent an order that does not exist. Such paths declare the comparisons
    they intend instead, and at least one must be marked required.
    """
    name: str
    treatment: object
    reference: object
    required: bool = False
    direction: str = "any"      # "greater", "less" or "any"

    def __str__(self) -> str:
        return (f"{self.name}:{self.treatment!r}-vs-{self.reference!r}"
                f"{'!' if self.required else ''}{self.direction}")


@dataclass(frozen=True)
class ProjectPlan:
    """What the learner commits to before spending compute.

    ``freeze()`` returns a hash of the decision fields only. Runtime bookkeeping such
    as the projected budget is excluded, so re-pricing a design does not invalidate a
    frozen rule, while changing any decision does.
    """
    path: str
    question: str
    hypothesis: str
    control: str
    intervention: str
    declared_change: str
    conditions: tuple
    evaluation_slices: tuple
    seeds: tuple
    compute_budget: float = 0.0
    # Decisions a path may add: for the abstention path, the layer, score and coverage.
    decisions: tuple = field(default_factory=tuple)
    # "ordinal" conditions lie on an axis and can be read as adjacent steps.
    # "categorical" conditions cannot, and must declare their planned contrasts.
    condition_kind: str = "ordinal"
    contrasts: tuple = field(default_factory=tuple)
    # What replication actually varies. "data_and_training" resamples the split per seed,
    # so the reported uncertainty covers data sampling as well as training stochasticity.
    # "training_only" holds one fixed dataset and varies initialisation and batch order,
    # which is a legitimate design but yields a NARROWER uncertainty that says nothing
    # about how the result would move on a different sample.
    seed_varies: str = "data_and_training"

    DECISION_FIELDS = (
        "path", "question", "hypothesis", "control", "intervention",
        "declared_change", "conditions", "evaluation_slices", "seeds", "decisions",
        "condition_kind", "contrasts", "seed_varies",
    )

    def freeze(self) -> str:
        payload = {name: getattr(self, name) for name in self.DECISION_FIELDS}
        text = json.dumps(payload, sort_keys=True, default=str)
        return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


@dataclass(frozen=True)
class RunRecord:
    """One measurement: one condition, one seed, one slice, one metric."""
    condition: object
    seed: int
    split_hash: str
    config_hash: str
    training_steps: int
    runtime_seconds: float
    metric_name: str
    evaluation_slice: str
    value: float
    # Optional binding from a measurement back to the artifact that produced it: for
    # the abstention path, the hash of the frozen rule actually applied to this row.
    provenance: str = ""


def config_hash(config: dict) -> str:
    text = json.dumps(config, sort_keys=True, default=str)
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


def split_hash(train_indices: Sequence[int], eval_indices: Sequence[int]) -> str:
    payload = json.dumps(
        {"train": sorted(train_indices), "eval": sorted(eval_indices)}, default=str)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:16]


# -------------------------------------------------------------------------- results

@dataclass
class ContractResult:
    failures: list = field(default_factory=list)

    def require(self, ok: bool, code: str, detail: str = "") -> None:
        if not ok:
            self.failures.append(f"{code}: {detail}" if detail else code)

    @property
    def passed(self) -> int:
        return int(not self.failures)

    def report(self) -> str:
        if not self.failures:
            return "all contract checks passed"
        return "\n".join(f"  - {failure}" for failure in self.failures)


# ------------------------------------------------------------ track-agnostic checks

# An ordinal sweep needs at least three levels: two points cannot show the shape of a
# curve, only its endpoints. A categorical comparison has no curve to show, so two arms
# is the classic controlled experiment and rejecting it would be wrong.
MIN_CONDITIONS_BY_KIND = {"ordinal": 3, "categorical": 2}
MAX_CONDITIONS = 6
MIN_SEEDS = 3


def check_plan(plan: ProjectPlan, *, budget_min: float, budget_max: float,
               result: ContractResult) -> ContractResult:
    """The proposal gate. Answerable before any measurement exists."""
    result.require(bool(plan.path and plan.question), "plan.identity",
                   "path and question are required")
    for name in ("hypothesis", "control", "intervention", "declared_change"):
        value = str(getattr(plan, name)).strip()
        result.require(len(value) >= 3, f"plan.{name}", "must be stated")
    result.require(len(str(plan.hypothesis).strip()) >= 40, "plan.hypothesis",
                   "state the expected direction for both metrics")
    minimum = MIN_CONDITIONS_BY_KIND.get(plan.condition_kind, 3)
    result.require(
        minimum <= len(plan.conditions) <= MAX_CONDITIONS, "plan.conditions",
        f"a {plan.condition_kind} plan needs {minimum}-{MAX_CONDITIONS} conditions, "
        f"got {len(plan.conditions)}")
    result.require(len(set(plan.conditions)) == len(plan.conditions),
                   "plan.conditions.distinct", "conditions must be distinct")
    result.require(len(set(plan.seeds)) >= MIN_SEEDS, "plan.seeds",
                   f"need at least {MIN_SEEDS} distinct seeds")
    result.require(len(set(plan.evaluation_slices)) >= 2, "plan.slices",
                   "need at least two evaluation slices to compare")
    result.require(budget_min <= plan.compute_budget <= budget_max, "plan.budget",
                   f"{plan.compute_budget} outside [{budget_min}, {budget_max}]")
    result.require(plan.seed_varies in ("data_and_training", "training_only"),
                   "plan.seed_varies",
                   f"{plan.seed_varies!r} must be 'data_and_training' or "
                   "'training_only'")
    result.require(plan.condition_kind in ("ordinal", "categorical"),
                   "plan.condition_kind",
                   f"{plan.condition_kind!r} must be 'ordinal' or 'categorical'")
    check_contrasts_declared(plan, result)
    return result


def check_contrasts_declared(plan: ProjectPlan, result: ContractResult) -> ContractResult:
    """Categorical conditions have no axis, so the comparisons must be named up front.

    Reading adjacent steps along a list of methods would invent an order that does not
    exist. A path with unordered conditions therefore declares which contrasts it means
    to draw, and marks at least one as required, before any measurement.
    """
    names = set()
    for contrast in plan.contrasts:
        result.require(contrast.treatment in plan.conditions, "contrast.treatment",
                       f"{contrast.treatment!r} is not one of the conditions")
        result.require(contrast.reference in plan.conditions, "contrast.reference",
                       f"{contrast.reference!r} is not one of the conditions")
        result.require(contrast.treatment != contrast.reference, "contrast.degenerate",
                       f"{contrast.name!r} compares a condition with itself")
        result.require(contrast.direction in ("greater", "less", "any"),
                       "contrast.direction", f"{contrast.direction!r} is not valid")
        result.require(contrast.name not in names, "contrast.duplicate",
                       f"{contrast.name!r} declared twice")
        names.add(contrast.name)
    if plan.condition_kind == "categorical":
        result.require(bool(plan.contrasts), "contrast.missing",
                       "categorical conditions must declare planned contrasts rather "
                       "than relying on an order that does not exist")
        result.require(any(c.required for c in plan.contrasts), "contrast.unrequired",
                       "at least one planned contrast must be marked required")
    return result


def check_matched_effort(plan: ProjectPlan, records: Sequence[RunRecord],
                         result: ContractResult) -> ContractResult:
    """Conditions must be compared at matched training effort.

    A method that triggers more retraining than its baseline is confounded with the
    budget it was given, so an inventory that differs by condition is not a comparison.
    """
    effort = {}
    for record in records:
        effort.setdefault(record.condition, set()).add(record.training_steps)
    for condition, steps in sorted(effort.items(), key=lambda kv: str(kv[0])):
        result.require(len(steps) == 1, "effort.unstable",
                       f"condition {condition!r} ran at {sorted(steps)} training steps")
    distinct = {next(iter(s)) for s in effort.values() if len(s) == 1}
    result.require(len(distinct) <= 1, "effort.unmatched",
                   f"conditions were trained at different efforts: {sorted(distinct)}")
    return result


def check_metric_finiteness(records: Sequence[RunRecord],
                            result: ContractResult) -> ContractResult:
    """No NaN or infinity may reach a reported metric.

    Precision at k is undefined when nothing was selected, and a macro average is
    undefined when a class disappears from a slice. Both produce a number-shaped hole
    that silently poisons any mean taken over it.
    """
    bad = [r for r in records if not math.isfinite(r.value)]
    result.require(not bad, "metric.nonfinite",
                   f"{len(bad)} non-finite value(s), e.g. "
                   f"{[(r.metric_name, r.condition, r.seed) for r in bad[:2]]}")
    return result


def check_split_integrity(records: Sequence[RunRecord], result: ContractResult,
                          *, expected_splits: int | None = None,
                          seed_varies: str = "data_and_training") -> ContractResult:
    """One split per seed, and the relationship between seeds that the plan declares.

    Whether two seeds should share a split depends on what replication is for. When a
    seed resamples the data, sharing a split means the "replication" was one experiment.
    When a seed varies only initialisation and batch order on a fixed dataset, every seed
    *must* share the split or the conditions are no longer comparable. Requiring the
    first unconditionally would reject a correctly built experiment of the second kind.
    """
    by_seed = {}
    for record in records:
        by_seed.setdefault(record.seed, set()).add(record.split_hash)
    for seed, hashes in sorted(by_seed.items()):
        result.require(len(hashes) == 1, "split.unstable",
                       f"seed {seed} used {len(hashes)} different splits")
    distinct = {next(iter(h)) for h in by_seed.values() if len(h) == 1}
    if seed_varies == "training_only":
        result.require(len(distinct) <= 1, "split.inconsistent",
                       f"the plan says seeds vary training only, but {len(distinct)} "
                       "different splits appear")
    else:
        result.require(len(distinct) == len(by_seed), "split.shared",
                       "different seeds must draw different splits")
    if expected_splits is not None:
        result.require(len(by_seed) == expected_splits, "split.count",
                       f"expected {expected_splits} seeds, found {len(by_seed)}")
    return result


def check_matched_seeds(plan: ProjectPlan, records: Sequence[RunRecord],
                        result: ContractResult) -> ContractResult:
    """Every condition measured at the same seed set, so comparisons can be paired."""
    seeds_by_condition = {}
    for record in records:
        seeds_by_condition.setdefault(record.condition, set()).add(record.seed)
    expected = set(plan.seeds)
    for condition in plan.conditions:
        got = seeds_by_condition.get(condition, set())
        result.require(got == expected, "seeds.unmatched",
                       f"condition {condition!r} ran seeds {sorted(got)}, "
                       f"expected {sorted(expected)}")
    return result


def check_complete_grid(plan: ProjectPlan, records: Sequence[RunRecord],
                        metric: str, result: ContractResult,
                        *, expected_slices: Sequence[str] | None = None) -> ContractResult:
    """condition x seed must be fully populated, on the slices the metric lives on.

    A metric does not necessarily span every declared slice. Precision at k is defined
    on the audited training split and nowhere else; macro accuracy is defined on the
    held-out split and nowhere else. Requiring every metric on every slice would reject
    a correctly built experiment, so completeness is checked over the slices where the
    metric actually appears, and those slices must be declared ones.

    A path whose question *requires* a metric on particular slices passes
    ``expected_slices``. The abstention path does: comparing a rule's behaviour on the
    development and test shifts is the entire question, so a run that never evaluated
    the test slice is incomplete rather than merely narrow.
    """
    seen = {(r.condition, r.seed, r.evaluation_slice)
            for r in records if r.metric_name == metric}
    present = {slice_name for _, _, slice_name in seen}
    result.require(bool(present), "grid.absent",
                   f"metric {metric!r} was never recorded")
    undeclared = present - set(plan.evaluation_slices)
    result.require(not undeclared, "grid.undeclared_slice",
                   f"metric {metric!r} recorded on undeclared slice(s) "
                   f"{sorted(undeclared)}")
    required_slices = sorted(present | set(expected_slices or ()))
    missing = [
        (condition, seed, slice_name)
        for condition in plan.conditions
        for seed in plan.seeds
        for slice_name in required_slices
        if (condition, seed, slice_name) not in seen
    ]
    result.require(not missing, "grid.incomplete",
                   f"{len(missing)} missing cell(s), e.g. {missing[:2]}")
    duplicates = len([r for r in records if r.metric_name == metric]) - len(seen)
    result.require(duplicates == 0, "grid.duplicates",
                   f"{duplicates} duplicate cell(s) for metric {metric!r}")
    return result


def check_single_factor(plan: ProjectPlan, configs: dict,
                        result: ContractResult) -> ContractResult:
    """Only the declared field may differ between the control and any condition."""
    control = configs.get(plan.control)
    result.require(control is not None, "factor.no_control",
                   f"control {plan.control!r} missing from configs")
    if control is None:
        return result
    for condition, config in configs.items():
        if condition == plan.control:
            continue
        # Keys absent from the control are invisible to a control-keyed comparison,
        # so an undeclared knob could ride along unnoticed.
        undeclared = set(config) - set(control)
        result.require(not undeclared, "factor.undeclared",
                       f"condition {condition!r} carries field(s) {sorted(undeclared)} "
                       "that the control does not declare")
        changed = {name for name in control if control[name] != config.get(name)}
        extra = changed - {plan.declared_change}
        result.require(not extra, "factor.confounded",
                       f"condition {condition!r} also changed {sorted(extra)}")
        # A condition whose configuration equals the control is not a condition.
        result.require(bool(changed) or bool(undeclared), "factor.noop",
                       f"condition {condition!r} is configured identically to the "
                       f"control {plan.control!r}, so it varies nothing")
    return result


def check_config_binding(records: Sequence[RunRecord], configs: dict,
                         result: ContractResult) -> ContractResult:
    """Rows must carry the hash of the configuration their condition declared.

    Without this the configs and the records are two independent stories.
    ``check_single_factor`` inspects the configuration dictionaries, the grid checks
    inspect the rows, and nothing ties a row to the configuration that was vetted, so a
    condition could be declared one way and recorded another. Compared per condition
    rather than per row so one mismatch reports once.
    """
    expected = {condition: config_hash(config)
                for condition, config in configs.items()}
    seen = {}
    for record in records:
        seen.setdefault(record.condition, set()).add(record.config_hash)
    for condition, hashes in sorted(seen.items(), key=lambda kv: str(kv[0])):
        want = expected.get(condition)
        result.require(want is not None, "config.undeclared",
                       f"records exist for condition {condition!r}, which has no "
                       "declared configuration")
        if want is None:
            continue
        result.require(hashes == {want}, "config.unbound",
                       f"condition {condition!r} recorded config hash(es) "
                       f"{sorted(hashes)}, not {want!r} from its declared configuration")
    return result


def check_provenance_bound(records: Sequence[RunRecord], expected: str,
                           result: ContractResult) -> ContractResult:
    """Rows must cite the design and code that are currently declared.

    Stamping a digest onto a row and never comparing it is decoration. What makes it
    load-bearing is this check: if the plan or the authored method changed after the
    experiment ran, the digest recomputed now will not match the one the rows carry,
    and the results being reported did not come from the design being declared.

    This does not stop anyone re-running the notebook from the top, and it is not meant
    to. Re-running regenerates both the rows and the digest, which is ordinary
    iteration. What it catches is reporting an old run under a new design.
    """
    result.require(bool(expected), "provenance.missing",
                   "no provenance digest was supplied for the run")
    stamps = {r.provenance for r in records}
    result.require(stamps == {expected}, "provenance.stale",
                   f"rows cite {sorted(stamps)} but the plan and method now hash to "
                   f"{expected!r}; the design changed after these rows were measured, "
                   "so re-run the experiment before reporting it")
    return result


def check_budget_honoured(plan: ProjectPlan, records: Sequence[RunRecord],
                          result: ContractResult, *, tolerance: float = 0.05,
                          measured: float | None = None) -> ContractResult:
    """The runs executed must be the runs that were priced."""
    if measured is None:
        measured = sum(r.training_steps for r in records)
    if plan.compute_budget <= 0:
        result.require(measured == 0, "budget.unpriced",
                       "training happened but no budget was projected")
        return result
    drift = abs(measured - plan.compute_budget) / plan.compute_budget
    result.require(drift <= tolerance, "budget.drift",
                   f"measured {measured:.4f} vs projected {plan.compute_budget:.4f}")
    return result


# -------------------------------------------------------------------- paired stats

def paired_deltas(records: Sequence[RunRecord], metric: str, slice_name: str,
                  reference) -> dict:
    """Per-seed differences against a reference condition, within the same slice.

    Pairing cancels whatever the two conditions share. Measured on this course's own
    data: raw accuracy across seeds spread 0.0160 while the paired quantization drop
    spread 0.0030 on the very same models.
    """
    values = {}
    for record in records:
        if record.metric_name == metric and record.evaluation_slice == slice_name:
            values.setdefault(record.condition, {})[record.seed] = record.value
    if reference not in values:
        raise KeyError(f"reference condition {reference!r} has no {metric!r} values")
    base = values[reference]
    deltas = {}
    for condition, by_seed in values.items():
        shared = sorted(set(by_seed) & set(base))
        deltas[condition] = [by_seed[seed] - base[seed] for seed in shared]
    return deltas


def _standard_error(values: Sequence[float]) -> float:
    if len(values) < 2:
        return 0.0
    return statistics.stdev(values) / math.sqrt(len(values))


# Two-sided 95% critical values. Ten seeds is a small sample, and 1.96 understates the
# interval; t(9) is 2.262. Anything past the table is close enough to normal.
_T95 = {1: 12.706, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571, 6: 2.447, 7: 2.365,
        8: 2.306, 9: 2.262, 10: 2.228, 12: 2.179, 15: 2.131, 20: 2.086, 30: 2.042}


def _critical(n: int) -> float:
    if n < 2:
        return float("inf")
    df = n - 1
    for key in sorted(_T95):
        if df <= key:
            return _T95[key]
    return 1.96


def paired_values(records: Sequence[RunRecord], metric: str,
                  slice_name: str) -> dict:
    """{condition: {seed: value}} for one metric on one slice."""
    values = {}
    for record in records:
        if record.metric_name == metric and record.evaluation_slice == slice_name:
            values.setdefault(record.condition, {})[record.seed] = record.value
    return values


def resolvability(values: dict, order: Sequence) -> dict:
    """Which adjacent steps clear their own noise, and by how much.

    Each step is judged against the standard error of the two conditions it joins, not
    against a single floor taken across the whole sweep. A global floor is set by the
    noisiest condition, which on measured data read 1 of 5 steps resolved where the
    per-step comparison read 5 of 5 on identical numbers.
    """
    def paired_difference(low, high):
        """Within-seed differences between two conditions, and their interval.

        Differencing two deltas that share a common reference leaves them correlated,
        and combining their separate standard errors misstates the uncertainty of the
        step. The difference is therefore formed per seed and its own spread is used.
        """
        left, right = values.get(low, {}), values.get(high, {})
        shared = sorted(set(left) & set(right))
        diffs = [right[seed] - left[seed] for seed in shared]
        if not diffs:
            return float("nan"), float("inf"), 0
        return (statistics.mean(diffs),
                _critical(len(diffs)) * _standard_error(diffs),
                len(diffs))

    steps = []
    for low, high in zip(order, order[1:]):
        mean, floor, pairs = paired_difference(low, high)
        size = abs(mean)
        steps.append({
            "from": low, "to": high, "step": size, "floor": floor, "pairs": pairs,
            "resolved": bool(size > floor),
            "ratio": (size / floor) if floor > 0 else float("inf"),
        })
    endpoint_mean, endpoint_floor, _ = paired_difference(order[0], order[-1])
    endpoint = abs(endpoint_mean)
    return {
        "steps": steps,
        "resolved": sum(step["resolved"] for step in steps),
        "total": len(steps),
        "endpoint": endpoint,
        "endpoint_floor": endpoint_floor,
        "endpoint_resolved": bool(endpoint > endpoint_floor),
    }


VERDICTS = ("meaningful", "equivalent", "inconclusive")


def practical_verdict(mean: float, floor: float, sesoi: float) -> str:
    """Classify an effect against the smallest effect of interest, using the interval.

    A point estimate settles nothing on its own. Comparing ``abs(mean)`` to the SESOI,
    which is what this layer used to do, silently treats "we measured a small number"
    as "the true effect is small", and those are different claims. The interval decides:

    * ``meaningful``   - the whole interval lies beyond the SESOI, so the effect is at
      least as large as the one declared worth acting on;
    * ``equivalent``   - the whole interval lies inside the SESOI, so the effect is at
      most that large. This is the precise null, and it is a real finding;
    * ``inconclusive`` - the interval straddles the SESOI, so this sample cannot tell
      the two apart. Also a real finding, and the honest report is that more seeds are
      needed rather than that nothing happened.

    The verdict is about magnitude only. Whether the effect points the way the
    hypothesis predicted is carried separately by ``direction_holds``, so a large
    effect in the wrong direction reads as meaningful and wrong rather than as a null.
    """
    if not math.isfinite(mean) or not math.isfinite(floor):
        return "inconclusive"
    size = abs(mean)
    if size - floor > sesoi:
        return "meaningful"
    if size + floor < sesoi:
        return "equivalent"
    return "inconclusive"


def contrast_report(records: Sequence[RunRecord], metric: str, slice_name: str,
                    contrasts: Sequence[Contrast], sesoi: float | None = None) -> dict:
    """Per-seed paired differences for each declared contrast.

    The categorical counterpart to ``resolvability``. Each contrast is judged against
    the standard error of its own paired differences, so no ordering is assumed and no
    condition borrows another's noise.

    Supplying ``sesoi`` adds the interval and a three-way practical verdict per row;
    see :func:`practical_verdict`.
    """
    values = {}
    for record in records:
        if record.metric_name == metric and record.evaluation_slice == slice_name:
            values.setdefault(record.condition, {})[record.seed] = record.value
    rows = []
    for contrast in contrasts:
        treatment = values.get(contrast.treatment, {})
        reference = values.get(contrast.reference, {})
        shared = sorted(set(treatment) & set(reference))
        diffs = [treatment[seed] - reference[seed] for seed in shared]
        mean = statistics.mean(diffs) if diffs else float("nan")
        floor = _critical(len(diffs)) * _standard_error(diffs)
        resolved = bool(diffs) and abs(mean) > floor
        if contrast.direction == "greater":
            correct = mean > 0
        elif contrast.direction == "less":
            correct = mean < 0
        else:
            correct = True
        rows.append({
            "name": contrast.name, "treatment": contrast.treatment,
            "reference": contrast.reference, "required": contrast.required,
            "direction": contrast.direction, "pairs": len(diffs), "mean": mean,
            "floor": floor, "resolved": resolved,
            "low": mean - floor, "high": mean + floor,
            "ratio": (abs(mean) / floor) if floor > 0 else float("inf"),
            "direction_holds": bool(correct),
            "verdict": (practical_verdict(mean, floor, sesoi)
                        if sesoi is not None else None),
        })
    required = [r for r in rows if r["required"]]
    report = {
        "rows": rows,
        "sesoi": sesoi,
        "resolved": sum(r["resolved"] for r in rows),
        "total": len(rows),
        "required_resolved": all(r["resolved"] and r["direction_holds"]
                                 for r in required) if required else False,
    }
    if sesoi is not None:
        report.update({verdict: sum(1 for r in rows if r["verdict"] == verdict)
                       for verdict in VERDICTS})
    return report


def format_contrasts(report: dict, *, label: str = "") -> str:
    """One line per contrast, and one verdict per line.

    When the report carries a SESOI the interval is shown and the practical verdict
    replaces the bare resolved/in-noise split, so a reader is not left holding two
    overlapping comparisons and inferring the relationship between them.
    """
    sesoi = report.get("sesoi")
    lines = [f"planned contrasts{' for ' + label if label else ''}:"]
    for row in report["rows"]:
        mark = "required" if row["required"] else "        "
        direction = "" if row["direction"] == "any" else (
            "  direction holds" if row["direction_holds"] else "  DIRECTION WRONG")
        if sesoi is None:
            verdict = "resolved" if row["resolved"] else "in noise"
            lines.append(
                f"  {mark} {row['name']:<26} mean={row['mean']:+.4f}  "
                f"floor={row['floor']:.4f}  {verdict} ({row['ratio']:.1f}x){direction}")
        else:
            shown = (row["verdict"].upper() if row["verdict"] == "meaningful"
                     else row["verdict"])
            # An effect established as smaller than the SESOI has no meaningful sign,
            # so reporting that it points the "wrong" way would be noise about noise.
            annotation = "" if row["verdict"] == "equivalent" else direction
            lines.append(
                f"  {mark} {row['name']:<26} diff={row['mean']:+.4f}  "
                f"95% CI [{row['low']:+.4f}, {row['high']:+.4f}]  "
                f"{shown:<12}{annotation}")
    if sesoi is None:
        lines.append(f"  {report['resolved']} of {report['total']} resolved; "
                     f"required contrasts satisfied: {report['required_resolved']}")
    else:
        lines.append(
            f"  {report['meaningful']} meaningful, {report['equivalent']} equivalent, "
            f"{report['inconclusive']} inconclusive against a SESOI of {sesoi:g}; "
            f"required contrasts satisfied: {report['required_resolved']}")
    return "\n".join(lines)


def format_resolvability(report: dict, *, label: str = "") -> str:
    lines = [f"resolvability{' for ' + label if label else ''}:"]
    for step in report["steps"]:
        lines.append(
            f"  {str(step['from']):>8} -> {str(step['to']):<8} step={step['step']:.4f}  "
            f"floor={step['floor']:.4f}  "
            f"{'resolved' if step['resolved'] else 'in noise'} ({step['ratio']:.1f}x)")
    lines.append(f"  RESOLVED {report['resolved']} of {report['total']}; "
                 f"endpoint {report['endpoint']:.4f} vs {report['endpoint_floor']:.4f} "
                 f"({'resolved' if report['endpoint_resolved'] else 'in noise'})")
    return "\n".join(lines)


# ------------------------------------------------------------------------- record

RECORD_FIELDS = ("claim", "evidence", "resolved_comparisons", "caveat",
                 "not_supported", "next_experiment")


def check_record(record: dict, result: ContractResult, *,
                 minimum: int = 40) -> ContractResult:
    """Completeness only. Quality is deliberately not certified here.

    Fields are named so a rubric or ORA could score them later without restructuring.
    """
    for name in RECORD_FIELDS:
        text = str(record.get(name, "")).strip()
        result.require(len(text) >= minimum, f"record.{name}",
                       f"needs a specific statement of {minimum}+ characters")
    evidence = str(record.get("evidence", ""))
    result.require(any(ch.isdigit() for ch in evidence), "record.evidence.number",
                   "evidence must cite at least one measured number")
    return result
