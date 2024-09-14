import { describe, it, expect } from 'vitest'

import { isWrapped, isProxyable, wrap, unwrap, passthroughGet } from '../src/wrap'

describe('wrap', () => {
	it('isWrapped', () => {
		const unwrapped = { foo: 'bar' }
		const wrapped = wrap(unwrapped, {})
		expect(isWrapped(unwrapped)).toBe(false)
		expect(isWrapped(wrapped)).toBe(true)
	})

	it('isProxyable', () => {
		expect(isProxyable(null)).toBe(false)
		expect(isProxyable({})).toBe(true)
		expect(isProxyable(() => {})).toBe(true)
	})

	it('wrap', () => {
		const unwrapped = { foo: 'bar', baz: 'qux' }
		const wrapped = wrap(unwrapped, {
			get(target, prop) {
				if (prop === 'foo') {
					return 'baz'
				}
				return passthroughGet(target, prop)
			},
		})
		expect(wrapped.foo).toBe('baz')
		expect(wrapped.baz).toBe('qux')
		expect(unwrap(wrapped)).toBe(unwrapped)
	})

	it('unwrap', () => {
		const unwrapped = { foo: 'bar' }
		const wrapped = wrap(unwrapped, {})
		expect(unwrap(wrapped)).toBe(unwrapped)
	})
})
