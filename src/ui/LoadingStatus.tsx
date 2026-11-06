import { useMapStore } from '../state/mapStore';

const ERROR_MESSAGE =
  'Map data could not be loaded. Run "npm run data:fetch" to generate public/data/gta.pmtiles (see the README).';

export function LoadingStatus() {
  const loadState = useMapStore((state) => state.loadState);
  const isError = loadState === 'error';

  return (
    <div id="status" role="status" className={isError ? 'error' : undefined} hidden={loadState === 'ready'}>
      {isError ? ERROR_MESSAGE : 'Loading map…'}
    </div>
  );
}
