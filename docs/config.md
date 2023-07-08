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
The default is `true` for all outgoing requests, but you can turn it off for all requests with `false`,or specify a method that takes the outgoing `Request` method and return a boolean on whether to include the tracing context.

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
const tailSampler = (localTrace: LocalTrace): boolean => {
	const localRootSpan = traceInfo.localRootSpan as unknown as ReadableSpan
	return localRootSpan.spanContext().traceFlags === TraceFlags.SAMPLED
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
