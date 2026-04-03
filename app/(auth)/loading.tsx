import { LoaderCircleIcon } from 'lucide-react';

export default function AuthLoading() {
  return (
    <div className='flex min-h-dvh items-center justify-center'>
      <LoaderCircleIcon className='size-6 animate-spin text-muted-foreground' />
    </div>
  );
}
