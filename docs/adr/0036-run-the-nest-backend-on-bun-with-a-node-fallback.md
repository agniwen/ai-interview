# Run the Nest backend on Bun with a Node fallback

`apps/backend` will use Bun 1.4 as its primary production runtime, while the same Rspack-built ESM artifact must also run on Node 24 LTS as an operational fallback. Backend code must therefore remain runtime-neutral and avoid Bun-only APIs; CI will exercise critical behavior on both runtimes so a runtime regression can be mitigated by changing the deployment runtime without rebuilding or rolling back application code.
