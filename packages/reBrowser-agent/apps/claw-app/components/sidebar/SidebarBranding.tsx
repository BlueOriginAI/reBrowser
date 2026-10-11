import { cn } from '@/lib/utils'

export interface SidebarBrandingProps {
  expanded?: boolean
}

/** Remocode family coral tile and chamfered circular mark, shared by both themes. */
export function SidebarBranding({ expanded = false }: SidebarBrandingProps) {
  return (
    <div className="flex h-14 shrink-0 items-center gap-3 px-3">
      <img
        src="/branding/remocode-browser-v2/icon-master.svg"
        alt="reBrowser"
        className="size-8 shrink-0 rounded-md shadow-card"
      />
      <span
        className={cn(
          'truncate font-extrabold text-base tracking-tight transition-opacity duration-200',
          expanded ? 'opacity-100' : 'opacity-0',
        )}
      >
        reBrowser
      </span>
    </div>
  )
}
