import { SpanExporter } from '@opentelemetry/sdk-trace-base';
import { ExportResult } from '@opentelemetry/core';
export declare class MultiSpanExporter implements SpanExporter {
    private exporters;
    constructor(exporters: Array<SpanExporter>);
    export(items: any[], resultCallback: (result: ExportResult) => void): void;
    shutdown(): Promise<void>;
}
export declare class MultiSpanExporterAsync implements SpanExporter {
    private exporters;
    constructor(exporters: Array<SpanExporter>);
    export(items: any[], resultCallback: (result: ExportResult) => void): void;
    shutdown(): Promise<void>;
}
//# sourceMappingURL=multiexporter.d.ts.map