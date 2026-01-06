if (new URL(request.url).pathname === "/ping") {
  return new Response("PING OK", {
    headers: { "Content-Type": "text/plain" }
  });
}export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);

      // --------------------
      // Health
      // --------------------
      if (url.pathname === "/health") {
        return new Response(
          JSON.stringify({
            status: "OK",
            hasUser: !!env.APP_USER,
            hasPass: !!env.APP_PASS,
            hasHF: !!env.HF_TOKEN
          }),
          { headers: { "Content-Type": "application/json" } }
        );
      }

      // --------------------
      // Debug endpoint
      // --------------------
      if (url.pathname === "/debug") {
        return new Response(
          JSON.stringify({
            method: request.method,
            contentType: request.headers.get("content-type"),
            hasAuthHeader: !!request.headers.get("authorization"),
            authHeader: request.headers.get("authorization") || null
          }),
          { headers: { "Content-Type": "application/json" } }
        );
      }

      // --------------------
      // Auth (safe)
      // --------------------
      const auth = request.headers.get("authorization");
      if (!auth || !auth.startsWith("Basic ")) {
        return new Response(
          JSON.stringify({ error: "Missing or invalid Authorization header" }),
          { status: 401, headers: { "Content-Type": "application/json" } }
        );
      }

      let user, pass;
      try {
        const decoded = atob(auth.split(" ")[1]);
        [user, pass] = decoded.split(":");
      } catch {
        return new Response(
          JSON.stringify({ error: "Authorization decoding failed" }),
          { status: 401, headers: { "Content-Type": "application/json" } }
        );
      }

      if (user !== env.APP_USER || pass !== env.APP_PASS) {
        return new Response(
          JSON.stringify({ error: "Bad credentials" }),
          { status: 401, headers: { "Content-Type": "application/json" } }
        );
      }

      // --------------------
      // Generate (NO HF CALL YET)
      // --------------------
      if (url.pathname === "/generate" && request.method === "POST") {
        let bodyText = "";

        try {
          bodyText = await request.text();
        } catch {
          bodyText = "(unable to read body)";
        }

        return new Response(
          JSON.stringify({
            message: "Generate endpoint reached safely",
            receivedBody: bodyText,
            contentType: request.headers.get("content-type")
          }),
          { headers: { "Content-Type": "application/json" } }
        );
      }

      return new Response("Not found", { status: 404 });
    } catch (e) {
      return new Response(
        JSON.stringify({
          fatalError: e.message || String(e)
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
  }
};
