import { instrument, instrumentDO, ResolveConfigFn } from '../../../src/index'
import handler, { Env, OtelDO } from './handler'

const config: ResolveConfigFn = (env: Env, _trigger) => {
	return {
		exporter: {
			url: 'https://api.honeycomb.io/v1/traces',
			headers: { 'x-honeycomb-team': env['otel.exporter.headers.x-honeycomb-team'] },
		},
		service: {
			name: 'greetings',
			version: '0.1',
		},
	}
}

const doConfig: ResolveConfigFn = (env: Env) => {
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
