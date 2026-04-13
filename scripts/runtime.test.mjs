import test from "node:test";
import assert from "node:assert/strict";
import { clearRuntimeState, registerStartupFormatGuard } from "../runtime.js";

function createApi(pluginConfig) {
  const hooks = new Map();
  return {
    pluginConfig,
    hooks,
    registerHook(name, handler, meta) {
      hooks.set(name, { handler, meta });
    }
  };
}

const pluginConfig = {
  enabled: true,
  targetChannels: ["telegram"],
  applyOnFirstTurnOnly: true,
  initialMessageCountMax: 2,
  enforceOutgoingMessages: true,
  guidanceTitle: "Guard:",
  requiredOpening: "Header.",
  requiredTakeaway: "Takeaway.",
  listRule: "List.",
  disallowedPatterns: ["flat blobs"]
};

test("registerStartupFormatGuard injects guidance and rewrites outgoing content", async () => {
  clearRuntimeState();
  const api = createApi(pluginConfig);
  registerStartupFormatGuard(api, pluginConfig);

  const beforePromptBuild = api.hooks.get("before_prompt_build").handler;
  const beforeMessageWrite = api.hooks.get("before_message_write").handler;
  const messageSending = api.hooks.get("message_sending").handler;

  const promptResult = await beforePromptBuild(
    { prompt: "Hey, what's the latest?", messages: [{}] },
    { sessionKey: "s1", channelId: "telegram" }
  );

  assert.match(promptResult.appendSystemContext, /Guard:/);

  const writeResult = beforeMessageWrite(
    {
      sessionKey: "s1",
      message: {
        role: "assistant",
        content: [
          {
            type: "text",
            text: "Here is the latest. Revenue is up. Hiring is steady."
          }
        ]
      }
    },
    { sessionKey: "s1", channelId: "telegram" }
  );

  assert.ok(writeResult?.message?.content?.[0]?.text);
  assert.match(writeResult.message.content[0].text, /^✨ \*\*Update\*\*/u);

  const sendResult = messageSending(
    {
      sessionKey: "s1",
      content: "Here is the latest. Revenue is up. Hiring is steady."
    },
    { sessionKey: "s1", channelId: "telegram" }
  );

  assert.equal(sendResult.content, writeResult.message.content[0].text);
});

test("plain-mode prompts skip both injection and rewrite fallback", async () => {
  clearRuntimeState();
  const api = createApi(pluginConfig);
  registerStartupFormatGuard(api, pluginConfig);

  const beforePromptBuild = api.hooks.get("before_prompt_build").handler;
  const beforeMessageWrite = api.hooks.get("before_message_write").handler;

  const promptResult = await beforePromptBuild(
    { prompt: "Reply in plain text only", messages: [{}] },
    { sessionKey: "s2", channelId: "telegram" }
  );

  assert.equal(promptResult, undefined);

  const writeResult = beforeMessageWrite(
    {
      sessionKey: "s2",
      message: {
        role: "assistant",
        content: [{ type: "text", text: "Flat response." }]
      }
    },
    { sessionKey: "s2", channelId: "telegram" }
  );

  assert.equal(writeResult, undefined);
});

test("session_end clears cached rewrites so later sends do not reuse stale content", async () => {
  clearRuntimeState();
  const api = createApi(pluginConfig);
  registerStartupFormatGuard(api, pluginConfig);

  const beforePromptBuild = api.hooks.get("before_prompt_build").handler;
  const beforeMessageWrite = api.hooks.get("before_message_write").handler;
  const messageSending = api.hooks.get("message_sending").handler;
  const sessionEnd = api.hooks.get("session_end").handler;

  await beforePromptBuild(
    { prompt: "Give me an update", messages: [{}] },
    { sessionKey: "s3", channelId: "telegram" }
  );

  beforeMessageWrite(
    {
      sessionKey: "s3",
      message: {
        role: "assistant",
        content: [{ type: "text", text: "Flat response. More detail follows." }]
      }
    },
    { sessionKey: "s3", channelId: "telegram" }
  );

  sessionEnd({ sessionKey: "s3" });

  const sendResult = messageSending(
    { sessionKey: "s3", content: "Flat response. More detail follows." },
    { sessionKey: "s3", channelId: "telegram" }
  );

  assert.equal(sendResult, undefined);
});
