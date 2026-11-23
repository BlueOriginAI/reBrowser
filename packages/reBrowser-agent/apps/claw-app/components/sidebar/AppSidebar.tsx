import { useLocale } from '@browseros/i18n/react'
import { ScrollText } from 'lucide-react'
import { NavLink, useLocation } from 'react-router'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { SidebarBranding } from './SidebarBranding'
import { SidebarHelp } from './SidebarHelp'
import { SidebarLocaleToggle } from './SidebarLocaleToggle'
import { SidebarNavigation } from './SidebarNavigation'
import { SidebarPrivacy } from './SidebarPrivacy'
import { SidebarThemeToggle } from './SidebarThemeToggle'

export interface AppSidebarProps {
  expanded?: boolean
}

/**
 * Sidebar shell: branding, primary navigation (Home, MCP, Skills), bottom utility
 * stack (Audit log, preferences, privacy), and bottom help footer.
 */
export function AppSidebar({ expanded = false }: AppSidebarProps) {
  const { t } = useLocale()
  const location = useLocation()
  const auditActive = location.pathname.startsWith('/audit')
  const auditLabel = t('nav.audit')

  const auditLink = (
    <NavLink
      to="/audit"
      data-testid="sidebar-audit-link"
      className={cn(
        'flex h-9 items-center gap-3 overflow-hidden whitespace-nowrap rounded-lg px-2.5 font-medium text-sm transition-all hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground',
        auditActive &&
          'bg-primary/10 font-semibold text-primary hover:bg-primary/15 hover:text-primary',
      )}
    >
      <ScrollText className="size-5 shrink-0" />
      <span
        className={cn(
          'truncate transition-opacity duration-200',
          expanded ? 'opacity-100' : 'opacity-0',
        )}
      >
        {auditLabel}
      </span>
    </NavLink>
  )

  return (
    <div
      className={cn(
        'flex h-full flex-col border-border border-r bg-sidebar text-sidebar-foreground transition-all duration-200 ease-in-out',
        expanded ? 'w-64 shadow-pop' : 'w-14',
      )}
    >
      <SidebarBranding expanded={expanded} />
      <SidebarNavigation expanded={expanded} />
      <div className="space-y-0.5 border-border border-t px-2 py-2">
        {expanded ? (
          auditLink
        ) : (
          <Tooltip>
            <TooltipTrigger render={auditLink} />
            <TooltipContent side="right">{auditLabel}</TooltipContent>
          </Tooltip>
        )}
        <SidebarThemeToggle expanded={expanded} />
        <SidebarLocaleToggle expanded={expanded} />
        <SidebarPrivacy expanded={expanded} />
      </div>
      <SidebarHelp expanded={expanded} />
    </div>
  )
}
