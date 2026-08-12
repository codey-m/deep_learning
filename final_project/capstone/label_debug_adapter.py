# -*- coding: utf-8 -*-
"""Adapter for the label-debugging path: "which training examples should I audit?"

Structured label noise is planted in the training split. Each method only *ranks*
examples; a simulated auditor inspects the top k, corrects the ones that are genuinely
corrupted and leaves legitimate examples alone. Methods are then compared on what they
found, what budget they wasted, and what the model looks like after matched retraining.

Generic experiment discipline lives in ``project_schema``. Only these four invariants
are specific to this path:

* **exact-k selection** - a method that audits more than its budget is not competing on
  the same terms;
* **unique training IDs** - a selection with duplicates spends budget on nothing;
* **the corruption mask is not an input** - a method that can see which labels were
  flipped is not a method, it is the answer key;
* **corruption is train-only** - evaluation labels must be pristine, or the measured
  downstream accuracy is against a moving target.

``check_method_inputs`` inspects audit callables and permits only parameters from
``ALLOWED_METHOD_INPUTS``. That is a **documented scientific protocol, not a security
guarantee**: Python cannot stop a method reading the mask through a global or a closure.
It catches the accident and records the intent; it does not defeat a determined author.
"""
from __future__ import annotations

import inspect
import math
from dataclasses import dataclass
from typing import Callable, Mapping, Sequence

from project_schema import ContractResult, ProjectPlan

TRAIN_SLICE = "train_audit"
EVAL_SLICE = "held_out"

# What a ranking method is allowed to see. Notably absent: anything derived from the
# planted mask, the true labels, or the evaluation split.
ALLOWED_METHOD_INPUTS = frozenset(
    {"features", "noisy_labels", "logits", "fold_logits", "budget", "rng", "seed"})


@dataclass(frozen=True)
class AuditProtocol:
    """The remediation policy, fixed for every method so only ranking varies."""
    budget: int
    corrupt_rate: float
    corrupt_pairs: tuple
    corrects_found: bool = True
    touches_clean: bool = False

    def describe(self) -> str:
        pairs = ", ".join(f"{a}->{b}" for a, b in self.corrupt_pairs)
        return (f"audit {self.budget} examples; auditor corrects corrupted labels and "
                f"leaves clean ones untouched; planted {self.corrupt_rate:.0%} on "
                f"{pairs}")


def check_method_inputs(methods: Mapping[str, Callable],
                        result: ContractResult) -> ContractResult:
    """A ranking method may not accept the corruption mask, by construction."""
    for name, function in sorted(methods.items()):
        parameters = set(inspect.signature(function).parameters)
        forbidden = parameters - ALLOWED_METHOD_INPUTS
        result.require(not forbidden, "method.inputs",
                       f"{name!r} accepts {sorted(forbidden)}, which is outside "
                       f"{sorted(ALLOWED_METHOD_INPUTS)}")
    return result


def check_exact_k(selections: Mapping[tuple, Sequence[int]], budget: int,
                  result: ContractResult) -> ContractResult:
    """Every method spends exactly its budget, so none competes on a longer list."""
    for (condition, seed), picked in sorted(selections.items(), key=lambda kv: str(kv[0])):
        result.require(len(picked) == budget, "audit.budget",
                       f"{condition!r} seed {seed} audited {len(picked)} of {budget}")
    return result


def check_unique_ids(selections: Mapping[tuple, Sequence[int]],
                     train_ids_by_seed: Mapping[int, Sequence[int]],
                     result: ContractResult) -> ContractResult:
    """Selections must be distinct and drawn from *that seed's* training split.

    The allow-list is supplied per seed and must be derived from the split, never from
    the selections being validated: an allow-list built from the selections would let
    an out-of-split pick authorise itself.
    """
    for (condition, seed), picked in sorted(selections.items(), key=lambda kv: str(kv[0])):
        allowed = set(train_ids_by_seed.get(seed, ()))
        result.require(bool(allowed), "audit.no_allowlist",
                       f"seed {seed} has no training split to validate against")
        result.require(len(set(picked)) == len(picked), "audit.duplicates",
                       f"{condition!r} seed {seed} selected the same example twice")
        stray = set(picked) - allowed
        result.require(not stray, "audit.out_of_split",
                       f"{condition!r} seed {seed} audited {len(stray)} id(s) outside "
                       "the training split")
    return result


def check_train_only_corruption(pristine_eval_labels, observed_eval_labels,
                                result: ContractResult) -> ContractResult:
    """Evaluation labels must be untouched, or downstream accuracy means nothing."""
    same = list(pristine_eval_labels) == list(observed_eval_labels)
    result.require(same, "corruption.leaked_to_eval",
                   "evaluation labels differ from the pristine split, so corruption "
                   "was not confined to training")
    return result


def check_protocol_fixed(configs: Mapping, protocol: AuditProtocol,
                         result: ContractResult) -> ContractResult:
    """Budget and remediation policy are held constant; only the ranking varies."""
    for condition, config in sorted(configs.items(), key=lambda kv: str(kv[0])):
        result.require(config.get("budget") == protocol.budget, "protocol.budget",
                       f"{condition!r} used budget {config.get('budget')}")
        result.require(config.get("corrects_found") == protocol.corrects_found,
                       "protocol.remediation",
                       f"{condition!r} changed the remediation policy")
    return result


def check_reference_points(bookends, result: ContractResult) -> ContractResult:
    """A floor and a ceiling must be recorded, so a learner always has a yardstick.

    Beating random selection is not evidence that an audit was worth running. Without
    the no-repair floor there is nothing to say repair helped at all, and without the
    all-corrected ceiling there is no way to tell whether a method captured most of the
    available gain or a sliver of it. The abstention path takes the same position for
    the same reason; see ``check_oracle_reference`` there.
    """
    for name in ("no_repair", "oracle"):
        values = list(bookends.get(name, ()))
        result.require(bool(values), f"reference.{name}",
                       f"no {name.replace('_', ' ')} reference was recorded, so the "
                       "audit result has no yardstick to be read against")
        result.require(all(math.isfinite(v) for pair in values for v in pair),
                       f"reference.{name}_finite",
                       f"the {name.replace('_', ' ')} reference is not finite")
    return result


def run_all_checks(plan: ProjectPlan, records, configs, methods, selections,
                   protocol: AuditProtocol, train_ids_by_seed, pristine_eval,
                   observed_eval,
                   record, *, budget_min, budget_max, metric, slice_name,
                   metrics=(), bookends=None, provenance=None, measured_budget=None):
    """Generic checks first, then this path's four invariants."""
    import project_schema as schema

    result = schema.ContractResult()
    schema.check_plan(plan, budget_min=budget_min, budget_max=budget_max, result=result)
    schema.check_split_integrity(records, result)
    schema.check_matched_seeds(plan, records, result)
    # Every metric the run reports, not only the primary one. Checking the ranking
    # metric alone would let the downstream metrics, which this path calls the real
    # objective, be incomplete or absent without failing the gate.
    for name in dict.fromkeys((metric,) + tuple(metrics)):
        schema.check_complete_grid(plan, records, name, result)
    schema.check_matched_effort(plan, records, result)
    schema.check_metric_finiteness(records, result)
    # This path claims only the ranking changes between conditions, so the same
    # single-factor discipline the other three adapters apply belongs here too.
    schema.check_single_factor(plan, configs, result)
    schema.check_config_binding(records, configs, result)
    if provenance is not None:
        schema.check_provenance_bound(records, provenance, result)
    schema.check_record(record, result)
    if measured_budget is not None:
        schema.check_budget_honoured(plan, records, result, measured=measured_budget)

    if bookends is not None:
        check_reference_points(bookends, result)
    check_method_inputs(methods, result)
    check_exact_k(selections, protocol.budget, result)
    check_unique_ids(selections, train_ids_by_seed, result)
    check_train_only_corruption(pristine_eval, observed_eval, result)
    check_protocol_fixed(configs, protocol, result)
    return result
