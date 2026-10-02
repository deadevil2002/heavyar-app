const UPSTREAM_ORIGIN = "https://heavyar-website.pages.dev";
const PRODUCTION_ORIGIN = "https://heavyar.com";

export default {
  async fetch(request: Request): Promise<Response> {
    const incomingUrl = new URL(request.url);

    if (incomingUrl.protocol === "http:") {
      incomingUrl.protocol = "https:";
      return Response.redirect(incomingUrl.toString(), 301);
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method Not Allowed", {
        status: 405,
        headers: { Allow: "GET, HEAD" },
      });
    }

    const upstreamUrl = new URL(incomingUrl.pathname + incomingUrl.search, UPSTREAM_ORIGIN);

    const upstreamResponse = await fetch(
      new Request(upstreamUrl, {
        method: request.method,
        headers: request.headers,
        redirect: "manual",
      }),
    );

    const headers = new Headers(upstreamResponse.headers);
    const location = headers.get("Location");

    if (location) {
      const redirectUrl = new URL(location, upstreamUrl);
      if (redirectUrl.origin === UPSTREAM_ORIGIN) {
        headers.set(
          "Location",
          new URL(
            redirectUrl.pathname + redirectUrl.search + redirectUrl.hash,
            PRODUCTION_ORIGIN,
          ).toString(),
        );
      }
    }

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers,
    });
  },
};
