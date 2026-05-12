export * from "./types.js";
export * from "./rules/index.js";
export { parseGa4Request, isGa4Endpoint } from "./ga4-parser.js";
export type { ParsedGa4Event } from "./ga4-parser.js";
export {
  GA4_ECOMMERCE_EVENTS,
  FUNNEL_EVENTS,
  ECOMMERCE_EVENT_NAMES,
  isEcommerceEvent,
  getEventDef,
} from "./ga4-events.js";
export type { EcommerceEventDef, TriggerType } from "./ga4-events.js";
export { classifyPage, extractPageSignalsScript } from "./page-classifier.js";
export type { PageType, PageClassification, PageSignals } from "./page-classifier.js";
export { detectPlatform, extractPlatformSignalsScript } from "./platform-detector.js";
export type { PlatformResult, PlatformSignals } from "./platform-detector.js";
export { assembleAuditDocument } from "./assembler.js";
export type { RawAuditCapture } from "./assembler.js";
export { detectAnalyticsPlatforms } from "./analytics-detector.js";
export type { DetectedPlatform } from "./analytics-detector.js";
