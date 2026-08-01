import { useState, useContext } from 'react'
import { UserContext } from '../lib/userContext'
import { ProfileSection } from '../components/ui'

export default function SettingsTab() {
  const { userEmail, setUserEmail } = useContext(UserContext)
  const [editEmail, setEditEmail] = useState(userEmail)
  return (
    <>
      <header>
        <div>
          <h1>Settings</h1>
          <div className="date">Configure your dashboard</div>
        </div>
        <ProfileSection />
      </header>

      <div className="recent-orders" style={{ padding: 24 }}>
        <div className="orders-header" style={{ marginBottom: 20 }}>
          <div className="orders-title">User Profile</div>
          <div className="chart-period">Update your display information</div>
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', color: '#94a3b8', fontSize: 13, fontWeight: 500, marginBottom: 6 }}>Email Address</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="email" value={editEmail} onChange={e => setEditEmail(e.target.value)}
              style={{ flex: 1, background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9', padding: '10px 14px', fontSize: 14 }} />
            <button onClick={() => setUserEmail(editEmail)}
              style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 8, color: '#3b82f6', padding: '10px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Update</button>
          </div>
        </div>
        <div style={{ fontSize: 12, color: '#64748b' }}>This email is displayed across all dashboard tabs.</div>
      </div>
    </>
  )
}
