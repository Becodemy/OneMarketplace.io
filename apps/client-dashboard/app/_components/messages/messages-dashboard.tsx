"use client";

import { Icon } from "@iconify/react";
import { useAuth } from "@clerk/nextjs";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { playIncomingMessageSound } from "../../hooks/message-sound";
import {
  type ClientConversation,
  type ClientMessage,
} from "../data/client-data";

type ApiConversation = {
  id: string;
  jobId: string | null;
  unreadCount: number;
  jobTitle: string | null;
  lastMessageAt: string | null;
  lastAttachmentName: string | null;
  lastMessage: { body: string | null; eventType: string | null } | null;
  participants: Array<{
    accountId: string;
    participantType: string;
    name: string;
    avatarUrl: string | null;
  }>;
};

type ApiMessage = {
  id: string;
  senderId: string | null;
  body: string | null;
  createdAt: string;
  replyToMessageId: string | null;
  attachments: Array<{
    file_name: string;
    file_url: string;
    file_size: number;
    mime_type: string;
  }>;
};

const readFile = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("File could not be read."));
    reader.readAsDataURL(file);
  });

export function MessagesDashboard({
  conversationId,
}: {
  conversationId?: string;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { getToken, userId } = useAuth();
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const [attachmentOpen, setAttachmentOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState("");
  const [sending, setSending] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const [typingUser, setTypingUser] = useState<{
    conversationId: string;
    userId: string;
  } | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const markedReadRef = useRef<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    void getToken().then((token) => {
      if (!active || !token) return;
      const socket = io(new URL(process.env.NEXT_PUBLIC_SERVER_URI!).origin, {
        auth: { token, role: "client" },
      });
      socketRef.current = socket;
      socket.on("presence:snapshot", ({ userIds }: { userIds: string[] }) =>
        setOnlineUsers(new Set(userIds)),
      );
      socket.on(
        "presence:update",
        ({ userId: changedUserId, online }: { userId: string; online: boolean }) =>
          setOnlineUsers((current) => {
            const next = new Set(current);
            online ? next.add(changedUserId) : next.delete(changedUserId);
            return next;
          }),
      );
      socket.on(
        "conversation:update",
        ({ conversationId: changedConversationId, messagesChanged }: {
          conversationId: string;
          messagesChanged?: boolean;
        }) => {
          playIncomingMessageSound();
          void queryClient.invalidateQueries({ queryKey: ["client-conversations"] });
          if (messagesChanged !== false)
            void queryClient.invalidateQueries({
              queryKey: ["conversation-messages", changedConversationId],
            });
        },
      );
      socket.on(
        "typing:update",
        ({ conversationId, userId, isTyping }: {
          conversationId: string;
          userId: string;
          isTyping: boolean;
        }) =>
          setTypingUser(isTyping ? { conversationId, userId } : null),
      );
    });
    return () => {
      active = false;
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [getToken, queryClient, userId]);

  const { data: inbox, isLoading: inboxLoading } = useQuery<{
    conversations: ApiConversation[];
    totalUnread: number;
  }>({
    queryKey: ["client-conversations"],
    queryFn: async () => {
      const token = await getToken();
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SERVER_URI}/conversations?role=client`,
        { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.message);
      return result.data;
    },
  });

  const selectedConversation = inbox?.conversations.find(
    ({ id }) => id === conversationId,
  );
  const { data: messageData } = useQuery<{ messages: ApiMessage[] }>({
    queryKey: ["conversation-messages", conversationId],
    enabled: Boolean(selectedConversation),
    queryFn: async () => {
      const token = await getToken();
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SERVER_URI}/conversations/${conversationId}/messages?role=client`,
        { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.message);
      return result.data;
    },
  });

  const conversations: ClientConversation[] = useMemo(
    () =>
      (inbox?.conversations ?? []).map((conversation) => {
        const person = conversation.participants.find(
          ({ accountId }) => accountId !== userId,
        );
        return {
          id: conversation.id,
          person: person?.name ?? "Freelancer",
          avatarUrl: person?.avatarUrl,
          initials: (person?.name ?? "Freelancer")
            .split(" ")
            .map((part) => part[0])
            .join("")
            .slice(0, 2),
          accountType:
            person?.participantType === "AGENCY" ? "Agency" : "Freelancer",
          context: conversation.jobTitle ?? "Direct conversation",
          contextHref: conversation.jobId
            ? `/proposals/${conversation.jobId}`
            : "/proposals",
          online: person ? onlineUsers.has(person.accountId) : false,
          unread: conversation.unreadCount,
          lastMessage:
            conversation.lastMessage?.body ??
            conversation.lastMessage?.eventType ??
            (conversation.lastAttachmentName
              ? `Attachment – ${conversation.lastAttachmentName}`
              : null) ??
            "Conversation started",
          time: conversation.lastMessageAt
            ? formatDistanceToNow(new Date(conversation.lastMessageAt), {
                addSuffix: true,
              })
            : "New",
          messages: [],
        };
      }),
    [inbox, onlineUsers, userId],
  );

  const selectedBase = conversations.find(({ id }) => id === conversationId);
  const selectedMessages: ClientMessage[] = (messageData?.messages ?? []).map(
    (message) => ({
      id: message.id,
      kind: "text",
      sender: message.senderId === userId ? "client" : "talent",
      text: message.body ?? "Shared an attachment.",
      time: formatDistanceToNow(new Date(message.createdAt), {
        addSuffix: true,
      }),
      replyToId: message.replyToMessageId ?? undefined,
      attachment: message.attachments[0]
        ? {
            name: message.attachments[0].file_name,
            size: `${(message.attachments[0].file_size / 1024 / 1024).toFixed(1)} MB`,
            type: message.attachments[0].mime_type,
            url: message.attachments[0].file_url,
          }
        : undefined,
    }),
  );
  const selected = selectedBase
    ? { ...selectedBase, messages: selectedMessages }
    : undefined;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversationId, selectedMessages.length]);

  const filtered = useMemo(
    () =>
      conversations.filter((item) =>
        `${item.person} ${item.context}`
          .toLowerCase()
          .includes(search.toLowerCase()),
      ),
    [conversations, search],
  );

  useEffect(() => {
    const lastMessage = messageData?.messages.findLast(
      ({ id }) => !id.startsWith("optimistic-"),
    );
    if (
      !selectedConversation ||
      !lastMessage ||
      !selectedConversation.unreadCount
    )
      return;
    const readKey = `${selectedConversation.id}:${lastMessage.id}`;
    if (markedReadRef.current === readKey) return;
    markedReadRef.current = readKey;
    queryClient.setQueryData<{
      conversations: ApiConversation[];
      totalUnread: number;
    }>(["client-conversations"], (current) =>
      current
        ? {
            ...current,
            totalUnread: Math.max(
              0,
              current.totalUnread - selectedConversation.unreadCount,
            ),
            conversations: current.conversations.map((conversation) =>
              conversation.id === selectedConversation.id
                ? { ...conversation, unreadCount: 0 }
                : conversation,
            ),
          }
        : current,
    );
    void getToken().then((token) =>
      fetch(
        `${process.env.NEXT_PUBLIC_SERVER_URI}/conversations/${selectedConversation.id}/read?role=client`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ lastReadMessageId: lastMessage.id }),
        },
      ).then((response) => {
        if (!response.ok && markedReadRef.current === readKey)
          markedReadRef.current = null;
      }).catch(() => {
        if (markedReadRef.current === readKey) markedReadRef.current = null;
      }),
    );
  }, [getToken, messageData?.messages, queryClient, selectedConversation]);

  const selectConversation = (conversation: ClientConversation) =>
    router.push(`/messages?conversationId=${conversation.id}`);

  const sendMessage = async (file?: File) => {
    const text = draft.trim();
    if ((!text && !file) || !selected || sending) return;
    const optimisticId = `optimistic-${Date.now()}`;
    setSending(true);
    setDraft("");
    queryClient.setQueryData<{
      conversations: ApiConversation[];
      totalUnread: number;
    }>(["client-conversations"], (current) =>
      current
        ? {
            ...current,
            conversations: current.conversations.map((conversation) =>
              conversation.id === selected.id
                ? {
                    ...conversation,
                    lastMessage: { body: text || null, eventType: null },
                    lastAttachmentName: file?.name ?? null,
                    lastMessageAt: new Date().toISOString(),
                  }
                : conversation,
            ),
          }
        : current,
    );
    queryClient.setQueryData<{ messages: ApiMessage[] }>(
      ["conversation-messages", selected.id],
      (current) => ({
        messages: [
          ...(current?.messages ?? []),
          {
            id: optimisticId,
            senderId: userId ?? null,
            body: text || null,
            createdAt: new Date().toISOString(),
            replyToMessageId: null,
            attachments: file
              ? [{ file_name: file.name, file_url: "", file_size: file.size, mime_type: file.type }]
              : [],
          },
        ],
      }),
    );

    try {
      const token = await getToken();
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SERVER_URI}/conversations/${selected.id}/messages?role=client`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            body: text || undefined,
            attachments: file
              ? [
                  {
                    fileUrl: await readFile(file),
                    fileName: file.name,
                    fileSize: file.size,
                    mimeType: file.type,
                  },
                ]
              : [],
          }),
        },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.message);
      queryClient.setQueryData<{ messages: ApiMessage[] }>(
        ["conversation-messages", selected.id],
        (current) => ({
          messages: (current?.messages ?? []).map((message) =>
            message.id === optimisticId ? result.data : message,
          ),
        }),
      );
    } catch (error) {
      queryClient.setQueryData<{ messages: ApiMessage[] }>(
        ["conversation-messages", selected.id],
        (current) => ({
          messages: (current?.messages ?? []).filter(({ id }) => id !== optimisticId),
        }),
      );
      setDraft(text);
      setFileError(error instanceof Error ? error.message : "Message could not be sent.");
      void queryClient.invalidateQueries({ queryKey: ["client-conversations"] });
      setSending(false);
      return;
    }

    setSending(false);
    socketRef.current?.emit("typing:set", {
      conversationId: selected.id,
      isTyping: false,
    });
    setSelectedFile(null);
    setAttachmentOpen(false);
  };

  const createMeeting = () => {
    if (!selected) return;
    const meetUrl = "https://meet.google.com/new";
    setDraft(`Meeting room: ${meetUrl}`);
    window.open(meetUrl, "_blank", "noopener,noreferrer");
  };

  const chooseFile = (file?: File) => {
    setSelectedFile(null);
    setFileError("");
    if (!file) return;
    const allowedTypes = [
      "application/pdf",
      "image/png",
      "image/jpeg",
      "text/plain",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];
    if (!allowedTypes.includes(file.type)) {
      setFileError("Use PDF, DOCX, PNG, JPG, or TXT files only.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setFileError("The maximum attachment size is 5 MB.");
      return;
    }
    setSelectedFile(file);
  };

  const attachFile = () => selectedFile && void sendMessage(selectedFile);

  return (
    <>
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-[.14em] text-[#62805f] uppercase">
            Project communication
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-.045em] sm:text-4xl">
            Messages
          </h1>
        </div>
        <p className="text-xs text-[#858a82]">
          {conversations.reduce((sum, item) => sum + item.unread, 0)} unread
          messages
        </p>
      </div>

      <div className="mt-7 grid h-[calc(100svh-13rem)] min-h-120 max-h-180 overflow-hidden rounded-2xl border border-black/8 bg-white lg:grid-cols-[360px_minmax(0,1fr)]">
        <section className="flex min-h-0 flex-col border-b border-black/7 lg:border-r lg:border-b-0">
          <header className="shrink-0 p-5">
            <h2 className="font-semibold">Project threads</h2>
            <p className="mt-1 text-[10px] text-[#858a82]">
              Proposals, meetings, contracts, and payments
            </p>
            <label className="mt-4 flex h-11 items-center gap-2 rounded-xl bg-[#f2f4f1] px-3">
              <Icon icon="solar:magnifer-linear" width="18" />
              <span className="sr-only">Search project threads</span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search project threads"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none"
              />
            </label>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto border-t border-black/7">
            {filtered.map((conversation) => (
              <button
                key={conversation.id}
                type="button"
                onClick={() => selectConversation(conversation)}
                className={`flex w-full gap-3 border-b border-black/6 p-4 text-left ${
                  conversationId === conversation.id
                    ? "bg-[#edf4ea]"
                    : "hover:bg-[#f8f9f6]"
                }`}
              >
                <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#527a73] text-xs font-semibold text-white">
                  {conversation.avatarUrl ? (
                    <Image
                      src={conversation.avatarUrl}
                      alt={conversation.person}
                      fill
                      className="rounded-full object-cover"
                    />
                  ) : (
                    conversation.initials
                  )}
                  {conversation.online && (
                    <span className="absolute right-0 bottom-0 h-3 w-3 rounded-full border-2 border-white bg-[#5ca568]" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex justify-between gap-2">
                    <strong className="truncate text-sm">
                      {conversation.person}
                    </strong>
                    <span className="text-[10px] text-[#8a8f87]">
                      {conversation.time}
                    </span>
                  </span>
                  <span className="mt-1 block truncate text-[10px] text-[#7b8078]">
                    {conversation.accountType} · {conversation.context}
                  </span>
                  <span className="mt-1 block truncate text-xs text-[#656b64]">
                    {conversation.lastMessage}
                  </span>
                </span>
                {conversation.unread > 0 && (
                  <span className="mt-7 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#5f8d5c] px-1 text-[9px] text-white">
                    {conversation.unread}
                  </span>
                )}
              </button>
            ))}
            {!filtered.length && (
              <p className="p-8 text-center text-xs text-[#858a82]">
                No project threads found.
              </p>
            )}
          </div>
        </section>

        {selected ? (
          <section className="flex min-h-0 flex-col">
            <header className="flex shrink-0 items-center justify-between gap-4 border-b border-black/7 p-4 sm:p-5">
              <div className="flex items-center gap-3">
                <span className="relative flex h-10 w-10 items-center justify-center rounded-full bg-[#527a73] text-xs font-semibold text-white">
                  {selected.avatarUrl ? (
                    <Image
                      src={selected.avatarUrl}
                      alt={selected.person}
                      fill
                      className="rounded-full object-cover"
                    />
                  ) : (
                    selected.initials
                  )}
                </span>
                <div>
                  <h2 className="text-sm font-semibold">{selected.person}</h2>
                  <p className="mt-1 text-[10px] text-[#7b8078]">
                    {typingUser?.conversationId === selected.id
                      ? "Typing..."
                      : `${selected.accountType} · ${selected.online ? "Online" : "Offline"}`}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={createMeeting}
                className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-black/10 px-3 text-xs font-semibold"
              >
                <Icon icon="solar:videocamera-record-linear" width="18" />
                Create meeting
              </button>
            </header>

            <div className="flex shrink-0 items-center justify-between border-b border-black/7 bg-[#fafbf9] px-5 py-3 text-xs">
              <span className="truncate">{selected.context}</span>
              <Link
                href={selected.contextHref}
                className="shrink-0 font-semibold text-[#52784f]"
              >
                View project details
              </Link>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-[#fbfcfa] p-5">
              <div className="flex items-center gap-3 py-1">
                <span className="h-px flex-1 bg-black/7" />
                <span className="text-[9px] font-medium text-[#969b94]">
                  Project activity
                </span>
                <span className="h-px flex-1 bg-black/7" />
              </div>
              {selected.messages.map((message) => (
                <TransactionMessage
                  key={message.id}
                  message={message}
                  messages={selected.messages}
                />
              ))}
              {!selected.messages.length && (
                <p className="py-12 text-center text-xs text-[#858a82]">
                  This project thread is ready. Send the first message.
                </p>
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="shrink-0 border-t border-black/7 bg-white p-4">
              <div className="flex items-end gap-2 rounded-xl border border-black/10 p-2">
                <button
                  type="button"
                  aria-label="Attach file"
                  onClick={() => setAttachmentOpen(true)}
                  className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg hover:bg-black/4"
                >
                  <Icon icon="solar:paperclip-linear" width="20" />
                </button>
                <textarea
                  value={draft}
                  onChange={(event) => {
                    setDraft(event.target.value);
                    socketRef.current?.emit("typing:set", {
                      conversationId: selected.id,
                      isTyping: Boolean(event.target.value.trim()),
                    });
                  }}
                  onBlur={() =>
                    socketRef.current?.emit("typing:set", {
                      conversationId: selected.id,
                      isTyping: false,
                    })
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void sendMessage();
                    }
                  }}
                  rows={1}
                  placeholder="Reply in this project thread…"
                  className="min-h-10 flex-1 resize-none py-2 text-sm outline-none"
                />
                <button
                  type="button"
                  onClick={() => void sendMessage()}
                  disabled={sending}
                  aria-label="Send message"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#252724] text-white disabled:opacity-50"
                >
                  <Icon icon="solar:plain-2-bold" width="18" />
                </button>
              </div>
            </div>
          </section>
        ) : (
          <section className="flex min-h-0 items-center justify-center p-8 text-center">
            <div>
              <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#edf4ea] text-[#52784f]">
                <Icon icon="solar:chat-round-dots-linear" width="30" />
              </span>
              <h2 className="mt-5 font-semibold">
                {inboxLoading
                  ? "Loading conversation..."
                  : "Conversation does not exist"}
              </h2>
              <p className="mt-2 max-w-sm text-sm leading-6 text-[#7b8078]">
                {inboxLoading
                  ? "Please wait while the conversation is loaded."
                  : "The conversation ID is missing or you do not have access to it."}
              </p>
            </div>
          </section>
        )}
      </div>
      {attachmentOpen && (
        <AttachmentModal
          file={selectedFile}
          error={fileError}
          uploading={sending}
          onChoose={chooseFile}
          onClose={() => {
            setAttachmentOpen(false);
            setSelectedFile(null);
            setFileError("");
          }}
          onAttach={attachFile}
        />
      )}
    </>
  );
}

function AttachmentModal({
  file,
  error,
  uploading,
  onChoose,
  onClose,
  onAttach,
}: {
  file: File | null;
  error: string;
  uploading: boolean;
  onChoose: (file?: File) => void;
  onClose: () => void;
  onAttach: () => void;
}) {
  return (
    <div className="fixed inset-0 z-90 grid place-items-center bg-[#1d221d]/45 p-5 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#edf4ea] text-[#52784f]">
            <Icon icon="solar:paperclip-linear" width="23" />
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close attachment modal"
            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-black/8"
          >
            <Icon icon="solar:close-circle-linear" width="19" />
          </button>
        </div>
        <h2 className="mt-4 text-xl font-semibold">Add an attachment</h2>
        <p className="mt-2 text-sm leading-6 text-[#737970]">
          Review the file before sharing it in this project thread.
        </p>
        <label className="mt-5 flex cursor-pointer flex-col items-center rounded-2xl border border-dashed border-black/15 bg-[#fafbf9] px-5 py-8 text-center">
          <Icon
            icon="solar:upload-minimalistic-linear"
            width="25"
            className="text-[#52784f]"
          />
          <span className="mt-2 text-sm font-semibold">Choose a file</span>
          <span className="mt-1 text-[11px] text-[#858a82]">
            PDF, DOCX, PNG, JPG, or TXT · Maximum 5 MB
          </span>
          <input
            type="file"
            accept=".pdf,.docx,.png,.jpg,.jpeg,.txt"
            className="sr-only"
            onChange={(event) => onChoose(event.target.files?.[0])}
          />
        </label>
        {file && (
          <div className="mt-4 flex items-center gap-3 rounded-xl bg-[#f0f3ee] p-3">
            <Icon icon="solar:file-text-linear" width="21" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold">{file.name}</p>
              <p className="mt-0.5 text-[10px] text-[#858a82]">
                {(file.size / 1024 / 1024).toFixed(1)} MB
              </p>
            </div>
            <Icon
              icon="solar:check-circle-bold"
              width="19"
              className="text-[#5d8759]"
            />
          </div>
        )}
        {error && (
          <p role="alert" className="mt-3 text-xs font-medium text-[#9a5953]">
            {error}
          </p>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-xl border border-black/10 px-4 text-sm font-semibold"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onAttach}
            disabled={!file || uploading}
            className="h-10 rounded-xl bg-[#252724] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-35"
          >
            {uploading ? "Uploading…" : "Attach file"}
          </button>
        </div>
      </div>
    </div>
  );
}

function TransactionMessage({
  message,
  messages,
}: {
  message: ClientMessage;
  messages: ClientMessage[];
}) {
  if (message.kind === "text") {
    const repliedMessage = message.replyToId
      ? messages.find((item) => item.id === message.replyToId)
      : undefined;
    return (
      <div
        className={`flex ${
          message.sender === "client" ? "justify-end" : "justify-start"
        }`}
      >
        <div
          className={`max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-6 ${
            message.sender === "client"
              ? "bg-[#252724] text-white"
              : "bg-[#edf2eb]"
          }`}
        >
          {repliedMessage && (
            <div
              className={`mb-2 rounded-lg border-l-3 px-3 py-2 ${
                message.sender === "client"
                  ? "border-[#9fbd9b] bg-white/10"
                  : "border-[#6f966b] bg-white/65"
              }`}
            >
              <p
                className={`text-[9px] font-semibold tracking-wide uppercase ${
                  message.sender === "client"
                    ? "text-white/65"
                    : "text-[#52784f]"
                }`}
              >
                Replying to proposal
              </p>
              <p className="mt-0.5 truncate text-[10px] font-medium opacity-80">
                {repliedMessage.kind === "proposal"
                  ? repliedMessage.title
                  : "Previous message"}
              </p>
            </div>
          )}
          <p>{message.text}</p>
          {message.attachment && (
            <div
              className={`mt-3 flex items-center gap-3 rounded-xl p-3 ${message.sender === "client" ? "bg-white/10" : "bg-white"}`}
            >
              <Icon icon="solar:file-text-linear" width="20" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-semibold">
                  {message.attachment.name}
                </span>
                <span className="block text-[9px] opacity-60">
                  {message.attachment.size}
                </span>
              </span>
              {message.attachment.url && (
                <a
                  href={message.attachment.url}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Download ${message.attachment.name}`}
                >
                  <Icon icon="solar:download-minimalistic-linear" width="17" />
                </a>
              )}
            </div>
          )}
          <p
            className={`mt-1 text-[9px] ${
              message.sender === "client" ? "text-white/50" : "text-[#8a8f87]"
            }`}
          >
            {message.time}
          </p>
        </div>
      </div>
    );
  }

  if (message.kind === "payment") {
    return (
      <div className="mx-auto flex max-w-xl items-center gap-3 rounded-xl border border-[#d1dfcd] bg-[#edf4ea] px-4 py-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-[#52784f]">
          <Icon icon="solar:shield-check-linear" width="19" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold text-[#486d45]">
            Payment {message.status.toLowerCase()}
          </p>
          <p className="mt-1 truncate text-[10px] text-[#697467]">
            {message.title}
          </p>
        </div>
        <strong className="text-xs">${message.amount.toLocaleString()}</strong>
      </div>
    );
  }

  const eventStyle = {
    proposal: {
      icon: "solar:document-text-linear",
      eyebrow: "Proposal received",
      tone: "bg-[#eef3eb] text-[#52784f]",
    },
    meeting: {
      icon: "solar:videocamera-record-linear",
      eyebrow: "Project meeting",
      tone: "bg-[#e8eff4] text-[#527187]",
    },
    contract: {
      icon: "solar:case-round-linear",
      eyebrow: "Contract offer",
      tone: "bg-[#eeeaf5] text-[#6b5d82]",
    },
    milestone: {
      icon: "solar:flag-linear",
      eyebrow: "Milestone update",
      tone: "bg-[#f2efe3] text-[#7b7044]",
    },
  }[message.kind];

  return (
    <article
      className={`w-full rounded-2xl border border-black/8 bg-white p-5 ${
        message.sender === "client" ? "ml-auto" : "mr-auto"
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${eventStyle.tone}`}
        >
          <Icon icon={eventStyle.icon} width="20" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[9px] font-semibold tracking-wide text-[#798077] uppercase">
              {eventStyle.eyebrow}
            </p>
            <span className="text-[9px] text-[#969b94]">{message.time}</span>
          </div>
          <h3 className="mt-2 text-sm font-semibold">{message.title}</h3>

          {message.kind === "proposal" && (
            <>
              <p className="mt-3 text-xs leading-5 text-[#6c736a]">
                {message.summary}
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {message.skills.slice(0, 4).map((skill) => (
                  <span
                    key={skill}
                    className="rounded-lg bg-[#f0f3ed] px-2.5 py-1.5 text-[10px]"
                  >
                    {skill}
                  </span>
                ))}
              </div>
              <EventFooter
                detail={`$${message.bid.toLocaleString()} · ${message.duration}`}
                href={message.href}
                action="View proposal"
              />
            </>
          )}

          {message.kind === "meeting" && (
            <EventFooter
              detail={message.startsAt}
              href={message.meetUrl}
              action="Join meeting"
              external
            />
          )}

          {message.kind === "contract" && (
            <>
              <p className="mt-2 text-[10px] text-[#6c736a]">
                ${message.amount.toLocaleString()} · {message.status}
              </p>
              {message.status === "Awaiting acceptance" && (
                <p className="mt-2 text-[9px] leading-4 text-[#858b83]">
                  The contract becomes active only after the talent accepts the
                  offer.
                </p>
              )}
              <EventFooter
                detail={message.status}
                href={message.href}
                action="View offer"
              />
            </>
          )}

          {message.kind === "milestone" && (
            <EventFooter
              detail={`$${message.amount.toLocaleString()} · ${message.status}`}
              href={message.href}
              action="View milestone"
            />
          )}
        </div>
      </div>
    </article>
  );
}

function EventFooter({
  detail,
  href,
  action,
  external = false,
}: {
  detail: string;
  href: string;
  action: string;
  external?: boolean;
}) {
  return (
    <div className="mt-3 flex items-center justify-between gap-3 border-t border-black/6 pt-3">
      <span className="truncate text-[9px] font-medium text-[#747b72]">
        {detail}
      </span>
      <a
        href={href}
        target={external ? "_blank" : undefined}
        rel={external ? "noreferrer" : undefined}
        className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg bg-[#252724] px-3 text-[9px] font-semibold text-white"
      >
        {action}
        <Icon icon="solar:arrow-right-up-linear" width="12" />
      </a>
    </div>
  );
}
