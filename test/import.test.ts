import { expect, it } from 'vitest'

import * as otelCfWorkers from '..'
import { instrument } from '..'

it('can import in esm', () => {
	expect(otelCfWorkers).toBeDefined()
	expect(otelCfWorkers.instrument).toBeTypeOf('function')

	expect(instrument).toBeDefined()
	expect(instrument).toBeTypeOf('function')
})
