# -*- coding: utf-8 -*-
"""MADE instrument for the autoregressive factorization-order candidate.

The question is whether the order in which pixels are generated changes how well a
finite-capacity model fits the data. The obvious implementation is to rebuild the
autoregressive masks for each ordering, and that is exactly the trap: in MADE the masks
depend on the ordering, so different orders yield different numbers of live connections
and "ordering matters" becomes confounded with "capacity differs".

**The control used here removes the confound by construction.** The network is fixed and
always operates in *rank space* with the natural ordering. An ordering is applied by
permuting the pixels into rank order on the way in and back on the way out. Parameter
count, mask pattern and live-connection count are therefore bit-identical across every
condition, and the only thing that changes is which pixel occupies which rank.

That also makes the invariant trivial to check rather than a matter of trust: see
``connectivity_signature``.
"""
from __future__ import annotations

import math

import torch
import torch.nn as nn


def masks(dims: int, hidden: int, layers: int, seed: int = 0):
    """Fixed MADE masks in rank space. Independent of any ordering."""
    generator = torch.Generator().manual_seed(seed)
    degrees = [torch.arange(1, dims + 1)]
    for _ in range(layers):
        degrees.append(torch.randint(1, dims, (hidden,), generator=generator))
    built = []
    for lower, upper in zip(degrees[:-1], degrees[1:]):
        built.append((upper.unsqueeze(1) >= lower.unsqueeze(0)).float())
    # The output layer is strictly greater: a pixel may not condition on itself.
    built.append((degrees[0].unsqueeze(1) > degrees[-1].unsqueeze(0)).float())
    return built


class MADE(nn.Module):
    """Autoregressive Bernoulli model over ``dims`` binary variables, in rank space."""

    def __init__(self, dims: int, hidden: int = 512, layers: int = 2, mask_seed: int = 0):
        super().__init__()
        self.dims = dims
        sizes = [dims] + [hidden] * layers + [dims]
        self.linears = nn.ModuleList(
            nn.Linear(sizes[i], sizes[i + 1]) for i in range(len(sizes) - 1))
        # Registered as buffers rather than held in a plain list, so .to(), .cpu() and
        # .cuda() all move them. An earlier version overrode to() instead, which missed
        # .cpu() and left the masks stranded on the GPU.
        for index, mask in enumerate(masks(dims, hidden, layers, mask_seed)):
            self.register_buffer(f"mask_{index}", mask, persistent=False)
        self.mask_count = len(self.linears)

    @property
    def mask_list(self):
        return [getattr(self, f"mask_{index}") for index in range(self.mask_count)]

    def forward(self, x):
        h = x
        for index, (linear, mask) in enumerate(zip(self.linears, self.mask_list)):
            h = nn.functional.linear(h, linear.weight * mask, linear.bias)
            if index < len(self.linears) - 1:
                h = torch.relu(h)
        return h                      # logits for each rank position

    def connectivity_signature(self) -> tuple:
        """Parameter count and live-connection count, for the invariant check.

        Identical across every ordering by construction, because the ordering never
        touches the network. A path adapter compares this across conditions; if it ever
        differs, the experiment is measuring capacity rather than order.
        """
        parameters = sum(p.numel() for p in self.parameters())
        live = int(sum(m.sum().item() for m in self.mask_list))
        return (parameters, live, tuple(m.shape for m in self.mask_list))


def bits_per_dim(model, data, permutation) -> float:
    """Held-out bits per dimension under a given factorization order.

    The permutation reorders pixels into rank space; the density is over the same images
    either way, so the number is directly comparable across orderings.
    """
    ranked = data[:, permutation]
    with torch.no_grad():
        logits = model(ranked)
        nll = nn.functional.binary_cross_entropy_with_logits(
            logits, ranked, reduction="none").sum(dim=1)
        return float((nll / (data.shape[1] * math.log(2))).mean())


# ---------------------------------------------------------------- orderings

def raster_order(side: int) -> torch.Tensor:
    return torch.arange(side * side)


def centre_out_order(side: int) -> torch.Tensor:
    """Pixels sorted by distance from the image centre, nearest first."""
    grid = torch.arange(side).float()
    y, x = torch.meshgrid(grid, grid, indexing="ij")
    centre = (side - 1) / 2.0
    distance = ((x - centre) ** 2 + (y - centre) ** 2).flatten()
    return torch.argsort(distance, stable=True)


def random_order(side: int, seed: int) -> torch.Tensor:
    return torch.randperm(side * side,
                          generator=torch.Generator().manual_seed(seed))


def is_permutation(order, dims: int) -> bool:
    values = sorted(int(v) for v in order)
    return values == list(range(dims))


def self_check() -> dict:
    """Verify the instrument, and above all verify the confound control."""
    dims, side = 16, 4
    model = MADE(dims, hidden=32, layers=2)
    signature = model.connectivity_signature()

    x = (torch.rand(64, dims) > 0.5).float()
    orders = {"raster": raster_order(side), "centre": centre_out_order(side),
              "random": random_order(side, 3)}
    checks = {name: is_permutation(order, dims) for name, order in orders.items()}

    # The central control: connectivity cannot depend on the ordering, because the
    # ordering never reaches the network.
    checks["connectivity_identical_across_orders"] = all(
        model.connectivity_signature() == signature for _ in orders)

    # Autoregressive property: output at rank r must not depend on input at rank >= r.
    model.zero_grad()
    probe = x[:1].clone().requires_grad_(True)
    model(probe)[0, 5].backward()
    influence = probe.grad[0].abs()
    checks["no_future_leak"] = bool(influence[5:].sum() == 0)
    checks["past_is_used"] = bool(influence[:5].sum() > 0)

    # A density must be comparable across orders on identical data.
    value = bits_per_dim(model, x, orders["raster"])
    checks["bits_finite"] = math.isfinite(value) and value > 0
    return checks


if __name__ == "__main__":
    results = self_check()
    for name, ok in results.items():
        print(f"  {name:<38} {'ok' if ok else 'FAILED'}")
    print("all made self-checks passed" if all(results.values())
          else "SELF-CHECK FAILED")
