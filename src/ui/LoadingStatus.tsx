import { useEffect } from 'react';
import { useMapStore } from '../state/mapStore';

const MISSING_DATA_MESSAGE =
  'Map data could not be loaded. Run "npm run data:fetch" to generate public/data/gta.pmtiles (see the README).';

export function LoadingStatus() {
  const progress = useMapStore((state) => state.progress);
  const initialLoadDone = useMapStore((state) => state.initialLoadDone);
  const lastError = progress?.lastError;
  const loaded = progress?.loaded ?? 0;
  const failed = progress?.failed ?? 0;
  const total = progress?.total ?? 0;
  const done = progress !== null && loaded + failed === total;
  const nothingLoaded = failed > 0 && loaded === 0;
  const isError = nothingLoaded || (done && failed > 0);

  useEffect(() => {
    if (isError && lastError) console.error(lastError);
  }, [isError, lastError]);

  let message = progress ? `Loading map… ${loaded + failed} of ${total}` : 'Loading map…';
  if (nothingLoaded) message = MISSING_DATA_MESSAGE;
  else if (isError) message = `${failed} of ${total} map tiles failed to load. Reload to try again.`;

  return (
    <div id="status" role="status" className={isError ? 'error' : undefined} hidden={!isError && (initialLoadDone || (done && failed === 0))}>
      {message}
    </div>
  );
}
