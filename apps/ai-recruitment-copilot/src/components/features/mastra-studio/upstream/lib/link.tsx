import { forwardRef } from "react";
import { Link as RouterLink } from "@/components/features/mastra-studio/router/compat";
import type {
  LinkComponent,
  LinkComponentProps,
} from "@/components/features/mastra-studio/upstream/lib/framework";
import { EMBEDDED_MASTRA_API_PREFIX } from "@/components/features/mastra-studio/mastra-studio-config";

// Routes served by the Hono server, not the React Router SPA.
// These need full-page navigation via a plain <a> tag.
const SERVER_ROUTE_PREFIXES = [
  `${EMBEDDED_MASTRA_API_PREFIX}/swagger-ui`,
  `${EMBEDDED_MASTRA_API_PREFIX}/openapi.json`,
];

export const Link: LinkComponent = forwardRef<HTMLAnchorElement, LinkComponentProps>(
  ({ children, href, ...props }, ref) => {
    const isServerRoute = href && SERVER_ROUTE_PREFIXES.some((prefix) => href.startsWith(prefix));

    if (isServerRoute) {
      return (
        <a ref={ref} href={href} {...props}>
          {children}
        </a>
      );
    }

    return (
      <RouterLink ref={ref} to={href ?? ""} viewTransition {...props}>
        {children}
      </RouterLink>
    );
  },
);
