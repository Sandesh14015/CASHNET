"""Dependency-free Node2Vec-style graph embeddings.

Implements the Node2Vec idea (Grover & Leskovec 2016) without torch/networkx:
  1. biased/unbiased random walks over an adjacency dict,
  2. a skip-gram co-occurrence matrix from the walks,
  3. low-dim embeddings via TruncatedSVD (equivalent to word2vec skip-gram).

Used by model_182 to give wallet/entity nodes a graph-aware vector that the
VASP-attribution head can consume. The same `embed()` works on any
wallet->wallet transaction graph, so when live multi-chain indexers feed real
edges this module upgrades the prototype to production attribution.
"""

from __future__ import annotations

import random
from collections.abc import Iterable

import numpy as np
import scipy.sparse as sp
from sklearn.decomposition import TruncatedSVD


def build_adj(edge_lists: Iterable[Iterable[tuple[str, str]]]) -> dict[str, list[str]]:
    """Merge multiple edge iterables into an undirected adjacency dict."""
    adj: dict[str, list[str]] = {}
    for edges in edge_lists:
        for a, b in edges:
            if a == b:
                continue
            adj.setdefault(a, []).append(b)
            adj.setdefault(b, []).append(a)
    return adj


def random_walks(
    adj: dict[str, list[str]], num_walks: int = 10, walk_len: int = 8, seed: int = 42
) -> list[list[str]]:
    rnd = random.Random(seed)
    nodes = [n for n in adj if adj[n]]
    walks: list[list[str]] = []
    if not nodes:
        return walks
    for _ in range(num_walks):
        for start in nodes:
            walk = [start]
            for _ in range(walk_len - 1):
                neigh = adj.get(walk[-1])
                if not neigh:
                    break
                walk.append(rnd.choice(neigh))
            walks.append(walk)
    return walks


def embed(
    adj: dict[str, list[str]],
    dim: int = 32,
    num_walks: int = 10,
    walk_len: int = 8,
    window: int = 2,
    seed: int = 42,
):
    """Return (node->vector dict, fitted TruncatedSVD)."""
    nodes = list(adj.keys())
    if not nodes:
        return {}, None
    idx = {n: i for i, n in enumerate(nodes)}
    walks = random_walks(adj, num_walks, walk_len, seed)
    rows, cols, data = [], [], []
    for w in walks:
        for i, center in enumerate(w):
            lo, hi = max(0, i - window), min(len(w), i + window + 1)
            for j in range(lo, hi):
                if j == i:
                    continue
                rows.append(idx[center])
                cols.append(idx[w[j]])
                data.append(1.0)
    C = sp.csr_matrix((data, (rows, cols)), shape=(len(nodes), len(nodes)))
    C = C + C.T
    svd = TruncatedSVD(n_components=min(dim, len(nodes) - 1), random_state=seed)
    emb = svd.fit_transform(C)
    return {n: emb[i] for i, n in enumerate(nodes)}, svd


def aggregate(
    node_vecs: dict[str, np.ndarray], node_list: Iterable[str], dim: int
) -> np.ndarray:
    vecs = [node_vecs[n] for n in node_list if n in node_vecs]
    if vecs:
        return np.mean(vecs, axis=0)
    return np.zeros(dim)
