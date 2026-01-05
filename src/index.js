export default {
  async fetch(request, env) {
    const VALID_USER = env.APP_USER;
    const VALID_PASS = env.APP_PASS;

    const authHeader = request.headers.get("Authorization");

    if (!authHeader || !authHeader.startsWith("Basic ")) {
      return new Response("Unauthorized", {
        status: 401,
        headers: {
          "WWW-Authenticate": 'Basic realm="Private Image App"'
        }
      });
    }

    const base64 = authHeader.split(" ")[1];
    const decoded = atob(base64);
    const [user, pass] = decoded.split(":");

    if (user !== VALID_USER || pass !== VALID_PASS) {
      return new Response("Unauthorized", { status: 401 });
    }

    return new Response(
      JSON.stringify({ status: "Authenticated" }),
      { status: 200 }
    );
  }
};
