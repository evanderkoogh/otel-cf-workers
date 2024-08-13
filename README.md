# otel-cf-workers

An OpenTelemetry compatible library for instrumenting and exporting traces from Cloudflare Workers.

## Getting started

> [!IMPORTANT]
> To be able to use the Open Telemetry library you have to add the NodeJS compatibility flag in your `wrangler.toml` file.

```
compatibility_flags = [ "nodejs_compat" ]
```

### Code example

```typescript
import { trace } from '@opentelemetry/api'
import { instrument, ResolveConfigFn } from '@microlabs/otel-cf-workers'

export interface Env {
	HONEYCOMB_API_KEY: string
	OTEL_TEST: KVNamespace
}

const handler = {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		await fetch('https://cloudflare.com')

		const greeting = "G'day World"
		trace.getActiveSpan()?.setAttribute('greeting', greeting)
		ctx.waitUntil(fetch('https://workers.dev'))
		return new Response(`${greeting}!`)
	},
}

const config: ResolveConfigFn = (env: Env, _trigger) => {
	return {
		exporter: {
			url: 'https://api.honeycomb.io/v1/traces',
			headers: { 'x-honeycomb-team': env.HONEYCOMB_API_KEY },
		},
		service: { name: 'greetings' },
	}
}

export default instrument(handler, config)
```

## Auto-instrumentation

### Workers

Wrapping your exporter handler with the `instrument` function is all you need to do to automatically have not just the functions of you handler auto-instrumented, but also the global `fetch` and `caches` and all of the supported bindings in your environment such as KV.

See the quick start code sample for an example of how it works.

### Durable Objects

Instrumenting Durable Objects work very similar to the regular Worker auto-instrumentation. Instead of wrapping the handler in an `instrument` call, you wrap the Durable Object class with the `instrumentDO` function.

```typescript
import { instrumentDO, PartialTraceConfig } from '@microlabs/otel-cf-workers'

const config: ResolveConfigFn = (env: Env, _trigger) => {
	return {
		exporter: {
			url: 'https://api.honeycomb.io/v1/traces',
			headers: { 'x-honeycomb-team': env.HONEYCOMB_API_KEY },
		},
		service: { name: 'greetings-do' },
	}
}

class OtelDO implements DurableObject {
	async fetch(request: Request): Promise<Response> {
		return new Response('Hello World!')
	}
}

const TestOtelDO = instrumentDO(OtelDO, doConfig)

export { TestOtelDO }
```

## Creating custom spans

While auto-instrumenting should take care of a lot of the information that you would want to add, there will always be application specific information you want to send along.

You can get the current active span by doing:

```typescript
import {trace} from '@opentelemetry/api'

const handler = {
	async fetch(request: Request) {
		const span = trace.getActiveSpan()
		if(span) span.setAttributes('name', 'value')
		....
	}
}
```

Or if you want to create a new span:

```typescript
import { trace } from '@opentelemetry/api'

const handler = {
	async fetch(request: Request) {
		const tracer = trace.getTracer('my_own_tracer_name')
		return tracer.startActiveSpan('name', (span) => {
			const response = await doSomethingAwesome
			span.end()
			return response
		})
	},
}
```

## Configuration

For configuration you can either pass in a [TraceConfig](https://github.com/evanderkoogh/otel-cf-workers/blob/0da125a4e16ff13e49f8e486340eb6080e631eb9/src/types.ts#L24C18-L24C29) or a function that takes the Environment and the trigger for this particular trace and returns a `TraceConfig`.

Because the configuration function is run separately for every new invocation, it is possible to tailor your configuration for every type of request. So it is for example possible to have a much lower sampling ratio for your healthchecks than actual API requests.

### Exporter

In the `exporter`, you need to configure where to send spans to. It can take either an instance of a class that implements the standard Open Telemetry `SpanExporter`interface, or an object with the properties `url` and optionally `headers` to configure an exporter for the Open Telemetry format.

Examples:

```typescript
const exporter = new ConsoleSpanExporter()
```

```typescript
const exporter = {
	url: 'https://api.honeycomb.io/v1/traces',
	headers: { 'x-honeycomb-team': env.HONEYCOMB_API_KEY },
}
```

### Fetch

`includeTraceContext` is used to specify if outgoing requests should include the TraceContext so that the other service can participate in a distributed trace.
The default is `true` for all outgoing requests, but you can turn it off for all requests with `false`, or specify a method that takes the outgoing `Request` method and return a boolean on whether to include the tracing context.

Example:

```typescript
const fetchConf = (request: Request): boolean => {
	return new URL(request.url).hostname === 'example.com'
}
```

### Handlers

The `handlers` field of the configuration overrides the way in which event handlers, such as `fetch` or `queue`, are instrumented.

#### Fetch Handler

`acceptTraceContext` is used to specify if incoming requests handled by `fetch` should accept a TraceContext and participate in a distributed trace.
The default is `true` for all incoming requests, but you can turn it off for all requests with `false` or specify a method that takes the incoming `Request` and returns a boolean indicating whether to accept the tracing context.

Example:

```typescript
const fetchConf = (request: Request): boolean => {
	return new URL(request.url).hostname === 'example.com'
}
```

### PostProcessor

The PostProcessor function is called just before exporting the spans and allows you to make any changes to the spans before sending this. For example to remove entire spans, or to remove or redact security or privacy sensitive data.

Example:

```typescript
const postProcessor = (spans: ReadableSpan[]): ReadableSpan[] => {
	spans[0].attributes['http.url'] = 'REDACTED'
	return spans
}
```

### Sampling

One of the challenges of tracing is that for sites and applications with a lot of traffic it becomes prohibitively expensive to store every trace. So the question becomes how to store the ones with the most interesting information and drop the ones that are the least interesting. That is where sampling comes in.

#### Head Sampling vs Tail Sampling

There are two (complimentary) sampling strategies: Head Sampling and Tail Sampling and in a lot of cases you will want to use a combination to get the most information into the least amount of sampled events.

To understand the difference in head vs tail sampling in our context, we have to understand distributed tracing. A distributed trace is one that spans multiple systems or services. At every point another service is called, we inject a header with the information about the trace, such as the traceId, the parentSpanId and a hint if this trace is sampled.

Head Sampling, as the name implies, is done at the beginning of a span/trace. In our case it is mostly used to signal to downstream systems whether or not to sample a particular trace, because we can always drop the current services portion of a trace during Tail Sampling.

Head Sampling can be configured with any standard Open Telemetry `Sampler` or an object with a `ratio` property and optional `acceptRemote` property. The default is the AlwaysOnSampler, which samples every single request.

Examples:

```typescript
const headSampler = new AlwaysOnSampler()
```

```typescript
const headSampler = {
	acceptRemote: false //Whether to accept incoming trace contexts
	ratio: 0.5 //number between 0 and 1 that represents the ratio of requests to sample. 0 is none and 1 is all requests.
}
```

Tail Sampling on the other hand is done at the end. Because we record every single span, even if it isn't head sampled, it is possible to still sample the local part of a trace in say the event of an error.

Example:

```typescript
const tailSampler = (traceInfo: LocalTrace): boolean => {
	const localRootSpan = traceInfo.localRootSpan as unknown as ReadableSpan
	return (localRootSpan.spanContext().traceFlags & TraceFlags.SAMPLED) === TraceFlags.SAMPLED
}
```

The default is a tailSampler that samples traces that have been head sampled or if the local root span is marked as an error.

#### Service

Service identifies the service and version to help with querying.

Example:

```typescript
const service = {
	name: 'some_name' //required. The name of your service
	version: '1.0.4' //optional: An opaque version string. Can be a semver or git hash for example
	namespace: 'namespace' //optional: Useful to group multiple services together in one namespace.
}
```

### Propagation

Register a custom propagator with:

```ts
const config: ResolveConfigFn = (env: Env, _trigger) => {
	return {
		propagator: new MyCoolPropagator(),
	}
}
```

## Distributed Tracing

One of the advantages of using Open Telemetry is that it makes it easier to do distributed tracing through multiple different services. This library will automatically inject the W3C Trace Context headers when making calls to Durable Objects or outbound fetch calls.

## Limitations

- The worker runtime does not expose accurate timing information to protect against side-channel attacks such as Spectre and will only update the clock on IO, so any CPU heavy processing will look like it takes 0 milliseconds.
- Not everything is auto-instrumented yet. See the lists below for what is and isn't.

Triggers:

- [ ] Email (`handler.email`)
- [x] HTTP (`handler.fetch`)
- [x] Queue (`handler.queue`)
- [x] Cron (`handler.scheduled`)
- [ ] Tail (`handler.tail`)
- [x] Durable Objects fetch
- [x] Durable Objects alarm
- [ ] Durable Objects hibernated WebSocket
- [x] waitUntil (`ctx.waitUntil`)

Globals/built-ins:

- [x] Fetch
- [x] Caches
- [x] Durable Object Storage

Cloudflare modules

- [ ] `cloudflare:email`
- [ ] `cloudflare:sockets`

Bindings:

- [x] KV
- [x] Queue
- [x] Durable Objects
- [ ] R2
- [ ] D1
- [x] Service Bindings
- [x] Analytics Engine
- [ ] Browser Rendering
- [ ] Workers AI
- [ ] Email Sending
- [ ] mTLS
- [ ] Vectorize
- [ ] Hyperdrive
- [ ] Workers for Platforms Dispatch
