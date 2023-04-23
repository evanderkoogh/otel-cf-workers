import { trace } from '@opentelemetry/api'
import {
	instrument,
	instrumentDO,
	isRequest,
	PartialTraceConfig,
	resolveConfig,
	waitUntilTrace,
} from '../../../src/index'

export interface Env {
	OTEL_TEST: KVNamespace
	Test_Otel_DO: DurableObjectNamespace
	'otel.exporter.headers.x-honeycomb-team': string
}

const handleDO = async (request: Request, env: Env): Promise<Response> => {
	const ns = env.Test_Otel_DO
	const id = ns.idFromName('testing')
	const stub = ns.get(id)
	return await stub.fetch('https://does-not-exist.com/blah')
}

const handleRest = async (request: Request, env: Env, ctx: ExecutionContext): Promise<Response> => {
	await fetch('https://cloudflare.com')

	const cache = await caches.open('stuff')
	const promises = [env.OTEL_TEST.get('non-existant'), cache.match(new Request('https://no-exist.com'))]
	await Promise.all(promises)

	const greeting = "G'day World"
	trace.getActiveSpan()?.setAttribute('greeting', greeting)
	ctx.waitUntil(waitUntilTrace(() => fetch('https://workers.dev')))
	return new Response(`${greeting}!`)
}

const handler = {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const pathname = new URL(request.url).pathname
		if (pathname === '/do') {
			return handleDO(request, env)
		} else if (pathname === '/error') {
			throw new Error('You asked for it!')
		} else {
			return handleRest(request, env, ctx)
		}
	},
}

const config: resolveConfig = (env: Env, trigger) => {
	const pathname = isRequest(trigger) ? new URL(trigger.url).pathname : undefined
	return {
		exporter: {
			url: 'https://api.honeycomb.io/v1/traces',
			headers: { 'x-honeycomb-team': env['otel.exporter.headers.x-honeycomb-team'] },
		},
		service: {
			name: 'greetings',
			version: '0.1',
		},
		globals: {
			caches: !(pathname === '/nocaches'),
		},
		bindings: {
			kv: {
				sanitiseKeys({ key }) {
					return key.toUpperCase()
				},
			},
		},
	}
}

const doConfig: PartialTraceConfig = {
	exporter: { url: 'https://api.honeycomb.io/v1/traces' },
	service: { name: 'greetings-do' },
}

class OtelDO implements DurableObject {
	constructor(protected state: DurableObjectState, protected env: Env) {}
	async fetch(request: Request): Promise<Response> {
		await fetch('https://cloudflare.com')
		await this.env.OTEL_TEST.put('something', 'else')
		return new Response('Hello World!')
	}
	async alarm(): Promise<void> {
		throw new Error('Method not implemented.')
	}
}

const TestOtelDO = instrumentDO(OtelDO, doConfig)

export default instrument(handler, config)

export { TestOtelDO }
