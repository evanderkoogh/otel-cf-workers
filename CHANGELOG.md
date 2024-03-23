# @microlabs/otel-cf-workers

## 1.0.0-rc.26

### Patch Changes

- a2b04cd: chore: Bump release version

## 1.0.0-rc.25

### Patch Changes

- 8c196ee: fix: Use extensions in all imports

  This fixes unit tests not working due to non-ESM imports.

## 1.0.0-rc.24

### Patch Changes

- 23363aa: fix: Set has_result to false when there is no value returned in kv.getWithMetadata()

## 1.0.0-rc.23

### Patch Changes

- 7a7a46e: chore: Update @cloudflare/workers-types

## 1.0.0-rc.22

### Patch Changes

- 1e46f13: fix: Inline kv.getWithMetadata() attributes to prevent exception

  KVAttributes functions don't have access to other functions, so we
  needed to inline functionality from get(argArray)

## 1.0.0-rc.21

### Patch Changes

- d2f5aa2: fix: correct `cache.hit` attribute (#84)

## 1.0.0-rc.20

### Patch Changes

- Browser Rendering + AI binding send invalid URLs. Disable auto-instrumentation for now.

## 1.0.0-rc.19

### Patch Changes

- Revert upgrade of OTel exporter dependency because it was borked.

## 1.0.0-rc.18

### Patch Changes

- Fix issue with scheduled events and queues not reporting proper durations

## 1.0.0-rc.17

### Patch Changes

- Also have workaround for any other bindings (like AI) that pass in illegal arguments to `fetch`

## 1.0.0-rc.16

### Patch Changes

- Workaround for bug in puppeteer/browser binding. Detect and disable auto-instrumentation for now.

## 1.0.0-rc.15

### Minor Changes

- 8f83b55: Added instrumentation for scheduled handler
- 0195525: [Potentially breaking change] Updated all span names and attributes related to HTTP to the latest semantic conventions
- a1ff053: Add instrumentation for Analytics Engine bindings

### Patch Changes

- a154ddd: Update attr naming convention to db.cf.kv._ and db.cf.do._

## 1.0.0-rc.14

### Patch Changes

- 45547b6: Make instrumentEnv more robust still.
- 21a18f8: Fix bug where multiple calls to the same service_binding/do would only export the first call

## 1.0.0-rc.13

### Patch Changes

- Fix bug with detecting service bindings

## 1.0.0-rc.12

### Patch Changes

- 36ccf33: Properly await the export again.

## 1.0.0-rc.11

### Patch Changes

- 7fd1109: Preliminary support for the fetch method on Service Bindings

## 1.0.0-rc.10

### Patch Changes

- f275a13: Config format is changed so that config.exporter and config.spanProcessors are mutually exclusive.
- 1242ccd: Fixed an issue with instrumentation sometimes failing to be applied.
