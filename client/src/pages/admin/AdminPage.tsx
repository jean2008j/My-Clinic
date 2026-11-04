import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { publicApi, type Provider } from '../../lib/api';
import { useI18n, type MessageKey } from '../../i18n';
import CalendarTab from './CalendarTab';
import StatsTab from './StatsTab';
import HolidaysTab from './HolidaysTab';
import ReviewsTab from './ReviewsTab';

const TABS = [
  { id: 'calendar', label: 'admin.tab.calendar' },
  { id: 'stats', label: 'admin.tab.stats' },
  { id: 'reviews', label: 'admin.tab.reviews' },
  { id: 'holidays', label: 'admin.tab.holidays' },
] as const satisfies readonly { id: string; label: MessageKey }[];

type TabId = (typeof TABS)[number]['id'];

export default function AdminPage() {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const tab: TabId = TABS.some((x) => x.id === params.get('tab')) ? (params.get('tab') as TabId) : 'calendar';
  const [providers, setProviders] = useState<Provider[]>([]);

  // Doctors list: used by the filters and by the day-off form.
  useEffect(() => { publicApi.providers().then(setProviders).catch(() => setProviders([])); }, []);

  return (
    <div className="container page">
      <h1>{t('page.admin')}</h1>

      <div className="tabs" role="tablist">
        {TABS.map((x) => (
          <button
            key={x.id}
            role="tab"
            aria-selected={tab === x.id}
            className={tab === x.id ? 'tab active' : 'tab'}
            onClick={() => setParams({ tab: x.id })}
          >
            {t(x.label)}
          </button>
        ))}
      </div>

      {tab === 'calendar' && <CalendarTab providers={providers} />}
      {tab === 'stats' && <StatsTab providers={providers} />}
      {tab === 'reviews' && <ReviewsTab />}
      {tab === 'holidays' && <HolidaysTab providers={providers} />}
    </div>
  );
}
