import { SpanKind, SpanStatusCode, } from '@opentelemetry/api';
import { hrTimeDuration, isAttributeKey, isAttributeValue, isTimeInput, sanitizeAttributes, } from '@opentelemetry/core';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
function transformExceptionAttributes(exception) {
    const attributes = {};
    if (typeof exception === 'string') {
        attributes[SemanticAttributes.EXCEPTION_MESSAGE] = exception;
    }
    else {
        if (exception.code) {
            attributes[SemanticAttributes.EXCEPTION_TYPE] = exception.code.toString();
        }
        else if (exception.name) {
            attributes[SemanticAttributes.EXCEPTION_TYPE] = exception.name;
        }
        if (exception.message) {
            attributes[SemanticAttributes.EXCEPTION_MESSAGE] = exception.message;
        }
        if (exception.stack) {
            attributes[SemanticAttributes.EXCEPTION_STACKTRACE] = exception.stack;
        }
    }
    return attributes;
}
function millisToHr(millis) {
    return [Math.trunc(millis / 1000), (millis % 1000) * 1e6];
}
function getHrTime(input) {
    const now = Date.now();
    if (!input) {
        return millisToHr(now);
    }
    else if (input instanceof Date) {
        return millisToHr(input.getTime());
    }
    else if (typeof input === 'number') {
        //TODO: do something with performance.now something
        return millisToHr(input);
    }
    else if (Array.isArray(input)) {
        return input;
    }
    const v = input;
    throw new Error(`unreachable value: ${JSON.stringify(v)}`);
}
export class SpanImpl {
    name;
    _spanContext;
    onEnd;
    parentSpanId;
    kind;
    attributes;
    status = {
        code: SpanStatusCode.UNSET,
    };
    endTime = [0, 0];
    _duration = [0, 0];
    startTime;
    events = [];
    links;
    resource;
    instrumentationLibrary = { name: '@microlabs/otel-cf-workers' };
    _ended = false;
    _droppedAttributesCount = 0;
    _droppedEventsCount = 0;
    _droppedLinksCount = 0;
    constructor(init) {
        this.name = init.name;
        this._spanContext = init.spanContext;
        this.parentSpanId = init.parentSpanId;
        this.kind = init.spanKind || SpanKind.INTERNAL;
        this.attributes = sanitizeAttributes(init.attributes);
        this.startTime = getHrTime(init.startTime);
        this.links = init.links || [];
        this.resource = init.resource;
        this.onEnd = init.onEnd;
    }
    addLink(link) {
        this.links.push(link);
        return this;
    }
    addLinks(links) {
        this.links.push(...links);
        return this;
    }
    spanContext() {
        return this._spanContext;
    }
    setAttribute(key, value) {
        if (isAttributeKey(key) && isAttributeValue(value)) {
            this.attributes[key] = value;
        }
        return this;
    }
    setAttributes(attributes) {
        for (const [key, value] of Object.entries(attributes)) {
            this.setAttribute(key, value);
        }
        return this;
    }
    addEvent(name, attributesOrStartTime, startTime) {
        if (isTimeInput(attributesOrStartTime)) {
            startTime = attributesOrStartTime;
            attributesOrStartTime = undefined;
        }
        const attributes = sanitizeAttributes(attributesOrStartTime);
        const time = getHrTime(startTime);
        this.events.push({ name, attributes, time });
        return this;
    }
    setStatus(status) {
        this.status = status;
        return this;
    }
    updateName(name) {
        this.name = name;
        return this;
    }
    end(endTime) {
        if (this._ended) {
            return;
        }
        this._ended = true;
        this.endTime = getHrTime(endTime);
        this._duration = hrTimeDuration(this.startTime, this.endTime);
        this.onEnd(this);
    }
    isRecording() {
        return !this._ended;
    }
    recordException(exception, time) {
        const attributes = transformExceptionAttributes(exception);
        this.addEvent('exception', attributes, time);
    }
    get duration() {
        return this._duration;
    }
    get ended() {
        return this._ended;
    }
    get droppedAttributesCount() {
        return this._droppedAttributesCount;
    }
    get droppedEventsCount() {
        return this._droppedEventsCount;
    }
    get droppedLinksCount() {
        return this._droppedLinksCount;
    }
}
//# sourceMappingURL=span.js.map