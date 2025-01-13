import { SpanKind } from '@opentelemetry/api'
import { HandlerInstrumentation, InitialSpanInfo, OrPromise } from '../types.js'
import {
	ATTR_FAAS_CRON,
	ATTR_FAAS_TIME,
	ATTR_FAAS_TRIGGER,
	FAAS_TRIGGER_VALUE_TIMER,
} from '@opentelemetry/semantic-conventions/incubating'

export const scheduledInstrumentation: HandlerInstrumentation<ScheduledController, OrPromise<void>> = {
	getInitialSpanInfo: function (controller: ScheduledController): InitialSpanInfo {
		return {
			name: `scheduledHandler ${controller.cron}`,
			options: {
				attributes: {
					[ATTR_FAAS_TRIGGER]: FAAS_TRIGGER_VALUE_TIMER,
					[ATTR_FAAS_CRON]: controller.cron,
					[ATTR_FAAS_TIME]: new Date(controller.scheduledTime).toISOString(),
				},
				kind: SpanKind.INTERNAL,
			},
		}
	},
}
