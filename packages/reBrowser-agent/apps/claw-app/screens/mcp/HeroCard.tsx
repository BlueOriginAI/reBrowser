import { useLocale } from '@browseros/i18n/react'
import { EndpointStrip } from './EndpointStrip'

interface HeroCardProps {
  url: string | null
}

/** Renders the MCP hero around the resolved endpoint strip. */
export function HeroCard({ url }: HeroCardProps) {
  const { t } = useLocale()
  return (
    <header className="space-y-6">
      <div className="space-y-1">
        <h1 className="font-extrabold text-3xl text-cyanotype-ink leading-tight tracking-tight md:text-4xl">
          MCP
        </h1>
        <p className="text-[15px] text-cyanotype-muted leading-snug">
          {t('mcp.tagline')}
        </p>
      </div>
      <EndpointStrip label={t('mcp.endpointUrl')} value={url} />
    </header>
  )
}
