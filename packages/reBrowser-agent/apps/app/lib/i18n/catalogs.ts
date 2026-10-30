import { en } from './en'
import { providerChinese, providerEnglish } from './provider-supplemental'
import { surfacesChinese, surfacesEnglish } from './surfaces-supplemental'
import { zhCN } from './zh-CN'

export const catalogs = {
  en: { ...en, ...providerEnglish, ...surfacesEnglish },
  'zh-CN': { ...zhCN, ...providerChinese, ...surfacesChinese },
}
