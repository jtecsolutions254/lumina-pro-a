export type RuntimeType = "static-browser" | "vite-react" | "nextjs" | "node-api" | "image-studio";
export type TemplateKind = "portfolio" | "saas" | "dashboard" | "ecommerce" | "blog" | "admin";

export type FileRecord = {
  path: string;
  content: string;
  language?: string;
  updatedAt?: string;
};

export type FilePatchRecord = {
  id: string;
  path: string;
  action: "create" | "update" | "delete";
  summary: string;
  oldContent?: string;
  newContent?: string;
  diff?: string;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
};

export type UserRecord = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
};

export type ConversationKind = "general" | "image";

export type ConversationRecord = {
  id: string;
  ownerId: string;
  kind: ConversationKind;
  title: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
};

export type CommitRecord = {
  id: string;
  message: string;
  author: "user" | "ai" | "system";
  createdAt: string;
  filesChanged: string[];
  patches?: FilePatchRecord[];
};

export type TaskRecord = {
  id: string;
  title: string;
  status: "todo" | "in_progress" | "done" | "blocked";
  priority: "low" | "medium" | "high";
  createdAt: string;
};

export type ProjectRecord = {
  id: string;
  ownerId?: string;
  name: string;
  description: string;
  runtime: RuntimeType;
  template?: TemplateKind;
  files: FileRecord[];
  messages: ChatMessage[];
  commits: CommitRecord[];
  tasks: TaskRecord[];
  linkedImageIds?: string[];
  createdAt: string;
  updatedAt: string;
};

export type ImageEditRecord = {
  id: string;
  prompt: string;
  createdAt: string;
  sourceImageId?: string;
};

export type ImageGeneration = {
  id: string;
  ownerId?: string;
  prompt: string;
  enhancedPrompt: string;
  style: string;
  aspectRatio: string;
  imageUrl: string;
  provider: string;
  referenceImageUrl?: string;
  parentImageId?: string;
  linkedProjectIds?: string[];
  saved?: boolean;
  editHistory?: ImageEditRecord[];
  createdAt: string;
  updatedAt?: string;
};

export type FileChange = {
  path: string;
  content?: string;
  action: "create" | "update" | "delete";
  summary: string;
};

export type ProviderTextInput = {
  message: string;
  projectName: string;
  files: FileRecord[];
};

export type ProviderCodeOutput = {
  reply: string;
  changes: FileChange[];
  tasks: TaskRecord[];
};

export type ReferenceImageInput = {
  dataUrl: string;
  mimeType?: string;
  name?: string;
};

export type ProviderImageInput = {
  prompt: string;
  style: string;
  aspectRatio: string;
  referenceImage?: ReferenceImageInput;
  editTargetImageUrl?: string;
  priorMessages?: ChatMessage[];
};
