---
'@microlabs/otel-cf-workers': major
---

Breaking changes for HTTP related attributes

- http.accepts -> http.request.header.accepts
- http.mime_type -> http.response.header.mime-type
- net.tls_cipher -> tls.cipher
- net.tls_version -> tls.protocol.version
