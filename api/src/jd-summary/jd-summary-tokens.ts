import type { JdLogger } from './jd-summary-log';

export const JD_PUBLICATION_ACCESS = Symbol('JD_PUBLICATION_ACCESS');
export const JD_SUMMARY_OPTIONS = Symbol('JD_SUMMARY_OPTIONS');
export interface JdSummaryOptions { clock: () => Date; logger: JdLogger }
