import { create } from 'zustand'

type CombineMode = 'and' | 'or'

interface FilterState {
  query: string
  activeTags: string[]
  activeGroups: string[]
  combine: CombineMode

  setQuery: (q: string) => void
  toggleTag: (tag: string, additive: boolean) => void
  clearTags: () => void
  toggleGroup: (group: string, additive: boolean) => void
  clearGroups: () => void
  setCombine: (m: CombineMode) => void
}

/** Active sidebar filter — search box + chip selection.
 *  Lives outside react state so it survives component remounts during
 *  layout changes (resize, copilot toggle). */
export const useFilter = create<FilterState>((set) => ({
  query: '',
  activeTags: [],
  activeGroups: [],
  combine: 'and',

  setQuery: (q) => set({ query: q }),

  toggleTag: (tag, additive) =>
    set((s) => {
      const t = tag.toLowerCase()
      if (!additive) {
        // single-select: clicking same tag clears, otherwise replace
        return { activeTags: s.activeTags.includes(t) && s.activeTags.length === 1 ? [] : [t] }
      }
      return {
        activeTags: s.activeTags.includes(t)
          ? s.activeTags.filter((x) => x !== t)
          : [...s.activeTags, t]
      }
    }),

  clearTags: () => set({ activeTags: [] }),

  toggleGroup: (group, additive) =>
    set((s) => {
      const g = group
      if (!additive) {
        return {
          activeGroups: s.activeGroups.includes(g) && s.activeGroups.length === 1 ? [] : [g]
        }
      }
      return {
        activeGroups: s.activeGroups.includes(g)
          ? s.activeGroups.filter((x) => x !== g)
          : [...s.activeGroups, g]
      }
    }),

  clearGroups: () => set({ activeGroups: [] }),
  setCombine: (m) => set({ combine: m })
}))
