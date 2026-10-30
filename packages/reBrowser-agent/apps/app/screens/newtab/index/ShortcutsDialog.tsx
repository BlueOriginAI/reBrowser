import { useLocale } from '@browseros/i18n/react'
import { LocalizedDialogContent as DialogContent } from '@/components/i18n/LocalizedDialogContent'
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Kbd, KbdGroup } from '@/components/ui/kbd'
import { SHORTCUTS_LIST } from '@/lib/constants/shortcuts'
import { useIsMac } from '@/lib/useIsMac'

export interface ShortcutsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export const ShortcutsDialog = ({
  open,
  onOpenChange,
}: ShortcutsDialogProps) => {
  const { t } = useLocale()

  const isMac = useIsMac()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="styled-scrollbar max-h-[80vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-semibold text-2xl">
            {t('Keyboard Shortcuts')}
          </DialogTitle>
          <DialogDescription>
            {t('Use these shortcuts to navigate BrowserOS faster')}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-8">
          <div className="space-y-1">
            {SHORTCUTS_LIST.map((shortcut, index) => (
              <div
                key={index.toString()}
                className="group flex items-center justify-between rounded-md px-2 py-3 transition-colors hover:bg-accent/30"
              >
                <span className="text-foreground text-sm group-hover:text-foreground/90">
                  {t(shortcut.description)}
                </span>
                <div className="flex items-center gap-1.5">
                  <KbdGroup>
                    <Kbd>
                      {isMac
                        ? shortcut.modifier.mac
                        : shortcut.modifier.windows}
                    </Kbd>
                    <span>+</span>
                    <Kbd>{shortcut.key}</Kbd>
                  </KbdGroup>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-8 border-border/50 border-t pt-4 text-center text-muted-foreground text-xs">
          {t('More shortcuts coming soon')}
        </div>
      </DialogContent>
    </Dialog>
  )
}
