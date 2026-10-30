import { isLocalePreference, type LocalePreference } from '@browseros/i18n/core'
import { useLocale } from '@browseros/i18n/react'
import { Languages } from 'lucide-react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

const localeOptions: Array<{
  value: LocalePreference
  key: 'locale.system' | 'locale.en' | 'locale.zhCN'
}> = [
  { value: 'system', key: 'locale.system' },
  { value: 'en', key: 'locale.en' },
  { value: 'zh-CN', key: 'locale.zhCN' },
]

export interface SidebarLocaleToggleProps {
  expanded?: boolean
}

/** Sidebar-footer language preference control. */
export function SidebarLocaleToggle({
  expanded = false,
}: SidebarLocaleToggleProps) {
  const { preference, setPreference, t } = useLocale()
  const [saving, setSaving] = useState(false)
  const current =
    localeOptions.find((option) => option.value === preference) ??
    localeOptions[0]
  const currentLabel = t(current.key)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const trigger = (
    <DropdownMenuTrigger
      ref={triggerRef}
      disabled={saving}
      aria-busy={saving}
      aria-label={t('locale.current', { locale: currentLabel })}
      className="flex h-9 w-full items-center gap-3 overflow-hidden whitespace-nowrap rounded-md px-2.5 font-medium text-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground aria-expanded:bg-sidebar-accent aria-expanded:text-sidebar-accent-foreground"
    >
      <Languages className="size-5 shrink-0" />
      <span
        className={cn(
          'truncate transition-opacity duration-200',
          expanded ? 'opacity-100' : 'opacity-0',
        )}
      >
        {currentLabel}
      </span>
    </DropdownMenuTrigger>
  )

  return (
    <DropdownMenu modal={false}>
      <Tooltip>
        <TooltipTrigger render={trigger} />
        {expanded ? null : (
          <TooltipContent side="right">{t('locale.label')}</TooltipContent>
        )}
      </Tooltip>
      <DropdownMenuContent
        anchor={() => triggerRef.current}
        side={expanded ? 'top' : 'right'}
        align={expanded ? 'start' : 'end'}
        sideOffset={8}
      >
        <DropdownMenuRadioGroup
          value={preference}
          onValueChange={(value) => {
            if (!isLocalePreference(value)) return
            setSaving(true)
            void setPreference(value)
              .catch(() =>
                toast.error(
                  t(
                    'Could not save the language preference. Please try again.',
                  ),
                ),
              )
              .finally(() => setSaving(false))
          }}
        >
          {localeOptions.map(({ value, key }) => (
            <DropdownMenuRadioItem key={value} value={value}>
              {t(key)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
