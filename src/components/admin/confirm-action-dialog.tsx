'use client'

import { useRef } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface ConfirmActionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel: string
  confirmingLabel: string
  tone: 'default' | 'destructive'
  confirming: boolean
  /** Shown inside the dialog, so a refused action can be read, retried or cancelled without the dialog vanishing. */
  error: string
  /** Where focus goes on close: the button that opened it. The menu item that was clicked no longer exists by then. */
  returnFocusId: string
  onConfirm: () => void
}

// A named, plain-language replacement for the browser's confirm() pop-up.
// Cancel is focused first, so pressing Enter by reflex never carries out the action.
export default function ConfirmActionDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  confirmingLabel,
  tone,
  confirming,
  error,
  returnFocusId,
  onConfirm,
}: ConfirmActionDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null)

  return (
    <Dialog
      open={open}
      // While the request is running, Escape or a click outside must not hide the result.
      onOpenChange={(next) => {
        if (!confirming) onOpenChange(next)
      }}
    >
      <DialogContent initialFocus={cancelRef} finalFocus={() => document.getElementById(returnFocusId)}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <DialogFooter>
          <Button ref={cancelRef} variant="outline" disabled={confirming} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            // The app's soft red button is 4:1 on its tint; a solid red with white text is 4.8:1.
            className={tone === 'destructive' ? 'bg-destructive text-white hover:bg-destructive/90' : undefined}
            disabled={confirming}
            onClick={onConfirm}
          >
            {confirming ? confirmingLabel : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
