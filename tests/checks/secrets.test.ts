import { describe, expect, it } from "vitest";
import { checkSecrets, findSecrets, redactSecrets } from "@/lib/checks/secrets";
import { redact } from "@/lib/checks/helpers";
import { assistantLine, bashStep, buildRun, finalText, sampleRun, toolResult, toolUse, userLine } from "../helpers";

const FAKE_ANTHROPIC = "sk-ant-api03-EXAMPLEonlyNOTaREALkey-0000000000";
const FAKE_AWS = "AKIAIOSFODNN7EXAMPLE";
const FAKE_GITHUB = `ghp_${"a".repeat(36)}`;

describe("findSecrets", () => {
  it("detects common provider key formats", () => {
    expect(findSecrets(`export ANTHROPIC_API_KEY=${FAKE_ANTHROPIC}`).map((hit) => hit.label)).toEqual(["Anthropic API key"]);
    expect(findSecrets(`aws configure set aws_access_key_id ${FAKE_AWS}`)[0].label).toBe("AWS access key ID");
    expect(findSecrets(`git remote set-url origin https://${FAKE_GITHUB}@github.com/x/y`)[0].label).toBe("GitHub token");
    expect(findSecrets("-----BEGIN OPENSSH PRIVATE KEY-----")[0].label).toBe("Private key block");
    expect(findSecrets(`const k = "sk_live_${"9".repeat(24)}"`)[0].label).toBe("Stripe secret key");
  });

  it("treats hard-coded credential assignments as warnings", () => {
    const hits = findSecrets('const config = { apiKey: "q8Zr1t9XvB2mN4kL0pQs" };');
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ label: "Hard-coded credential assignment", severity: "warn", match: "q8Zr1t9XvB2mN4kL0pQs" });
  });

  it("ignores environment references and short placeholders", () => {
    expect(findSecrets('curl -H "x-api-key: $ANTHROPIC_API_KEY" https://api.anthropic.com')).toEqual([]);
    expect(findSecrets("const apiKey = process.env.API_KEY;")).toEqual([]);
    expect(findSecrets('password = "hunter2"')).toEqual([]);
    expect(findSecrets("sk-ant-short")).toEqual([]);
  });

  it("redacts every detected secret", () => {
    const text = `key ${FAKE_ANTHROPIC} and ${FAKE_AWS}`;
    expect(redactSecrets(text)).toBe("key [REDACTED] and [REDACTED]");
    expect(redact(FAKE_ANTHROPIC)).not.toContain("EXAMPLE");
    expect(redact(FAKE_ANTHROPIC)).toMatch(/^sk-ant-… \(\d+ chars, redacted\)$/);
  });
});

describe("checkSecrets", () => {
  it("fails the risky sample and never exposes the key in evidence", () => {
    const result = checkSecrets(sampleRun("risky"));
    expect(result.status).toBe("fail");
    expect(result.evidence).toHaveLength(1);
    expect(result.evidence[0].label).toBe("Anthropic API key in Bash command");
    expect(JSON.stringify(result)).not.toContain("EXAMPLEonlyNOTaREALkey");
  });

  it("scans files written by the agent and edits", () => {
    const write = toolUse("Write", { file_path: "/app/.env", content: `GITHUB_TOKEN=${FAKE_GITHUB}\n` });
    const edit = toolUse("MultiEdit", { file_path: "/app/config.ts", edits: [{ old_string: "a", new_string: `const key = "${FAKE_AWS}";` }] });
    const run = buildRun([
      userLine("configure"),
      assistantLine([write, edit]),
      userLine([toolResult(write.id, "ok"), toolResult(edit.id, "ok")]),
      finalText("done"),
    ]);
    const result = checkSecrets(run);
    expect(result.status).toBe("fail");
    expect(result.evidence.map((item) => item.label)).toEqual([
      "GitHub token in file written to /app/.env",
      "AWS access key ID in edit to /app/config.ts",
    ]);
  });

  it("does not scan tool output, only what the agent wrote or ran", () => {
    const run = buildRun([userLine("read env"), ...bashStep("cat .env.example", `ANTHROPIC_API_KEY=${FAKE_ANTHROPIC}`), finalText("ok")]);
    expect(checkSecrets(run).status).toBe("pass");
  });

  it("passes the clean sample", () => {
    expect(checkSecrets(sampleRun("clean")).status).toBe("pass");
  });
});
