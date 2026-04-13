import test from "node:test";
import assert from "node:assert/strict";
import {
  buildGuidance,
  formatHouseStyle,
  isHouseFormatted,
  promptRequestsPlainMode,
  rewriteAssistantMessage,
  shouldInject
} from "../core.js";

const baseConfig = {
  enabled: true,
  targetChannels: ["telegram"],
  applyOnFirstTurnOnly: false,
  initialMessageCountMax: 2,
  enforceOutgoingMessages: true,
  plainModeEscapeWords: ["plain", "raw"],
  guidanceTitle: "Test guidance:",
  requiredOpening: "Use the required opening.",
  requiredTakeaway: "Put the takeaway on top.",
  listRule: "Use bullets if needed.",
  disallowedPatterns: ["flat blobs"],
  customGuidance: ""
};

test("shouldInject respects channel and plain-mode escape words", () => {
  assert.equal(
    shouldInject({
      event: { prompt: "Hey, give me an update", messages: [{}] },
      ctx: { channelId: "telegram" },
      config: baseConfig
    }),
    true
  );

  assert.equal(
    shouldInject({
      event: { prompt: "Reply in plain text", messages: [{}] },
      ctx: { channelId: "telegram" },
      config: baseConfig
    }),
    false
  );

  assert.equal(promptRequestsPlainMode("Need a raw answer", baseConfig.plainModeEscapeWords), true);
  assert.equal(
    shouldInject({
      event: { prompt: "Hey there", messages: [{}] },
      ctx: { channelId: "discord" },
      config: baseConfig
    }),
    false
  );
});

test("formatHouseStyle converts flat prose into the new sectioned house format", () => {
  const formatted = formatHouseStyle(
    "The clearest headline right now is a major oil spike after a new Middle East escalation. Reuters says shipping risks are rising in the Gulf. AP says markets are reacting quickly. Traders are watching energy prices closely."
  );

  assert.match(formatted, /^📰 \*\*News update\*\*/u);
  assert.ok(isHouseFormatted(formatted));
  assert.match(
    formatted,
    /\*\*The clearest headline right now is a major oil spike after a new Middle East escalation\.\*\*/
  );
  assert.match(formatted, /\*\*✅ What’s verified\*\*/u);
  assert.match(formatted, /\*\*📌 Source basis\*\*/u);
  assert.match(formatted, /- \*\*Reuters\*\*/);
  assert.match(formatted, /- \*\*AP\*\*/);
});

test("rewriteAssistantMessage rewrites the first text block and preserves non-text blocks", () => {
  const rewritten = rewriteAssistantMessage(
    {
      role: "assistant",
      content: [
        {
          type: "text",
          text: "The clearest headline right now is a major oil spike after a new Middle East escalation. Reuters says shipping risks are rising in the Gulf. AP says markets are reacting quickly."
        },
        {
          type: "image",
          image: "https://example.com/chart.png"
        },
        {
          type: "text",
          text: "This duplicate text block should be removed."
        }
      ]
    },
    baseConfig
  );

  assert.equal(rewritten.changed, true);
  assert.ok(isHouseFormatted(rewritten.rewrittenText));
  assert.match(rewritten.rewrittenText, /\*\*✅ What’s verified\*\*/u);
  assert.equal(rewritten.message.content.length, 2);
  assert.equal(rewritten.message.content[0].type, "text");
  assert.equal(rewritten.message.content[1].type, "image");
});

test("buildGuidance includes the new section-format instructions", () => {
  const guidance = buildGuidance(baseConfig);
  assert.match(guidance, /Test guidance:/);
  assert.match(guidance, /clearly separated body sections/i);
  assert.match(guidance, /1–3 body emojis/i);
  assert.match(guidance, /rewrite it before sending/i);
});
