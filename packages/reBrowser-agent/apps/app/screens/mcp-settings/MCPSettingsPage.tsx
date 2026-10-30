import { useLocale } from '@browseros/i18n/react'
import { type FC, useCallback, useEffect, useState } from 'react'
import { getMcpServerUrl } from '@/lib/browseros/helpers'
import { BrowserClawMcpBanner } from './BrowserClawMcpBanner'
import { IntegrationsSection } from './IntegrationsSection'
import { MCPServerHeader } from './MCPServerHeader'
import { MCPToolsSection } from './MCPToolsSection'

/** @public */
export const MCPSettingsPage: FC = () => {
  const { t } = useLocale()
  const [serverUrl, setServerUrl] = useState<string | null>(null)
  const [urlLoading, setUrlLoading] = useState(true)
  const [urlError, setUrlError] = useState(false)

  const loadServerUrl = useCallback(async () => {
    setUrlLoading(true)
    setUrlError(false)
    try {
      setServerUrl(await getMcpServerUrl())
    } catch {
      setUrlError(true)
    } finally {
      setUrlLoading(false)
    }
  }, [])

  useEffect(() => {
    loadServerUrl()
  }, [loadServerUrl])

  return (
    <div className="fade-in slide-in-from-bottom-5 animate-in space-y-6 duration-500">
      <MCPServerHeader
        serverUrl={serverUrl}
        isLoading={urlLoading}
        error={urlError ? t('mcp.loadFailed') : null}
        onServerRestart={loadServerUrl}
      />

      <BrowserClawMcpBanner />

      <IntegrationsSection serverUrl={serverUrl} />

      <MCPToolsSection />
    </div>
  )
}
