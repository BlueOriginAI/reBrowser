import { useLocale } from '@browseros/i18n/react'
import { ArrowRight } from 'lucide-react'
import type { FC } from 'react'
import BrowserClawLogo from '@/assets/browserclaw_logo.png'
import { Button } from '@/components/ui/button'
import { BROWSERCLAW_MCP_BANNER_CLICKED_EVENT } from '@/lib/constants/analyticsEvents'
import { track } from '@/lib/metrics/track'
import { sentry } from '@/lib/sentry/sentry'

const BROWSERCLAW_URL = 'https://browserclaw.ai'

/**
 * Permanent BrowserOS neo pitch on the MCP settings page — deliberately no dismiss
 * control and no persisted visibility, so it never reads
 * `browserClawPromoDismissedStorage` the way `components/promo/BrowserClawPromoBanner`
 * does. That key is global: honouring it would hide this banner from everyone who
 * dismissed the new-tab promo, which is the opposite of what it is for.
 *
 * Copy stays MCP-specific so it explains why BrowserOS neo is relevant to users
 * configuring BrowserOS as an MCP server.
 */
export const BrowserClawMcpBanner: FC = () => {
  const { t } = useLocale()
  const handleClick = async () => {
    track(BROWSERCLAW_MCP_BANNER_CLICKED_EVENT)
    try {
      await chrome.tabs.create({ url: BROWSERCLAW_URL })
    } catch (error) {
      sentry.captureException(error, {
        extra: { message: 'Failed to open BrowserClaw site from MCP settings' },
      })
    }
  }

  return (
    <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-4 shadow-sm transition-all hover:shadow-md">
      <img
        src={BrowserClawLogo}
        alt={t('mcp.neoAlt')}
        className="h-10 w-10 shrink-0 rounded-lg"
      />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-sm">{t('mcp.neoTitle')}</p>
        <p className="text-muted-foreground text-xs">
          {t('mcp.neoDescription')}
        </p>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={handleClick}
        className="shrink-0 border-[var(--accent-orange)] bg-[var(--accent-orange)]/10 text-[var(--accent-orange)] hover:bg-[var(--accent-orange)]/20 hover:text-[var(--accent-orange)]"
      >
        {t('chat.learnMore')}
        <ArrowRight className="ml-1 h-3 w-3" />
      </Button>
    </div>
  )
}
