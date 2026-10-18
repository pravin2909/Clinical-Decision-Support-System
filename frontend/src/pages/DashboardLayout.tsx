import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import Logo, { LogoMark } from "../components/Logo";
import SettingsModal from "../components/SettingsModal";
import { useAuth } from "../context/AuthProvider";

interface NavItem {
  to: string;
  label: string;
  icon: string;
  end?: boolean;
}

const PATIENT_NAV: NavItem[] = [
  { to: "/app", label: "Dashboard", icon: "space_dashboard", end: true },
  { to: "/app/assistant", label: "Health Assistant", icon: "assistant" },
  { to: "/app/doctors", label: "My Doctors", icon: "stethoscope" },
  { to: "/app/messages", label: "Messages", icon: "chat" },
  { to: "/app/tracker", label: "Health Tracker", icon: "monitor_heart" },
  { to: "/app/prescriptions", label: "Prescriptions", icon: "medication" },
  { to: "/app/history", label: "History", icon: "history" },
];

const DOCTOR_NAV: NavItem[] = [
  { to: "/app", label: "Dashboard", icon: "space_dashboard", end: true },
  { to: "/app/copilot-ai", label: "AI Copilot", icon: "neurology" },
  { to: "/app/appointments", label: "Appointments", icon: "calendar_month" },
  { to: "/app/patients", label: "Patients", icon: "groups" },
  { to: "/app/messages", label: "Messages", icon: "chat" },
];

function navForRole(role: string | undefined): NavItem[] {
  return role === "doctor" ? DOCTOR_NAV : PATIENT_NAV;
}

/* Flat solid surfaces (no frosted glass), consistent with the rest of the app. */
const glassPanel: CSSProperties = {
  background: "rgb(var(--surface))",
  border: "1px solid rgb(var(--border))",
  boxShadow: "0 1px 2px rgba(16,24,40,0.05)",
};

const glassControl: CSSProperties = {
  background: "rgb(var(--surface-2))",
  border: "1px solid rgb(var(--border))",
  boxShadow: "none",
};

const glassActive: CSSProperties = {
  background: "rgb(var(--surface-2))",
  border: "1px solid rgb(var(--border))",
  boxShadow: "none",
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

function Sidebar({
  collapsed,
  onToggle,
  onOpenSettings,
}: {
  collapsed: boolean;
  onToggle: () => void;
  onOpenSettings: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const NAV = navForRole(user?.role);

  const displayName = user?.full_name || user?.email || "Guest";
  const roleLabel = user?.role ? user.role[0].toUpperCase() + user.role.slice(1) : "Not signed in";
  const initials = (user?.full_name || user?.email || "U")
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  async function handleLogout() {
    setMenuOpen(false);
    await signOut();
    navigate("/");
  }

  // Close the account menu on navigation.
  useEffect(() => setMenuOpen(false), [pathname]);

  // Close on outside click.
  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

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
            className="block"
          >
            {({ isActive }) => (
              <span
                className={
                  "flex items-center gap-3 rounded-xl transition-colors " +
                  (collapsed ? "justify-center p-2.5 " : "px-3 py-2.5 ") +
                  (isActive
                    ? "bg-accent-500/10 "
                    : "hover:bg-black/5 dark:hover:bg-white/5")
                }
              >
                <span
                  className={
                    "material-symbols-outlined text-[22px] leading-none " +
                    (isActive ? "text-accent-600" : "text-muted")
                  }
                  style={{ fontVariationSettings: `'FILL' ${isActive ? 1 : 0}, 'wght' 400, 'GRAD' 0, 'opsz' 24` }}
                >
                  {item.icon}
                </span>
                {!collapsed && (
                  <span
                    className={
                      "truncate text-[15px] " +
                      (isActive ? "font-semibold text-accent-700" : "font-medium text-muted")
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

      <div ref={menuRef} className="relative p-2 border-t border-line/60">
        {menuOpen && (
          <div
            style={glassPanel}
            className={
              "absolute z-20 rounded-xl p-1.5 shadow-2xl animate-fade-in " +
              (collapsed ? "left-full bottom-2 ml-2 w-56" : "left-2 right-2 bottom-full mb-2")
            }
          >
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                onOpenSettings();
              }}
              className="block w-full text-left"
            >
              <span className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-content hover:bg-black/5 dark:hover:bg-white/5">
                <span className="material-symbols-outlined text-[20px] text-muted">settings</span>
                Settings
              </span>
            </button>
            <Link to="/" onClick={() => setMenuOpen(false)} className="block">
              <span className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-content hover:bg-black/5 dark:hover:bg-white/5">
                <span className="material-symbols-outlined text-[20px] text-muted">help</span>
                Get help
              </span>
            </Link>
            <div className="my-1.5 border-t border-line" />
            <button type="button" onClick={handleLogout} className="block w-full text-left">
              <span className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-rose-500 hover:bg-rose-500/10">
                <span className="material-symbols-outlined text-[20px]">logout</span>
                Log out
              </span>
            </button>
          </div>
        )}
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          title="Account"
          className={
            "w-full flex items-center rounded-xl hover:bg-black/5 dark:hover:bg-white/5 " +
            (collapsed ? "justify-center p-2" : "gap-3 p-2")
          }
        >
          <span className="size-9 shrink-0 rounded-full bg-accent-600 text-white flex items-center justify-center font-semibold text-xs">
            {initials}
          </span>
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1 text-left">
                <span className="block text-sm font-semibold text-content truncate">{displayName}</span>
                <span className="block text-xs text-muted truncate">{roleLabel}</span>
              </span>
              <span className="material-symbols-outlined text-lg text-muted shrink-0">
                {menuOpen ? "expand_more" : "expand_less"}
              </span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}

function MobileTopNav() {
  const { user } = useAuth();
  const items = navForRole(user?.role);
  const activeStyle = (isActive: boolean) => (isActive ? glassActive : undefined);
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    "rounded-xl transition-all " + (isActive ? "text-accent-700" : "text-muted");

  return (
    <div
      style={glassPanel}
      className="md:hidden flex items-center justify-between m-3 mb-0 px-3 h-14 rounded-2xl overflow-x-auto"
    >
      <Link to="/" className="shrink-0">
        <Logo markClassName="size-7" textClassName="text-content !text-base" />
      </Link>
      <div className="flex items-center gap-1 text-sm font-semibold shrink-0">
        {items.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} className={linkClass}>
            {({ isActive }) => (
              <span style={activeStyle(isActive)} className="block px-3 py-1.5 rounded-xl whitespace-nowrap">
                {item.label}
              </span>
            )}
          </NavLink>
        ))}
      </div>
    </div>
  );
}

export default function DashboardLayout() {
  const [collapsed, setCollapsed] = useState(loadCollapsed);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { pathname } = useLocation();
  const onChat =
    pathname.startsWith("/app/assistant") ||
    pathname.startsWith("/app/copilot-ai") ||
    pathname.startsWith("/app/messages");

  /* Give chat-like pages the full width, then restore the saved choice on other pages */
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
      <Sidebar collapsed={collapsed} onToggle={toggle} onOpenSettings={() => setSettingsOpen(true)} />
      <div className="flex-1 flex flex-col min-w-0">
        <MobileTopNav />
        <main className={"flex-1 " + (onChat ? "overflow-hidden" : "overflow-y-auto")}>
          <Outlet />
        </main>
      </div>
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}