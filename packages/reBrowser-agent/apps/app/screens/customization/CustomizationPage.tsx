import type { FC } from 'react'
import { CustomizationHeader } from './CustomizationHeader'
import { LanguageSettingsCard } from './LanguageSettingsCard'
import { ToolbarSettingsCard } from './ToolbarSettingsCard'

export const CustomizationPage: FC = () => {
  return (
    <div className="fade-in slide-in-from-bottom-5 animate-in space-y-6 duration-500">
      <CustomizationHeader />
      <LanguageSettingsCard />
      <ToolbarSettingsCard />
    </div>
  )
}
