import { create } from 'zustand';

interface RealtimeState {
    isConnected: boolean;
    setConnected: (connected: boolean) => void;
}

export const useRealtimeStore = create<RealtimeState>((set) => ({
    isConnected: false,
    setConnected: (isConnected) => set({ isConnected }),
}));
