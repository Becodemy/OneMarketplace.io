"use client";

import { useAuth } from "@clerk/nextjs";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { io } from "socket.io-client";
import { usePathname } from "next/navigation";
import { playIncomingMessageSound, unlockMessageSound } from "./message-sound";

export const useUnreadMessages = () => {
  const { getToken } = useAuth();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const { data } = useQuery<{ totalUnread: number }>({
    queryKey: ["freelancer-conversations"],
    queryFn: async () => {
      const token = await getToken();
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SERVER_URI}/conversations?role=freelancer`,
        { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.message);
      return result.data;
    },
  });

  useEffect(() => {
    const unlock = () => {
      unlockMessageSound();
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  useEffect(() => {
    if (pathname === "/messages") return;
    let active = true;
    let socket: ReturnType<typeof io> | undefined;
    void getToken().then((token) => {
      if (!active || !token) return;
      socket = io(new URL(process.env.NEXT_PUBLIC_SERVER_URI!).origin, {
        auth: { token, role: "freelancer" },
      });
      socket.on("conversation:update", () => {
        playIncomingMessageSound();
        void queryClient.invalidateQueries({
          queryKey: ["freelancer-conversations"],
        });
      });
    });

    return () => {
      active = false;
      socket?.disconnect();
    };
  }, [getToken, pathname, queryClient]);

  return data?.totalUnread ?? 0;
};
