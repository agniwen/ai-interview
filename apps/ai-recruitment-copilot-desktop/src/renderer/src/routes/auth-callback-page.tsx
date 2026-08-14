/**
 * Landing page for the OAuth child window after better-auth redirects.
 * The main process closes that window when this hash route is hit; the shell
 * should rarely render this in the primary window.
 */
export function AuthCallbackPage(): React.JSX.Element {
  return (
    <main className="flex h-full items-center justify-center bg-background text-sm text-muted-foreground">
      登录成功，正在返回应用…
    </main>
  );
}
