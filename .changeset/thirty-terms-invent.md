---
'@microlabs/otel-cf-workers': patch
---

EXPERIMENTAL: implement withNextSpan(attrs: Attributes) that will includes those attributes in the next span that is created.
This is useful for adding additional information to spans created by libraries such as when using `fetch` for example.
