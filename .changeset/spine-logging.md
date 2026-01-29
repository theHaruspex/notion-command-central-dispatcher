---
"@theharuspex/notion-dispatch-events": patch
---

Implement multiline spine logging with sticky fields and origin_page extraction. All logs now use multiline format with origin_page on first line. Notion logs are app-aware. Removed raw JSON payload logging from ingress.
