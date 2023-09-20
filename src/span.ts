import {
	SpanContext,
	Link,
	SpanKind,
	TimeInput,
	Exception,
	Attributes,
	HrTime,
	Span,
	SpanStatus,
	SpanStatusCode,
	AttributeValue,
} from '@opentelemetry/api'
import {
	hrTimeDuration,
	InstrumentationLibrary,
	isAttributeKey,
	isAttributeValue,
	isTimeInput,
	sanitizeAttributes,
} from '@opentelemetry/core'
import { IResource } from '@opentelemetry/resources'
import { ReadableSpan, TimedEvent } from '@opentelemetry/sdk-trace-base'
import { SemanticAttributes } from '@opentelemetry/semantic-conventions'

type OnSpanEnd = (span: Span) => void

interface SpanInit {
	attributes: unknown
	name: string
	onEnd: OnSpanEnd
	resource: IResource
	spanContext: SpanContext
	links?: Link[]
	parentSpanId?: string
	spanKind?: SpanKind
	startTime?: TimeInput
}

function transformExceptionAttributes(exception: Exception): Attributes {
	const attributes: Attributes = {}
	if (typeof exception === 'string') {
		attributes[SemanticAttributes.EXCEPTION_MESSAGE] = exception
	} else {
		if (exception.code) {
			attributes[SemanticAttributes.EXCEPTION_TYPE] = exception.code.toString()
		} else if (exception.name) {
			attributes[SemanticAttributes.EXCEPTION_TYPE] = exception.name
		}
		if (exception.message) {
			attributes[SemanticAttributes.EXCEPTION_MESSAGE] = exception.message
		}
		if (exception.stack) {
			attributes[SemanticAttributes.EXCEPTION_STACKTRACE] = exception.stack
		}
	}
	return attributes
}

function millisToHr(millis: number): HrTime {
	return [Math.trunc(millis / 1000), (millis % 1000) * 1e6]
}

function getHrTime(input?: TimeInput): HrTime {
	const now = Date.now()
	if (!input) {
		return millisToHr(now)
	} else if (input instanceof Date) {
		return millisToHr(input.getTime())
	} else if (typeof input === 'number') {
		//TODO: do something with performance.now something
		return millisToHr(input)
	} else {
		throw new Error('No valid time')
	}
}

export class SpanImpl implements Span, ReadableSpan {
	name: string
	private readonly _spanContext: SpanContext
	private readonly onEnd: OnSpanEnd
	readonly parentSpanId?: string
	readonly kind: SpanKind
	readonly attributes: Attributes
	status: SpanStatus = {
		code: SpanStatusCode.UNSET,
	}
	endTime: HrTime = [0, 0]
	private _duration: HrTime = [0, 0]
	readonly startTime: HrTime
	readonly events: TimedEvent[] = []
	readonly links: Link[]
	readonly resource: IResource
	instrumentationLibrary: InstrumentationLibrary = { name: '@microlabs/otel-cf-workers' }
	private _ended: boolean = false
	private _droppedAttributesCount: number = 0
	private _droppedEventsCount: number = 0
	private _droppedLinksCount: number = 0

	constructor(init: SpanInit) {
		this.name = init.name
		this._spanContext = init.spanContext
		this.parentSpanId = init.parentSpanId
		this.kind = init.spanKind || SpanKind.INTERNAL
		this.attributes = sanitizeAttributes(init.attributes)
		this.startTime = getHrTime(init.startTime)
		this.links = init.links || []
		this.resource = init.resource
		this.onEnd = init.onEnd
	}

	spanContext(): SpanContext {
		return this._spanContext
	}

	setAttribute(key: string, value?: AttributeValue): this {
		if (isAttributeKey(key) && isAttributeValue(value)) {
			this.attributes[key] = value
		}
		return this
	}

	setAttributes(attributes: Attributes): this {
		for (const [key, value] of Object.entries(attributes)) {
			this.setAttribute(key, value)
		}
		return this
	}

	addEvent(name: string, attributesOrStartTime?: Attributes | TimeInput, startTime?: TimeInput): this {
		if (isTimeInput(attributesOrStartTime)) {
			startTime = attributesOrStartTime
			attributesOrStartTime = undefined
		}

		const attributes = sanitizeAttributes(attributesOrStartTime)
		const time = getHrTime(startTime)
		this.events.push({ name, attributes, time })
		return this
	}

	setStatus(status: SpanStatus): this {
		this.status = status
		return this
	}

	updateName(name: string): this {
		this.name = name
		return this
	}

	end(endTime?: TimeInput): void {
		if (this._ended) {
			return
		}
		this._ended = true
		this.endTime = getHrTime(endTime)
		this._duration = hrTimeDuration(this.startTime, this.endTime)
		this.onEnd(this)
	}

	isRecording(): boolean {
		return !this._ended
	}

	recordException(exception: Exception, time?: TimeInput): void {
		const attributes = transformExceptionAttributes(exception)
		this.addEvent('exception', attributes, time)
	}

	get duration(): HrTime {
		return this._duration
	}

	get ended(): boolean {
		return this._ended
	}

	get droppedAttributesCount(): number {
		return this._droppedAttributesCount
	}

	get droppedEventsCount(): number {
		return this._droppedEventsCount
	}

	get droppedLinksCount(): number {
		return this._droppedLinksCount
	}
}
