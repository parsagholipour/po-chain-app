export type AssistantRole = "user" | "assistant";

export type AssistantSourceKind =
  | "dashboard"
  | "analytics"
  | "purchase_order"
  | "stock_order"
  | "manufacturing_order"
  | "shipping"
  | "product"
  | "manufacturer"
  | "sale_channel"
  | "logistics_partner";

export type AssistantSource = {
  kind: AssistantSourceKind;
  id: string;
  label: string;
  href: string;
};

export type AssistantPageContextEntityType =
  | "po"
  | "so"
  | "mo"
  | "shipping"
  | "dashboard"
  | "analytics";

export type AssistantPageContext = {
  pathname: string;
  search: string;
  entityType?: AssistantPageContextEntityType;
  entityId?: string;
};

export type AssistantMessageState = "ready" | "streaming" | "error";

export type AssistantMessage = {
  id: string;
  role: AssistantRole;
  content: string;
  createdAt: string;
  sources?: AssistantSource[];
  state?: AssistantMessageState;
};

export type AssistantStreamEvent =
  | { type: "chunk"; content: string }
  | { type: "sources"; sources: AssistantSource[] }
  | { type: "done" }
  | { type: "error"; message: string };
