import assert from "node:assert/strict";
import {
  buildGuidance,
  formatHouseStyle,
  isHouseFormatted,
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

const formatted = formatHouseStyle(
  "The clearest headline right now is a major oil spike after a new Middle East escalation. Markets are reacting quickly. Traders are watching shipping risk and energy prices."
);
assert.match(formatted, /^📰 \*\*News update\*\*/u);
assert.ok(isHouseFormatted(formatted));
assert.match(formatted, /\*\*The clearest headline right now is a major oil spike after a new Middle East escalation\.\*\*/);

const rewritten = rewriteAssistantMessage(
  {
    role: "assistant",
    content: [
      {
        type: "text",
        text: "The clearest headline right now is a major oil spike after a new Middle East escalation. Markets are reacting quickly. Traders are watching shipping risk and energy prices."
      }
    ]
  },
  baseConfig
);

assert.equal(rewritten.changed, true);
assert.ok(isHouseFormatted(rewritten.rewrittenText));
assert.match(buildGuidance(baseConfig), /Test guidance:/);

console.log("startup-format-guard smoke test passed");
