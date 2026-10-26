"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent, TouchEvent, UIEvent, WheelEvent } from "react";

/** Follow the last message until the reader deliberately scrolls through history. */
export function useChatScroll(activeKey: string | null, items: unknown, loading: boolean) {
  const [viewport, viewportRef] = useState<HTMLDivElement | null>(null);
  const [content, contentRef] = useState<HTMLDivElement | null>(null);
  const following = useRef(true);
  const userIntent = useRef(false);
  const lastKey = useRef<string | null>(null);
  const touchY = useRef<number | null>(null);
  const frame = useRef<number | null>(null);

  const align = useCallback(() => {
    viewport?.scrollTo({ top: viewport.scrollHeight, behavior: "instant" });
  }, [viewport]);
  const reset = useCallback(() => {
    following.current = true;
    userIntent.current = false;
    touchY.current = null;
  }, []);
  const scrollBottom = useCallback(() => {
    reset(); align();
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => { if (following.current) align(); });
  }, [align, reset]);

  useLayoutEffect(() => {
    if (lastKey.current !== activeKey) { lastKey.current = activeKey; reset(); }
    if (following.current) align();
  }, [activeKey, items, loading, viewport, align, reset]);

  useEffect(() => {
    if (!viewport || !content) return;
    const follow = () => { if (following.current) align(); };
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(follow);
    observer?.observe(viewport);
    observer?.observe(content);
    window.visualViewport?.addEventListener("resize", follow);
    return () => { observer?.disconnect(); window.visualViewport?.removeEventListener("resize", follow); };
  }, [viewport, content, align]);
  useEffect(() => () => { if (frame.current !== null) cancelAnimationFrame(frame.current); }, []);

  const onScroll = (event: UIEvent<HTMLDivElement>) => {
    const element = event.currentTarget;
    if (userIntent.current) following.current = element.scrollHeight - element.clientHeight - element.scrollTop < 80;
    else if (following.current) align();
  };
  const onWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (!event.deltaY) return;
    userIntent.current = true;
    if (event.deltaY < 0) following.current = false;
  };
  const onTouchStart = (event: TouchEvent<HTMLDivElement>) => { touchY.current = event.touches[0]?.clientY ?? null; };
  const onTouchMove = (event: TouchEvent<HTMLDivElement>) => {
    const y = event.touches[0]?.clientY;
    if (y === undefined || touchY.current === null || Math.abs(y - touchY.current) < 3) return;
    userIntent.current = true;
    if (y > touchY.current) following.current = false;
    touchY.current = y;
  };
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.target === event.currentTarget) userIntent.current = true;
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (["ArrowUp", "PageUp", "Home"].includes(event.key) || (event.key === " " && event.shiftKey)) {
      userIntent.current = true; following.current = false;
    } else if (event.key === "End") scrollBottom();
  };
  return { viewportRef, contentRef, reset, scrollBottom, following, handlers: { onScroll, onWheel, onTouchStart, onTouchMove, onPointerDown, onKeyDown } };
}
