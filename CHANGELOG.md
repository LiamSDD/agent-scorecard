# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-11-24

### Added

- Streaming Claude Code `.jsonl` parser that runs in the browser: usage deduplicated per `message.id` and `requestId`, malformed lines skipped and counted, sidechains grouped into subagents, ANSI and control characters stripped. Files up to 50 MB.
- Run view with header stats, a filterable timeline with expandable turns, and lazy-loaded SVG charts for cumulative cost, token mix and tool usage.
- Seven deterministic checks with evidence links into the timeline, and a 0 to 100 hygiene score with a visible breakdown.
- Optional AI review through `/api/review` using `claude-opus-5-5` structured outputs and server-side fallbacks, with a payload preview, bring-your-own-key, and a rate-limited shared key.
- Compare page for any two runs.
- Three synthetic sample runs with hand-authored example reviews and `npm run review:samples` to regenerate them.
- About page with an architecture diagram, privacy notes, the pricing table and limitations.
- Dark and light themes, keyboard navigation, reduced-motion support and security headers.
