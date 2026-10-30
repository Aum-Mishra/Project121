const roles = [
  { name: "Inspection Engineer", users: 8 },
  { name: "Process Engineer", users: 12 },
  { name: "HSE Officer", users: 5 },
  { name: "Procurement Officer", users: 6 },
  { name: "Manager", users: 4 },
  { name: "Developer", users: 3 },
  { name: "Administrator", users: 2 },
];

const permissions = ["View", "Search", "Upload", "Analyze", "Generate", "Execute", "Approve", "Admin"];

const matrix: Record<string, boolean[]> = {
  "Inspection Engineer": [true, true, true, true, false, false, false, false],
  "Process Engineer": [true, true, true, true, true, false, false, false],
  "HSE Officer": [true, true, true, true, true, false, true, false],
  "Procurement Officer": [true, true, true, true, false, false, false, false],
  "Manager": [true, true, false, true, true, false, true, false],
  "Developer": [true, true, true, true, true, true, false, false],
  "Administrator": [true, true, true, true, true, true, true, true],
};

export default function RBAC() {
  return (
    <div className="flex-1 overflow-y-auto" style={{ background: "var(--color-bg-secondary)" }}>
      <div className="max-w-6xl mx-auto px-8 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold" style={{ color: "var(--color-text-primary)" }}>RBAC & Access Control</h1>
            <p className="text-sm mt-0.5" style={{ color: "var(--color-text-muted)" }}>Role-based permissions — enforced at all levels of the Sovereign AI Workbench</p>
          </div>
          <div className="flex gap-2">
            <button className="text-xs px-3 py-2 rounded border font-medium" style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}>+ New Role</button>
            <button className="text-xs px-3 py-2 rounded font-medium text-white" style={{ background: "var(--color-teal)" }}>+ Add User</button>
          </div>
        </div>

        {/* Role Summary Cards */}
        <div className="grid grid-cols-7 gap-3 mb-6">
          {roles.map((role) => (
            <div key={role.name} className="bg-white rounded border px-4 py-3 cursor-pointer hover:shadow-sm transition-all" style={{ borderColor: "var(--color-border)" }}>
              <div className="text-xs font-semibold" style={{ color: "var(--color-text-primary)", fontSize: 12 }}>{role.name}</div>
              <div className="text-lg font-semibold mt-1" style={{ color: "var(--color-teal)" }}>{role.users}</div>
              <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>users</div>
            </div>
          ))}
        </div>

        {/* Permission Matrix */}
        <div className="bg-white rounded border overflow-hidden mb-6" style={{ borderColor: "var(--color-border)" }}>
          <div className="px-5 py-3.5 border-b font-semibold text-sm" style={{ borderColor: "var(--color-border)", color: "var(--color-text-primary)" }}>
            Permission Matrix — Base Roles
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                  <th className="text-left px-5 py-3 text-xs font-semibold" style={{ color: "var(--color-text-muted)", background: "var(--color-surface-subtle)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", minWidth: 180 }}>Role</th>
                  {permissions.map((p) => (
                    <th key={p} className="text-center px-4 py-3 text-xs font-semibold" style={{ color: "var(--color-text-muted)", background: "var(--color-surface-subtle)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", minWidth: 80 }}>{p}</th>
                  ))}
                  <th className="px-5 py-3" style={{ background: "var(--color-surface-subtle)" }} />
                </tr>
              </thead>
              <tbody>
                {roles.map((role, i) => (
                  <tr key={role.name} className="hover:bg-slate-50" style={{ borderBottom: i < roles.length - 1 ? "1px solid var(--color-border)" : "none" }}>
                    <td className="px-5 py-3">
                      <div className="font-medium text-sm" style={{ color: "var(--color-text-primary)", fontSize: 13 }}>{role.name}</div>
                      <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>{role.users} users</div>
                    </td>
                    {(matrix[role.name] || []).map((allowed, j) => (
                      <td key={j} className="text-center px-4 py-3">
                        {allowed ? (
                          <span className="text-sm font-bold" style={{ color: "var(--color-success)" }}>✓</span>
                        ) : (
                          <span className="text-sm" style={{ color: "var(--color-border-strong)" }}>—</span>
                        )}
                      </td>
                    ))}
                    <td className="px-5 py-3">
                      <button className="text-xs px-2 py-1 rounded border hover:bg-slate-100" style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)", fontSize: 11 }}>Edit</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Additional Permission Categories */}
        <div className="grid grid-cols-2 gap-4">
          {[
            { title: "Project-Level Permissions", items: ["View project", "Edit project settings", "Add/remove contributors", "Delete project", "Export project data"] },
            { title: "Agent & Tool Permissions", items: ["Use Research Agent", "Use Coding Agent", "Use Engineering Agent", "Execute in Sandbox", "Install dependencies"] },
            { title: "Knowledge Permissions", items: ["Query knowledge base", "Upload documents", "Create collections", "Delete documents", "Manage notebook sources"] },
            { title: "Document Permissions", items: ["View CONFIDENTIAL", "View RESTRICTED", "Generate artifacts", "Export documents", "Apply watermarks"] },
          ].map((cat) => (
            <div key={cat.title} className="bg-white rounded border p-5" style={{ borderColor: "var(--color-border)" }}>
              <div className="font-semibold text-sm mb-3" style={{ color: "var(--color-text-primary)" }}>{cat.title}</div>
              <div className="space-y-1">
                {cat.items.map((item) => (
                  <div key={item} className="flex items-center gap-2 text-xs" style={{ color: "var(--color-text-secondary)" }}>
                    <span style={{ color: "var(--color-text-muted)" }}>·</span>
                    {item}
                  </div>
                ))}
              </div>
              <button className="mt-3 text-xs px-2 py-1 rounded border" style={{ borderColor: "var(--color-border)", color: "var(--color-teal)" }}>Configure →</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
