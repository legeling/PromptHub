import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type ViewMode = 'prompt' | 'skill';

interface UIState {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  // Side bar collapsed state
  isSidebarCollapsed: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      viewMode: 'prompt',
      setViewMode: (mode) => set({ viewMode: mode }),
      isSidebarCollapsed: false,
      toggleSidebar: () => set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed })),
      setSidebarCollapsed: (collapsed) => set({ isSidebarCollapsed: collapsed }),
    }),
    {
      name: 'ui-storage',
      // Only persist viewMode and sidebar state
      partialize: (state) => ({ 
        viewMode: state.viewMode,
        isSidebarCollapsed: state.isSidebarCollapsed 
      }),
    }
  )
);
