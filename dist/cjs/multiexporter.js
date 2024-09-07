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
exports.MultiSpanExporterAsync = exports.MultiSpanExporter = void 0;
const core_1 = require("@opentelemetry/core");
// First implementation, completely synchronous, more tested.
class MultiSpanExporter {
    constructor(exporters) {
        this.exporters = exporters;
    }
    export(items, resultCallback) {
        for (const exporter of this.exporters) {
            exporter.export(items, resultCallback);
        }
    }
    shutdown() {
        return __awaiter(this, void 0, void 0, function* () {
            for (const exporter of this.exporters) {
                yield exporter.shutdown();
            }
        });
    }
}
exports.MultiSpanExporter = MultiSpanExporter;
// async
class MultiSpanExporterAsync {
    constructor(exporters) {
        this.exporters = exporters;
    }
    export(items, resultCallback) {
        const promises = this.exporters.map((exporter) => new Promise((resolve) => {
            exporter.export(items, resolve);
        }));
        Promise.all(promises).then((results) => {
            const failed = results.filter((result) => result.code === core_1.ExportResultCode.FAILED);
            if (failed.length > 0) {
                // not ideal, but just return the first error
                resultCallback({ code: core_1.ExportResultCode.FAILED, error: failed[0].error });
            }
            else {
                resultCallback({ code: core_1.ExportResultCode.SUCCESS });
            }
        });
    }
    shutdown() {
        return __awaiter(this, void 0, void 0, function* () {
            yield Promise.all(this.exporters.map((exporter) => exporter.shutdown()));
        });
    }
}
exports.MultiSpanExporterAsync = MultiSpanExporterAsync;
//# sourceMappingURL=multiexporter.js.map