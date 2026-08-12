# -*- coding: utf-8 -*-
"""Adapter for the abstention path: "when should the model decline to answer?"

Generic experiment discipline lives in ``project_schema``. This module adds only the
invariants that are specific to a pre-registered deployment rule:

* the rule is calibrated on development slices and frozen before the test slice is
  ever evaluated;
* the development and test shifts are genuinely different;
* coverage is computed on the slice it claims to describe.

The pre-registration check is the point of the path. A threshold retuned after seeing
the test shift is not a deployment rule, it is a result reported in advance.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

from project_schema import ContractResult, ProjectPlan


DEV_SLICE = "dev"
TEST_SLICE = "test"
# Confidence scores a learner may choose. "max_softmax" comes from the trained
# linear head; the others are nearest-neighbour scores over the frozen features.
SCORES = ("max_softmax", "margin", "max_similarity", "knn_distance")


@dataclass(frozen=True)
class AbstentionRule:
    """The frozen deployment rule. ``threshold`` is derived from dev data alone."""
    layer: str
    score: str
    target_coverage: float
    threshold: float
    calibrated_on: str
    plan_hash: str


class TestSliceLocked(RuntimeError):
    """Raised when the test slice is touched before a rule has been frozen."""


class RuleRegistry:
    """Enforces the ordering: freeze, then evaluate.

    A learner can re-run the notebook freely, but cannot obtain a test-slice number
    without a frozen rule, and cannot change the rule afterwards without the frozen
    hash ceasing to match the plan.
    """

    def __init__(self) -> None:
        self._rules: dict = {}
        self._test_unlocked = False

    @staticmethod
    def key(seed, condition) -> tuple:
        return (seed, condition)

    def freeze(self, rule: AbstentionRule, seed=None, condition=None) -> str:
        """Register one rule. Every rule must be frozen before any test slice is read.

        The earlier version froze a single rule and then recomputed a quantile at
        measurement time, so the registered threshold was never the one applied. Each
        (seed, condition) now registers the threshold that will actually be used, and
        the digest it returns is stamped onto the rows it produces.
        """
        if self._test_unlocked:
            raise TestSliceLocked(
                "the test slice has already been evaluated; freezing a rule now would "
                "be calibration after the fact. This registry is spent, not the "
                "session: re-run the cell that constructs the registry and calibrate "
                "again from there. Iterating is fine, what is refused is adding a rule "
                "to a registry whose held-out numbers you have already seen.")
        if rule.calibrated_on == TEST_SLICE:
            raise TestSliceLocked(
                "a rule calibrated on the test slice is not a deployment rule")
        self._rules[self.key(seed, condition)] = rule
        return self.digest(rule)

    @staticmethod
    def digest(rule: AbstentionRule) -> str:
        import hashlib, json
        payload = json.dumps({"layer": rule.layer, "score": rule.score,
                              "target": rule.target_coverage,
                              "threshold": round(float(rule.threshold), 10),
                              "calibrated_on": rule.calibrated_on,
                              "plan": rule.plan_hash}, sort_keys=True)
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:16]

    @property
    def rule(self) -> AbstentionRule | None:
        """Any registered rule, for checks that inspect shared decisions."""
        return next(iter(self._rules.values())) if self._rules else None

    @property
    def rules(self) -> dict:
        return dict(self._rules)

    def rule_for(self, seed, condition) -> AbstentionRule:
        if not self._test_unlocked:
            raise TestSliceLocked("unlock the test slice before applying a rule to it")
        return self._rules[self.key(seed, condition)]

    def unlock_test(self):
        if not self._rules:
            raise TestSliceLocked(
                "freeze the rules on the development shift before evaluating the test "
                "shift; that ordering is what makes this a prediction")
        self._test_unlocked = True
        return self._rules

    @property
    def test_was_evaluated(self) -> bool:
        return self._test_unlocked


def check_rule_frozen(plan: ProjectPlan, registry: RuleRegistry,
                      result: ContractResult) -> ContractResult:
    rule = registry.rule
    result.require(rule is not None, "rule.missing", "no rule was frozen")
    if rule is None:
        return result
    result.require(rule.plan_hash == plan.freeze(), "rule.stale",
                   "the plan changed after the rule was frozen, so the rule no longer "
                   "corresponds to a pre-registered decision")
    # What matters is that calibration never touched a test slice, not that it used one
    # particular development source. A policy whose whole design is "calibrate on clean"
    # should say so rather than mislabel itself to satisfy the check.
    result.require(rule.calibrated_on != TEST_SLICE, "rule.calibration",
                   f"rule reports calibration on {rule.calibrated_on!r}, which is the "
                   "held-out shift; that is not a deployment rule")
    result.require(bool(str(rule.calibrated_on).strip()), "rule.calibration_source",
                   "the calibration source must be named")
    result.require(rule.score in SCORES, "rule.score",
                   f"{rule.score!r} is not one of {SCORES}")
    result.require(0.0 < rule.target_coverage <= 1.0, "rule.coverage",
                   f"target coverage {rule.target_coverage} is not a fraction")
    result.require(math.isfinite(rule.threshold), "rule.threshold",
                   f"registered threshold {rule.threshold!r} is not a finite number, "
                   "so the rule cannot have been applied")
    return result


def check_rule_inventory(plan: ProjectPlan, registry: RuleRegistry, records,
                         result: ContractResult) -> ContractResult:
    """Every condition and seed must have registered its own rule, and every test-slice
    row must be stamped with the digest of a rule that was actually registered."""
    expected = {RuleRegistry.key(seed, condition)
                for seed in plan.seeds for condition in plan.conditions}
    missing = expected - set(registry.rules)
    result.require(not missing, "rule.inventory",
                   f"{len(missing)} (seed, condition) pair(s) never registered a rule")
    for rule in registry.rules.values():
        result.require(math.isfinite(rule.threshold), "rule.threshold",
                       "a registered threshold is not finite")
    digests = {RuleRegistry.digest(r) for r in registry.rules.values()}
    unstamped = [r for r in records
                 if r.evaluation_slice == TEST_SLICE and not r.provenance]
    result.require(not unstamped, "rule.unstamped",
                   f"{len(unstamped)} test-slice row(s) carry no rule digest")
    foreign = [r for r in records
               if r.evaluation_slice == TEST_SLICE and r.provenance
               and r.provenance not in digests]
    result.require(not foreign, "rule.foreign",
                   f"{len(foreign)} test-slice row(s) cite a rule that was never frozen")
    return result


# What a calibration policy may see. Notably absent: anything drawn from the held-out
# shift. A policy that reads the test slice is not calibrating, it is fitting.
ALLOWED_CALIBRATION_INPUTS = frozenset(
    {"clean_scores", "dev_shift_scores", "target_coverage", "rng", "seed"})


def check_calibration_inputs(policies, result: ContractResult) -> ContractResult:
    """A calibration policy may not accept scores from the held-out shift.

    Matches the signature-inspection protocol used by the early-exit and
    label-debugging adapters. Like those, this is a documented protocol rather than a
    sandbox: Python cannot stop a closure reading a global. It catches the accident and
    records the intent.
    """
    import inspect

    for name, function in sorted(policies.items()):
        parameters = set(inspect.signature(function).parameters)
        forbidden = parameters - ALLOWED_CALIBRATION_INPUTS
        result.require(not forbidden, "calibration.inputs",
                       f"{name!r} accepts {sorted(forbidden)}, outside "
                       f"{sorted(ALLOWED_CALIBRATION_INPUTS)}; a policy that can see "
                       "the held-out shift is not calibrating, it is fitting")
    return result


def check_calibration_disjoint(dev_positions, test_positions,
                               result: ContractResult) -> ContractResult:
    """Calibration and final evaluation must not share image identities.

    Sharing them measures transfer across corruptions *of the same pictures*, which is
    a narrower claim than transfer to an unseen shift and is easy to mistake for it.
    """
    overlap = set(dev_positions) & set(test_positions)
    result.require(not overlap, "calibration.shared_identities",
                   f"{len(overlap)} image identity/identities appear in both the "
                   "calibration and final slices")
    return result


def check_shifts_distinct(dev_shift, test_shift, result: ContractResult) -> ContractResult:
    result.require(tuple(dev_shift) != tuple(test_shift), "shift.identical",
                   "the development and test shifts must differ, or the rule was "
                   "never asked to transfer")
    return result


def check_coverage_slice(records, rule: AbstentionRule, plan: ProjectPlan,
                         result: ContractResult) -> ContractResult:
    """Coverage reported for a slice must be measured on that slice, and each
    condition's development coverage must land on the target it claims.

    When the swept factor is the coverage target itself, every condition carries its
    own target, so a single rule-wide comparison would be meaningless. The threshold is
    a dev quantile by construction, so dev coverage failing to track its target means
    the threshold was not derived the way the write-up says it was.
    """
    coverage = [r for r in records
                if r.metric_name in ("coverage", "realized_coverage")]
    result.require(bool(coverage), "coverage.missing", "no coverage was recorded")
    for record in coverage:
        result.require(record.evaluation_slice in plan.evaluation_slices
                       or record.evaluation_slice in (DEV_SLICE, TEST_SLICE),
                       "coverage.slice", f"unknown slice {record.evaluation_slice!r}")
        result.require(0.0 <= record.value <= 1.0, "coverage.range",
                       f"coverage {record.value} is not a fraction")

    sweeping_coverage = plan.declared_change == "target_coverage"
    if sweeping_coverage:
        result.require(rule.target_coverage in set(plan.conditions),
                       "coverage.operating_point",
                       f"the frozen operating point {rule.target_coverage} is not one "
                       f"of the swept conditions")
    by_condition = {}
    for record in coverage:
        if record.evaluation_slice == DEV_SLICE:
            by_condition.setdefault(record.condition, []).append(record.value)
    # A design that reports only unseen slices has no development coverage to check
    # against its target; the operating point is verified where it is measured.
    for condition, values in sorted(by_condition.items(), key=lambda kv: str(kv[0])):
        target = condition if sweeping_coverage else rule.target_coverage
        realized = sum(values) / len(values)
        result.require(abs(realized - float(target)) <= 0.05, "coverage.calibration",
                       f"dev coverage {realized:.3f} at condition {condition} does not "
                       f"match its target {float(target):.3f}")
    return result


def check_oracle_reference(records, result: ContractResult) -> ContractResult:
    """A ceiling must be recorded, so a learner always has a yardstick.

    Measured across six configurations, the score captured only 20-34% of the
    achievable risk reduction. Without the ceiling that reads as a success.
    """
    names = {r.metric_name for r in records}
    result.require("oracle_risk_reduction" in names, "oracle.missing",
                   "record the oracle ceiling alongside the achieved reduction")
    return result


def run_all_checks(plan, registry, records, configs, dev_shift, test_shift, record,
                   *, budget_min, budget_max, metric="selective_risk",
                   measured_budget=None, dev_positions=None,
                   test_positions=None, expected_slices=None, policies=None,
                   metrics=()):
    """Generic checks then path-specific ones, in one result.

    ``policies`` is optional so existing callers that inline their calibration are
    unaffected; supply it when the calibration rule is an authored callable.
    """
    import project_schema as schema

    result = schema.ContractResult()
    schema.check_plan(plan, budget_min=budget_min, budget_max=budget_max, result=result)
    schema.check_split_integrity(records, result)
    schema.check_matched_seeds(plan, records, result)
    # This path's question is a dev-versus-test comparison, so the metric must
    # span both slices; a run that skipped the test slice is incomplete.
    # Every metric the run reports, on the slices the question requires.
    for name in dict.fromkeys((metric,) + tuple(metrics)):
        schema.check_complete_grid(
            plan, records, name, result,
            expected_slices=expected_slices if expected_slices is not None
            else (DEV_SLICE, TEST_SLICE))
    schema.check_single_factor(plan, configs, result)
    schema.check_config_binding(records, configs, result)
    schema.check_matched_effort(plan, records, result)
    schema.check_metric_finiteness(records, result)
    if measured_budget is not None:
        schema.check_budget_honoured(plan, records, result,
                                     measured=measured_budget)
    schema.check_record(record, result)
    check_rule_frozen(plan, registry, result)
    check_rule_inventory(plan, registry, records, result)
    check_shifts_distinct(dev_shift, test_shift, result)
    if policies is not None:
        check_calibration_inputs(policies, result)
    if dev_positions is not None and test_positions is not None:
        check_calibration_disjoint(dev_positions, test_positions, result)
    if registry.rule is not None:
        check_coverage_slice(records, registry.rule, plan, result)
    if any(r.metric_name == "selective_risk" for r in records) and \
            plan.declared_change == "target_coverage":
        check_oracle_reference(records, result)
    return result
