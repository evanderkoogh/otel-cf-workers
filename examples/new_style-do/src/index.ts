import { instrument, instrumentDO, ResolveConfigFn } from '../../../src/index';
import handler, { MyDurableObject as MyDO } from './handler';

type WithSecretEnv = Env & { 'otel.exporter.headers.x-honeycomb-team': string };

const config: ResolveConfigFn = (env: WithSecretEnv, _trigger) => {
	return {
		exporter: {
			url: 'https://api.honeycomb.io/v1/traces',
			headers: { 'x-honeycomb-team': env['otel.exporter.headers.x-honeycomb-team'] },
		},
		service: {
			name: 'new-style-greetings',
			version: '0.1',
		},
	};
};

const doConfig: ResolveConfigFn = (env: WithSecretEnv) => {
	return {
		exporter: {
			url: 'https://api.honeycomb.io/v1/traces',
			headers: { 'x-honeycomb-team': env['otel.exporter.headers.x-honeycomb-team'] },
		},
		service: { name: 'new-style-greetings-do' },
	};
};

const MyDurableObject = instrumentDO(MyDO, doConfig);

export default instrument(handler, config);

export { MyDurableObject };
