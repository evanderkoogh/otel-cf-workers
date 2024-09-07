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
exports.executeScheduledHandler = executeScheduledHandler;
exports.createScheduledHandler = createScheduledHandler;
const api_1 = require("@opentelemetry/api");
const semantic_conventions_1 = require("@opentelemetry/semantic-conventions");
const config_js_1 = require("../config.js");
const common_js_1 = require("./common.js");
const env_js_1 = require("./env.js");
const wrap_js_1 = require("../wrap.js");
const version_js_1 = require("./version.js");
const traceIdSymbol = Symbol('traceId');
let cold_start = true;
function executeScheduledHandler(scheduledFn, [controller, env, ctx]) {
    const tracer = api_1.trace.getTracer('scheduledHandler');
    const attributes = {
        [semantic_conventions_1.SemanticAttributes.FAAS_TRIGGER]: 'timer',
        [semantic_conventions_1.SemanticAttributes.FAAS_COLDSTART]: cold_start,
        [semantic_conventions_1.SemanticAttributes.FAAS_CRON]: controller.cron,
        [semantic_conventions_1.SemanticAttributes.FAAS_TIME]: new Date(controller.scheduledTime).toISOString(),
    };
    cold_start = false;
    Object.assign(attributes, (0, version_js_1.versionAttributes)(env));
    const options = {
        attributes,
        kind: api_1.SpanKind.SERVER,
    };
    const promise = tracer.startActiveSpan(`scheduledHandler ${controller.cron}`, options, (span) => __awaiter(this, void 0, void 0, function* () {
        const traceId = span.spanContext().traceId;
        api_1.context.active().setValue(traceIdSymbol, traceId);
        try {
            yield scheduledFn(controller, env, ctx);
        }
        catch (error) {
            span.recordException(error);
            span.setStatus({ code: api_1.SpanStatusCode.ERROR });
            throw error;
        }
        finally {
            span.end();
        }
    }));
    return promise;
}
function createScheduledHandler(scheduledFn, initialiser) {
    const scheduledHandler = {
        apply(target, _thisArg, argArray) {
            return __awaiter(this, void 0, void 0, function* () {
                const [controller, orig_env, orig_ctx] = argArray;
                const config = initialiser(orig_env, controller);
                const env = (0, env_js_1.instrumentEnv)(orig_env);
                const { ctx, tracker } = (0, common_js_1.proxyExecutionContext)(orig_ctx);
                const context = (0, config_js_1.setConfig)(config);
                try {
                    const args = [controller, env, ctx];
                    return yield api_1.context.with(context, executeScheduledHandler, undefined, target, args);
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
    return (0, wrap_js_1.wrap)(scheduledFn, scheduledHandler);
}
//# sourceMappingURL=scheduled.js.map