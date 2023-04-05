import { trace } from '@opentelemetry/api'
import { instrument, waitUntilTrace, WorkerTraceConfig } from '../../../src/index'

export interface Env {
	OTEL_TEST: KVNamespace
}

const handler = {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		await fetch('https://cloudflare.com')
		await env.OTEL_TEST.get('non-existant')
		const cache = await caches.open('stuff')
		const noexist = await cache.match(new Request('https://no-exist.com'))
		const greeting = "G'day World"
		trace.getActiveSpan()?.setAttribute('greeting', greeting)
		ctx.waitUntil(waitUntilTrace(() => fetch('https://workers.dev')))
		return new Response(`${greeting}!`)
	},
}

const config: WorkerTraceConfig = {
	exporter: { url: 'https://api.honeycomb.io/v1/traces' },
	service: {
		name: 'greetings',
		version: '0.1',
	},
}

export default instrument(handler, config)
