"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import jsQR from "jsqr";

export type CameraState = "idle" | "starting" | "running" | "denied" | "unavailable";

const MAX_SIDE = 640; // Downscaled frames decode faster and read fine at gate distance.
const SCAN_INTERVAL_MS = 120;

/** Runs the camera and reports decoded QR strings. It works in any browser with getUserMedia. */
export function useQrCamera(onCode: (value: string) => void) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);
  const onCodeRef = useRef(onCode);
  const [state, setState] = useState<CameraState>("idle");

  useEffect(() => {
    onCodeRef.current = onCode;
  }, [onCode]);

  const stop = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setState("idle");
  }, []);

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setState("unavailable");
      return;
    }
    setState("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();
      setState("running");

      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d", { willReadFrequently: true });
      let last = 0;
      const loop = (time: number) => {
        frameRef.current = requestAnimationFrame(loop);
        if (time - last < SCAN_INTERVAL_MS || video.readyState < 2 || !context) return;
        last = time;
        const scale = Math.min(MAX_SIDE / Math.max(video.videoWidth, video.videoHeight), 1);
        canvas.width = Math.floor(video.videoWidth * scale);
        canvas.height = Math.floor(video.videoHeight * scale);
        if (!canvas.width || !canvas.height) return;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const image = context.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(image.data, image.width, image.height, { inversionAttempts: "dontInvert" });
        if (code?.data) onCodeRef.current(code.data);
      };
      frameRef.current = requestAnimationFrame(loop);
    } catch (error) {
      const name = (error as DOMException).name;
      setState(name === "NotAllowedError" || name === "SecurityError" ? "denied" : "unavailable");
    }
  }, []);

  useEffect(() => stop, [stop]);

  return { videoRef, state, start, stop };
}
