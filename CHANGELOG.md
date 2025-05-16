# @microlabs/otel-cf-workers

## 1.0.0-rc.50

### Minor Changes

- 19af336: Implement a complete rework of the internals to be more predictable and make it easier to implement more instrumentation on top of it.

### Patch Changes

- fcab308: Upgrade dependencies

## 1.0.0-rc.49

### Minor Changes

- 83fb993: Add support for email handlers
- 82a2ff8: add support for `email` handlers

  Example usage:

  ```ts
  export default {
  	async email(message, env, ctx) {
  		// this is running in a trace!
  	},
  }
  ```

## 1.0.0-rc.48

### Minor Changes

- 150efef: Add initial support for D1 (experimental)

## 1.0.0-rc.47

### Minor Changes

- 0a41148: Complete overhaul of the build system thanks to @Cherry

### Patch Changes

- 1aa4d2c: fix: refactor to modern build tooling and resolve import issues
- d0dcc83: Fix importing issues. Fixes #162

## 1.0.0-rc.46

### Patch Changes

- 7834157: Include correct version number in the outputted telemetry
- 1969866: EXPERIMENTAL: implement withNextSpan(attrs: Attributes) that will includes those attributes in the next span that is created.
  This is useful for adding additional information to spans created by libraries such as when using `fetch` for example.

## 1.0.0-rc.45

### Patch Changes

- 8c9be82: Fix regression in OTLP json encoding (thx @gdaszuta)

## 1.0.0-rc.44

### Patch Changes

- bd0a46a: Upgrade dependencies and make @open-telemetry/api a peer-dependency to guard against different otel api implementations.

## 1.0.0-rc.41

### Patch Changes

- Fix config being undefined in some uninstrumented functions

## 1.0.0-rc.40

### Patch Changes

- 226d7d3: fix(#143): Inline ts-checked-fsm due to module issues

## 1.0.0-rc.39

### Minor Changes

- 52100b5: [Breaking] Rename durable object fetch, client fetch and service binding spans

### Patch Changes

- 360e3bd: fix: Avoid calling bind on instances of RpcProperty

  This PR inspects the unwrapped value, and if it's constructor is of RpcProperty, it handles binding by returning a different function that calls the RPC property as if it was bound.

  Thanks @JacobMarshallPP !

## 1.0.0-rc.38

### Patch Changes

- 0fdf245: Add back instrumentation of fetch in service bindings

## 1.0.0-rc.37

### Minor Changes

- 285d0c0: [Breaking] Rename some instrumented spans for consistency
- f10e4cd: Add option to disable auto-instrumentation of global fetch and cache API

## 1.0.0-rc.36

### Minor Changes

- 0bfd65c: Export unwrapped global fetch for various advanced use cases

### Patch Changes

- 39d448c: Correctly detect version metadata when tag is an empty string. Also, check for RPC bindings in all cases as `isVersionMetadata` was incorrectly picking up rpc bindings too when searching for version bindings.

## 1.0.0-rc.35

### Patch Changes

- dc8e389: fix: Rename version metadata attribute to match binding name

## 1.0.0-rc.34

### Patch Changes

- 051118f: Add version metadata to attributes if found

## 1.0.0-rc.33

### Patch Changes

- 660e4a7: Prevent incorrect detection of rpc bindings

## 1.0.0-rc.32

### Patch Changes

- 1390b74: fix: Revert import of packge.json breaking module resolution

## 1.0.0-rc.31

### Patch Changes

- 10376e2: fix: Remove publish script to prevent double publish

## 1.0.0-rc.30

### Minor Changes

- c53aafa: Add instrumentation for DO storage alarm methods and deleteAll

### Patch Changes

- d107ae8: Fix telemetry sdk attributes
- c53aafa: Fix DO storage instrumentation extra attributes
- c53aafa: Fix DO storage put when providing an object with multiple values
- 97aa141: Make ResolveConfigFn generic

## 1.0.0-rc.29

### Patch Changes

- 3a3d089: chore: Update @changesets/cli

## 1.0.0-rc.28

### Patch Changes

- ebf918c: chore: Remove pnpm cache in release action

## 1.0.0-rc.27

### Patch Changes

- b51bf4d: chore: Lock @opentelemetry/api at 1.6.x

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
