import { OTLPExporterError } from '@opentelemetry/otlp-exporter-base';
import { ExportResult } from '@opentelemetry/core';
import { SpanExporter } from '@opentelemetry/sdk-trace-base';
export interface OTLPExporterConfig {
    url: string;
    headers?: Record<string, string>;
}
export declare class OTLPExporter implements SpanExporter {
    private headers;
    private url;
    constructor(config: OTLPExporterConfig);
    export(items: any[], resultCallback: (result: ExportResult) => void): void;
    private _export;
    send(items: any[], onSuccess: () => void, onError: (error: OTLPExporterError) => void): void;
    shutdown(): Promise<void>;
}
//# sourceMappingURL=exporter.d.ts.map