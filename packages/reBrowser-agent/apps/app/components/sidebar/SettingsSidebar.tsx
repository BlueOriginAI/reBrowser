import { useLocale } from '@browseros/i18n/react'
import {
  Activity,
  ArrowLeft,
  BookOpen,
  Bot,
  Compass,
  MessageSquare,
  Palette,
  Server,
} from 'lucide-react'
import type { FC } from 'react'
import { NavLink } from 'react-router'
import { ThemeToggle } from '@/components/elements/theme-toggle'
import type { Feature } from '@/lib/browseros/capabilities'
import { cn } from '@/lib/utils'
import { useCapabilities } from '@/modules/browseros/capabilities.hooks'

type BaseNavItem = {
  nameKey: string
  icon: typeof Bot
  feature?: Feature
}

type InternalNavItem = BaseNavItem & {
  href?: never
  to: string
}

type ExternalNavItem = BaseNavItem & {
  href: string
  to?: never
}

type NavItem = InternalNavItem | ExternalNavItem

type NavSection = {
  labelKey: string
  items: NavItem[]
}

function isExternalNavItem(item: NavItem): item is ExternalNavItem {
  return 'href' in item
}

const getNavLinkClassName = (isActive: boolean) =>
  cn(
    'flex h-9 items-center gap-2 overflow-hidden whitespace-nowrap rounded-md px-3 font-medium text-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
    isActive && 'bg-sidebar-accent text-sidebar-accent-foreground',
  )

const getSectionClassName = (index: number) =>
  cn(index > 0 && 'mt-3 border-t pt-3')

const sectionLabelClassName =
  'mb-2 px-3 font-semibold text-[10px] text-muted-foreground uppercase tracking-[0.18em]'

const primarySettingsSections: NavSection[] = [
  {
    labelKey: 'settings.providerSettings',
    items: [
      { nameKey: 'settings.aiAgents', to: '/settings/ai', icon: Bot },
      {
        nameKey: 'settings.chatProvider',
        to: '/settings/chat',
        icon: MessageSquare,
      },
    ],
  },
  {
    labelKey: 'settings.other',
    items: [
      {
        nameKey: 'settings.customizeBrowser',
        to: '/settings/customization',
        icon: Palette,
      },
      {
        nameKey: 'settings.browserAsMcp',
        to: '/settings/mcp',
        icon: Server,
      },
    ],
  },
]

const helpItems: NavItem[] = [
  {
    nameKey: 'settings.docs',
    href: 'https://docs.browseros.com/',
    icon: BookOpen,
  },
  { nameKey: 'settings.features', to: '/features', icon: Compass },
  {
    nameKey: 'settings.diagnostics',
    to: '/settings/diagnostics',
    icon: Activity,
  },
]

export const SettingsSidebar: FC = () => {
  const { t } = useLocale()
  const { supports } = useCapabilities()

  const filteredSections = primarySettingsSections
    .map((section) => ({
      ...section,
      items: section.items.filter(
        (item) => !item.feature || supports(item.feature),
      ),
    }))
    .filter((section) => section.items.length > 0)

  const filteredHelpItems = helpItems.filter(
    (item) => !item.feature || supports(item.feature),
  )

  const renderNavItem = (item: NavItem) => {
    const Icon = item.icon
    const name = t(item.nameKey)

    if (isExternalNavItem(item)) {
      return (
        <a
          key={item.href}
          href={item.href}
          target="_blank"
          rel="noopener noreferrer"
          className={getNavLinkClassName(false)}
        >
          <Icon className="size-4 shrink-0" />
          <span className="truncate">{name}</span>
        </a>
      )
    }

    return (
      <NavLink
        key={item.to}
        to={item.to}
        end
        className={({ isActive }) => getNavLinkClassName(isActive)}
      >
        <Icon className="size-4 shrink-0" />
        <span className="truncate">{name}</span>
      </NavLink>
    )
  }

  const renderSection = (section: NavSection, index: number) => (
    <div key={section.labelKey} className={getSectionClassName(index)}>
      <div className={sectionLabelClassName}>{t(section.labelKey)}</div>
      <nav className="space-y-1">{section.items.map(renderNavItem)}</nav>
    </div>
  )

  return (
    <div className="flex h-full w-64 flex-col border-r bg-sidebar text-sidebar-foreground">
      <div className="flex h-14 items-center justify-between border-b px-2">
        <NavLink
          to="/home"
          className="flex h-9 items-center gap-2 overflow-hidden whitespace-nowrap rounded-md px-3 font-medium text-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <ArrowLeft className="size-4 shrink-0" />
          <span className="truncate">{t('settings.back')}</span>
        </NavLink>
        <ThemeToggle
          className="mr-1 h-8 w-8 shrink-0"
          iconClassName="h-4 w-4"
        />
      </div>

      <div className="flex flex-1 flex-col overflow-y-auto overflow-x-hidden p-2">
        <div className="mb-2 px-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">
          {t('nav.settings')}
        </div>
        <div>{filteredSections.map(renderSection)}</div>
        <div className="mt-auto pt-4">
          <div className={sectionLabelClassName}>{t('settings.help')}</div>
          <nav className="space-y-1">
            {filteredHelpItems.map(renderNavItem)}
          </nav>
        </div>
      </div>
    </div>
  )
}
