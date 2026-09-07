export type FacadeStatus = {
  llm: string;
  codex: boolean;
  api: boolean;
  paywalled?: boolean;
  hosted?: boolean;
};

export const PHOTO_UNLOCK_KEY = "city-lab-photo-unlock";
export const PHOTO_SALES_EMAIL = "signumcode@gmail.com";

export const PHOTO_SALES_MAILTO =
  `mailto:${PHOTO_SALES_EMAIL}` +
  `?subject=${encodeURIComponent("City Lab Photo")}` +
  `&body=${encodeURIComponent("Hello,\n\nI would like to buy City Lab Photo.\n\n")}`;

export const HOSTED_PAYWALL: FacadeStatus = {
  llm: "none",
  codex: false,
  api: false,
  paywalled: true,
  hosted: true,
};

export function photoUnlocked() {
  return typeof localStorage !== "undefined" && localStorage.getItem(PHOTO_UNLOCK_KEY) === "1";
}

export function unlockPhoto() {
  localStorage.setItem(PHOTO_UNLOCK_KEY, "1");
}

export function readFacadeStatus(response: Response, data: unknown): FacadeStatus {
  if (!response.ok || !data || typeof data !== "object") return HOSTED_PAYWALL;
  const body = data as Record<string, unknown>;
  if (typeof body.llm !== "string") return HOSTED_PAYWALL;
  return {
    llm: body.llm,
    codex: Boolean(body.codex),
    api: Boolean(body.api),
    paywalled: Boolean(body.paywalled),
    hosted: Boolean(body.hosted),
  };
}

export async function fetchFacadeStatus(): Promise<FacadeStatus> {
  try {
    const response = await fetch("/api/facade/status");
    const data = await response.json().catch(() => null);
    return readFacadeStatus(response, data);
  } catch {
    return HOSTED_PAYWALL;
  }
}

export function facadePaintLocked(status: FacadeStatus | null, unlocked: boolean) {
  if (!status?.paywalled) return false;
  return Boolean(status.hosted) || !unlocked;
}
