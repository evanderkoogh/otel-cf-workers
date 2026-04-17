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

	// Regression: SDKs (e.g. WorkOS, Stripe) bind `globalThis.fetch` to `globalThis`
	// at construction to satisfy Cloudflare's this-strict native fetch. Previously
	// the `.bind` trap returned `() => receiver`, silently dropping the thisArg, so
	// subsequent calls forwarded the caller's `this` to native fetch and threw
	// "Illegal invocation". The trap must honor Function.prototype.bind semantics.
	it('.bind honors thisArg and bound args', () => {
		const target = function (this: unknown, ...args: unknown[]) {
			return { receivedThis: this, receivedArgs: args }
		}
		const callLog: Array<{ thisArg: unknown; args: unknown[] }> = []
		const wrapped = wrap(target, {
			apply(inner, thisArg, argArray) {
				callLog.push({ thisArg, args: argArray })
				return Reflect.apply(inner as (...a: unknown[]) => unknown, thisArg, argArray)
			},
		}) as (...args: unknown[]) => { receivedThis: unknown; receivedArgs: unknown[] }

		const pinnedThis = { marker: 'globalThis-substitute' }
		const bound = (wrapped as unknown as { bind: (t: unknown, ...a: unknown[]) => typeof wrapped }).bind(
			pinnedThis,
			'bound-arg',
		)

		// Invoke like `obj.method(...)` so JS would normally set `this = obj` — but
		// the bind should pin `this` to `pinnedThis` and prepend the bound arg.
		const caller = { bound }
		const result = caller.bound('call-arg')

		expect(result.receivedThis).toBe(pinnedThis)
		expect(result.receivedArgs).toEqual(['bound-arg', 'call-arg'])
		expect(callLog).toHaveLength(1)
		expect(callLog[0]?.thisArg).toBe(pinnedThis)
	})
})
