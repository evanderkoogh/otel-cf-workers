import { createExportTraceServiceRequest } from '@opentelemetry/otlp-transformer';
import { OTLPExporterError } from '@opentelemetry/otlp-exporter-base';
import { ExportResultCode } from '@opentelemetry/core';
import { unwrap } from './wrap.js';
const defaultHeaders = {
    accept: 'application/json',
    'content-type': 'application/json',
};
export class OTLPExporter {
    headers;
    url;
    constructor(config) {
        this.url = config.url;
        this.headers = Object.assign({}, defaultHeaders, config.headers);
    }
    export(items, resultCallback) {
        this._export(items)
            .then(() => {
            resultCallback({ code: ExportResultCode.SUCCESS });
        })
            .catch((error) => {
            resultCallback({ code: ExportResultCode.FAILED, error });
        });
    }
    _export(items) {
        return new Promise((resolve, reject) => {
            try {
                this.send(items, resolve, reject);
            }
            catch (e) {
                reject(e);
            }
        });
    }
    send(items, onSuccess, onError) {
        const exportMessage = createExportTraceServiceRequest(items, {
            useHex: true,
            useLongBits: false,
        });
        const body = JSON.stringify(exportMessage);
        const params = {
            method: 'POST',
            headers: this.headers,
            body,
        };
        unwrap(fetch)(this.url, params)
            .then((response) => {
            if (response.ok) {
                onSuccess();
            }
            else {
                onError(new OTLPExporterError(`Exporter received a statusCode: ${response.status}`));
            }
        })
            .catch((error) => {
            onError(new OTLPExporterError(`Exception during export: ${error.toString()}`, error.code, error.stack));
        });
    }
    async shutdown() { }
}
//# sourceMappingURL=exporter.js.map