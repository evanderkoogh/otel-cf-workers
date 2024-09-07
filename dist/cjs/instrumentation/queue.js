"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.executeQueueHandler = executeQueueHandler;
exports.createQueueHandler = createQueueHandler;
exports.instrumentQueueSender = instrumentQueueSender;
const api_1 = require("@opentelemetry/api");
const semantic_conventions_1 = require("@opentelemetry/semantic-conventions");
const config_js_1 = require("../config.js");
const common_js_1 = require("./common.js");
const env_js_1 = require("./env.js");
const wrap_js_1 = require("../wrap.js");
const version_js_1 = require("./version.js");
const traceIdSymbol = Symbol('traceId');
class MessageStatusCount {
    constructor(total) {
        this.succeeded = 0;
        this.failed = 0;
        this.total = total;
    }
    ack() {
        this.succeeded = this.succeeded + 1;
    }
    ackRemaining() {
        this.succeeded = this.total - this.failed;
    }
    retry() {
        this.failed = this.failed + 1;
    }
    retryRemaining() {
        this.failed = this.total - this.succeeded;
    }
    toAttributes() {
        return {
            'queue.messages_count': this.total,
            'queue.messages_success': this.succeeded,
            'queue.messages_failed': this.failed,
            'queue.batch_success': this.succeeded === this.total,
        };
    }
}
const addEvent = (name, msg) => {
    var _a;
    const attrs = {};
    if (msg) {
        attrs['queue.message_id'] = msg.id;
        attrs['queue.message_timestamp'] = msg.timestamp.toISOString();
    }
    (_a = api_1.trace.getActiveSpan()) === null || _a === void 0 ? void 0 : _a.addEvent(name, attrs);
};
const proxyQueueMessage = (msg, count) => {
    const msgHandler = {
        get: (target, prop) => {
            if (prop === 'ack') {
                const ackFn = Reflect.get(target, prop);
                return new Proxy(ackFn, {
                    apply: (fnTarget) => {
                        addEvent('messageAck', msg);
                        count.ack();
                        //TODO: handle errors
                        Reflect.apply(fnTarget, msg, []);
                    },
                });
            }
            else if (prop === 'retry') {
                const retryFn = Reflect.get(target, prop);
                return new Proxy(retryFn, {
                    apply: (fnTarget) => {
                        addEvent('messageRetry', msg);
                        count.retry();
                        //TODO: handle errors
                        const result = Reflect.apply(fnTarget, msg, []);
                        return result;
                    },
                });
            }
            else {
                return Reflect.get(target, prop, msg);
            }
        },
    };
    return (0, wrap_js_1.wrap)(msg, msgHandler);
};
const proxyMessageBatch = (batch, count) => {
    const batchHandler = {
        get: (target, prop) => {
            if (prop === 'messages') {
                const messages = Reflect.get(target, prop);
                const messagesHandler = {
                    get: (target, prop) => {
                        if (typeof prop === 'string' && !isNaN(parseInt(prop))) {
                            const message = Reflect.get(target, prop);
                            return proxyQueueMessage(message, count);
                        }
                        else {
                            return Reflect.get(target, prop);
                        }
                    },
                };
                return (0, wrap_js_1.wrap)(messages, messagesHandler);
            }
            else if (prop === 'ackAll') {
                const ackFn = Reflect.get(target, prop);
                return new Proxy(ackFn, {
                    apply: (fnTarget) => {
                        addEvent('ackAll');
                        count.ackRemaining();
                        //TODO: handle errors
                        Reflect.apply(fnTarget, batch, []);
                    },
                });
            }
            else if (prop === 'retryAll') {
                const retryFn = Reflect.get(target, prop);
                return new Proxy(retryFn, {
                    apply: (fnTarget) => {
                        addEvent('retryAll');
                        count.retryRemaining();
                        //TODO: handle errors
                        Reflect.apply(fnTarget, batch, []);
                    },
                });
            }
            return Reflect.get(target, prop);
        },
    };
    return (0, wrap_js_1.wrap)(batch, batchHandler);
};
function executeQueueHandler(queueFn, [batch, env, ctx]) {
    const count = new MessageStatusCount(batch.messages.length);
    batch = proxyMessageBatch(batch, count);
    const tracer = api_1.trace.getTracer('queueHandler');
    const options = {
        attributes: {
            [semantic_conventions_1.SemanticAttributes.FAAS_TRIGGER]: 'pubsub',
            'queue.name': batch.queue,
        },
        kind: api_1.SpanKind.CONSUMER,
    };
    Object.assign(options.attributes, (0, version_js_1.versionAttributes)(env));
    const promise = tracer.startActiveSpan(`queueHandler ${batch.queue}`, options, (span) => __awaiter(this, void 0, void 0, function* () {
        const traceId = span.spanContext().traceId;
        api_1.context.active().setValue(traceIdSymbol, traceId);
        try {
            const result = yield queueFn(batch, env, ctx);
            span.setAttribute('queue.implicitly_acked', count.total - count.succeeded - count.failed);
            count.ackRemaining();
            span.setAttributes(count.toAttributes());
            span.end();
            return result;
        }
        catch (error) {
            span.recordException(error);
            span.setAttribute('queue.implicitly_retried', count.total - count.succeeded - count.failed);
            count.retryRemaining();
            span.end();
            throw error;
        }
    }));
    return promise;
}
function createQueueHandler(queueFn, initialiser) {
    const queueHandler = {
        apply(target, _thisArg, argArray) {
            return __awaiter(this, void 0, void 0, function* () {
                const [batch, orig_env, orig_ctx] = argArray;
                const config = initialiser(orig_env, batch);
                const env = (0, env_js_1.instrumentEnv)(orig_env);
                const { ctx, tracker } = (0, common_js_1.proxyExecutionContext)(orig_ctx);
                const context = (0, config_js_1.setConfig)(config);
                try {
                    const args = [batch, env, ctx];
                    return yield api_1.context.with(context, executeQueueHandler, undefined, target, args);
                }
                catch (error) {
                    throw error;
                }
                finally {
                    orig_ctx.waitUntil((0, common_js_1.exportSpans)(tracker));
                }
            });
        },
    };
    return (0, wrap_js_1.wrap)(queueFn, queueHandler);
}
function instrumentQueueSend(fn, name) {
    const tracer = api_1.trace.getTracer('queueSender');
    const handler = {
        apply: (target, thisArg, argArray) => {
            return tracer.startActiveSpan(`Queues ${name} send`, (span) => __awaiter(this, void 0, void 0, function* () {
                span.setAttribute('queue.operation', 'send');
                yield Reflect.apply(target, (0, wrap_js_1.unwrap)(thisArg), argArray);
                span.end();
            }));
        },
    };
    return (0, wrap_js_1.wrap)(fn, handler);
}
function instrumentQueueSendBatch(fn, name) {
    const tracer = api_1.trace.getTracer('queueSender');
    const handler = {
        apply: (target, thisArg, argArray) => {
            return tracer.startActiveSpan(`Queues ${name} sendBatch`, (span) => __awaiter(this, void 0, void 0, function* () {
                span.setAttribute('queue.operation', 'sendBatch');
                yield Reflect.apply(target, (0, wrap_js_1.unwrap)(thisArg), argArray);
                span.end();
            }));
        },
    };
    return (0, wrap_js_1.wrap)(fn, handler);
}
function instrumentQueueSender(queue, name) {
    const queueHandler = {
        get: (target, prop) => {
            if (prop === 'send') {
                const sendFn = Reflect.get(target, prop);
                return instrumentQueueSend(sendFn, name);
            }
            else if (prop === 'sendBatch') {
                const sendFn = Reflect.get(target, prop);
                return instrumentQueueSendBatch(sendFn, name);
            }
            else {
                return Reflect.get(target, prop);
            }
        },
    };
    return (0, wrap_js_1.wrap)(queue, queueHandler);
}
//# sourceMappingURL=queue.js.map