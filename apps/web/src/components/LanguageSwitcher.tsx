import { useTranslation } from 'react-i18next';
import { Languages } from 'lucide-react';

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation();
  return (
    <label className="language" title={t('language')}>
      <Languages size={15} />
      <select value={i18n.resolvedLanguage} onChange={(e) => void i18n.changeLanguage(e.target.value)} aria-label={t('language')}>
        <option value="es">ES</option>
        <option value="en">EN</option>
      </select>
    </label>
  );
}
