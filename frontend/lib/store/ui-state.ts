import { create } from 'zustand';

interface UIState {
    isSidebarOpen: boolean;
    activeModal: string | null;
    toggleSidebar: () => void;
    setSidebarOpen: (isOpen: boolean) => void;
    setActiveModal: (modalId: string | null) => void;
}

export const useUIStore = create<UIState>((set) => ({
    isSidebarOpen: true,
    activeModal: null,
    toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
    setSidebarOpen: (isOpen) => set({ isSidebarOpen: isOpen }),
    setActiveModal: (modalId) => set({ activeModal: modalId }),
}));
