"use client"

import { useCallback, useEffect } from "react"
import { useTheme } from "@teispace/next-themes"
import { Toaster as Sonner, toast, type ToastT, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

const Toaster = ({ position = "top-right", ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()
  const toasterPosition = position as NonNullable<ToasterProps["position"]>

  const dismissToastOnClick = useCallback(
    (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof HTMLElement)) return
      if (target.closest("button")) return

      const toastEl = target.closest("[data-sonner-toast]")
      if (!(toastEl instanceof HTMLElement)) return
      if (toastEl.dataset.dismissible === "false") return

      const index = Number(toastEl.dataset.index)
      if (Number.isNaN(index)) return

      const toastPosition = `${toastEl.dataset.yPosition}-${toastEl.dataset.xPosition}`
      const matching = toast.getToasts().filter(
        (t): t is ToastT => "position" in t && (t.position ?? toasterPosition) === toastPosition,
      )
      const match = matching[index]
      if (match) toast.dismiss(match.id)
    },
    [toasterPosition],
  )

  useEffect(() => {
    document.addEventListener("click", dismissToastOnClick)
    return () => document.removeEventListener("click", dismissToastOnClick)
  }, [dismissToastOnClick])

  return (
    <Sonner
      position={toasterPosition}
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: (
          <CircleCheckIcon className="size-4" />
        ),
        info: (
          <InfoIcon className="size-4" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4" />
        ),
        error: (
          <OctagonXIcon className="size-4" />
        ),
        loading: (
          <Loader2Icon className="size-4 animate-spin" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast cursor-pointer",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
