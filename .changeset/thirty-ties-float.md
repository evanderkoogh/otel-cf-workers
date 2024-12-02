---
'@microlabs/otel-cf-workers': minor
---

add support for `email` handlers

Example usage:

```ts
export default {
  async email(message, env, ctx) {
    // this is running in a trace!
  },
};
```
