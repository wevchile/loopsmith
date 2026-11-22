import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { useTranslation } from 'react-i18next';
export function LanguageSwitcher() {
    const { i18n, t } = useTranslation();
    const changeLanguage = (lng) => {
        i18n.changeLanguage(lng);
    };
    return (_jsxs("div", { style: { display: 'flex', gap: '10px', alignItems: 'center' }, children: [_jsxs("span", { children: [t('languageSwitcher'), ":"] }), _jsx("button", { onClick: () => changeLanguage('es'), style: {
                    fontWeight: i18n.language === 'es' ? 'bold' : 'normal',
                    padding: '5px 10px',
                }, children: t('spanish') }), _jsx("button", { onClick: () => changeLanguage('en'), style: {
                    fontWeight: i18n.language === 'en' ? 'bold' : 'normal',
                    padding: '5px 10px',
                }, children: t('english') })] }));
}
