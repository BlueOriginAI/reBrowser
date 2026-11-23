import { cn } from '@/lib/utils'
import { useRerouteState } from '@/modules/api/reroute.hooks'

export interface SidebarBrandingProps {
  expanded?: boolean
}

/** Remocode family coral tile and chamfered circular mark, shared by both themes. */
export function SidebarBranding({ expanded = false }: SidebarBrandingProps) {
  const reroute = useRerouteState()
  const isPro = reroute.data?.isPro ?? false

  return (
    <div className="flex h-14 shrink-0 items-center justify-between gap-2 px-3">
      <div className="flex min-w-0 items-center gap-3">
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
      {isPro ? (
        <span
          className={cn(
            'shrink-0 rounded-full bg-primary/15 px-2 py-0.5 font-bold text-[10px] text-primary tracking-wider transition-opacity duration-200',
            expanded ? 'opacity-100' : 'pointer-events-none opacity-0',
          )}
        >
          PRO
        </span>
      ) : null}
    </div>
  )
}
