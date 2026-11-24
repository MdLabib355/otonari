import { useContext } from 'react';
import { MoonIcon, SunIcon } from './Icons.tsx';
import { useTheme } from '../core/theme.tsx';
import { UserContext } from '../core/UserContext.ts';
import { t } from '../i18n/index.ts';

export default function ThemeToggle({ className = '' }: { className?: string }) {
  const { isDark, toggleTheme } = useTheme();
  const userCtx = useContext(UserContext);
  const lang = userCtx?.lang ?? 'en';

  const label = t(lang, isDark ? 'theme.light' : 'theme.dark');

  return (
    <button
      type="button"
      className={`theme-toggle ${className}`}
      onClick={toggleTheme}
      aria-label={label}
      title={label}
    >
      {isDark ? <SunIcon className="icon-sm" /> : <MoonIcon className="icon-sm" />}
    </button>
  );
}
