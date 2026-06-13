import { NavLink } from 'react-router-dom'
import { Briefcase, Box, Camera, Settings } from 'lucide-react'

const TABS = [
  { to: '/jobs',     label: 'Jobs',     Icon: Briefcase },
  { to: '/models',   label: 'Models',   Icon: Box },
  { to: '/capture',  label: 'Capture',  Icon: Camera },
  { to: '/settings', label: 'Settings', Icon: Settings },
] as const

export function PhoneTabBar() {
  return (
    <nav style={{
      display: 'flex',
      borderTop: '1px solid var(--border)',
      background: 'var(--surface-raised)',
      // Safe area inset for iOS home bar
      paddingBottom: 'env(safe-area-inset-bottom, 0px)',
    }}>
      {TABS.map(({ to, label, Icon }) => (
        <NavLink
          key={to}
          to={to}
          style={({ isActive }) => ({
            flex: 1,
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', gap: 3,
            padding: 'var(--sp-2) 0',
            textDecoration: 'none',
            color: isActive ? 'var(--accent)' : 'var(--text-faint)',
            fontSize: 'var(--text-xs)',
            fontWeight: isActive ? 600 : 400,
            transition: `color var(--dur-fast) var(--ease-out)`,
          })}
        >
          <Icon size={20} />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
