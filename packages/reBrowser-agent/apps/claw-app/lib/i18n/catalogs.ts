import { auditChinese, auditEnglish } from './audit-supplemental'
import { en } from './locales/en'
import { zhCN } from './locales/zh-CN'
import { supplementalChinese, supplementalEnglish } from './supplemental'

export const catalogs = {
  en: { ...en, ...supplementalEnglish, ...auditEnglish },
  'zh-CN': { ...zhCN, ...supplementalChinese, ...auditChinese },
}
