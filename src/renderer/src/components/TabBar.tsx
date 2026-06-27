import { useApp } from '../store/app'

export default function TabBar(): React.JSX.Element {
  const tabs = useApp((s) => s.tabs)
  const activeTabId = useApp((s) => s.activeTabId)
  const setActiveTab = useApp((s) => s.setActiveTab)
  const closeTab = useApp((s) => s.closeTab)
  const openLocalTab = useApp((s) => s.openLocalTab)

  return (
    <div className="tabbar">
      {tabs.map((t) => (
        <div
          key={t.id}
          className={`tab ${t.id === activeTabId ? 'active' : ''}`}
          onClick={() => setActiveTab(t.id)}
          title={t.title}
        >
          <span className="kind">{t.kind}</span>
          <span className="title">{t.title}</span>
          <button
            className="close"
            onClick={(e) => {
              e.stopPropagation()
              closeTab(t.id)
            }}
            title="Close"
          >
            ×
          </button>
        </div>
      ))}
      <button className="new" onClick={() => openLocalTab()} title="New local terminal">
        +
      </button>
    </div>
  )
}
