import { SpanKind, trace } from '@opentelemetry/api';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import { wrap } from '../wrap.js';
const dbSystem = 'Cloudflare Analytics Engine';
const AEAttributes = {
    writeDataPoint(argArray) {
        const attrs = {};
        const opts = argArray[0];
        if (typeof opts === 'object') {
            attrs['db.cf.ae.indexes'] = opts.indexes.length;
            attrs['db.cf.ae.index'] = opts.indexes[0].toString();
            attrs['db.cf.ae.doubles'] = opts.doubles.length;
            attrs['db.cf.ae.blobs'] = opts.blobs.length;
        }
        return attrs;
    },
};
function instrumentAEFn(fn, name, operation) {
    const tracer = trace.getTracer('AnalyticsEngine');
    const fnHandler = {
        apply: (target, thisArg, argArray) => {
            const attributes = {
                binding_type: 'AnalyticsEngine',
                [SemanticAttributes.DB_NAME]: name,
                [SemanticAttributes.DB_SYSTEM]: dbSystem,
                [SemanticAttributes.DB_OPERATION]: operation,
            };
            const options = {
                kind: SpanKind.CLIENT,
                attributes,
            };
            return tracer.startActiveSpan(`Analytics Engine ${name} ${operation}`, options, async (span) => {
                const result = await Reflect.apply(target, thisArg, argArray);
                const extraAttrsFn = AEAttributes[operation];
                const extraAttrs = extraAttrsFn ? extraAttrsFn(argArray, result) : {};
                span.setAttributes(extraAttrs);
                span.setAttribute(SemanticAttributes.DB_STATEMENT, `${operation} ${argArray[0]}`);
                span.end();
                return result;
            });
        },
    };
    return wrap(fn, fnHandler);
}
export function instrumentAnalyticsEngineDataset(dataset, name) {
    const datasetHandler = {
        get: (target, prop, receiver) => {
            const operation = String(prop);
            const fn = Reflect.get(target, prop, receiver);
            return instrumentAEFn(fn, name, operation);
        },
    };
    return wrap(dataset, datasetHandler);
}
//# sourceMappingURL=analytics-engine.js.map