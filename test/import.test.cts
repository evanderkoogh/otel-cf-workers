import { expect, it } from 'vitest'

it('can import in cjs', () => {
	const otelCfWorkers = require('..')

	expect(otelCfWorkers).toBeDefined()
	expect(otelCfWorkers.instrument).toBeTypeOf('function')
})
