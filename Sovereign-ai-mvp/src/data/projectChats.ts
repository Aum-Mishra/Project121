export type PcMsg = 
  | { kind: "text"; role: "user" | "ai"; author: string; text: string; files?: string[]; approval?: any }
  | { kind: "demo"; role: "user" | "ai"; author?: string; qId: string; syntheticData?: any };

export type ProjectConv = {
  id: string;
  title: string;
  preview: string;
  time: string;
  messages: PcMsg[];
};

export type Project = {
  name: string;
  convs: ProjectConv[];
};

export const projectConversations: Project[] = [
  {
    name: "P-102 Integrity Assessment",
    convs: [
      {
        id: "p1-general",
        title: "General Discussion",
        preview: "Project initialized.",
        time: "Just now",
        messages: [{ kind: "text", role: "ai", author: "System", text: "Project initialized." }]
      }
    ]
  },
  {
    name: "CDU-4 Turnaround Planning",
    convs: [
      {
        id: "p2-general",
        title: "General Discussion",
        preview: "Project initialized.",
        time: "Just now",
        messages: [{ kind: "text", role: "ai", author: "System", text: "Project initialized." }]
      }
    ]
  },
  {
    name: "Q3 Safety & Environmental",
    convs: [
      {
        id: "p3-general",
        title: "General Discussion",
        preview: "Project initialized.",
        time: "Just now",
        messages: [{ kind: "text", role: "ai", author: "System", text: "Project initialized." }]
      }
    ]
  }
];

export const convsByProjectName = (name: string): ProjectConv[] => {
  const p = projectConversations.find(p => p.name === name);
  return p ? p.convs : [];
};

export const flatProjectConvs = () => {
  return projectConversations.flatMap(p => 
    p.convs.map(c => ({
      project: p.name,
      conv: c
    }))
  );
};

export const convOwner = (convId: string) => {
  return "System";
};

export const projectContributors = (convId: string) => {
  return ["Anita Rao (You)", "System"];
};
