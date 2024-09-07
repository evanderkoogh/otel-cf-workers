"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SpanImpl = void 0;
const api_1 = require("@opentelemetry/api");
const core_1 = require("@opentelemetry/core");
const semantic_conventions_1 = require("@opentelemetry/semantic-conventions");
function transformExceptionAttributes(exception) {
    const attributes = {};
    if (typeof exception === 'string') {
        attributes[semantic_conventions_1.SemanticAttributes.EXCEPTION_MESSAGE] = exception;
    }
    else {
        if (exception.code) {
            attributes[semantic_conventions_1.SemanticAttributes.EXCEPTION_TYPE] = exception.code.toString();
        }
        else if (exception.name) {
            attributes[semantic_conventions_1.SemanticAttributes.EXCEPTION_TYPE] = exception.name;
        }
        if (exception.message) {
            attributes[semantic_conventions_1.SemanticAttributes.EXCEPTION_MESSAGE] = exception.message;
        }
        if (exception.stack) {
            attributes[semantic_conventions_1.SemanticAttributes.EXCEPTION_STACKTRACE] = exception.stack;
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
class SpanImpl {
    constructor(init) {
        this.status = {
            code: api_1.SpanStatusCode.UNSET,
        };
        this.endTime = [0, 0];
        this._duration = [0, 0];
        this.events = [];
        this.instrumentationLibrary = { name: '@microlabs/otel-cf-workers' };
        this._ended = false;
        this._droppedAttributesCount = 0;
        this._droppedEventsCount = 0;
        this._droppedLinksCount = 0;
        this.name = init.name;
        this._spanContext = init.spanContext;
        this.parentSpanId = init.parentSpanId;
        this.kind = init.spanKind || api_1.SpanKind.INTERNAL;
        this.attributes = (0, core_1.sanitizeAttributes)(init.attributes);
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
        if ((0, core_1.isAttributeKey)(key) && (0, core_1.isAttributeValue)(value)) {
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
        if ((0, core_1.isTimeInput)(attributesOrStartTime)) {
            startTime = attributesOrStartTime;
            attributesOrStartTime = undefined;
        }
        const attributes = (0, core_1.sanitizeAttributes)(attributesOrStartTime);
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
        this._duration = (0, core_1.hrTimeDuration)(this.startTime, this.endTime);
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
exports.SpanImpl = SpanImpl;
//# sourceMappingURL=span.js.map