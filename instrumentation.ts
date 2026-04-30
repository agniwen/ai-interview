export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { getWorld } = await import("workflow/runtime");
    const world = await getWorld();
    await world.start?.();
  }
}
