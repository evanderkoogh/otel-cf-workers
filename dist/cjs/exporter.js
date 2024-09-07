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
exports.OTLPExporter = void 0;
const otlp_transformer_1 = require("@opentelemetry/otlp-transformer");
const otlp_exporter_base_1 = require("@opentelemetry/otlp-exporter-base");
const core_1 = require("@opentelemetry/core");
const wrap_js_1 = require("./wrap.js");
const defaultHeaders = {
    accept: 'application/json',
    'content-type': 'application/json',
};
class OTLPExporter {
    constructor(config) {
        this.url = config.url;
        this.headers = Object.assign({}, defaultHeaders, config.headers);
    }
    export(items, resultCallback) {
        this._export(items)
            .then(() => {
            resultCallback({ code: core_1.ExportResultCode.SUCCESS });
        })
            .catch((error) => {
            resultCallback({ code: core_1.ExportResultCode.FAILED, error });
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
        const exportMessage = (0, otlp_transformer_1.createExportTraceServiceRequest)(items, {
            useHex: true,
            useLongBits: false,
        });
        const body = JSON.stringify(exportMessage);
        const params = {
            method: 'POST',
            headers: this.headers,
            body,
        };
        (0, wrap_js_1.unwrap)(fetch)(this.url, params)
            .then((response) => {
            if (response.ok) {
                onSuccess();
            }
            else {
                onError(new otlp_exporter_base_1.OTLPExporterError(`Exporter received a statusCode: ${response.status}`));
            }
        })
            .catch((error) => {
            onError(new otlp_exporter_base_1.OTLPExporterError(`Exception during export: ${error.toString()}`, error.code, error.stack));
        });
    }
    shutdown() {
        return __awaiter(this, void 0, void 0, function* () { });
    }
}
exports.OTLPExporter = OTLPExporter;
//# sourceMappingURL=exporter.js.map