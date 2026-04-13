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

const SOURCE_PATTERNS = [
  ["Reuters", /\breuters\b/i],
  ["AP", /\b(?:ap news|associated press|ap)\b/i],
  ["BBC", /\bbbc\b/i],
  ["CNN", /\bcnn\b/i],
  ["NPR", /\bnpr\b/i],
  ["Bloomberg", /\bbloomberg\b/i],
  ["Financial Times", /\bfinancial times\b|\bft\b/i],
  ["Wall Street Journal", /\bwall street journal\b|\bwsj\b/i],
  ["The Guardian", /\bthe guardian\b|\bguardian\b/i],
  ["New York Times", /\bnew york times\b|\bnyt\b/i]
];

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

  lines.push("- After the takeaway, use clearly separated body sections with blank lines between them when there is enough content.");
  lines.push("- Section labels should be bold and may use 1–3 body emojis total for visual separation, such as **✅ What’s verified**, **🌍 Why it matters**, **⚠️ What looks less certain**, or **📌 Source basis**.");
  lines.push("- Prefer short bullets under each section instead of dense paragraphs.");
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

function inferSources(text) {
  const normalized = stripMarkdownDecorators(text);
  const sources = [];

  for (const [name, pattern] of SOURCE_PATTERNS) {
    if (pattern.test(normalized)) {
      sources.push(name);
    }
  }

  return sources;
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
  const hasSectionHeading = lines.slice(2).some((line) => /^\*\*[✅🌍⚠️📌💡🛠️].+\*\*$/.test(line));

  return headerOk && takeawayOk && (lines.length <= 2 || hasSectionHeading);
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

function buildSection(title, items) {
  if (!items || items.length === 0) {
    return [];
  }

  return [
    `**${title}**`,
    ...items.map((item) => `- ${item}`)
  ];
}

function dedupeItems(items) {
  const unique = [];
  const seen = new Set();

  for (const item of items) {
    const normalized = trimSentence(item, 180);
    if (!normalized) {
      continue;
    }

    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(normalized);
  }

  return unique;
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

  const remainder = dedupeItems(
    candidates.filter((item) => trimSentence(item).toLowerCase() !== takeaway.toLowerCase())
  );

  const lines = [inferHeader(source), `**${takeaway}**`];
  const sections = [];
  const sources = inferSources(source);
  const isNews = /^📰 /.test(lines[0]);

  if (isNews) {
    sections.push(buildSection("✅ What’s verified", remainder.slice(0, 3)));
    sections.push(buildSection("🌍 Why it matters", remainder.slice(3, 6)));
  } else {
    sections.push(buildSection(`✅ ${titleCase([remainder.length > 1 ? "key points" : "key point"])}`, remainder.slice(0, 3)));
    sections.push(buildSection("📌 Additional context", remainder.slice(3, 6)));
  }

  if (sources.length > 0) {
    sections.push(buildSection("📌 Source basis", sources.map((item) => `**${item}**`)));
  }

  const renderedSections = sections.filter((section) => section.length > 0);
  if (renderedSections.length > 0) {
    for (const section of renderedSections) {
      lines.push("");
      lines.push(...section);
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
