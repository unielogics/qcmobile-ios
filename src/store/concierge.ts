// Global AI-Concierge launcher. The concierge (AIChatSheet) used to be
// per-screen local state; this store lets the TopBar icon open one
// shared sheet mounted once at the authenticated root.
import { create } from "zustand";

interface ConciergeStore {
  open: boolean;
  openConcierge: () => void;
  closeConcierge: () => void;
}

export const useConcierge = create<ConciergeStore>((set) => ({
  open: false,
  openConcierge: () => set({ open: true }),
  closeConcierge: () => set({ open: false }),
}));
