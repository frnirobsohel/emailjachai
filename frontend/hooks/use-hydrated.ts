"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};
const getSnapshot = () => true;
const getServerSnapshot = () => false;

/**
 * Returns true once the component has mounted on the client.
 * Essential for preventing React hydration mismatch errors when
 * accessing localStorage-backed persisted stores (like Zustand persist).
 */
export function useHydrated(): boolean {
    return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

