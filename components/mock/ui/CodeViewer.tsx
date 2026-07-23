"use client";
/**
 * CodeViewer — tabbed artifact viewer for YAML / JSON / Markdown files on a
 * dark surface (spec §2, §14). Simple <pre> blocks; no syntax library.
 */
import { useState } from "react";
import { FileCode2 } from "lucide-react";
import type { ArtifactFile } from "@/lib/mock/types";

export default function CodeViewer({
  files,
  maxHeight = 420,
}: {
  files: ArtifactFile[];
  maxHeight?: number;
}) {
  const [active, setActive] = useState(0);
  const file = files[active];
  if (!file) return null;

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div className="oa-tabs" role="tablist" aria-label="Generated files">
        {files.map((f, i) => (
          <button
            key={f.name}
            type="button"
            role="tab"
            aria-selected={i === active}
            className={`oa-tab ${i === active ? "oa-tab--active" : ""}`}
            onClick={() => setActive(i)}
          >
            <FileCode2 size={13} aria-hidden style={{ marginRight: 6, verticalAlign: -2 }} />
            {f.name}
          </button>
        ))}
      </div>
      <pre className="oa-code" style={{ maxHeight, margin: 0 }} tabIndex={0} aria-label={`Contents of ${file.name}`}>
        {file.content}
      </pre>
    </div>
  );
}
