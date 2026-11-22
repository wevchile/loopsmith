import { useTranslation } from 'react-i18next';

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation();

  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng);
  };

  return (
    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
      <span>{t('languageSwitcher')}:</span>
      <button
        onClick={() => changeLanguage('es')}
        style={{
          fontWeight: i18n.language === 'es' ? 'bold' : 'normal',
          padding: '5px 10px',
        }}
      >
        {t('spanish')}
      </button>
      <button
        onClick={() => changeLanguage('en')}
        style={{
          fontWeight: i18n.language === 'en' ? 'bold' : 'normal',
          padding: '5px 10px',
        }}
      >
        {t('english')}
      </button>
    </div>
  );
}
