import { useLanguage } from '../i18n/Language'
import { launcherHomeUrl } from '../services/launchSource'

export default function PickitiHomeLink() {
  const { t } = useLanguage()
  return (
    <a href={launcherHomeUrl('pickiti')} aria-label={t('Back to Pickiti')} title={t('Back to Pickiti')}
      className="icon-btn inline-flex shrink-0">
      <img src={`${import.meta.env.BASE_URL}pickiti-mark.png`} alt="" className="w-7 h-7 object-contain" />
    </a>
  )
}
