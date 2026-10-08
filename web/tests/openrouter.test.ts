// The co-producer through OpenRouter (lib/openrouter.ts): the conversation
// in the Messages API's shape translated to OpenAI's chat format and the
// reply translated back, with OpenRouter itself faked.
//
//   node --import ./tests/support/register.mjs --test tests/openrouter.test.ts

import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import { OpenRouterError, fromOpenAi, openRouterModels, openRouterTurn, toOpenAi, toOpenAiTools } from "../src/lib/openrouter.ts";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const history = [
  { role: "user" as const, content: "Make it sound good" },
  {
    role: "assistant" as const,
    content: [
      { type: "thinking", thinking: "", signature: "x" },
      { type: "text", text: "Listening first." },
      { type: "tool_use", id: "toolu_1", name: "get_mix", input: {} },
      { type: "tool_use", id: "toolu_2", name: "play", input: { from_seconds: 20 } },
    ],
  },
  {
    role: "user" as const,
    content: [
      { type: "tool_result", tool_use_id: "toolu_1", content: '{"score":51}' },
      { type: "tool_result", tool_use_id: "toolu_2", content: "no audio", is_error: true },
    ],
  },
];

describe("OpenRouter translation", () => {
  test("history: system first, tool calls on the assistant turn, each result a tool message, thinking dropped", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out = toOpenAi("SYSTEM", history as any);
    assert.deepEqual(out, [
      { role: "system", content: "SYSTEM" },
      { role: "user", content: "Make it sound good" },
      {
        role: "assistant",
        content: "Listening first.",
        tool_calls: [
          { id: "toolu_1", type: "function", function: { name: "get_mix", arguments: "{}" } },
          { id: "toolu_2", type: "function", function: { name: "play", arguments: '{"from_seconds":20}' } },
        ],
      },
      { role: "tool", tool_call_id: "toolu_1", content: '{"score":51}' },
      { role: "tool", tool_call_id: "toolu_2", content: "Error: no audio" },
    ]);
  });

  test("tools become functions with the same JSON Schema", () => {
    const schema = { type: "object", properties: { x: { type: "number" } } };
    assert.deepEqual(toOpenAiTools([{ name: "t", description: "d", input_schema: schema }]), [{ type: "function", function: { name: "t", description: "d", parameters: schema } }]);
  });

  test("a reply with tool calls comes back as tool_use blocks", () => {
    const reply = fromOpenAi({
      model: "anthropic/claude-x",
      choices: [{ finish_reason: "tool_calls", message: { content: "Trying it.", tool_calls: [{ id: "call_9", function: { name: "try_ideas", arguments: '{"ids":["auto-good"]}' } }] } }],
    });
    assert.equal(reply.stop_reason, "tool_use");
    assert.deepEqual(reply.content, [
      { type: "text", text: "Trying it." },
      { type: "tool_use", id: "call_9", name: "try_ideas", input: { ids: ["auto-good"] } },
    ]);
  });

  test("finish reasons map onto the Messages API's", () => {
    const reply = (finish: string) => fromOpenAi({ choices: [{ finish_reason: finish, message: { content: "x" } }] }).stop_reason;
    assert.equal(reply("stop"), "end_turn");
    assert.equal(reply("length"), "max_tokens");
    assert.equal(reply("content_filter"), "refusal");
  });

  test("broken tool JSON is passed on for the tool to report, not thrown", () => {
    const reply = fromOpenAi({ choices: [{ finish_reason: "tool_calls", message: { content: null, tool_calls: [{ id: "c", function: { name: "play", arguments: "{oops" } }] } }] });
    assert.deepEqual(reply.content[0], { type: "tool_use", id: "c", name: "play", input: { _unparsed: "{oops" } });
  });
});

describe("talking to OpenRouter", () => {
  test("a turn posts the translated conversation with the key, and an error carries its status", async () => {
    let sent: { url: string; init: RequestInit } | null = null;
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      sent = { url, init };
      return new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: "Done." } }] }), { status: 200 });
    }) as typeof fetch;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const reply = await openRouterTurn("sk-or-test", "openai/gpt-x", "SYS", [{ name: "get_mix", description: "d", input_schema: {} }], history as any);
    assert.equal(reply.stop_reason, "end_turn");
    assert.equal(sent!.url, "https://openrouter.ai/api/v1/chat/completions");
    assert.equal((sent!.init.headers as Record<string, string>).Authorization, "Bearer sk-or-test");
    const body = JSON.parse(String(sent!.init.body));
    assert.equal(body.model, "openai/gpt-x");
    assert.equal(body.tool_choice, "auto");
    assert.equal(body.messages[0].content, "SYS");
    assert.equal(body.tools[0].function.name, "get_mix");

    globalThis.fetch = (async () => new Response(JSON.stringify({ error: { message: "Insufficient credits", code: 402 } }), { status: 402 })) as typeof fetch;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await assert.rejects(openRouterTurn("sk-or-test", "openai/gpt-x", "SYS", [], history as any), (e) => e instanceof OpenRouterError && e.status === 402);
  });

  test("the model list keeps only models that can use tools, with prices per million tokens", async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          data: [
            { id: "b/with-tools", name: "B", context_length: 1000, pricing: { prompt: "0.000003", completion: "0.000015" }, supported_parameters: ["tools", "temperature"] },
            { id: "a/no-tools", name: "A", pricing: { prompt: "0", completion: "0" }, supported_parameters: ["temperature"] },
          ],
        })
      )) as typeof fetch;
    const list = await openRouterModels();
    assert.deepEqual(list, [{ id: "b/with-tools", name: "B", context: 1000, promptPerMillion: 3, completionPerMillion: 15 }]);
  });
});
