import { trace, SpanKind, context as api_context, SpanStatusCode } from '@opentelemetry/api';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import { setConfig } from '../config.js';
import { exportSpans, proxyExecutionContext } from './common.js';
import { instrumentEnv } from './env.js';
import { wrap } from '../wrap.js';
import { versionAttributes } from './version.js';
const traceIdSymbol = Symbol('traceId');
let cold_start = true;
export function executeScheduledHandler(scheduledFn, [controller, env, ctx]) {
    const tracer = trace.getTracer('scheduledHandler');
    const attributes = {
        [SemanticAttributes.FAAS_TRIGGER]: 'timer',
        [SemanticAttributes.FAAS_COLDSTART]: cold_start,
        [SemanticAttributes.FAAS_CRON]: controller.cron,
        [SemanticAttributes.FAAS_TIME]: new Date(controller.scheduledTime).toISOString(),
    };
    cold_start = false;
    Object.assign(attributes, versionAttributes(env));
    const options = {
        attributes,
        kind: SpanKind.SERVER,
    };
    const promise = tracer.startActiveSpan(`scheduledHandler ${controller.cron}`, options, async (span) => {
        const traceId = span.spanContext().traceId;
        api_context.active().setValue(traceIdSymbol, traceId);
        try {
            await scheduledFn(controller, env, ctx);
        }
        catch (error) {
            span.recordException(error);
            span.setStatus({ code: SpanStatusCode.ERROR });
            throw error;
        }
        finally {
            span.end();
        }
    });
    return promise;
}
export function createScheduledHandler(scheduledFn, initialiser) {
    const scheduledHandler = {
        async apply(target, _thisArg, argArray) {
            const [controller, orig_env, orig_ctx] = argArray;
            const config = initialiser(orig_env, controller);
            const env = instrumentEnv(orig_env);
            const { ctx, tracker } = proxyExecutionContext(orig_ctx);
            const context = setConfig(config);
            try {
                const args = [controller, env, ctx];
                return await api_context.with(context, executeScheduledHandler, undefined, target, args);
            }
            catch (error) {
                throw error;
            }
            finally {
                orig_ctx.waitUntil(exportSpans(tracker));
            }
        },
    };
    return wrap(scheduledFn, scheduledHandler);
}
//# sourceMappingURL=scheduled.js.map