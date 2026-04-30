import { create } from 'zustand';

interface CreditState {
    balance: number;
    isLoading: boolean;
    setBalance: (balance: number) => void;
    addCredits: (amount: number) => void;
    deductCredits: (amount: number) => void;
    setLoading: (loading: boolean) => void;
}

export const useCreditStore = create<CreditState>((set) => ({
    balance: 0,
    isLoading: false,
    setBalance: (balance) => set({ balance }),
    addCredits: (amount) => set((state) => ({ balance: state.balance + amount })),
    deductCredits: (amount) => set((state) => ({ balance: Math.max(0, state.balance - amount) })),
    setLoading: (isLoading) => set({ isLoading }),
}));
