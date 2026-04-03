"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif" }}>
        <div
          style={{
            minHeight: "100vh",
            display: "grid",
            placeItems: "center",
            padding: 24,
            background: "#020617",
            color: "#e2e8f0",
          }}
        >
          <div style={{ maxWidth: 720, width: "100%" }}>
            <h1 style={{ margin: "0 0 8px", fontSize: 22, color: "#fff" }}>Something went wrong</h1>
            <p style={{ margin: "0 0 16px", lineHeight: 1.5, color: "#94a3b8" }}>
              The server hit an error while rendering this page. If this keeps happening, check the server logs.
            </p>
            {error.digest ? (
              <p style={{ margin: "0 0 16px", fontSize: 12, color: "#7dd3fc" }}>
                Digest: <code style={{ color: "#bae6fd" }}>{error.digest}</code>
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => reset()}
              style={{
                appearance: "none",
                border: "1px solid rgba(255,255,255,0.15)",
                background: "rgba(255,255,255,0.06)",
                color: "#fff",
                borderRadius: 10,
                padding: "10px 14px",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}

