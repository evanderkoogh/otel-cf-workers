import { SpanContext, Link, SpanKind, TimeInput, Exception, Attributes, HrTime, Span, SpanStatus, AttributeValue } from '@opentelemetry/api';
import { InstrumentationLibrary } from '@opentelemetry/core';
import { IResource } from '@opentelemetry/resources';
import { ReadableSpan, TimedEvent } from '@opentelemetry/sdk-trace-base';
type OnSpanEnd = (span: Span) => void;
interface SpanInit {
    attributes: unknown;
    name: string;
    onEnd: OnSpanEnd;
    resource: IResource;
    spanContext: SpanContext;
    links?: Link[];
    parentSpanId?: string;
    spanKind?: SpanKind;
    startTime?: TimeInput;
}
export declare class SpanImpl implements Span, ReadableSpan {
    name: string;
    private readonly _spanContext;
    private readonly onEnd;
    readonly parentSpanId?: string;
    readonly kind: SpanKind;
    readonly attributes: Attributes;
    status: SpanStatus;
    endTime: HrTime;
    private _duration;
    readonly startTime: HrTime;
    readonly events: TimedEvent[];
    readonly links: Link[];
    readonly resource: IResource;
    instrumentationLibrary: InstrumentationLibrary;
    private _ended;
    private _droppedAttributesCount;
    private _droppedEventsCount;
    private _droppedLinksCount;
    constructor(init: SpanInit);
    addLink(link: Link): this;
    addLinks(links: Link[]): this;
    spanContext(): SpanContext;
    setAttribute(key: string, value?: AttributeValue): this;
    setAttributes(attributes: Attributes): this;
    addEvent(name: string, attributesOrStartTime?: Attributes | TimeInput, startTime?: TimeInput): this;
    setStatus(status: SpanStatus): this;
    updateName(name: string): this;
    end(endTime?: TimeInput): void;
    isRecording(): boolean;
    recordException(exception: Exception, time?: TimeInput): void;
    get duration(): HrTime;
    get ended(): boolean;
    get droppedAttributesCount(): number;
    get droppedEventsCount(): number;
    get droppedLinksCount(): number;
}
export {};
//# sourceMappingURL=span.d.ts.map