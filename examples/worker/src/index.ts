import { trace } from '@opentelemetry/api'
import { instrument, WorkerTraceConfig } from '../../../src/index'

export interface Env {
	OTEL_TEST: KVNamespace
}

const handler = {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		await fetch('https://cloudflare.com')
		await env.OTEL_TEST.get('non-existant')
		const greeting = "G'day World"
		trace.getActiveSpan()?.setAttribute('greeting', greeting)
		return new Response(`${greeting}!`)
	},
}

const config: WorkerTraceConfig = {
	exporter: { url: 'https://api.honeycomb.io/v1/traces' },
	serviceName: 'greetings',
	serviceVersion: '0.1',
}

export default instrument(handler, config)
