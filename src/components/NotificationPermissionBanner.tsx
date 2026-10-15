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
      className={`p-4 rounded-2xl border transition-all ${
        status === "granted"
          ? "bg-zinc-900/60 border-zinc-800 text-zinc-300"
          : "bg-gradient-to-r from-blue-950/40 to-indigo-950/40 border-blue-800/40 text-white"
      } ${className}`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div
            className={`p-2.5 rounded-xl shrink-0 ${
              status === "granted"
                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                : "bg-blue-600/20 text-blue-400 border border-blue-500/30"
            }`}
          >
            {status === "granted" ? (
              <BellRing size={20} className="text-emerald-400" />
            ) : status === "denied" ? (
              <BellOff size={20} className="text-red-400" />
            ) : (
              <Bell size={20} className="text-blue-400 animate-bounce" />
            )}
          </div>

          <div className="space-y-0.5">
            <h4 className="text-sm font-bold flex items-center gap-1.5">
              <span>{isDriver ? "Driver Dispatch Push Alerts" : "Live Ride Push Alerts"}</span>
              {status === "granted" && (
                <span className="text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                  <Check size={10} /> Active
                </span>
              )}
            </h4>
            <p className="text-xs text-zinc-400">
              {status === "granted"
                ? isDriver
                  ? "You'll receive sound & vibration alerts even when your phone screen is locked."
                  : "You'll get notified immediately when your driver accepts, arrives, or finishes."
                : status === "denied"
                ? "Notifications are blocked in your browser settings. Tap the lock icon in the URL bar to enable."
                : isDriver
                ? "Never miss a ride request. Get instant push alerts with chime & vibration when nearby riders request a trip."
                : "Get instant alerts when your driver accepts your ride, arrives at pickup, and settles payment."}
            </p>
            {errorMsg && (
              <p className="text-xs text-red-400 flex items-center gap-1 pt-1">
                <AlertCircle size={12} /> {errorMsg}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
          {status === "granted" ? (
            <button
              onClick={handleSendTestPush}
              disabled={testSent}
              className="text-xs font-semibold py-2 px-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl transition flex items-center gap-1.5 border border-zinc-700 active:scale-95"
            >
              <Send size={12} className={testSent ? "animate-spin" : ""} />
              <span>{testSent ? "Alert Sent!" : "Test Alert"}</span>
            </button>
          ) : status !== "denied" ? (
            <button
              onClick={handleEnablePush}
              disabled={loading}
              className={`text-xs font-bold py-2.5 px-4 rounded-xl shadow-md transition active:scale-95 flex items-center gap-1.5 text-white ${
                isDriver
                  ? "bg-emerald-600 hover:bg-emerald-500"
                  : "bg-blue-600 hover:bg-blue-500"
              }`}
            >
              <Bell size={14} className={loading ? "animate-pulse" : ""} />
              <span>{loading ? "Activating..." : "Enable Push Alerts"}</span>
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
