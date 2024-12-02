import { SpanKind, type SpanOptions } from '@opentelemetry/api'
import {
	ATTR_FAAS_TRIGGER,
	ATTR_MESSAGING_DESTINATION_NAME,
	ATTR_RPC_MESSAGE_ID,
} from '@opentelemetry/semantic-conventions/incubating'
import { HandlerInstrumentation, OrPromise } from '../types'

/**
 * Converts the message headers into a record ready to be injected
 * as OpenTelemetry attributes
 *
 * @example
 * ```ts
 * const headers = new Headers({ "Subject": "Hello!", From: "hello@example.com" })
 * headerAttributes({ headers })
 * // => {"email.header.Subject": "Hello!", "email.header.From": "hello@example.com"}
 * ```
 */
function headerAttributes(message: { headers: Headers }): Record<string, unknown> {
	return Object.fromEntries([...message.headers].map(([key, value]) => [`email.header.${key}`, value] as const))
}

export const emailInstrumentation: HandlerInstrumentation<ForwardableEmailMessage, OrPromise<void>> = {
	getInitialSpanInfo: (message) => {
		const attributes = {
			[ATTR_FAAS_TRIGGER]: 'other',
			[ATTR_RPC_MESSAGE_ID]: message.headers.get('Message-Id') ?? undefined,
			[ATTR_MESSAGING_DESTINATION_NAME]: message.to,
		}
		Object.assign(attributes, headerAttributes(message))
		const options = {
			attributes,
			kind: SpanKind.CONSUMER,
		} satisfies SpanOptions

		return {
			name: `emailHandler ${message.to}`,
			options,
		}
	},
}
