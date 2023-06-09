import { instrument, instrumentDO, isRequest, ResolveConfigFn } from '../../../src/index'
import { Env, OtelDO } from './handler'
import handler from './handler'

const config: ResolveConfigFn = (env: Env, trigger) => {
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
	}
}

const doConfig: ResolveConfigFn = (env: Env, trigger) => {
	return {
		exporter: {
			url: 'https://api.honeycomb.io/v1/traces',
			headers: { 'x-honeycomb-team': env['otel.exporter.headers.x-honeycomb-team'] },
		},
		service: { name: 'greetings-do' },
	}
}

const TestOtelDO = instrumentDO(OtelDO, doConfig)

export default instrument(handler, config)

export { TestOtelDO }
