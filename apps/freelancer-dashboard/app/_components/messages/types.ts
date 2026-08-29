type MessageBase = {
  id: number;
  sender: "me" | "client";
  time: string;
};

export type TextMessage = MessageBase & {
  kind: "text";
  text: string;
  replyToId?: number;
  attachment?: {
    name: string;
    size: string;
    type?: string;
  };
};

export type ProposalMessage = MessageBase & {
  kind: "proposal";
  title: string;
  coverLetter: string;
  bid: string;
  duration: string;
  skills: string[];
};

export type MeetingMessage = MessageBase & {
  kind: "meeting";
  title: string;
  schedule: string;
  meetingUrl: string;
};

export type ContractMessage = MessageBase & {
  kind: "contract";
  title: string;
  budget: string;
  duration: string;
  status: "pending" | "accepted" | "declined";
};

export type MilestoneMessage = MessageBase & {
  kind: "milestone";
  title: string;
  amount: string;
  dueDate: string;
  status: "funded" | "submitted" | "changes-requested" | "approved";
  note?: string;
};

export type PaymentMessage = MessageBase & {
  kind: "payment";
  title: string;
  amount: string;
  description: string;
  status: "escrowed" | "released";
};

export type ChatMessage =
  | TextMessage
  | ProposalMessage
  | MeetingMessage
  | ContractMessage
  | MilestoneMessage
  | PaymentMessage;

export type Conversation = {
  id: number;
  client: string;
  initials: string;
  company: string;
  project: string;
  online: boolean;
  unread: number;
  lastMessage: string;
  lastMessageTime: string;
  messages: ChatMessage[];
};

export type FreelancerConversation = {
  id: string;
  person: string;
  avatarUrl?: string | null;
  initials: string;
  accountType: "Client";
  context: string;
  contextHref: string;
  online: boolean;
  unread: number;
  lastMessage: string;
  time: string;
  messages: FreelancerMessage[];
};

export type FreelancerMessage =
  | {
      id: string;
      kind: "text";
      sender: "client" | "talent";
      text: string;
      time: string;
      replyToId?: string;
      attachment?: {
        name: string;
        size: string;
        type: string;
        url?: string;
      };
    }
  | {
      id: string;
      kind: "proposal";
      sender: "talent";
      title: string;
      bid: number;
      duration: string;
      summary: string;
      skills: string[];
      href: string;
      time: string;
    }
  | {
      id: string;
      kind: "meeting";
      sender: "client" | "talent";
      title: string;
      startsAt: string;
      meetUrl: string;
      time: string;
    }
  | {
      id: string;
      kind: "contract";
      sender: "client";
      title: string;
      amount: number;
      status: "Awaiting acceptance" | "Active";
      href: string;
      time: string;
    }
  | {
      id: string;
      kind: "milestone";
      sender: "client" | "talent";
      title: string;
      amount: number;
      status: "Funded" | "Submitted" | "Changes requested" | "Approved";
      href: string;
      time: string;
    }
  | {
      id: string;
      kind: "payment";
      sender: "system";
      title: string;
      amount: number;
      status: "Protected in escrow" | "Released";
      time: string;
    };
