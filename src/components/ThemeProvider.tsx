"use client"

import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from "react"
import { usePathname } from "next/navigation"

export type Theme = "light" | "dark" | "system"
export type ResolvedTheme = "light" | "dark"
export type PortalScope = "rider" | "driver" | "root"

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resolvedTheme: ResolvedTheme;
  systemTheme: ResolvedTheme;
  themes: string[];
  portal: PortalScope;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

const RIDER_STORAGE_KEY = "solo_rider_theme"
const DRIVER_STORAGE_KEY = "solo_driver_theme"
const ROOT_STORAGE_KEY = "solo_theme"

function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "light"
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

function getStorageKeyForPath(pathname: string | null): { key: string; portal: PortalScope; defaultTheme: Theme } {
  if (pathname?.startsWith("/driver")) {
    return { key: DRIVER_STORAGE_KEY, portal: "driver", defaultTheme: "dark" }
  }
  if (pathname?.startsWith("/rider")) {
    return { key: RIDER_STORAGE_KEY, portal: "rider", defaultTheme: "light" }
  }
  return { key: ROOT_STORAGE_KEY, portal: "root", defaultTheme: "system" }
}

function applyThemeToDom(resolved: ResolvedTheme) {
  if (typeof document === "undefined") return
  const root = document.documentElement
  if (resolved === "dark") {
    root.classList.add("dark")
  } else {
    root.classList.remove("dark")
  }
  root.style.colorScheme = resolved
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { key: storageKey, portal, defaultTheme } = useMemo(
    () => getStorageKeyForPath(pathname),
    [pathname]
  )

  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>("light")
  const [theme, setThemeState] = useState<Theme>(defaultTheme)
  const [mounted, setMounted] = useState(false)

  // Listen for system OS dark/light mode changes
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)")
    const updateSystem = () => setSystemTheme(media.matches ? "dark" : "light")
    updateSystem()
    media.addEventListener("change", updateSystem)
    return () => media.removeEventListener("change", updateSystem)
  }, [])

  // Sync theme when switching between Rider and Driver portals or on initial mount
  useEffect(() => {
    setMounted(true)
    try {
      const stored = localStorage.getItem(storageKey) as Theme | null
      const currentTheme = stored || defaultTheme
      setThemeState(currentTheme)

      const resolved = currentTheme === "system" ? getSystemTheme() : currentTheme
      applyThemeToDom(resolved)
    } catch {
      applyThemeToDom(defaultTheme === "system" ? getSystemTheme() : defaultTheme)
    }
  }, [storageKey, defaultTheme])

  // Resolve active theme (light or dark)
  const resolvedTheme: ResolvedTheme = useMemo(() => {
    if (theme === "system") {
      return mounted ? systemTheme : "light"
    }
    return theme === "dark" ? "dark" : "light"
  }, [theme, systemTheme, mounted])

  // Apply to DOM whenever resolvedTheme changes
  useEffect(() => {
    if (mounted) {
      applyThemeToDom(resolvedTheme)
    }
  }, [resolvedTheme, mounted])

  // Setter function that writes strictly to the active portal's independent storage key
  const setTheme = useCallback(
    (newTheme: Theme) => {
      setThemeState(newTheme)
      try {
        localStorage.setItem(storageKey, newTheme)
        window.dispatchEvent(
          new CustomEvent("solo_portal_theme_change", {
            detail: { portal, storageKey, theme: newTheme },
          })
        )
      } catch (err) {
        console.error("Failed to persist portal theme:", err)
      }
    },
    [storageKey, portal]
  )

  // Cross-tab synchronization strictly scoped to the same portal key
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === storageKey && e.newValue) {
        const next = e.newValue as Theme
        setThemeState(next)
      }
    }

    const handleCustomChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ portal: PortalScope; storageKey: string; theme: Theme }>
      if (customEvent.detail?.storageKey === storageKey) {
        setThemeState(customEvent.detail.theme)
      }
    }

    window.addEventListener("storage", handleStorage)
    window.addEventListener("solo_portal_theme_change", handleCustomChange)
    return () => {
      window.removeEventListener("storage", handleStorage)
      window.removeEventListener("solo_portal_theme_change", handleCustomChange)
    }
  }, [storageKey])

  const contextValue = useMemo(
    () => ({
      theme,
      setTheme,
      resolvedTheme,
      systemTheme,
      themes: ["light", "dark", "system"],
      portal,
    }),
    [theme, setTheme, resolvedTheme, systemTheme, portal]
  )

  return <ThemeContext.Provider value={contextValue}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextType {
  const context = useContext(ThemeContext)
  if (!context) {
    // Graceful fallback if called outside provider
    return {
      theme: "system",
      setTheme: () => {},
      resolvedTheme: "light",
      systemTheme: "light",
      themes: ["light", "dark", "system"],
      portal: "root",
    }
  }
  return context
}
