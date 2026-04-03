import { LoaderCircleIcon } from 'lucide-react';

export default function StudioLoading() {
  return (
    <div className='flex flex-1 items-center justify-center'>
      <LoaderCircleIcon className='size-6 animate-spin text-muted-foreground' />
    </div>
  );
}
