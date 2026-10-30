import type { AnalysisEnvelope } from "../components/AnalysisCard";

export type ChatMsg =
  | {
      kind: "text";
      role: "user" | "ai";
      text: string;
      sources?: string[];
      files?: string[];
      analysis?: AnalysisEnvelope;
    }
  | { kind: "demo"; role: "user" | "ai"; qId: string; note?: string; syntheticData?: any };

export type Conversation = {
  id: number;
  title: string;
  preview: string;
  time: string;
  temp?: boolean;
  messages: ChatMsg[];
};

export const conversations: Conversation[] = [
  {
    id: 1,
    title: "New AI Chat",
    preview: "Start a new conversation.",
    time: "Just now",
    messages: [
      {
        kind: "text",
        role: "ai",
        text: "Hello! I am MRPL Sovereign AI. How can I assist you today?"
      }
    ]
  }
];

export const conversationById = (id: number): Conversation => {
  return conversations.find((c) => c.id === id) || conversations[0];
};

export const demoQ = (qId: string): ChatMsg => ({ kind: "demo", role: "user", qId });
export const demoA = (qId: string): ChatMsg => ({ kind: "demo", role: "ai", qId });
export const u = (text: string): ChatMsg => ({ kind: "text", role: "user", text });
export const a = (text: string): ChatMsg => ({ kind: "text", role: "ai", text });
