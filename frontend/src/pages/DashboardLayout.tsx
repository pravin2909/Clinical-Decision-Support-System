import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import Logo, { LogoMark } from "../components/Logo";

interface NavItem {
  to: string;
  label: string;
  icon: string;
  end?: boolean;
}

const NAV: NavItem[] = [
  { to: "/app", label: "Overview", icon: "dashboard", end: true },
  { to: "/app/diagnosis", label: "General Diagnosis", icon: "stethoscope" },
  { to: "/app/settings", label: "Settings", icon: "settings" },
];

/* Shared glass surfaces — colors come from CSS variables so they flip in dark mode */
const glassPanel: CSSProperties = {
  background: "var(--glass-panel-bg)",
  border: "1px solid var(--glass-panel-border)",
  backdropFilter: "blur(22px) saturate(180%)",
  WebkitBackdropFilter: "blur(22px) saturate(180%)",
  boxShadow: "var(--glass-panel-shadow)",
};

const glassControl: CSSProperties = {
  background: "var(--glass-control-bg)",
  border: "1px solid var(--glass-control-border)",
  backdropFilter: "blur(18px) saturate(190%)",
  WebkitBackdropFilter: "blur(18px) saturate(190%)",
  boxShadow: "var(--glass-control-shadow)",
};

const glassActive: CSSProperties = {
  background: "var(--glass-strong-bg)",
  border: "1px solid var(--glass-strong-border)",
  backdropFilter: "blur(18px) saturate(190%)",
  WebkitBackdropFilter: "blur(18px) saturate(190%)",
  boxShadow: "var(--glass-strong-shadow)",
};

/* Apple style type: San Francisco on Apple devices, clean fallbacks elsewhere */
const appleFont: CSSProperties = {
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", Inter, "Segoe UI", Roboto, Arial, sans-serif',
  letterSpacing: "-0.01em",
};

function loadCollapsed(): boolean {
  try {
    return localStorage.getItem("medcore.sidebar") === "collapsed";
  } catch {
    return false;
  }
}

function ToggleButton({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      style={glassControl}
      className="size-8 shrink-0 rounded-lg text-accent-700 flex items-center justify-center transition-all hover:brightness-105 hover:-translate-y-0.5"
    >
      <span className="material-symbols-outlined text-lg">{collapsed ? "menu" : "menu_open"}</span>
    </button>
  );
}

function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <aside
      className={
        "hidden md:flex shrink-0 flex-col bg-app border-r border-line transition-all duration-300 " +
        (collapsed ? "w-16" : "w-56")
      }
    >
      {collapsed ? (
        <div className="flex flex-col items-center gap-3 pt-4">
          <Link to="/" title="MedCore">
            <LogoMark className="text-xl" />
          </Link>
          <ToggleButton collapsed={collapsed} onToggle={onToggle} />
        </div>
      ) : (
        <div className="flex items-center justify-between h-14 px-4">
          <Link to="/" className="flex items-center">
            <Logo />
          </Link>
          <ToggleButton collapsed={collapsed} onToggle={onToggle} />
        </div>
      )}

      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {!collapsed && (
          <p className="px-3 pt-1 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
            Menu
          </p>
        )}
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            title={collapsed ? item.label : undefined}
          >
            {({ isActive }) => (
              <span
                style={isActive ? glassControl : undefined}
                className={
                  "flex items-center gap-3 rounded-xl transition-all " +
                  (collapsed ? "justify-center p-2.5 " : "px-3 py-2.5 ") +
                  (isActive ? "" : "hover:bg-black/5 dark:hover:bg-white/5")
                }
              >
                <span className="material-symbols-outlined text-[22px] leading-none text-accent-600">
                  {item.icon}
                </span>
                {!collapsed && (
                  <span
                    className={
                      "truncate text-[15px] " +
                      (isActive ? "font-semibold text-content" : "font-medium text-muted")
                    }
                  >
                    {item.label}
                  </span>
                )}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="p-2 border-t border-line/60">
        <button
          title="Profile"
          className={
            "w-full flex items-center rounded-xl transition-all hover:bg-black/5 dark:hover:bg-white/5 " +
            (collapsed ? "justify-center p-2" : "gap-3 p-2")
          }
        >
          <span className="size-9 shrink-0 rounded-full bg-accent-600 text-white flex items-center justify-center font-semibold text-xs">
            DR
          </span>
          {!collapsed && (
            <span className="min-w-0 text-left">
              <span className="block text-sm font-semibold text-content truncate">Dr. User</span>
              <span className="block text-xs text-muted truncate">Clinician</span>
            </span>
          )}
        </button>
      </div>
    </aside>
  );
}

function MobileTopNav() {
  const activeStyle = (isActive: boolean) => (isActive ? glassActive : undefined);
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    "rounded-xl transition-all " + (isActive ? "text-accent-700" : "text-muted");

  return (
    <div
      style={glassPanel}
      className="md:hidden flex items-center justify-between m-3 mb-0 px-3 h-14 rounded-2xl"
    >
      <Link to="/">
        <Logo markClassName="size-7" textClassName="text-content !text-base" />
      </Link>
      <div className="flex items-center gap-1 text-sm font-semibold">
        <NavLink to="/app" end className={linkClass}>
          {({ isActive }) => (
            <span style={activeStyle(isActive)} className="block px-3 py-1.5 rounded-xl">
              Home
            </span>
          )}
        </NavLink>
        <NavLink to="/app/diagnosis" className={linkClass}>
          {({ isActive }) => (
            <span style={activeStyle(isActive)} className="block px-3 py-1.5 rounded-xl">
              Diagnosis
            </span>
          )}
        </NavLink>
        <NavLink to="/app/settings" className={linkClass}>
          {({ isActive }) => (
            <span style={activeStyle(isActive)} className="block px-3 py-1.5 rounded-xl">
              Settings
            </span>
          )}
        </NavLink>
      </div>
    </div>
  );
}

export default function DashboardLayout() {
  const [collapsed, setCollapsed] = useState(loadCollapsed);
  const { pathname } = useLocation();
  const onChat = pathname.startsWith("/app/diagnosis");

  /* Give the chat page the full width, then restore the saved choice on other pages */
  useEffect(() => {
    setCollapsed(onChat ? true : loadCollapsed());
  }, [onChat]);

  const toggle = () => {
    setCollapsed((c) => {
      const next = !c;
      /* Only remember the choice made on normal pages */
      if (!onChat) {
        try {
          localStorage.setItem("medcore.sidebar", next ? "collapsed" : "expanded");
        } catch {
          /* ignore */
        }
      }
      return next;
    });
  };

  return (
    <div style={appleFont} className="h-screen overflow-hidden flex bg-surface antialiased">
      <Sidebar collapsed={collapsed} onToggle={toggle} />
      <div className="flex-1 flex flex-col min-w-0">
        <MobileTopNav />
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}