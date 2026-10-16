"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, BellRing, Check, Send, AlertCircle } from "lucide-react";
import {
  getPushPermissionStatus,
  registerForPushNotifications,
  PushPermissionStatus,
} from "@/utils/pushClient";

interface NotificationPermissionBannerProps {
  role: "driver" | "rider";
  userId?: string;
  className?: string;
}

export function NotificationPermissionBanner({
  role,
  userId,
  className = "",
}: NotificationPermissionBannerProps) {
  const [status, setStatus] = useState<PushPermissionStatus>("default");
  const [loading, setLoading] = useState(false);
  const [testSent, setTestSent] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    setStatus(getPushPermissionStatus());
  }, []);

  const handleEnablePush = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const result = await registerForPushNotifications(role, userId);
      if (result.success) {
        setStatus("granted");
      } else {
        setErrorMsg(result.error || "Failed to enable notifications");
        setStatus(getPushPermissionStatus());
      }
    } catch (err: unknown) {
      const error = err as Error;
      setErrorMsg(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSendTestPush = async () => {
    setTestSent(true);
    try {
      if ("serviceWorker" in navigator) {
        const registration = await navigator.serviceWorker.ready;
        const sub = await registration.pushManager.getSubscription();
        if (sub) {
          await fetch("/api/push/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              subscription: sub.toJSON(),
              payload: {
                title: role === "driver" ? "🚖 Dispatch Alert (Test)" : "SOLO Trip Update (Test)",
                body:
                  role === "driver"
                    ? "New R120 trip request near Sandton City! Open to accept."
                    : "Your driver is 3 minutes away in a White Toyota Corolla. PIN: 4892",
                role,
                icon: role === "driver" ? "/driver-icon-192.png" : "/rider-icon-192.png",
                url: role === "driver" ? "/driver" : "/rider",
              },
            }),
          });
        } else {
          // Local fallback notification if pushManager not connected
          registration.showNotification("SOLO Test Notification", {
            body: "Push notification alert test successful!",
            icon: role === "driver" ? "/driver-icon-192.png" : "/rider-icon-192.png",
          });
        }
      }
    } catch (err) {
      console.error("Test notification error:", err);
    } finally {
      setTimeout(() => setTestSent(false), 3000);
    }
  };

  if (status === "unsupported") {
    return null; // Don't clutter UI on unsupported environments
  }

  const isDriver = role === "driver";

  return (
    <div
      className={`p-3 sm:p-4 rounded-2xl border transition-all ${
        status === "granted"
          ? "bg-zinc-900/60 border-zinc-800 text-zinc-300"
          : "bg-gradient-to-r from-blue-950/80 to-indigo-950/80 border-blue-800/50 text-white"
      } ${className}`}
    >
      <div className="flex items-center justify-between gap-2.5 sm:gap-3">
        <div className="flex items-center sm:items-start gap-2.5 sm:gap-3 min-w-0 flex-1">
          <div
            className={`p-2 sm:p-2.5 rounded-xl shrink-0 ${
              status === "granted"
                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                : "bg-blue-600/20 text-blue-400 border border-blue-500/30"
            }`}
          >
            {status === "granted" ? (
              <BellRing size={16} className="text-emerald-400 sm:w-5 sm:h-5" />
            ) : status === "denied" ? (
              <BellOff size={16} className="text-red-400 sm:w-5 sm:h-5" />
            ) : (
              <Bell size={16} className="text-blue-400 animate-bounce sm:w-5 sm:h-5" />
            )}
          </div>

          <div className="space-y-0.5 min-w-0 flex-1">
            <h4 className="text-xs sm:text-sm font-bold flex items-center gap-1.5 flex-wrap">
              <span className="truncate">{isDriver ? "Dispatch Push Alerts" : "Live Ride Alerts"}</span>
              {status === "granted" && (
                <span className="text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded-full inline-flex items-center gap-1">
                  <Check size={10} /> Active
                </span>
              )}
            </h4>
            <p className="text-[11px] sm:text-xs text-zinc-300 sm:text-zinc-400 line-clamp-1 sm:line-clamp-2">
              {status === "granted"
                ? isDriver
                  ? "Sound & vibration alerts active even when locked."
                  : "Instant alerts when your driver accepts or arrives."
                : status === "denied"
                ? "Notifications blocked in browser settings."
                : isDriver
                ? "Instant chime & vibration when nearby riders request a trip."
                : "Get notified when your driver accepts & arrives."}
            </p>
            {errorMsg && (
              <p className="text-[11px] text-red-400 flex items-center gap-1 pt-0.5">
                <AlertCircle size={12} /> {errorMsg}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {status === "granted" ? (
            <button
              onClick={handleSendTestPush}
              disabled={testSent}
              className="text-[11px] sm:text-xs font-semibold py-1.5 px-2.5 sm:py-2 sm:px-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl transition flex items-center gap-1 border border-zinc-700 active:scale-95"
            >
              <Send size={11} className={testSent ? "animate-spin" : ""} />
              <span>{testSent ? "Sent!" : "Test"}</span>
            </button>
          ) : status !== "denied" ? (
            <button
              onClick={handleEnablePush}
              disabled={loading}
              className={`text-[11px] sm:text-xs font-bold py-2 px-3 sm:py-2.5 sm:px-4 rounded-xl shadow-md transition active:scale-95 flex items-center gap-1.5 text-white whitespace-nowrap ${
                isDriver
                  ? "bg-emerald-600 hover:bg-emerald-500"
                  : "bg-blue-600 hover:bg-blue-500"
              }`}
            >
              <Bell size={13} className={loading ? "animate-pulse" : ""} />
              <span>{loading ? "Enabling..." : "Enable"}</span>
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
