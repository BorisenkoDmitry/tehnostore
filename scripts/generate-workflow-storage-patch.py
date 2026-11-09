"""Pin synchronous inverse checkpoint persistence; never edit installed packages."""
from pathlib import Path
import difflib

root = Path(__file__).resolve().parents[1]
package = next((root / "node_modules/.pnpm").glob("@medusajs+workflow-engine-i*")) / "node_modules/@medusajs/workflow-engine-inmemory"
assert '"version": "2.22.3"' in (package / "package.json").read_text(encoding="utf-8")
path = "dist/utils/workflow-orchestrator-storage.js"
original = (package / path).read_text(encoding="utf-8")
old = "const isTargetState = targetStates.has(step.invoke?.state);"
assert original.count(old) == 1
modified = original.replace(old, "const isTargetState = targetStates.has((isFlowInvoking ? step.invoke : step.compensate)?.state);")
old = "if (!(isNotStarted || isFinished || isWaitingToCompensate) &&"
assert modified.count(old) == 1
modified = modified.replace(old, """// A synchronous inverse can commit before a process dies. Persist
        // every compensation transition of an explicitly stored workflow,
        // including native child-as-step definitions whose store is false.
        const isCompensating = data.flow.state === utils_1.TransactionState.COMPENSATING;
        if (!(isNotStarted || isFinished || isWaitingToCompensate || isCompensating) &&""")
result = [f"diff --git a/{path} b/{path}\n"]
for line in difflib.unified_diff(original.splitlines(True), modified.splitlines(True), fromfile=f"a/{path}", tofile=f"b/{path}"):
    result.append(line if line.endswith("\n") else line + "\n\\ No newline at end of file\n")
(root / "patches/@medusajs__workflow-engine-inmemory@2.22.3.patch").write_text("".join(result), encoding="utf-8", newline="\n")
print("Generated pinned synchronous compensation storage patch")
