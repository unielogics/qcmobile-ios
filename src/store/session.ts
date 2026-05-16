// Until Clerk keys are wired, dev mode acts as the seeded borrower (Marcus).
import { create } from "zustand";

interface SessionStore {
  devUser: string;
  setDevUser: (email: string) => void;
}

export const useSession = create<SessionStore>((set) => ({
  devUser: "marcus@qc.dev",
  setDevUser: (email) => set({ devUser: email }),
}));
