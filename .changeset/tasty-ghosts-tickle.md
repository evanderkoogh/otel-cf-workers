---
"@microlabs/otel-cf-workers": patch
---

Correctly detect version metadata when tag is an empty string. Also, check for RPC bindings in all cases as `isVersionMetadata` was incorrectly picking up rpc bindings too when searching for version bindings.
