import { bkashGateway } from "./adapters/bkash";
import { nagadGateway } from "./adapters/nagad";
import { sslcommerzGateway } from "./adapters/sslcommerz";
import { testGateway } from "./adapters/test-gateway";
import type { PaymentGateway } from "./types";

const ALL: PaymentGateway[] = [sslcommerzGateway, bkashGateway, nagadGateway, testGateway];

export const getGateway = (code: string) => ALL.find((gateway) => gateway.code === code);

/** Only gateways that have credentials appear at checkout. */
export const availableGateways = () => ALL.filter((gateway) => gateway.isAvailable());

/** For the admin panel: every integration and whether it is configured. */
export const gatewayStatuses = () =>
  ALL.map((g) => ({ code: g.code, label: g.label, instruments: g.instruments, isTestOnly: g.isTestOnly, available: g.isAvailable() }));
