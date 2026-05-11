export type Finding = {
  id: string;
  ruleId: string;
  category: string;
  severity: string;
  status: string;
  title: string;
  summary: string;
  impact?: string;
  fix?: { platformSpecific?: Record<string, string>; estimatedEffort?: string };
};

export type CapturedEvent = {
  name: string;
  tid: string;
  transport: string;
  params: Record<string, unknown>;
  items: Record<string, unknown>[];
};

export type DetectedPlatformData = {
  name: string;
  category: "cdp" | "analytics" | "ads" | "pixel" | "tag_manager";
  requestCount: number;
  sampleUrls: string[];
  detectedEvents: string[];
};

export type AiAnalysisData = {
  summary: string;
  ga4Present: boolean;
  insights: { category: "observation" | "issue" | "recommendation"; text: string }[];
  tokensUsed: number;
  inputTokens?: number;
  outputTokens?: number;
  estimatedCostUsd?: number;
};

export type FunnelStepLogData = {
  step: number;
  name: string;
  instruction: string;
  observation?: string;
  urlBefore: string;
  urlAfter: string;
  success: boolean;
  error?: string;
  eventsCaptureDuringStep: number;
  timestamp: string;
  durationMs: number;
};

export const CATEGORY_LABELS: Record<string, { label: string; maxScore: number }> = {
  implementation_coverage: { label: "Implementation Coverage", maxScore: 35 },
  data_quality: { label: "Data Quality", maxScore: 35 },
  platform_infrastructure: { label: "Platform & Infrastructure", maxScore: 30 },
};
