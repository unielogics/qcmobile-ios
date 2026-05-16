// Mock layer for backend endpoints that haven't shipped yet.
// Each module exports a stable shape so the UI can render without
// 404 noise. Flip on the matching EXPO_PUBLIC_BACKEND_HAS_* flag
// (see featureFlags.ts) and the real fetcher takes over.

export * from "./fundingMetrics";
export * from "./dealSecretary";
export * from "./conditions";
export * from "./hudLines";
export * from "./lenderThread";
export * from "./experienceMode";
export * from "./parsedCredit";
export * from "./aiQuestions";
export * from "./loanChat";
export * from "./loanCriteria";
