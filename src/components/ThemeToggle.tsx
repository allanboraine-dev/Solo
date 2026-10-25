"use client"

import * as React from "react"
import { Moon, Sun } from "lucide-react"
import { useTheme } from "@/components/ThemeProvider"

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme, portal } = useTheme()
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return <div className={`w-11 h-11 p-2.5 rounded-xl ${className || ""}`} />
  }

  const isDark = resolvedTheme === "dark"

  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className={`min-w-[44px] min-h-[44px] p-2.5 rounded-xl hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors flex items-center justify-center text-gray-700 dark:text-gray-200 active:scale-95 touch-manipulation ${className || ""}`}
      aria-label={`Toggle night mode (${portal})`}
      title={isDark ? `Night mode is ON (${portal}) — Click for Day mode` : `Night mode is OFF (${portal}) — Click for Night mode`}
    >
      {isDark ? (
        <Sun className="h-5 w-5 sm:h-6 sm:w-6 text-amber-400 rotate-0 scale-100 transition-all hover:rotate-45" />
      ) : (
        <Moon className="h-5 w-5 sm:h-6 sm:w-6 text-blue-600 rotate-0 scale-100 transition-all hover:-rotate-12" />
      )}
      <span className="sr-only">Toggle {portal} theme</span>
    </button>
  )
}

