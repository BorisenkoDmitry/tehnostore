"""Generate the pinned 2.22.3 nested-compensation recovery patch.

Reads pristine installed JS, writes a pnpm patch, never edits node_modules.
"""
from pathlib import Path
import difflib

root = Path(__file__).resolve().parents[1]
package = next((root / "node_modules/.pnpm").glob("@medusajs+orchestration@2.2*")) / "node_modules/@medusajs/orchestration"
assert '"version": "2.22.3"' in (package / "package.json").read_text(encoding="utf-8")
path = "dist/workflow/local-workflow.js"
original = (package / path).read_text(encoding="utf-8")
old = '''        if (!transaction.getFlow) {
            transaction = await this.getRunningTransaction(transaction.flow.transactionId, context);
        }'''
new = '''        if (!transaction.getFlow) {
            const saved = transaction;
            try {
                transaction = await this.getRunningTransaction(saved.flow.transactionId, context);
            }
            catch (error) {
                // A stored parent already carries the completed child's full
                // compensation checkpoint. Non-stored native child workflows
                // disappear from the in-memory datastore on process restart.
                // Recover only this SDK parent-child boundary, never arbitrary
                // API-provided snapshots or a different workflow/transaction.
                // The SDK derives a new suffix from the parent's compensation
                // attempt, although cancel still receives the original child
                // checkpoint. Bind both IDs to that exact parent step rather
                // than accepting arbitrary transaction-ID suffixes.
                const parentKey = saved.flow?.metadata?.parentStepIdempotencyKey;
                const parentParts = typeof parentKey === "string" ? parentKey.split(":") : [];
                const [parentWorkflow, parentTransaction, parentAction, parentType] = parentParts;
                const baseChildId = `${parentAction}-${parentTransaction}`;
                const isChildAttempt = (id) => {
                    if (id === baseChildId) return true;
                    const prefix = `${baseChildId}-attempt-`;
                    const suffix = typeof id === "string" && id.startsWith(prefix) ? id.slice(prefix.length) : "";
                    return /^[1-9][0-9]*$/.test(suffix) && Number(suffix) >= 2;
                };
                const matchingRetryContext = parentParts.length === 4 && parentWorkflow && parentTransaction && parentAction && parentType === "invoke" &&
                    context?.parentStepIdempotencyKey === `${parentWorkflow}:${parentTransaction}:${parentAction}:compensate` &&
                    isChildAttempt(saved.flow?.transactionId) && isChildAttempt(context?.transactionId);
                const validSnapshot = context?.cancelingFromParentStep === true &&
                    saved.flow?.modelId === this.workflowId &&
                    (saved.flow?.transactionId === context.transactionId || matchingRetryContext) &&
                    typeof saved.flow?.runId === "string" && saved.flow.runId.length > 0 &&
                    saved.flow?.state === utils_1.TransactionState.DONE &&
                    typeof saved.flow?.metadata?.parentStepIdempotencyKey === "string" &&
                    saved.flow?.definition && saved.context?.invoke && saved.context?.compensate;
                if (error?.type !== utils_1.MedusaError.Types.NOT_FOUND || !validSnapshot) {
                    throw error;
                }
                // getRunningTransaction intentionally filters terminal records,
                // and the storage adapter also hides lookup errors. Prove true
                // absence through the public module read: DB errors propagate.
                const engine = this.container_.resolve(utils_1.Modules.WORKFLOW_ENGINE, { allowUnregistered: true });
                if (!engine?.listWorkflowExecutions) throw error;
                const executions = await engine.listWorkflowExecutions({ workflow_id: this.workflowId, transaction_id: saved.flow.transactionId }, { order: { created_at: "DESC" }, take: 1 });
                const latest = executions[0];
                if (latest && latest.state !== utils_1.TransactionState.REVERTED && latest.state !== utils_1.TransactionState.DONE) {
                    throw new utils_1.MedusaError(utils_1.MedusaError.Types.NOT_ALLOWED, "Child compensation requires review of its persisted execution state");
                }
                const checkpoint = latest ? {
                    flow: latest.execution,
                    context: latest.context?.data,
                    errors: latest.context?.errors ?? [],
                } : JSON.parse(JSON.stringify(saved));
                if (checkpoint.flow?.modelId !== this.workflowId || checkpoint.flow?.transactionId !== saved.flow.transactionId || !checkpoint.context?.invoke || !checkpoint.context?.compensate || (latest && checkpoint.flow.runId !== saved.flow.runId)) throw error;
                if (latest?.state !== utils_1.TransactionState.REVERTED) {
                    checkpoint.flow.metadata.parentSnapshotRecovery = true;
                    checkpoint.flow.options = { ...checkpoint.flow.options, store: true, retentionTime: 60 * 60 * 24 * 30 };
                    const storeSteps = (definition) => {
                        if (definition?.action) definition.store = true;
                        if (Array.isArray(definition?.next)) definition.next.forEach(storeSteps);
                        else if (definition?.next) storeSteps(definition.next);
                    };
                    storeSteps(checkpoint.flow.definition);
                }
                const [steps] = transaction_1.TransactionOrchestrator.buildSteps(checkpoint.flow.definition, checkpoint.flow.steps);
                checkpoint.flow.steps = steps;
                transaction = new transaction_1.DistributedTransaction(checkpoint.flow, this.workflow.handler(this.container_, context), undefined, checkpoint.errors, checkpoint.context);
                // A previous worker already committed this child's inverse.
                // Complete the parent checkpoint without applying it twice.
                if (latest?.state === utils_1.TransactionState.REVERTED) return transaction;
            }
        }'''
assert original.count(old) == 1
modified = original.replace(old, new)
needle = '''        await orchestrator.cancelTransaction(transaction);
        try {'''
assert modified.count(needle) == 1
modified = modified.replace(needle, '''        const recoveringInverse = transaction.getFlow().metadata?.parentSnapshotRecovery === true &&
            [utils_1.TransactionState.COMPENSATING, utils_1.TransactionState.WAITING_TO_COMPENSATE].includes(transaction.getState());
        if (recoveringInverse) {
            // An interrupted in-flight inverse is ambiguous: its external
            // mutation may already have committed. Never replay it blindly.
            const ambiguous = Object.values(transaction.getFlow().steps).some((step) => step.compensate?.status === utils_1.TransactionStepStatus.WAITING);
            if (ambiguous) throw new utils_1.MedusaError(utils_1.MedusaError.Types.NOT_ALLOWED, "Interrupted child inverse requires review");
            await orchestrator.resume(transaction);
        } else {
            await orchestrator.cancelTransaction(transaction);
        }
        // Optional OS-local test observer; normal applications register none.
        // It runs after the recovered child is durably terminal, before the
        // parent records its compensation response, to test a second crash.
        const observer = global[Symbol.for("medusa.workflow.afterChildCompensation")];
        if (transaction.getFlow().metadata?.parentSnapshotRecovery && typeof observer === "function") {
            await observer({ workflowId: this.workflowId, transactionId: transaction.transactionId, state: transaction.getState() });
        }
        try {''')
changes = [(path, original, modified)]
path = "dist/transaction/distributed-transaction.js"
original = (package / path).read_text(encoding="utf-8")
needle = '''        if (!options?.store) {
            return;
        }'''
assert original.count(needle) == 1
modified = original.replace(needle, '''        // Recovered native children use their parent's saved checkpoint. Keep
        // their inverse progress and terminal record across another restart;
        // do not change the global options of ordinary native workflows.
        if (this.getFlow().metadata?.parentSnapshotRecovery === true) {
            options.store = true;
            options.retentionTime = this.getFlow().options?.retentionTime ?? 60 * 60 * 24 * 30;
        }
        if (!options?.store) {
            return;
        }''')
changes.append((path, original, modified))
needle = '''                const savedCheckpoint = await DistributedTransaction.keyValueStore.save(key, checkpoint, ttl, options);
                return savedCheckpoint;'''
assert modified.count(needle) == 1
modified = modified.replace(needle, '''                const savedCheckpoint = await DistributedTransaction.keyValueStore.save(key, checkpoint, ttl, options);
                const observer = global[Symbol.for("medusa.workflow.afterRecoveredCheckpoint")];
                if (checkpoint.flow.metadata?.parentSnapshotRecovery && typeof observer === "function") await observer(checkpoint);
                return savedCheckpoint;''')
changes[-1] = (path, original, modified)
result = []
for path, original, modified in changes:
    result.append(f"diff --git a/{path} b/{path}\n")
    for line in difflib.unified_diff(original.splitlines(True), modified.splitlines(True), fromfile=f"a/{path}", tofile=f"b/{path}"):
        result.append(line if line.endswith("\n") else line + "\n\\ No newline at end of file\n")
(root / "patches/@medusajs__orchestration@2.22.3.patch").write_text("".join(result), encoding="utf-8", newline="\n")
print("Generated pinned orchestration nested compensation patch")
