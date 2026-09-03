export function InterviewBackground() {
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
