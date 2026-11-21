"use client";

import { ArrowLeftIcon } from "@phosphor-icons/react/dist/ssr";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function BackButton() {
  const router = useRouter();

  function goBack() {
    const { history, navigation } = window as Window & {
      navigation?: { readonly canGoBack: boolean };
    };

    if (history.length > 1 && (navigation?.canGoBack || document.referrer || !navigation)) {
      router.back();
    } else {
      router.replace("/");
    }
  }

  return (
    <Button type="button" variant="outline" size="touch" onClick={goBack}>
      <ArrowLeftIcon data-icon="inline-start" aria-hidden />
      Go back
    </Button>
  );
}
