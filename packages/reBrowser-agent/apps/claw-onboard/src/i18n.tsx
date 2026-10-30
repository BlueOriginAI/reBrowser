import { type Catalog, createLocaleRuntime } from '@browseros/i18n/core'
import { LocaleProvider, useLocale } from '@browseros/i18n/react'
import { type ReactNode, useEffect } from 'react'
import { extraChinese, extraEnglish } from './i18n-messages'
import type { BrowserOSOnboardingBridge } from './onboarding/browseros-onboarding-bridge'
import { createOnboardingLocaleStore } from './onboarding-locale-store'

const en: Catalog = {
  'language.label': 'Language',
  'language.system': 'System default',
  'language.en': 'English',
  'language.zh-CN': '简体中文',
  'welcome.title.before': 'Welcome to ',
  'welcome.copy':
    'Two quick steps to get set up: bring your browser over, then connect your agent.',
  'welcome.start': 'Get started',
  'welcome.skip': 'Skip for now',
  'claw.welcome.title.before': 'Your second browser. For your ',
  'claw.welcome.title.emphasis': 'agents.',
  'claw.welcome.copy':
    'Not a Chrome replacement. This browser is for your agents, where Claude, Codex, and Cursor work.',
  'claw.welcome.start': 'Set it up',
  'claw.welcome.reconnect': 'Already set up? Reconnect.',
  'import.title.before': 'Bring ',
  'import.title.emphasis': 'everything',
  'import.title.after': ' with you',
  'import.copy':
    'Copy your history, bookmarks, and saved logins from your current browser. Everything stays on this machine.',
  'import.looking': 'Looking for profiles',
  'import.pick': 'Pick a profile',
  'import.refresh': 'Refresh',
  'import.profilesAria': 'Browser profiles',
  'import.none': 'No profiles found.',
  'import.showFewer': 'Show fewer profiles',
  'import.showMore': 'Show {{count}} more profiles',
  'import.skip': 'Skip for now',
  'import.continue': 'Continue',
  'import.retry': 'Try again',
  'import.refreshProfiles': 'Refresh profiles',
  'import.failed': 'Something went wrong.',
  'import.failedFallback':
    "RemocodeBrowser couldn't finish this import. Try again below, or refresh the profile list.",
  'import.macPassword': 'macOS may ask for your Mac login password.',
  'import.fromProfile': 'From {{profile}}’s profile',
  'import.noCompleted': 'No completed items reported',
  'import.noDetails': 'No item details reported',
  'import.source': 'source',
  'import.browser': 'browser',
  'import.pickProfile': 'Pick a profile',
  'import.nothingToCopy': 'Nothing to copy from this profile',
  'import.selectToCopy': 'Select what to copy',
  'import.copyFrom': 'Copy from {{browser}}',
  'progress.importing': 'Importing {{item}}...',
  'progress.data': 'data',
  'progress.items': '{{progress}} / {{total}} items',
  'checklist.title': 'What to copy',
  'checklist.selected': '{{count}} categories selected',
  'checklist.browsingSetup': 'Also copy my browsing setup',
  'summary.copied': 'Copied {{count}} items from {{source}}.',
  'summary.private': 'Stays on this machine. Never shown to you or the agent.',
  'summary.cardsSkipped': 'Payment cards were skipped.',
  'steps.progress': 'Onboarding progress',
  'item.history': 'History',
  'item.bookmarks': 'Bookmarks',
  'item.cookies': 'Signed-in sessions',
  'item.passwords': 'Saved passwords',
  'item.searchEngines': 'Search engines',
  'item.autofill': 'Autofill',
  'item.extensions': 'Extensions',
  'item.unknown': 'Unknown data',
  'item.none': 'No supported data.',
  'setup.finishing': 'Finishing setup',
  'setup.failed': 'Setup didn’t finish',
  'setup.retry': 'Try again',
  'error.import_failed': 'The import could not be completed.',
  'error.nativeDetails': '{{details}}',
}

const zhCN: Catalog = {
  'language.label': '语言',
  'language.system': '跟随系统',
  'language.en': 'English',
  'language.zh-CN': '简体中文',
  'welcome.title.before': '欢迎使用 ',
  'welcome.copy': '只需两步即可完成设置：迁移浏览器数据，然后连接你的智能体。',
  'welcome.start': '开始使用',
  'welcome.skip': '暂时跳过',
  'claw.welcome.title.before': '你的第二个浏览器，专为你的',
  'claw.welcome.title.emphasis': '智能体而设。',
  'claw.welcome.copy':
    '它不是 Chrome 的替代品。这是供你的智能体工作的浏览器，Claude、Codex 和 Cursor 都能在此运行。',
  'claw.welcome.start': '开始设置',
  'claw.welcome.reconnect': '已经设置过？重新连接。',
  'import.title.before': '带上你的',
  'import.title.emphasis': '全部数据',
  'import.title.after': '一起迁移',
  'import.copy':
    '从当前浏览器复制历史记录、书签和已保存的登录信息。所有数据都留在这台设备上。',
  'import.looking': '正在查找配置文件',
  'import.pick': '选择配置文件',
  'import.refresh': '刷新',
  'import.profilesAria': '浏览器配置文件',
  'import.none': '未找到配置文件。',
  'import.showFewer': '显示更少的配置文件',
  'import.showMore': '再显示 {{count}} 个配置文件',
  'import.skip': '暂时跳过',
  'import.continue': '继续',
  'import.retry': '重试',
  'import.refreshProfiles': '刷新配置文件',
  'import.failed': '出现了一些问题。',
  'import.failedFallback':
    'RemocodeBrowser 无法完成此次导入。请在下方重试，或刷新配置文件列表。',
  'import.macPassword': 'macOS 可能会要求输入 Mac 登录密码。',
  'import.fromProfile': '来自 {{profile}} 的配置文件',
  'import.noCompleted': '未报告已完成的数据项',
  'import.noDetails': '未报告数据项详情',
  'import.source': '来源',
  'import.browser': '浏览器',
  'import.pickProfile': '选择配置文件',
  'import.nothingToCopy': '此配置文件中没有可复制的数据',
  'import.selectToCopy': '选择要复制的内容',
  'import.copyFrom': '从 {{browser}} 复制',
  'progress.importing': '正在导入 {{item}}…',
  'progress.data': '数据',
  'progress.items': '{{progress}} / {{total}} 项',
  'checklist.title': '要复制的内容',
  'checklist.selected': '已选择 {{count}} 个类别',
  'checklist.browsingSetup': '同时复制我的浏览设置',
  'summary.copied': '已从 {{source}} 复制 {{count}} 项。',
  'summary.private': '数据将保留在这台设备上，绝不会向你或智能体显示。',
  'summary.cardsSkipped': '已跳过支付卡。',
  'steps.progress': '引导进度',
  'item.history': '历史记录',
  'item.bookmarks': '书签',
  'item.cookies': '已登录会话',
  'item.passwords': '已保存的密码',
  'item.searchEngines': '搜索引擎',
  'item.autofill': '自动填充',
  'item.extensions': '扩展程序',
  'item.unknown': '未知数据',
  'item.none': '没有支持的数据。',
  'setup.finishing': '正在完成设置',
  'setup.failed': '设置未完成',
  'setup.retry': '重试',
  'error.import_failed': '无法完成导入。',
  'error.nativeDetails': '{{details}}',
}

export const onboardingCatalogs = {
  en: { ...en, ...extraEnglish },
  'zh-CN': { ...zhCN, ...extraChinese },
}

export function createOnboardingLocaleRuntime(
  bridge: BrowserOSOnboardingBridge,
) {
  return createLocaleRuntime(
    onboardingCatalogs,
    createOnboardingLocaleStore(bridge),
  )
}

export function OnboardingLocaleProvider({
  runtime,
  children,
}: {
  runtime: ReturnType<typeof createOnboardingLocaleRuntime>
  children: ReactNode
}) {
  return (
    <LocaleProvider runtime={runtime}>
      <OnboardingTitle />
      {children}
    </LocaleProvider>
  )
}

function OnboardingTitle() {
  const { t } = useLocale()
  useEffect(() => {
    document.title = t('page.title')
  }, [t])
  return null
}
