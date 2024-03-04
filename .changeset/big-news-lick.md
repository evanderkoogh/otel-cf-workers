---
'@microlabs/otel-cf-workers': patch
---

fix: Inline kv.getWithMetadata() attributes to prevent exception

KVAttributes functions don't have access to other functions, so we
needed to inline functionality from get(argArray)
