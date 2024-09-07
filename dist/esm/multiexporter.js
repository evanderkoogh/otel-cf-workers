import { ExportResultCode } from '@opentelemetry/core';
// First implementation, completely synchronous, more tested.
export class MultiSpanExporter {
    exporters;
    constructor(exporters) {
        this.exporters = exporters;
    }
    export(items, resultCallback) {
        for (const exporter of this.exporters) {
            exporter.export(items, resultCallback);
        }
    }
    async shutdown() {
        for (const exporter of this.exporters) {
            await exporter.shutdown();
        }
    }
}
// async
export class MultiSpanExporterAsync {
    exporters;
    constructor(exporters) {
        this.exporters = exporters;
    }
    export(items, resultCallback) {
        const promises = this.exporters.map((exporter) => new Promise((resolve) => {
            exporter.export(items, resolve);
        }));
        Promise.all(promises).then((results) => {
            const failed = results.filter((result) => result.code === ExportResultCode.FAILED);
            if (failed.length > 0) {
                // not ideal, but just return the first error
                resultCallback({ code: ExportResultCode.FAILED, error: failed[0].error });
            }
            else {
                resultCallback({ code: ExportResultCode.SUCCESS });
            }
        });
    }
    async shutdown() {
        await Promise.all(this.exporters.map((exporter) => exporter.shutdown()));
    }
}
//# sourceMappingURL=multiexporter.js.map