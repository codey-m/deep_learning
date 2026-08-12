# -*- coding: utf-8 -*-
"""Adapter for the early-exit path: "who gets the deep network?"

Exit heads are trained once at several depths and shared by every policy. A policy is a
rule for deciding, per example, where to stop. Conditions are compared **at matched
average cost**, so the question is not whether spending less hurts but whether spending
the same budget unevenly beats spending it arbitrarily.

Generic experiment discipline lives in ``project_schema``. These invariants are specific:

* **matched realized cost.** A policy that quietly spends more is not competing, it is
  buying. This is the one that decides whether the comparison means anything.
* **savings materialise on the clock.** Predicted cost must track measured time on a
  genuinely truncated batch. A policy whose saving exists only in the arithmetic is the
  failure mode that makes early-exit results untrustworthy, and measuring the stem shows
  why: it alone is 48% of this backbone's forward pass, so layer-counting badly
  overstates what exiting early can buy.
* **shared exit heads.** A policy that trains its own heads is competing with a different
  model, not a different rule.
* **every example exits exactly once**, at a valid depth.
* **the policy may not see the label.** Enforced by inspecting the callable's parameters,
  which is a documented protocol rather than a security guarantee: Python cannot stop a
  closure. It catches the accident and records the intent.
"""
from __future__ import annotations

import inspect
from typing import Callable, Mapping, Sequence

from project_schema import ContractResult, ProjectPlan

EVAL_SLICE = "held_out"
COST_SLICE = "cost"

# What a routing policy may see. Absent: labels, the evaluation targets, anything that
# would let it route by knowing the answer.
# "calibration_exit" carries scores from images the policy is allowed to tune on.
# "per_exit" carries the images it is scored on, and they are disjoint: a threshold
# solved on the examples it will be judged on is an oracle operating point, not a
# deployable rule. The abstention path makes that its whole lesson, and this path
# should not quietly do the opposite.
ALLOWED_POLICY_INPUTS = frozenset(
    {"per_exit", "calibration_exit", "stage_costs", "target_cost", "seed", "rng",
     "count"})


def check_policy_inputs(policies: Mapping[str, Callable],
                        result: ContractResult) -> ContractResult:
    for name, function in sorted(policies.items()):
        parameters = set(inspect.signature(function).parameters)
        forbidden = parameters - ALLOWED_POLICY_INPUTS
        result.require(not forbidden, "policy.inputs",
                       f"{name!r} accepts {sorted(forbidden)}, outside "
                       f"{sorted(ALLOWED_POLICY_INPUTS)}; a policy that can see the "
                       "label is not routing, it is cheating")
    return result


def check_cost_matched(realized: Mapping[str, float], target: float,
                       result: ContractResult, tolerance: float = 0.02) -> ContractResult:
    """Every condition must land on the declared budget, within a relative tolerance."""
    for condition, cost in sorted(realized.items(), key=lambda kv: str(kv[0])):
        drift = abs(cost - target) / target if target else float("inf")
        result.require(drift <= tolerance, "cost.unmatched",
                       f"{condition!r} realized {cost:.4f} against a target of "
                       f"{target:.4f} ({drift:.1%} off); conditions spending different "
                       "budgets are not comparable")
    return result


def check_savings_materialise(verification: Mapping[str, dict],
                              result: ContractResult,
                              lower: float = 0.7, upper: float = 1.5) -> ContractResult:
    """Measured time must track predicted cost on a genuinely truncated batch."""
    for condition, report in sorted(verification.items(), key=lambda kv: str(kv[0])):
        ratio = report.get("ratio", float("nan"))
        result.require(lower <= ratio <= upper, "cost.not_realised",
                       f"{condition!r} predicted {report.get('predicted_ms', 0):.4f} ms "
                       f"but measured {report.get('measured_ms', 0):.4f} "
                       f"(ratio {ratio:.2f}); the saving does not appear on the clock")
    return result


def check_shared_heads(head_digests: Mapping[str, str],
                       result: ContractResult) -> ContractResult:
    distinct = set(head_digests.values())
    result.require(len(distinct) == 1, "heads.not_shared",
                   f"{len(distinct)} distinct exit-head sets across conditions; a policy "
                   "with its own heads is a different model, not a different rule")
    return result


def check_valid_exits(depths: Mapping[str, Sequence[int]], stage_count: int,
                      expected: int, result: ContractResult) -> ContractResult:
    for condition, depth in sorted(depths.items(), key=lambda kv: str(kv[0])):
        values = [int(v) for v in depth]
        result.require(len(values) == expected, "exit.count",
                       f"{condition!r} routed {len(values)} examples, expected {expected}")
        result.require(all(0 <= v < stage_count for v in values), "exit.out_of_range",
                       f"{condition!r} routed an example to a depth outside "
                       f"0..{stage_count - 1}")
    return result


def check_shared_evaluation(eval_digests: Mapping[str, str],
                            result: ContractResult) -> ContractResult:
    result.require(len(set(eval_digests.values())) == 1, "evaluation.not_shared",
                   "conditions were scored on different held-out sets")
    return result


def run_all_checks(plan: ProjectPlan, records, configs, policies, realized_costs,
                   target_cost, verification, head_digests, depths, eval_digests,
                   stage_count, expected_examples, record, *, budget_min, budget_max,
                   metric, metrics=(), provenance=None, measured_budget=None):
    """Generic checks first, then this path's invariants."""
    import project_schema as schema

    result = schema.ContractResult()
    schema.check_plan(plan, budget_min=budget_min, budget_max=budget_max, result=result)
    schema.check_split_integrity(records, result, seed_varies=plan.seed_varies)
    schema.check_matched_seeds(plan, records, result)
    # Every metric the run reports. Checking the primary one alone would let a
    # secondary metric be incomplete or absent without failing the gate.
    for name in dict.fromkeys((metric,) + tuple(metrics)):
        schema.check_complete_grid(plan, records, name, result)
    schema.check_matched_effort(plan, records, result)
    schema.check_metric_finiteness(records, result)
    schema.check_single_factor(plan, configs, result)
    schema.check_config_binding(records, configs, result)
    if provenance is not None:
        schema.check_provenance_bound(records, provenance, result)
    schema.check_record(record, result)
    if measured_budget is not None:
        schema.check_budget_honoured(plan, records, result, measured=measured_budget)

    check_policy_inputs(policies, result)
    check_cost_matched(realized_costs, target_cost, result)
    check_savings_materialise(verification, result)
    check_shared_heads(head_digests, result)
    check_valid_exits(depths, stage_count, expected_examples, result)
    check_shared_evaluation(eval_digests, result)
    return result
