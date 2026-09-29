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

export function InterviewBackground({ entry = false }: { entry?: boolean }) {
  if (entry) {
    return <InterviewEntryBackground />;
  }

  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-20 bg-[url('/textures/interview-scene-editorial-light-v2.png')] bg-center bg-cover bg-no-repeat dark:bg-[url('/textures/interview-scene-editorial-dark-v2.png')]"
        data-slot="interview-background-artwork"
      />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 bg-background/42 dark:bg-background/68"
        data-slot="interview-background-veil"
      />
    </>
  );
}
