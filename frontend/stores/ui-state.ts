import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UIState {
    isSidebarOpen: boolean; // For mobile
    isSidebarCollapsed: boolean; // For desktop
    activeModal: string | null;
    toggleSidebar: () => void;
    toggleSidebarCollapse: () => void;
    setSidebarOpen: (isOpen: boolean) => void;
    setActiveModal: (modalId: string | null) => void;
}

export const useUIStore = create<UIState>()(
    persist(
        (set) => ({
            isSidebarOpen: true,
            isSidebarCollapsed: false,
            activeModal: null,
            toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
            toggleSidebarCollapse: () => set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed })),
            setSidebarOpen: (isOpen) => set({ isSidebarOpen: isOpen }),
            setActiveModal: (modalId) => set({ activeModal: modalId }),
        }),
        {
            name: 'ui-state-storage',
            partialize: (state) => ({ isSidebarCollapsed: state.isSidebarCollapsed }),
        }
    )
);
