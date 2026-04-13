# Startup Format Guard

A small, generalized OpenClaw plugin that reinforces a **reply contract / house format** with two layers:

1. **Prompt-time guidance** via `before_prompt_build`
2. **Outgoing rewrite fallback** via `before_message_write` + `message_sending`

The goal is to catch the common failure mode where the model usually follows a structure contract, but the first reply after `/new`, `/reset`, startup, or a short greeting still slips into a flat response.

## What changed in the hardened version

Compared with the lighter initial community version, this build now does the following more reliably:

- records per-session enforcement state during `before_prompt_build`
- honors explicit plain/raw/minimal/no-formatting escape requests consistently
- rewrites non-compliant assistant text before persistence when enforcement is active
- formats rewritten replies into clearly separated body sections instead of a single undifferentiated bullet blob
- keeps a short-lived rewrite cache so the **outbound delivered content** stays aligned with the rewritten persisted message
- scopes rewrite cache lookups by **session + channel + original text** instead of raw text alone, which reduces accidental collisions across conversations
- clears session-scoped state and cached rewrites on `session_end`

## What it does

The plugin appends extra system guidance when all of the following are true:

- the plugin is enabled
- the current channel matches `targetChannels` or no channel filter is set
- the current prompt does **not** explicitly request plain/raw/minimal output
- the run still looks like an early turn when `applyOnFirstTurnOnly` is enabled

If the assistant still produces a flat reply, the plugin can rewrite it into the configured house format before write/send.

## Good fits

Use it for patterns like:

- Telegram-style house-format enforcement
- executive-summary-first replies
- support-bot first-turn structure
- channel-specific startup formatting
- “never send flat blobs” guardrails for summaries or updates

It also works well for style contracts such as:

- clearly separated body sections after the takeaway
- optional use of 1–3 body emojis for section distinction or emphasis
- bold section labels like **✅ What’s verified**, **🌍 Why it matters**, **⚠️ What looks less certain**, and **📌 Source basis**

## Project structure

- `index.js` — OpenClaw plugin entry
- `core.js` — config normalization, guidance building, rewrite helpers
- `runtime.js` — hook registration and session/rewrite-cache behavior
- `openclaw.plugin.json` — plugin metadata
- `examples/config.example.json` — sample config
- `scripts/*.test.mjs` — local tests

## Install locally

### Option 1: drop into your OpenClaw extensions directory

Copy this folder into your OpenClaw extensions path, for example:

```bash
~/.openclaw/extensions/startup-format-guard
```

Then enable/configure it in your OpenClaw config.

### Option 2: publish later

The package layout is now closer to GitHub / npm publication, but this repo is still meant for local validation until you choose final metadata and distribution details.

## Example config

```json
{
  "plugins": {
    "startup-format-guard": {
      "enabled": true,
      "targetChannels": ["telegram"],
      "applyOnFirstTurnOnly": true,
      "initialMessageCountMax": 2,
      "enforceOutgoingMessages": true,
      "plainModeEscapeWords": [
        "plain",
        "raw",
        "minimal",
        "no emoji",
        "no formatting"
      ],
      "guidanceTitle": "Telegram house-format reinforcement:",
      "requiredOpening": "The first non-empty line must be an emoji-led fully bold header.",
      "requiredTakeaway": "The next line must be one short bold takeaway sentence.",
      "listRule": "If there is more than one point, use bullets or numbering.",
      "disallowedPatterns": [
        "flat paragraph blobs",
        "dry status lines",
        "memo-style summaries",
        "tool-log phrasing"
      ]
    }
  }
}
```

See also: [`examples/config.example.json`](./examples/config.example.json)

## Config fields

- `enabled` — turn the plugin on/off
- `targetChannels` — optional list like `telegram`, `discord`, `whatsapp`
- `applyOnFirstTurnOnly` — only apply to early-turn replies
- `initialMessageCountMax` — threshold for what counts as an early turn
- `enforceOutgoingMessages` — enables rewrite fallback on assistant output
- `plainModeEscapeWords` — phrases that disable enforcement for that prompt
- `guidanceTitle` — heading used inside injected guidance
- `requiredOpening` — opening-format rule
- `requiredTakeaway` — top-line / takeaway rule
- `listRule` — list-structure rule
- `customGuidance` can include rules like sectioned body layouts and optional 1–3 body emojis for section distinction
- `disallowedPatterns` — reply patterns to explicitly avoid
- `customGuidance` — full custom text override if you want total control

## Behavior notes

### Early-turn detection

This plugin uses `event.messages.length` as a lightweight heuristic. That is intentional: it is simple, cheap, and works well for startup/reset flows.

If your environment builds a slightly longer prepared message stack on first turn, raise `initialMessageCountMax`.

### Plain-mode escape hatch

If the current prompt includes a configured escape phrase like `plain`, `raw`, or `no formatting`, the plugin skips both:

- guidance injection
- rewrite fallback

### Sectioned rewrite output

When the outgoing rewrite fallback triggers, the plugin now prefers a more structured body layout:

- bold takeaway line near the top
- blank lines between sections
- bold section labels
- short bullets under each section
- source extraction for common news outlets when they appear in the text

### Rewrite fallback scope

The outgoing fallback keeps a short-lived cache of rewrites and looks them up by:

- `sessionKey`
- `channelId`
- original outbound text

That makes it safer than a raw text-only cache when multiple sessions emit similar content.

## Validation

Local validation currently covers:

- channel filtering
- plain-mode escape detection
- flat-prose to house-format rewriting
- preservation of non-text content during rewrites
- hook-level guidance injection
- hook-level outbound rewrite fallback
- session cleanup behavior

Run locally with:

```bash
npm test
```

## Publish-prep notes

Still worth doing before a broader public npm release:

1. add CI for `npm test`
2. add one or two real screenshots / transcripts
3. test against a live OpenClaw instance on at least one non-Telegram target channel
4. decide whether the default `targetChannels` should stay Telegram-first or become fully empty/general by default

## License

MIT
