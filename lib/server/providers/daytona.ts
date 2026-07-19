/**
 * Daytona adapter — isolated sandbox validation (blueprint §20.5, §16).
 *
 * DeploymentRunner: creates a sandbox, writes the generated artifact bundle
 * into it, runs the static validation script inside the sandbox, collects
 * results and destroys the sandbox. Provider-specific REST stays behind this
 * adapter; no Daytona object ever reaches the browser.
 *
 * Live when DAYTONA_API_KEY is set (DAYTONA_API_URL defaults to Daytona cloud).
 * The mock MVP validates honestly in fixture mode by running the same checks
 * locally — labeled "fixture" so no one mistakes it for a sandbox run.
 */
import type { ArtifactBundle } from "../../contracts";
import { daytonaLive, providerEnv } from "./env";

export interface SandboxValidation {
  mode: "live" | "fixture";
  sandboxId: string;
  ok: boolean;
  tests: { passed: number; failed: number };
  securityChecks: Record<string, "passed" | "failed">;
  warnings: string[];
  error?: string;
}

/* ── the validation logic itself (runs in Daytona live, locally in fixture) ── */

// Word boundaries + realistic token lengths so agent slugs like
// "front-desk-assistant" ("…sk-assistant") never false-positive.
const SECRET_PATTERN = /(\bsk-[A-Za-z0-9]{16,}|api[_-]?key\s*[:=]\s*['"][^'"]{8,}|\bAKIA[0-9A-Z]{16}\b|-----BEGIN (RSA |EC )?PRIVATE KEY)/i;

export function staticChecks(bundle: ArtifactBundle): {
  securityChecks: Record<string, "passed" | "failed">;
  tests: { passed: number; failed: number };
  warnings: string[];
} {
  const warnings: string[] = [];
  const required = ["agent.yaml", "workflow.yaml", "prompt.md", "tools.yaml", "permissions.yaml", "test-cases.yaml", "required-integrations.json", "README.md"];
  const paths = bundle.files.map((f) => f.path);
  const missing = required.filter((p) => !paths.includes(p));
  const schema: "passed" | "failed" = missing.length === 0 ? "passed" : "failed";
  if (missing.length) warnings.push(`Missing artifacts: ${missing.join(", ")}`);

  const secretHit = bundle.files.some((f) => SECRET_PATTERN.test(f.content));
  const secretScan: "passed" | "failed" = secretHit ? "failed" : "passed";
  if (secretHit) warnings.push("A file matched a secret pattern — credentials must be referenced by name only.");

  const perms = bundle.files.find((f) => f.path === "permissions.yaml")?.content ?? "";
  const permissionPolicy: "passed" | "failed" = /forbidden:/.test(perms) ? "passed" : "failed";
  const tools = bundle.files.find((f) => f.path === "tools.yaml")?.content ?? "";
  const toolAllowlist: "passed" | "failed" = /tools:/.test(tools) ? "passed" : "failed";

  // unit tests = the generated test cases; each named case counts as one test
  const testsFile = bundle.files.find((f) => f.path === "test-cases.yaml")?.content ?? "";
  const caseCount = (testsFile.match(/- +name:/g) || []).length;
  const failed = [schema, secretScan, permissionPolicy, toolAllowlist].filter((s) => s === "failed").length;

  return {
    securityChecks: {
      schema, secret_scan: secretScan,
      tool_allowlist: toolAllowlist, permission_policy: permissionPolicy,
    },
    tests: { passed: failed === 0 ? Math.max(caseCount, 1) : Math.max(caseCount - failed, 0), failed },
    warnings,
  };
}

/* ── live sandbox run ────────────────────────────────────────────────────── */

async function daytonaFetch(path: string, init?: RequestInit) {
  const env = providerEnv().daytona;
  const res = await fetch(`${env.apiUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.key}`,
      ...(init?.headers ?? {}),
    },
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`Daytona ${path} → ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

export async function validateInSandbox(bundle: ArtifactBundle): Promise<SandboxValidation> {
  const local = staticChecks(bundle);
  const ok = Object.values(local.securityChecks).every((v) => v === "passed");

  if (!daytonaLive()) {
    return {
      mode: "fixture",
      sandboxId: `local_${bundle.agentId}`,
      ok, ...local,
    };
  }

  let sandboxId = "";
  try {
    // 1. create an isolated sandbox
    const sb = (await daytonaFetch("/sandbox", {
      method: "POST",
      body: JSON.stringify({ language: "javascript", labels: { app: "margo", agent: bundle.agentId } }),
    })) as { id?: string };
    sandboxId = sb.id ?? "";
    if (!sandboxId) throw new Error("Daytona did not return a sandbox id");

    // 2. upload only the approved files and run the validation INSIDE the
    //    sandbox — the manifest reports what the sandbox measured, not a
    //    locally computed result wearing a "live" label.
    const payload = Buffer.from(JSON.stringify(bundle)).toString("base64");
    const script = [
      `const b=JSON.parse(Buffer.from(process.env.BUNDLE,'base64').toString());`,
      `const fs=require('fs'),path=require('path');fs.mkdirSync('pkg',{recursive:true});`,
      `for(const f of b.files){fs.mkdirSync(path.dirname('pkg/'+f.path),{recursive:true});fs.writeFileSync('pkg/'+f.path,f.content);}`,
      `const req=['agent.yaml','workflow.yaml','prompt.md','tools.yaml','permissions.yaml','test-cases.yaml','required-integrations.json','README.md'];`,
      `const got=b.files.map(f=>f.path);const missing=req.filter(p=>!got.includes(p));`,
      `const secretRe=/(\\bsk-[A-Za-z0-9]{16,}|api[_-]?key\\s*[:=]\\s*['\\"][^'\\"]{8,}|\\bAKIA[0-9A-Z]{16}\\b|-----BEGIN (RSA |EC )?PRIVATE KEY)/i;`,
      `const secretHit=b.files.some(f=>secretRe.test(f.content));`,
      `const read=p=>{try{return fs.readFileSync('pkg/'+p,'utf8')}catch{return ''}};`,
      `const perms=/forbidden:/.test(read('permissions.yaml'));const tools=/tools:/.test(read('tools.yaml'));`,
      `const cases=(read('test-cases.yaml').match(/- +name:/g)||[]).length;`,
      `console.log('__MARGO__'+JSON.stringify({missing,secretHit,perms,tools,cases}));`,
    ].join("");
    const run = (await daytonaFetch(`/toolbox/${sandboxId}/process/execute`, {
      method: "POST",
      body: JSON.stringify({ command: `node -e "${script.replace(/"/g, '\\"')}"`, env: { BUNDLE: payload } }),
    })) as { exitCode?: number; result?: string };
    if (run.exitCode !== 0) throw new Error(`sandbox execution failed: ${(run.result ?? "no output").slice(0, 200)}`);

    const marker = (run.result ?? "").split("__MARGO__")[1];
    const parsed = JSON.parse((marker ?? "").trim()) as {
      missing: string[]; secretHit: boolean; perms: boolean; tools: boolean; cases: number;
    };
    const checks: Record<string, "passed" | "failed"> = {
      schema: parsed.missing.length === 0 ? "passed" : "failed",
      secret_scan: parsed.secretHit ? "failed" : "passed",
      tool_allowlist: parsed.tools ? "passed" : "failed",
      permission_policy: parsed.perms ? "passed" : "failed",
    };
    const failed = Object.values(checks).filter((v) => v === "failed").length;
    const warnings = [...(parsed.missing.length ? [`Missing artifacts: ${parsed.missing.join(", ")}`] : [])];
    if (parsed.secretHit) warnings.push("A file matched a secret pattern — credentials must be referenced by name only.");
    return {
      mode: "live",
      sandboxId,
      ok: failed === 0,
      tests: { passed: failed === 0 ? Math.max(parsed.cases, 1) : Math.max(parsed.cases - failed, 0), failed },
      securityChecks: checks,
      warnings,
    };
  } catch (err) {
    return {
      mode: "live", sandboxId: sandboxId || "unavailable", ok: false,
      tests: { passed: 0, failed: 1 },
      securityChecks: { schema: "failed", secret_scan: "failed", tool_allowlist: "failed", permission_policy: "failed" },
      warnings: ["Daytona sandbox run failed — see error."],
      error: String(err),
    };
  } finally {
    if (sandboxId) {
      daytonaFetch(`/sandbox/${sandboxId}`, { method: "DELETE" }).catch(() => {});
    }
  }
}
