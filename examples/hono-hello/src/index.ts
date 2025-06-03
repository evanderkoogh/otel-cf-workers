import { Hono } from 'hono'
import { instrument, ResolveConfigFn } from '@microlabs/otel-cf-workers'

export interface Env {
	HONEYCOMB_API_KEY: string
}

// Create a new Hono application
const app = new Hono()

// Simple Hello World route
app.get('/', (c) => c.text('Hello Hono!'))

// Wrap the Hono app in a standard Workers handler so that we can
// apply OpenTelemetry instrumentation.
const handler = {
	fetch: app.fetch.bind(app),
}

// Configure the OpenTelemetry exporter – this forwards traces to Honeycomb.
const config: ResolveConfigFn = (env: Env) => {
	return {
		exporter: {
			url: 'https://api.honeycomb.io/v1/traces',
			headers: { 'x-honeycomb-team': env.HONEYCOMB_API_KEY },
		},
		service: { name: 'hono-hello-world' },
	}
}

export default instrument(handler, config) 