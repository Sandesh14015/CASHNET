import json
import sys
from pathlib import Path

# Add project root to sys.path
ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import lib.artifacts as art
import lib.io_utils as io


def main():
    try:
        # Read JSON from stdin
        input_data = sys.stdin.read()
        if not input_data.strip():
            print(json.dumps({"error": "Empty input"}))
            return

        record = json.loads(input_data)

        # Load the 184 model
        model_path = io.MODELS_DIR / "184_model.pkl"
        if not model_path.exists():
            print(json.dumps({"error": f"Model not found at {model_path}"}))
            return

        model, _ = art.load_model(model_path)

        # Predict
        payload = model.predict(record, threshold=0.7)

        # Output the result as JSON to stdout
        print(json.dumps(payload))

    except (json.JSONDecodeError, KeyError, FileNotFoundError, OSError) as e:
        import traceback

        print(json.dumps({"error": str(e), "traceback": traceback.format_exc()}))


if __name__ == "__main__":
    main()
