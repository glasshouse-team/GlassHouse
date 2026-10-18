/**
 * Real-model smoke test for the agent foundation (GH-13): Sonnet 5.5 calls an `echo` tool
 * through createAgent, and the call lands in the activity feed. Also proves the Anthropic key
 * works and has credit. Deletes its own feed row at the end.
 * Usage: pnpm exec tsx --env-file-if-exists=.env.local scripts/agent-smoke.ts
 */
import { tool } from "ai";
import { z } from "zod";
import { createAgent } from "../agents/core";
import { supabaseAdmin } from "../lib/supabase";

const TEXT = `smoke ${Date.now().toString(36)}`;

async function main() {
  const echo = tool({
    description: "Echo the given text back.",
    inputSchema: z.object({ text: z.string() }),
    execute: async ({ text }) => ({ summary: `Guest agent echoed "${text}" (smoke test)`, text }),
  });
  const agent = createAgent({
    name: "guest",
    system: "You are a test agent. Do exactly what the user asks, using your tools.",
    tools: { echo },
    effort: "low",
    maxSteps: 3,
  });

  const started = Date.now();
  const result = await agent.generate({
    prompt: `Call the echo tool once with the text "${TEXT}", then reply with the single word: done.`,
  });
  const calls = result.steps.flatMap((step) => step.toolCalls.map((call) => call.toolName));
  console.log(
    `Model answered "${result.text.trim()}" in ${Date.now() - started} ms; tools called: ${calls.join(", ") || "none"}`,
  );
  if (!calls.includes("echo")) throw new Error("The model did not call the echo tool");

  const { data, error } = await supabaseAdmin()
    .from("events")
    .select("id, actor_name, action, summary")
    .eq("action", "tool.echo")
    .like("summary", `%${TEXT}%`)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("The echo call did not reach the activity feed");
  console.log(`Feed row ${data.id}: ${data.actor_name} · ${data.action} · ${data.summary}`);
  await supabaseAdmin().from("events").delete().eq("id", data.id);
  console.log("Smoke test passed (feed row deleted).");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
