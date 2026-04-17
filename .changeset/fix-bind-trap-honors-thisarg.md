---
'@microlabs/otel-cf-workers': patch
---

fix: `wrap()` bind trap honors Function.prototype.bind semantics

The proxy `.bind` trap previously returned `() => receiver`, silently
dropping any passed thisArg. SDKs that defensively bind `globalThis.fetch`
to `globalThis` (e.g. WorkOS, Stripe) to satisfy Cloudflare's this-strict
native fetch ended up with their bind discarded. Later calls like
`this._fetchFn(...)` forwarded the caller's `this` to native fetch and
threw `TypeError: Illegal invocation`. The trap now returns a function
that forwards to the proxy's apply trap with the requested thisArg and
bound arguments, matching the language-level contract of `.bind`.
