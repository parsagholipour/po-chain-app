"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { XIcon } from "lucide-react"

function isDialogSectionChild<T extends React.ElementType>(
  child: React.ReactNode,
  component: T
): child is React.ReactElement<React.ComponentProps<T>, T> {
  return React.isValidElement(child) && child.type === component
}

function flattenDialogChildren(children: React.ReactNode): React.ReactNode[] {
  const result: React.ReactNode[] = []

  React.Children.forEach(children, (child) => {
    if (React.isValidElement(child) && child.type === React.Fragment) {
      result.push(
        ...flattenDialogChildren(
          (child.props as { children?: React.ReactNode }).children
        )
      )
      return
    }

    result.push(child)
  })

  return result
}

function isDialogFormElement(
  child: React.ReactNode
): child is React.ReactElement<React.ComponentProps<"form">, "form"> {
  return React.isValidElement(child) && child.type === "form"
}

const DialogBodyContext = React.createContext(false)

function Dialog({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({ ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 isolate z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className
      )}
      {...props}
    />
  )
}

const dialogContentVariants = cva(
  "fixed top-1/2 left-1/2 z-50 flex flex-col max-h-[calc(100dvh-2rem)] w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl bg-popover p-(--dialog-padding) text-sm text-popover-foreground ring-1 ring-foreground/10 duration-100 outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
  {
    variants: {
      size: {
        sm: "sm:max-w-sm [--dialog-padding:1rem]",
        md: "sm:max-w-md [--dialog-padding:1rem]",
        lg: "sm:max-w-lg [--dialog-padding:1rem]",
        xl: "sm:max-w-xl [--dialog-padding:1rem] sm:[--dialog-padding:1.25rem]",
        "2xl": "sm:max-w-2xl [--dialog-padding:1rem] sm:[--dialog-padding:1.5rem]",
        "3xl": "sm:max-w-3xl [--dialog-padding:1rem] sm:[--dialog-padding:1.5rem]",
        "4xl": "sm:max-w-4xl [--dialog-padding:1rem] sm:[--dialog-padding:1.5rem]",
      },
    },
    defaultVariants: {
      size: "sm",
    },
  }
)

type DialogContentProps = DialogPrimitive.Popup.Props &
  VariantProps<typeof dialogContentVariants> & {
    showCloseButton?: boolean
    disableCloseAnimation?: boolean
  }

function DialogContent({
  className,
  children,
  showCloseButton = true,
  style,
  disableCloseAnimation = false,
  size,
  ...props
}: DialogContentProps) {
  const childArray = flattenDialogChildren(children)
  let bodyStartIndex = 0

  while (
    bodyStartIndex < childArray.length &&
    isDialogSectionChild(childArray[bodyStartIndex], DialogHeader)
  ) {
    bodyStartIndex += 1
  }

  let bodyEndIndex = childArray.length

  while (
    bodyEndIndex > bodyStartIndex &&
    isDialogSectionChild(childArray[bodyEndIndex - 1], DialogFooter)
  ) {
    bodyEndIndex -= 1
  }

  const headerChildren = childArray.slice(0, bodyStartIndex)
  const bodyChildren = childArray.slice(bodyStartIndex, bodyEndIndex)
  const footerChildren = childArray.slice(bodyEndIndex)
  const formWithFooter =
    footerChildren.length === 0 &&
    bodyChildren.length === 1 &&
    isDialogFormElement(bodyChildren[0])
      ? splitDialogForm(bodyChildren[0])
      : null

  return (
    <DialogPortal>
      <DialogOverlay
        className={disableCloseAnimation ? "data-closed:animation-duration-0" : undefined}
      />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        className={cn(
          dialogContentVariants({ size }),
          disableCloseAnimation && "data-closed:animation-duration-0",
          className
        )}
        style={{ ...style, overflow: "hidden", overflowX: "hidden", overflowY: "hidden" }}
        {...props}
      >
        {headerChildren}
        {formWithFooter ? (
          <form {...formWithFooter.props} className="contents">
            <DialogBody hasHeader={headerChildren.length > 0}>
              {formWithFooter.className ? (
                <div className={formWithFooter.className}>
                  {formWithFooter.bodyChildren}
                </div>
              ) : (
                formWithFooter.bodyChildren
              )}
            </DialogBody>
            {formWithFooter.footerChildren}
          </form>
        ) : (
          <>
            {bodyChildren.length > 0 ? (
              <DialogBody
                hasHeader={headerChildren.length > 0}
                extendsToBottom={footerChildren.length === 0}
                hasFooter={footerChildren.length > 0}
              >
                {bodyChildren}
              </DialogBody>
            ) : null}
            {footerChildren}
          </>
        )}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            render={
              <Button
                variant="ghost"
                className="absolute top-[calc(var(--dialog-padding)-0.25rem)] right-[calc(var(--dialog-padding)-0.25rem)] z-20"
                size="icon-sm"
              />
            }
          >
            <XIcon
            />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Popup>
    </DialogPortal>
  )
}

function splitDialogForm(
  formElement: React.ReactElement<React.ComponentProps<"form">, "form">
) {
  const {
    children: formChildren,
    className,
    ...props
  } = formElement.props
  const childArray = flattenDialogChildren(formChildren)
  let footerStartIndex = childArray.length

  while (
    footerStartIndex > 0 &&
    isDialogSectionChild(childArray[footerStartIndex - 1], DialogFooter)
  ) {
    footerStartIndex -= 1
  }

  if (footerStartIndex === childArray.length) {
    return null
  }

  return {
    props,
    className,
    bodyChildren: childArray.slice(0, footerStartIndex),
    footerChildren: childArray.slice(footerStartIndex),
  }
}

function DialogBody({
  className,
  children,
  extendsToBottom = false,
  hasFooter = false,
  hasHeader = false,
  ...props
}: React.ComponentProps<"div"> & {
  extendsToBottom?: boolean
  hasFooter?: boolean
  hasHeader?: boolean
}) {
  return (
    <DialogBodyContext.Provider value>
      <div
        data-slot="dialog-body"
        className={cn(
          "mx-[calc(var(--dialog-padding)*-1)] min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-(--dialog-padding) [&_form>:has(+[data-slot=dialog-footer])]:pb-3",
          hasHeader && "pt-(--dialog-padding)",
          hasFooter && "pb-3",
          extendsToBottom && "mb-[calc(var(--dialog-padding)*-1)]",
          className
        )}
        {...props}
      >
        {children}
      </div>
    </DialogBodyContext.Provider>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn(
        "mx-[calc(var(--dialog-padding)*-1)] mt-[calc(var(--dialog-padding)*-1)] flex shrink-0 flex-col gap-2 border-b bg-popover px-(--dialog-padding) pt-(--dialog-padding) pb-(--dialog-padding) pr-[calc(var(--dialog-padding)+2rem)]",
        className
      )}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  const isInDialogBody = React.useContext(DialogBodyContext)

  return (
    <div
        data-slot="dialog-footer"
        className={cn(
        isInDialogBody
          ? "sticky bottom-0 z-10 mx-[calc(var(--dialog-padding)*-1)] flex shrink-0 flex-col-reverse gap-2 rounded-b-xl p-(--dialog-padding) sm:flex-row sm:justify-end"
          : "z-10 mx-[calc(var(--dialog-padding)*-1)] mb-[calc(var(--dialog-padding)*-1)] flex shrink-0 flex-col-reverse gap-2 rounded-b-xl p-(--dialog-padding) sm:flex-row sm:justify-end",
        className,
        "mt-0 border-t bg-popover"
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close render={<Button variant="outline" />}>
          Close
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(
        "font-heading text-base leading-none font-medium",
        className
      )}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogBody,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
  dialogContentVariants,
}
