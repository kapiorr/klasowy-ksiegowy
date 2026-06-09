import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';

const navItems = [
  { to: '/', label: 'Dashboard', icon: '◈', exact: true },
  { to: '/skladki', label: 'Składki', icon: '◎' },
  { to: '/ucznowie', label: 'Uczniowie', icon: '◉' },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const { dark, toggle } = useTheme();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const handleLogout = () => { logout(); navigate('/login'); };
  const close = () => setOpen(false);

  const linkCls = ({ isActive }) =>
    `flex items-center gap-3 px-3 py-2.5 rounded-xl font-body text-sm transition-all ${
      isActive ? 'bg-sage-600 text-white' : 'text-white/60 hover:text-white hover:bg-white/10'
    }`;

  const NavContent = () => (
    <>
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map(({ to, label, icon, exact }) => (
          <NavLink key={to} to={to} end={exact} className={linkCls} onClick={close}>
            <span className="text-base">{icon}</span>{label}
          </NavLink>
        ))}
        {['admin', 'ksiegowy'].includes(user?.rola) && (
          <NavLink to="/uzytkownicy" className={linkCls} onClick={close}>
            <span className="text-base">⊕</span>Użytkownicy
          </NavLink>
        )}
        {user?.rola === 'admin' && (<>
          <NavLink to="/backup" className={linkCls} onClick={close}>
            <span className="text-base">◫</span>Backup
          </NavLink>
          <NavLink to="/logi" className={linkCls} onClick={close}>
            <span className="text-base">◳</span>Logi
          </NavLink>
          <NavLink to="/mailing" className={linkCls} onClick={close}>
            <span className="text-base">✉</span>Mailing
          </NavLink>
          <NavLink to="/statystyki" className={linkCls} onClick={close}>
            <span className="text-base">◉</span>Statystyki
          </NavLink>
        </>)}
        <NavLink to="/ustawienia" className={linkCls} onClick={close}>
          <span className="text-base">⚙</span>Ustawienia
        </NavLink>
      </nav>

      <div className="px-3 py-4 border-t border-white/10">
        {/* Dark mode toggle */}
        <button onClick={toggle}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-body text-sm text-white/60 hover:text-white hover:bg-white/10 transition-all mb-1">
          <span>{dark ? '☀' : '☾'}</span>
          {dark ? 'Tryb jasny' : 'Tryb ciemny'}
        </button>

        <div className="px-3 py-2 mb-2">
          <div className="font-body text-white/40 text-xs">Zalogowany jako</div>
          <div className="font-body text-white text-sm font-500">{user?.login}</div>
          <div className="inline-block mt-1 bg-sage-600/30 text-sage-200 text-xs px-2 py-0.5 rounded-full font-mono">
            {user?.rola === 'admin' ? 'Admin' : user?.rola === 'ksiegowy' ? 'Księgowy' : user?.rola === 'podglad_pelny' ? 'Podgląd pełny' : 'Podgląd'}
          </div>
        </div>
        <button onClick={handleLogout}
          className="w-full text-left px-3 py-2.5 rounded-xl font-body text-sm text-white/60 hover:text-white hover:bg-white/10 transition-all">
          ← Wyloguj
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-paper dark:bg-gray-900 flex">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-60 bg-ink flex-col fixed h-full z-30">
        <div className="px-6 py-7 border-b border-white/10">
          <div className="flex items-center gap-3">
            <span className="text-xl">📒</span>
            <div>
              <div className="font-display text-white font-700 text-sm leading-none">Klasowy</div>
              <div className="font-display text-sage-400 font-400 text-sm">Księgowy</div>
            </div>
          </div>
        </div>
        <NavContent />
      </aside>

      {/* Mobile top bar */}
      <header className="md:hidden fixed top-0 left-0 right-0 bg-ink z-30 flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">📒</span>
          <span className="font-display text-white font-700 text-sm">Klasowy Księgowy</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={toggle} className="text-white/60 hover:text-white p-2 rounded-lg hover:bg-white/10">
            {dark ? '☀' : '☾'}
          </button>
          <button onClick={() => setOpen(o => !o)}
            className="text-white/70 hover:text-white p-2 rounded-lg hover:bg-white/10 transition-colors">
            {open ? (
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 15a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
              </svg>
            )}
          </button>
        </div>
      </header>

      {/* Mobile drawer */}
      {open && (
        <div className="md:hidden fixed inset-0 z-20" onClick={close}>
          <div className="absolute inset-0 bg-black/50" />
          <aside className="absolute top-0 left-0 bottom-0 w-72 bg-ink flex flex-col pt-16"
            onClick={e => e.stopPropagation()}>
            <NavContent />
          </aside>
        </div>
      )}

      <main className="flex-1 md:ml-60 pt-14 md:pt-0 p-4 md:p-8">
        <Outlet />
      </main>
    </div>
  );
}
