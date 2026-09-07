import { HOSTED_PAYWALL } from "./src/facade-tool/status";

export default {
  async fetch(request: Request, env: { ASSETS: Fetcher }): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/facade/")) {
      return env.ASSETS.fetch(request);
    }
    if (url.pathname === "/api/facade/status" && request.method === "GET") {
      return Response.json(HOSTED_PAYWALL);
    }
    return Response.json(
      {
        error: "City Lab Photo is behind a paywall on this site.",
        paywalled: true,
        hosted: true,
      },
      { status: 402 },
    );
  },
};
