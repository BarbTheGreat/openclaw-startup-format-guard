export const DEFAULT_CONFIG = {
  enabled: true,
  targetChannels: ["telegram"],
  applyOnFirstTurnOnly: false,
  initialMessageCountMax: 2,
  enforceOutgoingMessages: true,
  plainModeEscapeWords: [
    "plain",
    "raw",
    "minimal",
    "no emoji",
    "no-emoji",
    "no formatting",
    "no-formatting",
    "unformatted"
  ],
  guidanceTitle: "House-format reinforcement:",
  requiredOpening:
    "The first non-empty line must be an emoji-led fully bold header.",
  requiredTakeaway:
    "The next line must be one short bold takeaway sentence.",
  listRule:
    "If there is more than one point, use bullets or numbering.",
  disallowedPatterns: [
    "flat paragraph blobs",
    "memo-style greetings",
    "dry status lines",
    "tool-log phrasing"
  ],
  customGuidance: ""
};

export function normalizeConfig(pluginConfig = {}) {
  const config = { ...DEFAULT_CONFIG, ...(pluginConfig || {}) };

  config.targetChannels = Array.isArray(config.targetChannels)
    ? config.targetChannels.map((value) => String(value).trim().toLowerCase()).filter(Boolean)
    : [];

  config.plainModeEscapeWords = Array.isArray(config.plainModeEscapeWords)
    ? config.plainModeEscapeWords.map((value) => String(value).trim().toLowerCase()).filter(Boolean)
    : [...DEFAULT_CONFIG.plainModeEscapeWords];

  config.disallowedPatterns = Array.isArray(config.disallowedPatterns)
    ? config.disallowedPatterns.map((value) => String(value).trim()).filter(Boolean)
    : [...DEFAULT_CONFIG.disallowedPatterns];

  config.enabled = config.enabled !== false;
  config.enforceOutgoingMessages = config.enforceOutgoingMessages !== false;
  config.applyOnFirstTurnOnly = config.applyOnFirstTurnOnly === true;
  config.initialMessageCountMax = Number.isInteger(config.initialMessageCountMax)
    ? Math.max(0, config.initialMessageCountMax)
    : DEFAULT_CONFIG.initialMessageCountMax;
  config.guidanceTitle = String(config.guidanceTitle || DEFAULT_CONFIG.guidanceTitle).trim();
  config.requiredOpening = String(config.requiredOpening || DEFAULT_CONFIG.requiredOpening).trim();
  config.requiredTakeaway = String(config.requiredTakeaway || DEFAULT_CONFIG.requiredTakeaway).trim();
  config.listRule = String(config.listRule || DEFAULT_CONFIG.listRule).trim();
  config.customGuidance = String(config.customGuidance || "").trim();

  return config;
}

export function promptRequestsPlainMode(prompt, escapeWords) {
  const normalizedPrompt = String(prompt || "").toLowerCase();
  return escapeWords.some((term) => normalizedPrompt.includes(term));
}

export function shouldInject({ event, ctx, config }) {
  if (!config.enabled) {
    return false;
  }

  const channelId = String(ctx?.channelId || "").trim().toLowerCase();
  if (config.targetChannels.length > 0 && !config.targetChannels.includes(channelId)) {
    return false;
  }

  if (promptRequestsPlainMode(event?.prompt, config.plainModeEscapeWords)) {
    return false;
  }

  if (config.applyOnFirstTurnOnly) {
    const messageCount = Array.isArray(event?.messages) ? event.messages.length : 0;
    if (messageCount > config.initialMessageCountMax) {
      return false;
    }
  }

  return true;
}

export function buildGuidance(config) {
  if (config.customGuidance) {
    return config.customGuidance;
  }

  const lines = [config.guidanceTitle];

  if (config.requiredOpening) {
    lines.push(`- ${config.requiredOpening}`);
  }

  if (config.requiredTakeaway) {
    lines.push(`- ${config.requiredTakeaway}`);
  }

  if (config.listRule) {
    lines.push(`- ${config.listRule}`);
  }

  if (config.disallowedPatterns.length > 0) {
    lines.push(`- Do not send: ${config.disallowedPatterns.join(", ")}.`);
  }

  lines.push("- Unless the user explicitly requested plain/raw/minimal/no-emoji/no-formatting output, apply this to quick replies, updates, summaries, apologies, and tool-result summaries.");
  lines.push("- If a draft is flatter than the required format, rewrite it before sending.");

  return lines.join("\n");
}

export function getMessageText(message) {
  if (!message || message.role !== "assistant" || !Array.isArray(message.content)) {
    return "";
  }

  return message.content
    .filter((item) => item && item.type === "text" && typeof item.text === "string")
    .map((item) => item.text)
    .join("\n\n")
    .trim();
}

function cleanLine(line) {
  return String(line || "")
    .replace(/^[-*•]+\s*/, "")
    .replace(/^\d+[.)]\s*/, "")
    .trim();
}

function stripMarkdownDecorators(text) {
  return String(text || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .trim();
}

function splitIntoSentences(text) {
  return stripMarkdownDecorators(text)
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function trimSentence(text, max = 160) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }

  let result = normalized;
  if (result.length > max) {
    result = `${result.slice(0, max - 1).trimEnd()}…`;
  }

  if (!/[.!?…]$/.test(result)) {
    result = `${result}.`;
  }

  return result;
}

function titleCase(words) {
  return words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function inferHeader(text) {
  const normalized = stripMarkdownDecorators(text).toLowerCase();

  if (/news|headline|reuters|ap\s|markets|breaking/.test(normalized)) {
    return "📰 **News update**";
  }
  if (/sorry|apolog/.test(normalized)) {
    return "🙏 **Quick update**";
  }
  if (/error|issue|fix|bug|failed|failure/.test(normalized)) {
    return "🛠️ **Fix update**";
  }
  if (/yes\b|done\b|completed\b|ready\b/.test(normalized)) {
    return "✅ **Update**";
  }

  return "✨ **Update**";
}

export function isHouseFormatted(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    return false;
  }

  const headerOk = /^\p{Extended_Pictographic}.*\*\*.+\*\*$/u.test(lines[0]);
  const takeawayOk = /^\*\*.+\*\*$/.test(lines[1]);

  return headerOk && takeawayOk;
}

function collectBulletCandidates(text) {
  const rawLines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const bulletLines = rawLines
    .filter((line) => /^([-*•]|\d+[.)])\s+/.test(line))
    .map(cleanLine)
    .filter(Boolean);

  if (bulletLines.length > 0) {
    return bulletLines;
  }

  const paragraphs = String(text || "")
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean);

  const items = [];
  for (const paragraph of paragraphs) {
    const sentences = splitIntoSentences(paragraph);
    if (sentences.length > 1) {
      for (const sentence of sentences) {
        items.push(sentence);
      }
    } else if (paragraph) {
      items.push(paragraph);
    }
  }

  return items.map(cleanLine).filter(Boolean);
}

export function formatHouseStyle(text) {
  const source = String(text || "").trim();
  if (!source) {
    return source;
  }

  if (isHouseFormatted(source)) {
    return source;
  }

  const candidates = collectBulletCandidates(source);
  const firstSentence = splitIntoSentences(source)[0] || candidates[0] || source;
  const takeaway = trimSentence(firstSentence);

  const remainder = candidates
    .filter((item) => trimSentence(item).toLowerCase() !== takeaway.toLowerCase())
    .map((item) => trimSentence(item, 180))
    .filter(Boolean);

  const uniqueRemainder = [];
  const seen = new Set();
  for (const item of remainder) {
    const key = item.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      uniqueRemainder.push(item);
    }
  }

  const lines = [inferHeader(source), `**${takeaway}**`];

  if (uniqueRemainder.length > 0) {
    lines.push("");
    lines.push(`- **${titleCase([uniqueRemainder.length > 1 ? "key points" : "detail"])}**`);
    for (const item of uniqueRemainder.slice(0, 5)) {
      lines.push(`  - ${item}`);
    }
  }

  return lines.join("\n").trim();
}

export function rewriteAssistantMessage(message, config) {
  if (!config.enforceOutgoingMessages || !message || message.role !== "assistant" || !Array.isArray(message.content)) {
    return { changed: false, message, originalText: "", rewrittenText: "" };
  }

  const originalText = getMessageText(message);
  if (!originalText || isHouseFormatted(originalText)) {
    return { changed: false, message, originalText, rewrittenText: originalText };
  }

  const rewrittenText = formatHouseStyle(originalText);
  if (!rewrittenText || rewrittenText === originalText) {
    return { changed: false, message, originalText, rewrittenText: originalText };
  }

  let replaced = false;
  const nextContent = message.content
    .map((item) => {
      if (item && item.type === "text" && !replaced) {
        replaced = true;
        return { ...item, text: rewrittenText };
      }
      if (item && item.type === "text") {
        return null;
      }
      return item;
    })
    .filter(Boolean);

  return {
    changed: true,
    originalText,
    rewrittenText,
    message: {
      ...message,
      content: replaced ? nextContent : [{ type: "text", text: rewrittenText }]
    }
  };
}
