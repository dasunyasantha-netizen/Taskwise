import { useLanguage } from '../i18n/Language'
import { launcherHomeUrl } from '../services/launchSource'
import { Icon } from './ui/Icon'

export default function MobilePickitiLink() {
  const { t } = useLanguage()
  return (
    <a href={launcherHomeUrl('pickiti')} aria-label={t('Back to Pickiti')} title={t('Back to Pickiti')}
      className="md:hidden inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg border border-tw-border px-2 text-xs font-semibold text-tw-text-secondary hover:bg-tw-hover">
      <Icon name="grid" className="w-4 h-4" />
      <span>Pickiti</span>
    </a>
  )
}
