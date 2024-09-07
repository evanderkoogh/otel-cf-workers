import { trace, SpanKind, context as api_context } from '@opentelemetry/api';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import { setConfig } from '../config.js';
import { exportSpans, proxyExecutionContext } from './common.js';
import { instrumentEnv } from './env.js';
import { unwrap, wrap } from '../wrap.js';
import { versionAttributes } from './version.js';
const traceIdSymbol = Symbol('traceId');
class MessageStatusCount {
    succeeded = 0;
    failed = 0;
    total;
    constructor(total) {
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
    const attrs = {};
    if (msg) {
        attrs['queue.message_id'] = msg.id;
        attrs['queue.message_timestamp'] = msg.timestamp.toISOString();
    }
    trace.getActiveSpan()?.addEvent(name, attrs);
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
    return wrap(msg, msgHandler);
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
                return wrap(messages, messagesHandler);
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
    return wrap(batch, batchHandler);
};
export function executeQueueHandler(queueFn, [batch, env, ctx]) {
    const count = new MessageStatusCount(batch.messages.length);
    batch = proxyMessageBatch(batch, count);
    const tracer = trace.getTracer('queueHandler');
    const options = {
        attributes: {
            [SemanticAttributes.FAAS_TRIGGER]: 'pubsub',
            'queue.name': batch.queue,
        },
        kind: SpanKind.CONSUMER,
    };
    Object.assign(options.attributes, versionAttributes(env));
    const promise = tracer.startActiveSpan(`queueHandler ${batch.queue}`, options, async (span) => {
        const traceId = span.spanContext().traceId;
        api_context.active().setValue(traceIdSymbol, traceId);
        try {
            const result = await queueFn(batch, env, ctx);
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
    });
    return promise;
}
export function createQueueHandler(queueFn, initialiser) {
    const queueHandler = {
        async apply(target, _thisArg, argArray) {
            const [batch, orig_env, orig_ctx] = argArray;
            const config = initialiser(orig_env, batch);
            const env = instrumentEnv(orig_env);
            const { ctx, tracker } = proxyExecutionContext(orig_ctx);
            const context = setConfig(config);
            try {
                const args = [batch, env, ctx];
                return await api_context.with(context, executeQueueHandler, undefined, target, args);
            }
            catch (error) {
                throw error;
            }
            finally {
                orig_ctx.waitUntil(exportSpans(tracker));
            }
        },
    };
    return wrap(queueFn, queueHandler);
}
function instrumentQueueSend(fn, name) {
    const tracer = trace.getTracer('queueSender');
    const handler = {
        apply: (target, thisArg, argArray) => {
            return tracer.startActiveSpan(`Queues ${name} send`, async (span) => {
                span.setAttribute('queue.operation', 'send');
                await Reflect.apply(target, unwrap(thisArg), argArray);
                span.end();
            });
        },
    };
    return wrap(fn, handler);
}
function instrumentQueueSendBatch(fn, name) {
    const tracer = trace.getTracer('queueSender');
    const handler = {
        apply: (target, thisArg, argArray) => {
            return tracer.startActiveSpan(`Queues ${name} sendBatch`, async (span) => {
                span.setAttribute('queue.operation', 'sendBatch');
                await Reflect.apply(target, unwrap(thisArg), argArray);
                span.end();
            });
        },
    };
    return wrap(fn, handler);
}
export function instrumentQueueSender(queue, name) {
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
    return wrap(queue, queueHandler);
}
//# sourceMappingURL=queue.js.map