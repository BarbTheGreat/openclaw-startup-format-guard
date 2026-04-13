import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import {
  buildGuidance,
  normalizeConfig,
  DEFAULT_CONFIG,
  promptRequestsPlainMode,
  shouldInject,
  rewriteAssistantMessage
} from "./core.js";
import { registerStartupFormatGuard } from "./runtime.js";

export {
  buildGuidance,
  normalizeConfig,
  DEFAULT_CONFIG,
  promptRequestsPlainMode,
  shouldInject,
  rewriteAssistantMessage
} from "./core.js";
export { registerStartupFormatGuard, clearRuntimeState } from "./runtime.js";

export default definePluginEntry({
  id: "startup-format-guard",
  name: "Startup Format Guard",
  description: "Adds configurable prompt guidance plus a hardened outgoing rewrite fallback so channel-visible replies more reliably follow a house format.",
  configSchema: {
    validate(value) {
      if (value == null) {
        return { ok: true, value: { ...DEFAULT_CONFIG } };
      }

      if (typeof value !== "object" || Array.isArray(value)) {
        return { ok: false, errors: ["Plugin config must be an object."] };
      }

      const normalized = normalizeConfig(value);
      return { ok: true, value: normalized };
    },
    jsonSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        enabled: { type: "boolean", default: true },
        targetChannels: { type: "array", items: { type: "string" } },
        applyOnFirstTurnOnly: { type: "boolean", default: false },
        initialMessageCountMax: { type: "integer", minimum: 0, default: 2 },
        enforceOutgoingMessages: { type: "boolean", default: true },
        plainModeEscapeWords: { type: "array", items: { type: "string" } },
        requiredOpening: { type: "string" },
        requiredTakeaway: { type: "string" },
        listRule: { type: "string" },
        disallowedPatterns: { type: "array", items: { type: "string" } },
        guidanceTitle: { type: "string" },
        customGuidance: { type: "string" }
      }
    }
  },
  register(api) {
    registerStartupFormatGuard(api, api.pluginConfig);
  }
});
