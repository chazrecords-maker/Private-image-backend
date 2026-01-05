export default {
  async fetch(request, env) {
    // --- Read credentials from bindings ---
    const VALID_USER = env.APP_USER;
    const VALID_PASS = env.APP_PASS;

    // --- Read Authorization header ---
    const authHeader = request.headers.get("Authorization");

    if (!authHeader || !authHeader.startsWith("Basic ")) {
      return new Response("Unauthorized", {
        status: 401,
        headers: {
          "WWW-Authenticate": 'Basic realm="Private Image App"'
        }
      });
    }

    // --- Decode Basic Auth ---
    const base64 = authHeader.split(" ")[1];
    const decoded = atob(base64);
    const [user, pass] = decoded.split(":");

    // --- Validate credentials ---
    if (user !== VALID_USER || pass !== VALID_PASS) {
      return new Response("Unauthorized", {
        status: 401
      });
    }

    // --- Auth success ---
    return new Response("Authentication successful", {
      status: 200
    });
  }
};
