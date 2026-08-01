"use client";
/**
 * SchemaConfigForm — Step 9 Pass 1's minimal generic config form.
 *
 * Each agent_templates row declares its own config_schema (JSON Schema) with
 * completely different fields per template — there's no fixed set of config
 * fields shared across templates the way the old mock's PresetConfig
 * assumed. This renders one input per schema property (by JSON type) rather
 * than hardcoding fields, and POSTs exactly the collected object to
 * /configure — that route merges the raw body into agent_configs.config
 * unchanged.
 */
import { useState } from "react";

type JsonSchemaProperty = {
  type?: string;
  description?: string;
  default?: unknown;
  items?: { type?: string };
};

type JsonSchema = {
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
};

function initialValueFor(prop: JsonSchemaProperty): unknown {
  if (prop.default !== undefined) return prop.default;
  if (prop.type === "array") return [];
  if (prop.type === "integer" || prop.type === "number") return "";
  return "";
}

export default function SchemaConfigForm({
  schema,
  initialValues,
  onSave,
  saving,
}: {
  schema: Record<string, unknown> | undefined;
  initialValues: Record<string, unknown>;
  onSave: (values: Record<string, unknown>) => void | Promise<void>;
  saving: boolean;
}) {
  const parsed = schema as JsonSchema | undefined;
  const properties = parsed?.properties ?? {};
  const required = new Set(parsed?.required ?? []);
  const fields = Object.entries(properties);

  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const out: Record<string, unknown> = {};
    for (const [key, prop] of fields) {
      out[key] = initialValues[key] !== undefined ? initialValues[key] : initialValueFor(prop);
    }
    return out;
  });

  if (fields.length === 0) {
    return (
      <p className="oa-sub">
        This agent&apos;s template doesn&apos;t declare any configuration fields — it&apos;s ready
        to save as-is.
      </p>
    );
  }

  const missingRequired = fields
    .filter(([key]) => required.has(key))
    .filter(([key]) => {
      const v = values[key];
      return v === "" || v === undefined || v === null || (Array.isArray(v) && v.length === 0);
    })
    .map(([key]) => key);

  const setValue = (key: string, v: unknown) => setValues((prev) => ({ ...prev, [key]: v }));

  return (
    <div style={{ display: "grid", gap: 18 }}>
      {fields.map(([key, prop]) => {
        const isRequired = required.has(key);
        const label = key.replace(/_/g, " ");
        return (
          <div key={key} style={{ display: "grid", gap: 6 }}>
            <label className="oa-micro" htmlFor={`field-${key}`} style={{ textTransform: "capitalize" }}>
              {label}
              {isRequired && <span style={{ color: "var(--oa-amber-ink)" }}> *</span>}
            </label>
            {prop.description && <p className="oa-sub" style={{ margin: 0 }}>{prop.description}</p>}
            {prop.type === "array" ? (
              <textarea
                id={`field-${key}`}
                className="oa-input"
                rows={3}
                placeholder="One item per line"
                value={Array.isArray(values[key]) ? (values[key] as string[]).join("\n") : ""}
                onChange={(e) =>
                  setValue(
                    key,
                    e.target.value.split("\n").map((line) => line.trim()).filter(Boolean),
                  )
                }
              />
            ) : prop.type === "integer" || prop.type === "number" ? (
              <input
                id={`field-${key}`}
                type="number"
                className="oa-input"
                value={values[key] as number | string}
                onChange={(e) =>
                  setValue(key, e.target.value === "" ? "" : Number(e.target.value))
                }
              />
            ) : (
              <input
                id={`field-${key}`}
                type="text"
                className="oa-input"
                value={(values[key] as string) ?? ""}
                onChange={(e) => setValue(key, e.target.value)}
              />
            )}
          </div>
        );
      })}

      <div className="oa-between" style={{ gap: 12, marginTop: 8 }}>
        <span className="oa-sub">
          {missingRequired.length > 0
            ? `${missingRequired.length} required field${missingRequired.length === 1 ? "" : "s"} left to fill in.`
            : "Ready to save."}
        </span>
        <button
          type="button"
          className="oa-btn oa-btn--primary"
          disabled={missingRequired.length > 0 || saving}
          onClick={() => void onSave(values)}
        >
          {saving ? "Saving…" : "Save configuration"}
        </button>
      </div>
    </div>
  );
}
