import { useTranslation } from 'react-i18next';

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation();
  return (
    <label className="inline language">
      {t('language')}
      <select value={i18n.resolvedLanguage} onChange={(e) => void i18n.changeLanguage(e.target.value)}>
        <option value="es">Español</option>
        <option value="en">English</option>
      </select>
    </label>
  );
}
