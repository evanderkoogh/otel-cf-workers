---
"@microlabs/otel-cf-workers": patch
---

fix: Avoid calling bind on instances of RpcProperty

This PR inspects the unwrapped value, and if it's constructor is of RpcProperty, it handles binding by returning a different function that calls the RPC property as if it was bound.

Thanks @JacobMarshallPP !
