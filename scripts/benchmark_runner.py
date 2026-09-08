import time
import json
import statistics
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import lib.artifacts as art
import lib.io_utils as io

def run_benchmark():
    models_to_test = ["182_model.pkl", "183_model.pkl", "184_model.pkl"]
    
    # Mock data compatible with the models
    mock_payload = {
        "nodes": [{"id": "A", "type": "wallet"}],
        "edges": [{"source": "A", "target": "B", "amount": 100}]
    }

    results = {}
    
    for m in models_to_test:
        model_path = io.MODELS_DIR / m
        if not model_path.exists():
            continue
            
        print(f"Loading {m}...")
        t0 = time.perf_counter()
        model, _ = art.load_model(model_path)
        load_time = time.perf_counter() - t0
        
        # Warmup
        for _ in range(5):
            try:
                model.predict(mock_payload)
            except:
                pass
                
        # Benchmark
        latencies = []
        for _ in range(100):
            t1 = time.perf_counter()
            try:
                model.predict(mock_payload)
            except:
                pass
            latencies.append((time.perf_counter() - t1) * 1000) # ms
            
        latencies.sort()
        results[m] = {
            "load_time_ms": load_time * 1000,
            "runs": 100,
            "avg_ms": statistics.mean(latencies),
            "min_ms": latencies[0],
            "max_ms": latencies[-1],
            "p50_ms": latencies[50],
            "p95_ms": latencies[95],
            "p99_ms": latencies[99]
        }
        
    print(json.dumps(results, indent=2))

if __name__ == '__main__':
    run_benchmark()
