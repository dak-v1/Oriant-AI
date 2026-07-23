"use client";
/**
 * ProvenanceChip — where a fact came from + how sure Oriant is (spec §9.3).
 * Assumptions are visually distinct (dashed amber); confidence renders as a
 * subtle dot meter, never as false certainty.
 */
import type { Provenance } from "@/lib/mock/types";

const LABELS: Record<Provenance, string> = {
  owner_confirmed: "Owner confirmed",
  uploaded_document: "Uploaded canvas",
  selected_tool: "Selected tool",
  employee_response: "Invited employee",
  oriant_assumption: "Oriant assumption",
};

export default function ProvenanceChip({
  provenance,
  confidence,
}: {
  provenance: Provenance;
  confidence?: number;
}) {
  const cls =
    provenance === "oriant_assumption"
      ? "oa-prov--assumption"
      : provenance === "owner_confirmed" || provenance === "employee_response"
        ? "oa-prov--confirmed"
        : "";
  return (
    <span className={`oa-prov ${cls}`} title={confidence != null ? `Confidence ${Math.round(confidence * 100)}%` : undefined}>
      {LABELS[provenance]}
      {confidence != null && (
        <span aria-label={`Confidence ${Math.round(confidence * 100)} percent`} style={{ display: "inline-flex", gap: 2 }}>
          {[0.33, 0.66, 0.9].map((t) => (
            <span
              key={t}
              aria-hidden
              style={{
                width: 4,
                height: 4,
                borderRadius: "50%",
                background: "currentColor",
                opacity: confidence >= t ? 0.9 : 0.25,
              }}
            />
          ))}
        </span>
      )}
    </span>
  );
}
