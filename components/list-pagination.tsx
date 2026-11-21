"use client";

import { useState, useSyncExternalStore } from "react";
import {
  Pagination,
  PaginationContent,
  PaginationCurrent,
  PaginationItem,
  PaginationStep,
} from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DEFAULT_PAGE_SIZE,
  PAGE_SIZES,
  PAGE_SIZE_STORAGE_KEY,
  parsePageSize,
} from "@/lib/constants";
import type { PageSize } from "@/lib/constants";

const changeEvent = "lendloop-page-size-change";
let fallbackSize: PageSize = DEFAULT_PAGE_SIZE;

function storedSize() {
  try {
    return parsePageSize(window.localStorage.getItem(PAGE_SIZE_STORAGE_KEY));
  } catch {
    return fallbackSize;
  }
}

function subscribe(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener(changeEvent, listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener(changeEvent, listener);
  };
}

export function useListPage(scope: string) {
  const pageSize = useSyncExternalStore(subscribe, storedSize, () => DEFAULT_PAGE_SIZE);
  const key = JSON.stringify([scope, pageSize]);
  const [navigation, setNavigation] = useState<{ key: string; cursors: (string | null)[] }>({
    key,
    cursors: [null],
  });
  const cursors = navigation.key === key ? navigation.cursors : [null];
  if (navigation.key !== key) setNavigation({ key, cursors });

  return {
    cursor: cursors.at(-1) ?? null,
    pageSize,
    pageNumber: cursors.length,
    previous: () => setNavigation({ key, cursors: cursors.slice(0, -1) }),
    next: (cursor: string) => setNavigation({ key, cursors: [...cursors, cursor] }),
    changeSize: (value: string) => {
      fallbackSize = parsePageSize(value);
      try {
        window.localStorage.setItem(PAGE_SIZE_STORAGE_KEY, String(fallbackSize));
      } catch {
        // Keep the preference for this tab when browser storage is unavailable.
      }
      window.dispatchEvent(new Event(changeEvent));
    },
  };
}

export function ListPagination({
  label,
  navigation,
  result,
}: {
  label: string;
  navigation: ReturnType<typeof useListPage>;
  result?: { page: readonly unknown[]; isDone: boolean; continueCursor: string };
}) {
  const canGoBack = navigation.pageNumber > 1;
  if (!canGoBack && (!result || (result.page.length < DEFAULT_PAGE_SIZE && result.isDone)))
    return null;

  return (
    <Pagination aria-label={label}>
      <PaginationContent variant="toolbar">
        <PaginationItem>
          <PaginationContent variant="steps">
            <PaginationItem>
              <PaginationStep
                direction="previous"
                disabled={!canGoBack}
                onClick={navigation.previous}
              />
            </PaginationItem>
            <PaginationItem>
              <PaginationCurrent>Page {navigation.pageNumber}</PaginationCurrent>
            </PaginationItem>
            <PaginationItem>
              <PaginationStep
                direction="next"
                disabled={!result || result.isDone}
                onClick={() => result && navigation.next(result.continueCursor)}
              />
            </PaginationItem>
          </PaginationContent>
        </PaginationItem>
        <PaginationItem>
          <Select value={String(navigation.pageSize)} onValueChange={navigation.changeSize}>
            <SelectTrigger aria-label="Items per page" size="touch">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectGroup>
                {PAGE_SIZES.map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size} per page
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}
