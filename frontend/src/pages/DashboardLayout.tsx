import { useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
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

const VERSION = "v0.0.1";

function loadCollapsed(): boolean {
  try {
    return localStorage.getItem("medcore.sidebar") === "collapsed";
  } catch {
    return false;
  }
}

function Sidebar({ collapsed }: { collapsed: boolean }) {
  const linkBase =
    "flex items-center gap-3 rounded-lg text-sm font-semibold transition-colors " +
    (collapsed ? "justify-center px-0 py-3" : "px-3 py-2.5");

  return (
    <aside
      className={
        "hidden md:flex shrink-0 flex-col bg-surface border-r border-line transition-all duration-200 " +
        (collapsed ? "w-20" : "w-64")
      }
    >
      <Link
        to="/"
        className={"flex items-center h-16 " + (collapsed ? "justify-center px-0" : "px-5")}
      >
        {collapsed ? <LogoMark className="size-9" /> : <Logo />}
      </Link>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            title={collapsed ? item.label : undefined}
            className={({ isActive }) =>
              linkBase +
              " backdrop-blur-sm" +
              (isActive
                ? " bg-accent-500/15 text-accent-700 dark:text-accent-300 ring-1 ring-accent-500/25 shadow-[0_2px_10px_rgba(99,102,241,0.15)]"
                : " text-muted hover:bg-content/5 hover:text-content")
            }
          >
            <span className="material-symbols-outlined text-xl">{item.icon}</span>
            {!collapsed && item.label}
          </NavLink>
        ))}
      </nav>

      {/* Profile */}
      <div className="p-3">
        <button
          title="Profile"
          className={
            "w-full flex items-center rounded-xl hover:bg-surface2 transition-colors " +
            (collapsed ? "justify-center p-2" : "gap-3 p-2.5")
          }
        >
          <span className="size-9 shrink-0 rounded-full bg-accent-600 text-white flex items-center justify-center font-bold text-sm">
            DR
          </span>
          {!collapsed && (
            <span className="min-w-0 text-left">
              <span className="block text-sm font-bold text-content truncate">Dr. User</span>
              <span className="block text-xs text-muted truncate">Clinician</span>
            </span>
          )}
        </button>
      </div>
    </aside>
  );
}

function MobileTopNav() {
  return (
    <div className="md:hidden flex items-center justify-between px-4 h-14 bg-surface border-b border-line">
      <Link to="/">
        <Logo markClassName="size-7" textClassName="text-content !text-base" />
      </Link>
      <div className="flex items-center gap-3 text-sm font-semibold">
        <NavLink to="/app" end className={({ isActive }) => (isActive ? "text-accent-600" : "text-muted")}>
          Home
        </NavLink>
        <NavLink to="/app/diagnosis" className={({ isActive }) => (isActive ? "text-accent-600" : "text-muted")}>
          Diagnosis
        </NavLink>
        <NavLink to="/app/settings" className={({ isActive }) => (isActive ? "text-accent-600" : "text-muted")}>
          Settings
        </NavLink>
      </div>
    </div>
  );
}

export default function DashboardLayout() {
  const [collapsed, setCollapsed] = useState(loadCollapsed);

  const toggle = () => {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem("medcore.sidebar", next ? "collapsed" : "expanded");
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  return (
    <div className="min-h-screen flex bg-surface">
      <Sidebar collapsed={collapsed} />
      <div className="flex-1 flex flex-col min-w-0">
        <MobileTopNav />
        <header className="hidden md:flex items-center justify-between px-6 h-16 bg-surface">
          <button
            onClick={toggle}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="size-9 rounded-lg hover:bg-surface2 text-muted flex items-center justify-center transition-colors"
          >
            <span className="material-symbols-outlined">{collapsed ? "menu" : "menu_open"}</span>
          </button>
          <span className="text-xs font-semibold text-muted bg-surface2 px-2.5 py-1 rounded-full">
            {VERSION}
          </span>
        </header>
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
