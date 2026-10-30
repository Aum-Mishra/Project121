const sections = [
  {
    title: "Profile & Account",
    settings: [
      { label: "Display Name", value: "Anita Rao", type: "text" },
      { label: "Role", value: "Process Engineer", type: "text" },
      { label: "Department", value: "Process Engineering", type: "text" },
      { label: "Classification Level", value: "CONFIDENTIAL", type: "select" },
    ],
  },
  {
    title: "Workbench Preferences",
    settings: [
      { label: "Default Execution Mode", value: "Auto Select", type: "select" },
      { label: "Default Project", value: "CDU-4 Inspection Analysis", type: "select" },
      { label: "Show Execution Router", value: "Enabled", type: "toggle" },
      { label: "Show Evidence Panel", value: "Enabled", type: "toggle" },
    ],
  },
  {
    title: "AI & Model Settings",
    settings: [
      { label: "Preferred Reasoning Model", value: "QwQ-32B (Auto)", type: "select" },
      { label: "Max Context Length", value: "128K tokens", type: "select" },
      { label: "Show Model Info in Responses", value: "Enabled", type: "toggle" },
      { label: "Show Execution Path Labels", value: "Enabled", type: "toggle" },
    ],
  },
  {
    title: "Notifications",
    settings: [
      { label: "Approval Requests", value: "Enabled", type: "toggle" },
      { label: "Task Completion", value: "Enabled", type: "toggle" },
      { label: "Security Alerts", value: "Enabled", type: "toggle" },
      { label: "System Health Warnings", value: "Enabled", type: "toggle" },
    ],
  },
];

export default function Settings() {
  return (
    <div className="flex-1 overflow-y-auto" style={{ background: "var(--color-bg-secondary)" }}>
      <div className="max-w-3xl mx-auto px-8 py-8">
        <div className="mb-6">
          <h1 className="text-xl font-semibold" style={{ color: "var(--color-text-primary)" }}>Settings</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--color-text-muted)" }}>Workbench and account preferences</p>
        </div>

        {/* Security notice */}
        <div className="mb-6 px-4 py-3 rounded text-xs" style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", color: "#15803D" }}>
          🟢 Some settings are managed by your MRPL administrator and cannot be changed here. Contact IT for access changes.
        </div>

        <div className="space-y-5">
          {sections.map((section) => (
            <div key={section.title} className="bg-white rounded border overflow-hidden" style={{ borderColor: "var(--color-border)" }}>
              <div className="px-6 py-4 border-b font-semibold text-sm" style={{ borderColor: "var(--color-border)", color: "var(--color-text-primary)" }}>
                {section.title}
              </div>
              <div>
                {section.settings.map((setting, i) => (
                  <div
                    key={setting.label}
                    className="flex items-center justify-between px-6 py-4 border-b last:border-0"
                    style={{ borderColor: "var(--color-border)" }}
                  >
                    <div>
                      <div className="text-sm font-medium" style={{ color: "var(--color-text-primary)", fontSize: 13 }}>{setting.label}</div>
                    </div>
                    <div>
                      {setting.type === "toggle" ? (
                        <button
                          className="w-11 h-6 rounded-full relative transition-colors"
                          style={{ background: setting.value === "Enabled" ? "var(--color-teal)" : "#CBD5E1" }}
                        >
                          <span
                            className="absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform"
                            style={{ transform: setting.value === "Enabled" ? "translateX(26px)" : "translateX(2px)" }}
                          />
                        </button>
                      ) : setting.type === "select" ? (
                        <select
                          defaultValue={setting.value}
                          className="text-sm border rounded px-3 py-1.5 outline-none"
                          style={{ borderColor: "var(--color-border)", color: "var(--color-text-primary)", fontSize: 13 }}
                        >
                          <option>{setting.value}</option>
                        </select>
                      ) : (
                        <input
                          type="text"
                          defaultValue={setting.value}
                          className="text-sm border rounded px-3 py-1.5 outline-none w-48"
                          style={{ borderColor: "var(--color-border)", color: "var(--color-text-primary)", fontSize: 13 }}
                        />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button className="text-sm px-4 py-2 rounded border" style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}>Reset to Defaults</button>
          <button className="text-sm px-6 py-2 rounded font-medium text-white" style={{ background: "var(--color-teal)" }}>Save Changes</button>
        </div>
      </div>
    </div>
  );
}
