# -*- coding: utf-8 -*-
"""Adapter for the factorization-order path: "which order should a generator use?"

The learner designs the order in which pixels are generated. A fixed autoregressive
network operates in rank space, and an ordering is applied by permuting pixels in and
back out, so the network itself never changes.

Generic experiment discipline lives in ``project_schema``. Only these invariants are
specific to this path, and the first two are the ones that decide whether the experiment
means anything at all:

* **identical connectivity across conditions.** In MADE the masks normally depend on the
  ordering, so a naive implementation changes the number of live connections along with
  the order and "ordering matters" silently becomes "capacity differs". This checks the
  signature is bit-identical across every condition.
* **every ordering is a true permutation.** A learner order that repeats or omits a pixel
  is not a factorization of the same density, so its likelihood is not comparable.
* **no future leak**, verified by gradient rather than asserted: the logit at rank r must
  have zero gradient with respect to inputs at ranks >= r.
* **one shared held-out set**, because bits per dimension is only comparable when the
  data underneath it is the same.
* **one shared mask seed**, since a different draw of hidden-unit degrees is a different
  network.
"""
from __future__ import annotations

import torch

from project_schema import ContractResult, ProjectPlan

TRAIN_SLICE = "train"
EVAL_SLICE = "held_out"


def check_orders_are_permutations(orders, dims: int,
                                  result: ContractResult) -> ContractResult:
    for name, order in sorted(orders.items(), key=lambda kv: str(kv[0])):
        values = [int(v) for v in order]
        result.require(len(values) == dims, "order.length",
                       f"{name!r} has {len(values)} entries, expected {dims}")
        result.require(sorted(values) == list(range(dims)), "order.not_permutation",
                       f"{name!r} is not a permutation of 0..{dims - 1}: it repeats or "
                       "omits positions, so its likelihood is not comparable")
    return result


def check_identical_connectivity(signatures, result: ContractResult) -> ContractResult:
    """Parameter count, live-connection count and mask shapes must not vary.

    This is the confound control. If it fails, the experiment is measuring capacity.
    """
    distinct = {tuple(map(str, signature)) for signature in signatures.values()}
    result.require(len(distinct) == 1, "connectivity.differs",
                   f"{len(distinct)} distinct connectivity signatures across "
                   f"conditions; the comparison would confound order with capacity")
    return result


def check_no_future_leak(model, dims: int, result: ContractResult,
                         probe_rank: int | None = None) -> ContractResult:
    """Verified by gradient, not by trusting the mask construction."""
    rank = probe_rank if probe_rank is not None else dims // 2
    probe = (torch.rand(1, dims) > 0.5).float().requires_grad_(True)
    model.zero_grad()
    model(probe)[0, rank].backward()
    influence = probe.grad[0].abs()
    result.require(float(influence[rank:].sum()) == 0.0, "autoregressive.future_leak",
                   f"the logit at rank {rank} depends on inputs at rank >= {rank}")
    result.require(float(influence[:rank].sum()) > 0.0, "autoregressive.past_unused",
                   f"the logit at rank {rank} ignores every earlier rank, so the model "
                   "is not conditioning on anything")
    return result


def check_shared_evaluation(eval_hashes, result: ContractResult) -> ContractResult:
    distinct = set(eval_hashes.values())
    result.require(len(distinct) == 1, "evaluation.not_shared",
                   f"{len(distinct)} distinct held-out sets across conditions; bits per "
                   "dimension is only comparable on identical data")
    return result


def check_shared_mask_seed(configs, result: ContractResult) -> ContractResult:
    seeds = {config.get("mask_seed") for config in configs.values()}
    result.require(len(seeds) == 1, "network.mask_seed",
                   f"conditions used mask seeds {sorted(seeds)}; a different draw of "
                   "hidden-unit degrees is a different network")
    return result


def run_all_checks(plan: ProjectPlan, records, configs, orders, signatures,
                   eval_hashes, model, dims, record, *, budget_min, budget_max,
                   metric, provenance=None, measured_budget=None):
    """Generic checks first, then this path's invariants."""
    import project_schema as schema

    result = schema.ContractResult()
    schema.check_plan(plan, budget_min=budget_min, budget_max=budget_max, result=result)
    schema.check_split_integrity(records, result,
                                 seed_varies=plan.seed_varies)
    schema.check_matched_seeds(plan, records, result)
    schema.check_complete_grid(plan, records, metric, result)
    schema.check_matched_effort(plan, records, result)
    schema.check_metric_finiteness(records, result)
    schema.check_single_factor(plan, configs, result)
    schema.check_config_binding(records, configs, result)
    if provenance is not None:
        schema.check_provenance_bound(records, provenance, result)
    schema.check_record(record, result)
    if measured_budget is not None:
        schema.check_budget_honoured(plan, records, result, measured=measured_budget)

    check_orders_are_permutations(orders, dims, result)
    check_identical_connectivity(signatures, result)
    check_no_future_leak(model, dims, result)
    check_shared_evaluation(eval_hashes, result)
    check_shared_mask_seed(configs, result)
    return result
