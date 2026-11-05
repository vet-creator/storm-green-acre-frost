import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/citadel-shard")({
  server: {
    handlers: {
      GET: async () => {
        const { CITADEL_SHARD } = await import("@/server/citadel-shard.server");
        return new Response(CITADEL_SHARD, {
          headers: {
            "content-type": "application/octet-stream",
            "cache-control": "no-store",
            "x-content-type-options": "nosniff",
          },
        });
      },
    },
  },
});
