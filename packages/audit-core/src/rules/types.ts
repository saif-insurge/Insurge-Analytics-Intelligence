import type { AuditDocument, Finding } from "../types.js";

/** A single audit rule — pure function that evaluates an audit and returns findings. */
export type Rule = {
  id: string;
  category: Finding["category"];
  description: string;
  evaluate: (audit: AuditDocument) => Finding[];
};
