"""The nightly knowledge-base run (GitHub Actions .github/workflows/kb-nightly.yml, or by hand), all without AI:
vectorise new and changed items -> remove duplicates -> auto-tag -> difficulty from answers -> sympy answer checks.
One step failing doesn't stop the rest; the exit code says whether any failed.

    python scripts/kb/nightly.py
"""
from __future__ import annotations

import traceback

import checks
import dedup
import embed_batch
import irt
import tag
from common import log

STEPS = [("embed", embed_batch.main), ("dedup", dedup.main), ("tag", tag.main), ("irt", irt.main), ("checks", checks.main)]

if __name__ == "__main__":
    failed = []
    for name, fn in STEPS:
        try:
            fn()
        except Exception as e:  # noqa: BLE001
            failed.append(name)
            log(name, error=repr(e))
            traceback.print_exc()
    log("nightly", failed=failed)
    raise SystemExit(1 if failed else 0)
