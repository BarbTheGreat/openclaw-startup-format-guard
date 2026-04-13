import {
  buildGuidance,
  normalizeConfig,
  promptRequestsPlainMode,
  rewriteAssistantMessage
} from "./core.js";

const sessionState = new Map();
const recentRewrites = new Map();
const REWRITE_TTL_MS = 5 * 60 * 1000;

function cleanupRecentRewrites(now = Date.now()) {
  for (const [key, value] of recentRewrites.entries()) {
    if (!value || now - value.at > REWRITE_TTL_MS) {
      recentRewrites.delete(key);
    }
  }
}

function normalizeSessionKey(value) {
  const key = String(value || "").trim();
  return key || "";
}

function normalizeChannelId(value) {
  return String(value || "").trim().toLowerCase();
}

function makeRewriteKey({ sessionKey, channelId, originalText }) {
  return [normalizeSessionKey(sessionKey), normalizeChannelId(channelId), String(originalText || "")].join("::");
}

function setSessionState(sessionKey, state) {
  const normalizedKey = normalizeSessionKey(sessionKey);
  if (!normalizedKey) {
    return;
  }

  sessionState.set(normalizedKey, { ...state, at: Date.now() });
}

function getSessionState(sessionKey) {
  const normalizedKey = normalizeSessionKey(sessionKey);
  if (!normalizedKey) {
    return null;
  }

  return sessionState.get(normalizedKey) || null;
}

function saveRewrite({ sessionKey, channelId, originalText, rewrittenText }) {
  const entry = {
    originalText: String(originalText || ""),
    content: String(rewrittenText || ""),
    channelId: normalizeChannelId(channelId),
    sessionKey: normalizeSessionKey(sessionKey),
    at: Date.now()
  };

  if (!entry.originalText || !entry.content) {
    return;
  }

  cleanupRecentRewrites(entry.at);
  recentRewrites.set(makeRewriteKey(entry), entry);
}

function findRewrite({ sessionKey, channelId, content }) {
  const originalText = String(content || "");
  if (!originalText) {
    return null;
  }

  cleanupRecentRewrites();

  const exactKey = makeRewriteKey({ sessionKey, channelId, originalText });
  const exactMatch = recentRewrites.get(exactKey);
  if (exactMatch) {
    return exactMatch;
  }

  const normalizedChannel = normalizeChannelId(channelId);
  const normalizedSession = normalizeSessionKey(sessionKey);

  for (const entry of recentRewrites.values()) {
    if (!entry || entry.originalText !== originalText) {
      continue;
    }

    if (normalizedSession && entry.sessionKey && entry.sessionKey !== normalizedSession) {
      continue;
    }

    if (normalizedChannel && entry.channelId && entry.channelId !== normalizedChannel) {
      continue;
    }

    return entry;
  }

  return null;
}

export function clearRuntimeState() {
  sessionState.clear();
  recentRewrites.clear();
}

export function registerStartupFormatGuard(api, pluginConfig) {
  const config = normalizeConfig(pluginConfig);
  const guidance = buildGuidance(config);

  api.registerHook(
    "before_prompt_build",
    async (event, ctx) => {
      const prompt = String(event?.prompt || "");
      const channelId = normalizeChannelId(ctx?.channelId);
      const sessionKey = normalizeSessionKey(ctx?.sessionKey);
      const plainRequested = promptRequestsPlainMode(prompt, config.plainModeEscapeWords);
      const messageCount = Array.isArray(event?.messages) ? event.messages.length : 0;
      const inTargetChannel = config.targetChannels.length === 0 || config.targetChannels.includes(channelId);
      const withinFirstTurnWindow = !config.applyOnFirstTurnOnly || messageCount <= config.initialMessageCountMax;
      const shouldEnforce = config.enabled && inTargetChannel && !plainRequested && withinFirstTurnWindow;

      setSessionState(sessionKey, {
        channelId,
        shouldEnforce,
        plainRequested,
        messageCount,
        promptPreview: prompt.slice(0, 200)
      });

      if (!shouldEnforce) {
        return;
      }

      return {
        appendSystemContext: guidance
      };
    },
    {
      name: "startup-format-guard.before_prompt_build",
      description: "Injects configurable house-format guidance before prompt build and records per-session enforcement state."
    }
  );

  api.registerHook(
    "before_message_write",
    (event, ctx) => {
      const sessionKey = normalizeSessionKey(ctx?.sessionKey || event?.sessionKey);
      const state = getSessionState(sessionKey);
      if (!state?.shouldEnforce || state.plainRequested) {
        return;
      }

      const rewritten = rewriteAssistantMessage(event?.message, config);
      if (!rewritten.changed) {
        return;
      }

      saveRewrite({
        sessionKey,
        channelId: state.channelId || ctx?.channelId,
        originalText: rewritten.originalText,
        rewrittenText: rewritten.rewrittenText
      });

      return {
        message: rewritten.message
      };
    },
    {
      name: "startup-format-guard.before_message_write",
      description: "Rewrites non-compliant assistant text into the configured house format before it is persisted."
    }
  );

  api.registerHook(
    "message_sending",
    (event, ctx) => {
      const entry = findRewrite({
        sessionKey: ctx?.sessionKey || event?.sessionKey,
        channelId: ctx?.channelId,
        content: event?.content
      });

      if (!entry) {
        return;
      }

      return {
        content: entry.content
      };
    },
    {
      name: "startup-format-guard.message_sending",
      description: "Ensures outbound delivery uses the rewritten house-format version when a rewrite was applied earlier in the pipeline."
    }
  );

  api.registerHook(
    "session_end",
    (event) => {
      const sessionKey = normalizeSessionKey(event?.sessionKey);
      if (!sessionKey) {
        return;
      }

      sessionState.delete(sessionKey);

      for (const [key, entry] of recentRewrites.entries()) {
        if (entry?.sessionKey === sessionKey) {
          recentRewrites.delete(key);
        }
      }
    },
    {
      name: "startup-format-guard.session_end",
      description: "Cleans up session-scoped enforcement state and recent rewrite cache entries."
    }
  );

  return config;
}
