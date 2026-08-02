"use client";
/**
 * ArgsEditor — the owner changing what the agent is about to do, and the draft
 * state behind it.
 *
 * THE EDIT IS A PATCH, AND THE SCREEN SAYS SO EVERYWHERE. `ApprovalDecision.editedArgs`
 * is merged over the frozen invocation — `{ ...proposed, ...editedArgs }` — so an
 * argument the owner did not touch is not "unchanged by luck", it is genuinely
 * absent from what gets sent. `useArgDraft` therefore emits ONLY the keys that
 * moved. Round-tripping the whole object back would technically work (the
 * runtime's `diffArgs` discards equal values) but it would put the browser's
 * idea of every argument on the wire, and any coercion on the way — a number
 * that became a string, a key order the JSON walk reordered — would silently
 * become the thing that executed.
 *
 * THE EDITOR TYPE IS FIXED BY THE PROPOSAL, NOT BY WHAT IS TYPED. A field that
 * arrived as a number stays a number editor, so an owner correcting `1200` to
 * `1150` cannot accidentally send the string `"1150"` past a policy limit that
 * only understands numbers. Changing an argument's type is possible, but it
 * requires deliberately adding it back as a different kind — it is not something
 * a stray keystroke does.
 *
 * REMOVING AN ARGUMENT IS NOT OFFERED, AND THAT IS A LIMIT OF THE WIRE, NOT AN
 * OVERSIGHT. The runtime expresses "the owner cleared this key" as a key whose
 * value is `undefined`, which `JSON.stringify` drops on its way to the route —
 * so a clear sent over HTTP arrives as a key that was never mentioned, which
 * means "leave the agent's value alone". Rather than ship a button that silently
 * does nothing, the panel says what is missing: setting a value to `null` is a
 * change TO null, not a removal.
 *
 * A VALUE THAT DOES NOT PARSE BLOCKS THE APPROVAL RATHER THAN BEING DROPPED.
 * `invalidKeys` is what the drawer disables its Approve button on. Sending the
 * approval with the bad key omitted would approve the agent's original value
 * while showing the owner their replacement — the exact mismatch the whole
 * edit-before-approve path exists to prevent.
 */
import { useMemo, useState } from "react";
import { AlertTriangle, Plus, Undo2, X } from "lucide-react";
import type { ValueKind } from "./format";
import { previewValue, safeStringify, sameJsonValue, valueKind } from "./format";
import styles from "./live-approvals.module.css";

/* ═══════════════════════════ Draft state ═══════════════════════════ */

export interface ArgEntry {
  key: string;
  /** The agent's value. Absent — not undefined-valued — on a key the owner added. */
  original?: unknown;
  /** Fixed when the entry is created; see the header. */
  kind: ValueKind;
  /** Raw editor text. For `boolean` this is "true" or "false". */
  text: string;
}

export interface DraftChange {
  key: string;
  kind: "added" | "changed";
  from?: unknown;
  to: unknown;
}

export interface ArgDraft {
  entries: ArgEntry[];
  /** Only the keys that moved — this is what goes over the wire. */
  patch: Record<string, unknown>;
  /** `{ ...proposed, ...patch }`: exactly what the runtime will replay. */
  resolved: Record<string, unknown>;
  changes: DraftChange[];
  /** Keys whose text is not a value of their kind. Blocks the decision. */
  invalidKeys: string[];
  /** Per-key parse complaint, keyed the same way. */
  errors: Record<string, string>;
  edit(key: string, text: string): void;
  revert(key: string): void;
  add(key: string, kind: ValueKind, text: string): void;
  /** Only meaningful for keys the owner added; the agent's keys revert instead. */
  drop(key: string): void;
  resetAll(): void;
}

function seed(proposed: Record<string, unknown>): ArgEntry[] {
  // Sorted so the panel is stable across refetches; the runtime's own diff walks
  // keys in sorted order for the same reason.
  return Object.keys(proposed)
    .sort()
    .map((key) => {
      const original = proposed[key];
      const kind = valueKind(original);
      return { key, original, kind, text: textFor(kind, original) };
    });
}

function textFor(kind: ValueKind, value: unknown): string {
  if (kind === "string") return typeof value === "string" ? value : "";
  if (kind === "boolean") return value === true ? "true" : "false";
  if (kind === "number") return typeof value === "number" ? String(value) : "";
  return safeStringify(value);
}

type Parsed = { ok: true; value: unknown } | { ok: false; error: string };

function parse(kind: ValueKind, text: string): Parsed {
  if (kind === "string") return { ok: true, value: text };

  if (kind === "number") {
    const trimmed = text.trim();
    if (trimmed === "") return { ok: false, error: "This field is a number; it cannot be blank." };
    const value = Number(trimmed);
    if (!Number.isFinite(value)) {
      return { ok: false, error: `"${trimmed}" is not a number. Your limits compare numbers, not text.` };
    }
    return { ok: true, value };
  }

  if (kind === "boolean") {
    if (text === "true") return { ok: true, value: true };
    if (text === "false") return { ok: true, value: false };
    return { ok: false, error: "This field is true or false." };
  }

  const trimmed = text.trim();
  if (trimmed === "") {
    return { ok: false, error: "Enter a JSON value. Write null for an empty one." };
  }
  try {
    return { ok: true, value: JSON.parse(trimmed) as unknown };
  } catch (err) {
    return { ok: false, error: `Not valid JSON: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/**
 * The draft for one approval, re-seeded whenever the approval changes.
 *
 * The re-seed happens DURING RENDER rather than in an effect, so a drawer opened
 * on a second approval never paints the first one's edits — even for a frame.
 * That frame would be an owner reading somebody else's proposal.
 */
export function useArgDraft(approvalId: string, proposed: Record<string, unknown>): ArgDraft {
  const [state, setState] = useState(() => ({ id: approvalId, entries: seed(proposed) }));

  if (state.id !== approvalId) {
    setState({ id: approvalId, entries: seed(proposed) });
  }

  const entries = state.id === approvalId ? state.entries : seed(proposed);

  const derived = useMemo(() => {
    const patch: Record<string, unknown> = {};
    const changes: DraftChange[] = [];
    const invalidKeys: string[] = [];
    const errors: Record<string, string> = {};

    for (const entry of entries) {
      const result = parse(entry.kind, entry.text);
      if (!result.ok) {
        invalidKeys.push(entry.key);
        errors[entry.key] = result.error;
        continue;
      }
      const added = !Object.hasOwn(entry, "original");
      if (!added && sameJsonValue(entry.original, result.value)) continue;

      patch[entry.key] = result.value;
      changes.push(
        added
          ? { key: entry.key, kind: "added", to: result.value }
          : { key: entry.key, kind: "changed", from: entry.original, to: result.value },
      );
    }

    const resolved: Record<string, unknown> = { ...proposed, ...patch };
    return { patch, changes, invalidKeys, errors, resolved };
  }, [entries, proposed]);

  const update = (next: (current: ArgEntry[]) => ArgEntry[]) =>
    setState((current) => ({ id: current.id, entries: next(current.entries) }));

  return {
    entries,
    ...derived,
    edit: (key, text) =>
      update((current) => current.map((e) => (e.key === key ? { ...e, text } : e))),
    revert: (key) =>
      update((current) =>
        current.map((e) =>
          e.key === key && Object.hasOwn(e, "original")
            ? { ...e, text: textFor(e.kind, e.original) }
            : e,
        ),
      ),
    add: (key, kind, text) =>
      update((current) =>
        current.some((e) => e.key === key) ? current : [...current, { key, kind, text }],
      ),
    drop: (key) =>
      update((current) => current.filter((e) => e.key !== key || Object.hasOwn(e, "original"))),
    resetAll: () => setState({ id: approvalId, entries: seed(proposed) }),
  };
}

/* ═══════════════════════════ The editor ═══════════════════════════ */

const KIND_LABEL: Record<ValueKind, string> = {
  string: "text",
  number: "number",
  boolean: "true / false",
  null: "empty (null)",
  json: "JSON",
};

/** Kinds an owner may choose when adding a field the agent did not propose. */
const ADDABLE: ValueKind[] = ["string", "number", "boolean", "json"];

export default function ArgsEditor({
  draft,
  disabled,
  idPrefix,
}: {
  draft: ArgDraft;
  /** True once a decision is in flight or made — the proposal becomes read-only. */
  disabled: boolean;
  /** Namespaces the field ids, so two drawers in one document cannot collide. */
  idPrefix: string;
}) {
  const [newKey, setNewKey] = useState("");
  const [newKind, setNewKind] = useState<ValueKind>("string");
  const [newValue, setNewValue] = useState("");

  const changedKeys = useMemo(
    () => new Set(draft.changes.map((change) => change.key)),
    [draft.changes],
  );

  const trimmedKey = newKey.trim();
  const duplicate = trimmedKey !== "" && draft.entries.some((entry) => entry.key === trimmedKey);
  const canAdd = trimmedKey !== "" && !duplicate && !disabled;

  const addArgument = () => {
    if (!canAdd) return;
    draft.add(trimmedKey, newKind, newKind === "boolean" ? "true" : newValue);
    setNewKey("");
    setNewValue("");
    setNewKind("string");
  };

  return (
    <div className={styles.args}>
      {draft.entries.length === 0 && (
        <p className="oa-sub">
          This action has no details to change. Approving it carries it out exactly as proposed.
        </p>
      )}

      {draft.entries.map((entry) => {
        const added = !Object.hasOwn(entry, "original");
        const changed = changedKeys.has(entry.key);
        const error = draft.errors[entry.key];
        const fieldId = `${idPrefix}-arg-${entry.key}`;

        return (
          <div
            key={entry.key}
            className={`${styles.argRow} ${changed ? styles.argRowEdited : ""} ${
              error ? styles.argRowInvalid : ""
            }`}
          >
            <div className={styles.argHead}>
              <label className={styles.argKey} htmlFor={fieldId}>
                {entry.key}
              </label>
              <span className="oa-cluster" style={{ gap: 8 }}>
                <span className={styles.argKindTag}>{KIND_LABEL[entry.kind]}</span>
                {added && <span className="oa-tag oa-tag--neutral">Added by you</span>}
                {changed && !added && <span className="oa-tag">Edited</span>}
                {!disabled && changed && !added && (
                  <button
                    type="button"
                    className="oa-btn oa-btn--ghost oa-btn--sm"
                    onClick={() => draft.revert(entry.key)}
                  >
                    <Undo2 size={13} aria-hidden />
                    Revert
                  </button>
                )}
                {!disabled && added && (
                  <button
                    type="button"
                    className="oa-btn oa-btn--ghost oa-btn--sm"
                    onClick={() => draft.drop(entry.key)}
                    aria-label={`Remove the ${entry.key} field you added`}
                  >
                    <X size={13} aria-hidden />
                    Remove
                  </button>
                )}
              </span>
            </div>

            {changed && !added && (
              <p className={styles.argOriginal}>Agent proposed {previewValue(entry.original)}</p>
            )}

            {entry.kind === "boolean" ? (
              <select
                id={fieldId}
                className="oa-select"
                value={entry.text}
                disabled={disabled}
                onChange={(event) => draft.edit(entry.key, event.target.value)}
              >
                <option value="true">true</option>
                <option value="false">false</option>
              </select>
            ) : entry.kind === "json" || entry.kind === "null" ? (
              <textarea
                id={fieldId}
                className={`oa-textarea ${styles.argInput}`}
                rows={Math.min(10, Math.max(3, entry.text.split("\n").length))}
                value={entry.text}
                disabled={disabled}
                spellCheck={false}
                onChange={(event) => draft.edit(entry.key, event.target.value)}
              />
            ) : (
              <input
                id={fieldId}
                className={`oa-input ${styles.argInput}`}
                type="text"
                inputMode={entry.kind === "number" ? "decimal" : undefined}
                value={entry.text}
                disabled={disabled}
                spellCheck={false}
                onChange={(event) => draft.edit(entry.key, event.target.value)}
              />
            )}

            {error && (
              <p className={styles.argParseError} role="alert">
                <AlertTriangle size={12} aria-hidden /> {error}
              </p>
            )}
          </div>
        );
      })}

      {!disabled && (
        <div className={styles.argRow}>
          <div className={styles.argHead}>
            <span className={styles.argKey}>Add a field</span>
            <span className="oa-sim-note">
              Sent as a new field on top of what the agent proposed.
            </span>
          </div>
          <div className={styles.argAddRow}>
            <div className={styles.argAddField}>
              <label className="oa-label" htmlFor={`${idPrefix}-new-key`}>
                Name
              </label>
              <input
                id={`${idPrefix}-new-key`}
                className={`oa-input ${styles.argInput}`}
                value={newKey}
                spellCheck={false}
                onChange={(event) => setNewKey(event.target.value)}
              />
            </div>
            <div className={styles.argAddField}>
              <label className="oa-label" htmlFor={`${idPrefix}-new-kind`}>
                Type
              </label>
              <select
                id={`${idPrefix}-new-kind`}
                className="oa-select"
                value={newKind}
                onChange={(event) => setNewKind(event.target.value as ValueKind)}
              >
                {ADDABLE.map((kind) => (
                  <option key={kind} value={kind}>
                    {KIND_LABEL[kind]}
                  </option>
                ))}
              </select>
            </div>
            {newKind !== "boolean" && (
              <div className={styles.argAddField}>
                <label className="oa-label" htmlFor={`${idPrefix}-new-value`}>
                  Value
                </label>
                <input
                  id={`${idPrefix}-new-value`}
                  className={`oa-input ${styles.argInput}`}
                  value={newValue}
                  spellCheck={false}
                  onChange={(event) => setNewValue(event.target.value)}
                />
              </div>
            )}
            <button
              type="button"
              className="oa-btn oa-btn--ghost oa-btn--sm"
              onClick={addArgument}
              disabled={!canAdd}
            >
              <Plus size={13} aria-hidden />
              Add
            </button>
          </div>
          {duplicate && (
            <p className={styles.argParseError} role="alert">
              <AlertTriangle size={12} aria-hidden /> This action already has a field called
              &quot;{trimmedKey}&quot;. Edit it above instead.
            </p>
          )}
          <p className="oa-sub">
            The agent&apos;s own fields cannot be removed here. A removal cannot survive the trip
            to the server, so a Remove button would quietly leave the agent&apos;s value in place
            instead. Setting a value to <code>null</code> is a change to null, not a removal.
          </p>
        </div>
      )}
    </div>
  );
}
