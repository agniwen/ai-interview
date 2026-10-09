export function InterviewEntryBackground() {
  return (
    <>
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 -z-10 bg-[url('/illustrations/interview/abstract-light-trails-light.webp')] bg-cover bg-center opacity-45 dark:bg-[url('/illustrations/interview/abstract-light-trails-dark.webp')] dark:opacity-40"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 -z-10 bg-[linear-gradient(to_right,transparent,var(--background)_25%,var(--background)_75%,transparent)] opacity-80"
      />
    </>
  );
}
